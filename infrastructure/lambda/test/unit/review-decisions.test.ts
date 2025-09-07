import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../api/review-decisions';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/client-sqs');
vi.mock('@aws-sdk/client-sns');

// Mock enhanced auth middleware
vi.mock('../../api/auth-middleware-enhanced', () => ({
  EnhancedAuthMiddleware: {
    withAuthAndRateLimit: (handlerFn: any) => handlerFn,
  },
  ENDPOINT_RATE_LIMITS: {
    '/review/decisions': {
      requestsPerMinute: 20,
      burstLimit: 5,
    },
  },
}));

// Mock environment variables
process.env.REVIEW_DECISIONS_TABLE = 'test-review-decisions-table';
process.env.MEDIA_ANALYSIS_TABLE = 'test-media-analysis-table';
process.env.THREAT_INTELLIGENCE_QUEUE = 'test-threat-intelligence-queue';
process.env.REVIEW_NOTIFICATIONS_TOPIC = 'test-review-notifications-topic';

describe('Review Decisions Handler', () => {
  let mockEvent: any;
  let mockContext: Context;
  let mockDynamoClient: any;
  let mockSQSClient: any;
  let mockSNSClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AWS clients
    mockDynamoClient = {
      send: vi.fn(),
    };

    mockSQSClient = {
      send: vi.fn(),
    };

    mockSNSClient = {
      send: vi.fn(),
    };

    vi.doMock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: vi.fn(() => mockDynamoClient),
      GetItemCommand: vi.fn(),
      PutItemCommand: vi.fn(),
      UpdateItemCommand: vi.fn(),
      QueryCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-sqs', () => ({
      SQSClient: vi.fn(() => mockSQSClient),
      SendMessageCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-sns', () => ({
      SNSClient: vi.fn(() => mockSNSClient),
      PublishCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/util-dynamodb', () => ({
      marshall: vi.fn((obj) => obj),
      unmarshall: vi.fn((obj) => obj),
    }));

    // Create mock authenticated event with moderator role
    mockEvent = {
      httpMethod: 'POST',
      path: '/review/decisions',
      pathParameters: null,
      queryStringParameters: null,
      body: JSON.stringify({
        mediaId: 'test-media-id',
        decision: 'confirm',
        confidence: 0.85,
        notes: 'Clear evidence of deepfake manipulation detected',
        tags: ['deepfake', 'face-manipulation', 'high-confidence'],
        findings: {
          manipulationTechniques: ['face_swap', 'expression_transfer'],
          suspiciousPatterns: ['temporal_inconsistency', 'lighting_mismatch'],
          technicalDetails: {
            artifactScore: 0.87,
            temporalConsistency: 0.23,
          },
        },
      }),
      user: {
        userId: 'moderator-123',
        email: 'moderator@example.com',
        role: 'moderator',
        permissions: {
          canModerateContent: true,
        },
      },
      correlationId: 'test-correlation-id',
    };

    mockContext = {
      awsRequestId: 'test-correlation-id',
      functionName: 'test-function',
      getRemainingTimeInMillis: () => 30000,
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Permission Validation', () => {
    it('should reject requests from users without moderator permissions', async () => {
      // Arrange
      mockEvent.user.role = 'user';
      mockEvent.user.permissions.canModerateContent = false;

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(403);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('Insufficient permissions');
    });

    it('should allow moderators to access review endpoints', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});
      mockSQSClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
    });

    it('should allow admin users to access review endpoints', async () => {
      // Arrange
      mockEvent.user.role = 'admin';
      mockDynamoClient.send.mockResolvedValue({});
      mockSQSClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
    });
  });

  describe('Submit Review Decision', () => {
    it('should successfully submit a valid review decision', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});
      mockSQSClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.reviewId).toBeDefined();
      expect(responseBody.data.decision).toBe('confirm');
      expect(responseBody.data.confidence).toBe(0.85);
      expect(responseBody.data.threatIntelligenceTriggered).toBe(true);

      // Verify DynamoDB was called to store decision
      expect(mockDynamoClient.send).toHaveBeenCalled();
      
      // Verify threat intelligence was triggered for high-confidence confirmation
      expect(mockSQSClient.send).toHaveBeenCalled();
      
      // Verify notification was sent
      expect(mockSNSClient.send).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        // Missing required fields
        decision: 'confirm',
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('mediaId, decision, confidence, and notes are required');
    });

    it('should validate decision values', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        mediaId: 'test-media-id',
        decision: 'invalid-decision',
        confidence: 0.85,
        notes: 'Test notes',
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('Invalid decision value');
    });

    it('should validate confidence range', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        mediaId: 'test-media-id',
        decision: 'confirm',
        confidence: 1.5, // Invalid - exceeds 1.0
        notes: 'Test notes',
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('Confidence must be between 0 and 1');
    });

    it('should not trigger threat intelligence for low-confidence decisions', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        mediaId: 'test-media-id',
        decision: 'confirm',
        confidence: 0.5, // Low confidence
        notes: 'Uncertain about manipulation',
        tags: ['uncertain'],
      });

      mockDynamoClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.threatIntelligenceTriggered).toBe(false);

      // Verify threat intelligence was NOT triggered
      expect(mockSQSClient.send).not.toHaveBeenCalled();
    });

    it('should not trigger threat intelligence for reject decisions', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        mediaId: 'test-media-id',
        decision: 'reject',
        confidence: 0.9, // High confidence but rejecting threat
        notes: 'No manipulation detected',
        tags: ['authentic'],
      });

      mockDynamoClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.threatIntelligenceTriggered).toBe(false);

      // Verify threat intelligence was NOT triggered
      expect(mockSQSClient.send).not.toHaveBeenCalled();
    });
  });

  describe('Start Review', () => {
    it('should successfully start a review', async () => {
      // Arrange
      mockEvent.pathParameters = { action: 'start' };
      mockEvent.body = JSON.stringify({
        mediaId: 'test-media-id',
        priority: 'high',
      });

      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.reviewId).toBeDefined();
      expect(responseBody.data.status).toBe('in_review');
      expect(responseBody.data.assignedModerator).toBe('moderator-123');

      // Verify notification was sent
      expect(mockSNSClient.send).toHaveBeenCalled();
    });

    it('should validate mediaId when starting review', async () => {
      // Arrange
      mockEvent.pathParameters = { action: 'start' };
      mockEvent.body = JSON.stringify({
        // Missing mediaId
        priority: 'high',
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('mediaId is required');
    });
  });

  describe('Get Review Queue', () => {
    it('should return review queue for moderator', async () => {
      // Arrange
      mockEvent.httpMethod = 'GET';
      mockEvent.pathParameters = { action: 'queue' };
      mockEvent.queryStringParameters = {
        priority: 'high',
        assignedOnly: 'false',
        limit: '10',
      };

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.queue).toBeInstanceOf(Array);
      expect(responseBody.data.totalPending).toBeDefined();
      expect(responseBody.data.priorityDistribution).toBeDefined();
      expect(responseBody.data.estimatedWorkload).toBeDefined();
    });

    it('should filter queue by assigned moderator', async () => {
      // Arrange
      mockEvent.httpMethod = 'GET';
      mockEvent.pathParameters = { action: 'queue' };
      mockEvent.queryStringParameters = {
        assignedOnly: 'true',
      };

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.assignedToMe).toBeDefined();
    });
  });

  describe('Get Review Decision', () => {
    it('should return specific review decision', async () => {
      // Arrange
      mockEvent.httpMethod = 'GET';
      mockEvent.pathParameters = { reviewId: 'test-review-id' };

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.reviewId).toBeDefined();
      expect(responseBody.data.decision).toBeDefined();
      expect(responseBody.data.confidence).toBeDefined();
    });
  });

  describe('List Review Decisions', () => {
    it('should list review decisions with filters', async () => {
      // Arrange
      mockEvent.httpMethod = 'GET';
      mockEvent.queryStringParameters = {
        moderatorId: 'moderator-123',
        decision: 'confirm',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        limit: '20',
      };

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.decisions).toBeInstanceOf(Array);
      expect(responseBody.data.totalCount).toBeDefined();
      expect(responseBody.data.filters).toMatchObject({
        moderatorId: 'moderator-123',
        decision: 'confirm',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
    });
  });

  describe('Update Review Decision', () => {
    it('should update existing review decision', async () => {
      // Arrange
      mockEvent.httpMethod = 'PUT';
      mockEvent.pathParameters = {
        reviewId: 'test-review-id',
        action: 'update',
      };
      mockEvent.body = JSON.stringify({
        notes: 'Updated notes with additional findings',
        tags: ['deepfake', 'face-manipulation', 'updated'],
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.reviewId).toBe('test-review-id');
      expect(responseBody.data.status).toBe('updated');
    });
  });

  describe('Assign Review', () => {
    it('should assign review to moderator', async () => {
      // Arrange
      mockEvent.httpMethod = 'PUT';
      mockEvent.pathParameters = {
        mediaId: 'test-media-id',
        action: 'assign',
      };
      mockEvent.body = JSON.stringify({
        moderatorId: 'moderator-456',
        priority: 'critical',
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.assignedModerator).toBe('moderator-456');
      expect(responseBody.data.priority).toBe('critical');
    });

    it('should validate moderatorId when assigning', async () => {
      // Arrange
      mockEvent.httpMethod = 'PUT';
      mockEvent.pathParameters = {
        mediaId: 'test-media-id',
        action: 'assign',
      };
      mockEvent.body = JSON.stringify({
        // Missing moderatorId
        priority: 'high',
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('moderatorId is required');
    });
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      // Arrange
      mockDynamoClient.send.mockRejectedValue(new Error('DynamoDB error'));

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toBe('Internal server error');
    });

    it('should handle SQS errors gracefully', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});
      mockSQSClient.send.mockRejectedValue(new Error('SQS error'));
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      // Should still succeed even if SQS fails (threat intelligence is not critical)
      expect(result.statusCode).toBe(200);
    });

    it('should handle invalid JSON in request body', async () => {
      // Arrange
      mockEvent.body = 'invalid-json';

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});
      mockSQSClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': expect.stringContaining('Authorization'),
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'X-Correlation-ID': 'test-correlation-id',
      });
    });
  });
});