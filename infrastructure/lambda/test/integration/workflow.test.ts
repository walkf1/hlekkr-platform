import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Import handlers
import { handler as mediaUploadHandler } from '../../api/media-upload';
import { handler as analysisResultsHandler } from '../../api/analysis-results';
import { handler as reviewDecisionsHandler } from '../../api/review-decisions';
import { handler as rateLimitMonitorHandler } from '../../monitoring/rate-limit-monitor';

describe('Hlekkr Workflow Integration Tests', () => {
  let mockContext: Context;
  let mockAWSClients: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock context
    mockContext = {
      awsRequestId: 'integration-test-correlation-id',
      functionName: 'integration-test-function',
      getRemainingTimeInMillis: () => 30000,
    } as any;

    // Mock AWS clients with consistent behavior
    mockAWSClients = {
      dynamodb: {
        send: vi.fn(),
      },
      s3: {
        send: vi.fn(),
      },
      sqs: {
        send: vi.fn(),
      },
      sns: {
        send: vi.fn(),
      },
      cloudwatch: {
        send: vi.fn(),
      },
    };

    // Setup consistent mocks
    setupAWSMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Media Processing Workflow', () => {
    it('should handle complete workflow from upload to review decision', async () => {
      // Step 1: Media Upload
      const uploadEvent = createAuthenticatedEvent({
        httpMethod: 'POST',
        path: '/media',
        body: JSON.stringify({
          fileName: 'suspicious-video.mp4',
          fileType: 'video/mp4',
          fileSize: 50 * 1024 * 1024, // 50MB
          metadata: {
            description: 'Potentially manipulated video',
            source: 'social-media',
          },
        }),
        user: {
          userId: 'test-user-123',
          email: 'user@example.com',
          role: 'user',
          permissions: { canUploadMedia: true },
        },
      });

      mockAWSClients.dynamodb.send.mockResolvedValue({});
      mockAWSClients.sqs.send.mockResolvedValue({});

      const uploadResult = await mediaUploadHandler(uploadEvent, mockContext);

      expect(uploadResult.statusCode).toBe(200);
      const uploadData = JSON.parse(uploadResult.body);
      expect(uploadData.success).toBe(true);
      expect(uploadData.data.mediaId).toBeDefined();

      const mediaId = uploadData.data.mediaId;

      // Step 2: Analysis Results (simulating after processing)
      const analysisEvent = createAuthenticatedEvent({
        httpMethod: 'GET',
        path: `/analysis/${mediaId}`,
        pathParameters: { mediaId },
        user: {
          userId: 'test-user-123',
          email: 'user@example.com',
          role: 'user',
          permissions: { canViewAnalysis: true },
        },
      });

      const analysisResult = await analysisResultsHandler(analysisEvent, mockContext);

      expect(analysisResult.statusCode).toBe(200);
      const analysisData = JSON.parse(analysisResult.body);
      expect(analysisData.success).toBe(true);
      expect(analysisData.data.mediaId).toBe(mediaId);
      expect(analysisData.data.trustScore).toBeDefined();

      // Step 3: Review Decision (for low trust score)
      const reviewEvent = createAuthenticatedEvent({
        httpMethod: 'POST',
        path: '/review/decisions',
        body: JSON.stringify({
          mediaId,
          decision: 'confirm',
          confidence: 0.9,
          notes: 'Clear evidence of deepfake manipulation in facial features',
          tags: ['deepfake', 'face-manipulation', 'high-confidence'],
          findings: {
            manipulationTechniques: ['face_swap', 'expression_transfer'],
            suspiciousPatterns: ['temporal_inconsistency', 'lighting_mismatch'],
          },
        }),
        user: {
          userId: 'moderator-456',
          email: 'moderator@example.com',
          role: 'moderator',
          permissions: { canModerateContent: true },
        },
      });

      mockAWSClients.dynamodb.send.mockResolvedValue({});
      mockAWSClients.sqs.send.mockResolvedValue({});
      mockAWSClients.sns.send.mockResolvedValue({});

      const reviewResult = await reviewDecisionsHandler(reviewEvent, mockContext);

      expect(reviewResult.statusCode).toBe(200);
      const reviewData = JSON.parse(reviewResult.body);
      expect(reviewData.success).toBe(true);
      expect(reviewData.data.decision).toBe('confirm');
      expect(reviewData.data.threatIntelligenceTriggered).toBe(true);

      // Verify all AWS services were called appropriately
      expect(mockAWSClients.dynamodb.send).toHaveBeenCalled(); // Data storage
      expect(mockAWSClients.sqs.send).toHaveBeenCalled(); // Threat intelligence queue
      expect(mockAWSClients.sns.send).toHaveBeenCalled(); // Notifications
    });

    it('should handle rate limiting across multiple requests', async () => {
      // Simulate multiple rapid requests from same user
      const baseEvent = createAuthenticatedEvent({
        httpMethod: 'POST',
        path: '/media',
        body: JSON.stringify({
          fileName: 'test-video.mp4',
          fileType: 'video/mp4',
          fileSize: 1024000,
        }),
        user: {
          userId: 'rate-limited-user',
          email: 'user@example.com',
          role: 'user',
          permissions: { canUploadMedia: true },
        },
      });

      // Mock rate limit data showing user has exceeded limits
      const rateLimitData = {
        rateLimitKey: 'rate-limited-user:POST:/media',
        minuteRequests: 100, // Exceeds default limit
        hourRequests: 500,
        dayRequests: 1000,
        lastMinute: Math.floor(Date.now() / 60000),
        lastHour: Math.floor(Date.now() / 3600000),
        lastDay: Math.floor(Date.now() / 86400000),
        burstCount: 15,
      };

      mockAWSClients.dynamodb.send
        .mockResolvedValueOnce({ Item: null }) // User profile not found
        .mockResolvedValueOnce({}) // Create user profile
        .mockResolvedValueOnce({ Item: rateLimitData }); // Rate limit exceeded

      const result = await mediaUploadHandler(baseEvent, mockContext);

      expect(result.statusCode).toBe(429);
      const responseData = JSON.parse(result.body);
      expect(responseData.success).toBe(false);
      expect(responseData.error.type).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Rate Limit Monitoring Integration', () => {
    it('should detect and alert on suspicious activity patterns', async () => {
      // Create scheduled event for rate limit monitoring
      const scheduledEvent = {
        version: '0',
        id: 'test-event-id',
        'detail-type': 'Scheduled Event',
        source: 'aws.events',
        account: '123456789012',
        time: new Date().toISOString(),
        region: 'us-east-1',
        detail: {},
      };

      // Mock high violation scenario
      const mockRateLimitData = Array.from({ length: 150 }, (_, i) => ({
        rateLimitKey: `suspicious-user:GET:/media${i}`,
        userId: 'suspicious-user',
        minuteRequests: 100, // Exceeds limit
        hourRequests: 2000,
        dayRequests: 5000,
        lastRequest: new Date().toISOString(),
        burstCount: 15,
      }));

      const mockUserProfiles = [
        {
          userId: 'suspicious-user',
          email: 'suspicious@example.com',
          role: 'user',
          isActive: true,
        },
      ];

      mockAWSClients.dynamodb.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: mockUserProfiles });

      mockAWSClients.cloudwatch.send.mockResolvedValue({});
      mockAWSClients.sns.send.mockResolvedValue({});

      await rateLimitMonitorHandler(scheduledEvent as any, mockContext);

      // Verify alert was sent
      expect(mockAWSClients.sns.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Subject: '[TEST] Hlekkr Rate Limit Alert',
            Message: expect.stringContaining('Suspicious user activity detected'),
          }),
        })
      );

      // Verify metrics were sent to CloudWatch
      expect(mockAWSClients.cloudwatch.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Namespace: 'Hlekkr/Authentication',
            MetricData: expect.arrayContaining([
              expect.objectContaining({
                MetricName: 'RateLimitViolations',
                Value: expect.any(Number),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle AWS service failures gracefully', async () => {
      const uploadEvent = createAuthenticatedEvent({
        httpMethod: 'POST',
        path: '/media',
        body: JSON.stringify({
          fileName: 'test-video.mp4',
          fileType: 'video/mp4',
          fileSize: 1024000,
        }),
        user: {
          userId: 'test-user',
          email: 'user@example.com',
          role: 'user',
          permissions: { canUploadMedia: true },
        },
      });

      // Simulate DynamoDB failure
      mockAWSClients.dynamodb.send.mockRejectedValue(new Error('DynamoDB service unavailable'));

      const result = await mediaUploadHandler(uploadEvent, mockContext);

      expect(result.statusCode).toBe(500);
      const responseData = JSON.parse(result.body);
      expect(responseData.success).toBe(false);
      expect(responseData.correlationId).toBe('integration-test-correlation-id');
    });

    it('should maintain data consistency across service failures', async () => {
      const reviewEvent = createAuthenticatedEvent({
        httpMethod: 'POST',
        path: '/review/decisions',
        body: JSON.stringify({
          mediaId: 'test-media-id',
          decision: 'confirm',
          confidence: 0.9,
          notes: 'Test review decision',
          tags: ['test'],
        }),
        user: {
          userId: 'moderator-123',
          email: 'moderator@example.com',
          role: 'moderator',
          permissions: { canModerateContent: true },
        },
      });

      // DynamoDB succeeds, but SQS fails
      mockAWSClients.dynamodb.send.mockResolvedValue({});
      mockAWSClients.sqs.send.mockRejectedValue(new Error('SQS service unavailable'));
      mockAWSClients.sns.send.mockResolvedValue({});

      const result = await reviewDecisionsHandler(reviewEvent, mockContext);

      // Should still succeed even if threat intelligence queue fails
      expect(result.statusCode).toBe(200);
      const responseData = JSON.parse(result.body);
      expect(responseData.success).toBe(true);
    });
  });

  describe('Security and Authorization', () => {
    it('should enforce role-based access control', async () => {
      // Regular user trying to access moderator endpoint
      const unauthorizedEvent = createAuthenticatedEvent({
        httpMethod: 'GET',
        path: '/review/queue',
        pathParameters: { action: 'queue' },
        user: {
          userId: 'regular-user',
          email: 'user@example.com',
          role: 'user', // Not a moderator
          permissions: { canModerateContent: false },
        },
      });

      const result = await reviewDecisionsHandler(unauthorizedEvent, mockContext);

      expect(result.statusCode).toBe(403);
      const responseData = JSON.parse(result.body);
      expect(responseData.success).toBe(false);
      expect(responseData.error.message).toContain('Insufficient permissions');
    });

    it('should validate input data thoroughly', async () => {
      const invalidEvent = createAuthenticatedEvent({
        httpMethod: 'POST',
        path: '/media',
        body: JSON.stringify({
          fileName: 'malicious.exe',
          fileType: 'application/x-executable', // Not allowed
          fileSize: 1024000,
        }),
        user: {
          userId: 'test-user',
          email: 'user@example.com',
          role: 'user',
          permissions: { canUploadMedia: true },
        },
      });

      const result = await mediaUploadHandler(invalidEvent, mockContext);

      expect(result.statusCode).toBe(400);
      const responseData = JSON.parse(result.body);
      expect(responseData.success).toBe(false);
      expect(responseData.error.message).toContain('not supported');
    });
  });

  // Helper functions
  function createAuthenticatedEvent(overrides: any = {}): any {
    return {
      httpMethod: 'GET',
      path: '/test',
      resource: '/test',
      headers: {
        Authorization: 'Bearer valid-jwt-token',
        'Content-Type': 'application/json',
      },
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
      pathParameters: null,
      queryStringParameters: null,
      body: null,
      correlationId: 'integration-test-correlation-id',
      ...overrides,
    };
  }

  function setupAWSMocks() {
    // Mock all AWS SDK clients
    vi.doMock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: vi.fn(() => mockAWSClients.dynamodb),
      GetItemCommand: vi.fn(),
      PutItemCommand: vi.fn(),
      UpdateItemCommand: vi.fn(),
      QueryCommand: vi.fn(),
      ScanCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: vi.fn(() => mockAWSClients.s3),
      PutObjectCommand: vi.fn(),
      CreateMultipartUploadCommand: vi.fn(),
      UploadPartCommand: vi.fn(),
      CompleteMultipartUploadCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-sqs', () => ({
      SQSClient: vi.fn(() => mockAWSClients.sqs),
      SendMessageCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-sns', () => ({
      SNSClient: vi.fn(() => mockAWSClients.sns),
      PublishCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-cloudwatch', () => ({
      CloudWatchClient: vi.fn(() => mockAWSClients.cloudwatch),
      PutMetricDataCommand: vi.fn(),
    }));

    // Mock enhanced auth middleware to pass through
    vi.doMock('../../api/auth-middleware-enhanced', () => ({
      EnhancedAuthMiddleware: {
        withAuthAndRateLimit: (handlerFn: any) => handlerFn,
      },
      ENDPOINT_RATE_LIMITS: {
        '/media': { requestsPerMinute: 10, burstLimit: 3 },
        '/analysis/results': { requestsPerMinute: 30, burstLimit: 10 },
        '/review/decisions': { requestsPerMinute: 20, burstLimit: 5 },
      },
    }));

    vi.doMock('@aws-sdk/util-dynamodb', () => ({
      marshall: vi.fn((obj) => obj),
      unmarshall: vi.fn((obj) => obj),
    }));

    vi.doMock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: vi.fn().mockResolvedValue('https://mock-presigned-url.com'),
    }));
  }
});