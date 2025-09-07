import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../api/media-upload';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3');
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/client-sqs');
vi.mock('@aws-sdk/s3-request-presigner');

// Mock enhanced auth middleware
vi.mock('../../api/auth-middleware-enhanced', () => ({
  EnhancedAuthMiddleware: {
    withAuthAndRateLimit: (handlerFn: any) => handlerFn,
  },
  ENDPOINT_RATE_LIMITS: {
    '/media': {
      requestsPerMinute: 10,
      burstLimit: 3,
    },
  },
}));

// Mock environment variables
process.env.MEDIA_BUCKET = 'test-media-bucket';
process.env.MEDIA_ANALYSIS_TABLE = 'test-media-analysis-table';
process.env.ANALYSIS_QUEUE_URL = 'test-analysis-queue-url';

describe('Media Upload Handler', () => {
  let mockEvent: any;
  let mockContext: Context;
  let mockS3Client: any;
  let mockDynamoClient: any;
  let mockSQSClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AWS clients
    mockS3Client = {
      send: vi.fn(),
    };

    mockDynamoClient = {
      send: vi.fn(),
    };

    mockSQSClient = {
      send: vi.fn(),
    };

    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: vi.fn(() => mockS3Client),
      PutObjectCommand: vi.fn(),
      CreateMultipartUploadCommand: vi.fn(),
      UploadPartCommand: vi.fn(),
      CompleteMultipartUploadCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: vi.fn(() => mockDynamoClient),
      PutItemCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-sqs', () => ({
      SQSClient: vi.fn(() => mockSQSClient),
      SendMessageCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: vi.fn().mockResolvedValue('https://presigned-url.com'),
    }));

    vi.doMock('@aws-sdk/util-dynamodb', () => ({
      marshall: vi.fn((obj) => obj),
    }));

    // Create mock authenticated event
    mockEvent = {
      httpMethod: 'POST',
      path: '/media',
      pathParameters: null,
      body: JSON.stringify({
        fileName: 'test-video.mp4',
        fileSize: 1024000, // 1MB
        fileType: 'video/mp4',
        metadata: {
          description: 'Test video upload',
        },
      }),
      user: {
        userId: 'test-user-id',
        email: 'test@example.com',
        permissions: {
          canUploadMedia: true,
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

  describe('Direct Upload (Small Files)', () => {
    it('should handle direct upload for small files successfully', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.mediaId).toBeDefined();
      expect(responseBody.data.uploadUrl).toBeDefined();
      expect(responseBody.correlationId).toBe('test-correlation-id');

      // Verify DynamoDB was called to store media record
      expect(mockDynamoClient.send).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        // Missing fileName and fileType
        fileSize: 1024000,
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('fileName and fileType are required');
    });

    it('should validate file type', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        fileName: 'test.exe',
        fileType: 'application/x-executable', // Not allowed
        fileSize: 1024000,
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('not supported');
    });

    it('should validate file size limits', async () => {
      // Arrange
      mockEvent.body = JSON.stringify({
        fileName: 'huge-file.mp4',
        fileType: 'video/mp4',
        fileSize: 600 * 1024 * 1024, // 600MB - exceeds 500MB limit
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('exceeds maximum limit');
    });
  });

  describe('Multipart Upload (Large Files)', () => {
    it('should initiate multipart upload for large files', async () => {
      // Arrange
      mockEvent.pathParameters = { action: 'initiate' };
      mockEvent.body = JSON.stringify({
        fileName: 'large-video.mp4',
        fileType: 'video/mp4',
        fileSize: 150 * 1024 * 1024, // 150MB - triggers multipart
      });

      mockS3Client.send.mockResolvedValue({
        UploadId: 'test-upload-id',
      });

      mockDynamoClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.multipartUpload).toBeDefined();
      expect(responseBody.data.multipartUpload.uploadId).toBe('test-upload-id');
      expect(responseBody.data.multipartUpload.presignedUrls).toBeInstanceOf(Array);
    });

    it('should complete multipart upload', async () => {
      // Arrange
      mockEvent.httpMethod = 'PUT';
      mockEvent.pathParameters = {
        mediaId: 'test-media-id',
        action: 'complete',
      };
      mockEvent.body = JSON.stringify({
        uploadId: 'test-upload-id',
        parts: [
          { ETag: 'etag1', PartNumber: 1 },
          { ETag: 'etag2', PartNumber: 2 },
        ],
      });

      mockS3Client.send.mockResolvedValue({});
      mockSQSClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.status).toBe('uploaded');
      expect(responseBody.data.message).toContain('completed successfully');

      // Verify analysis was triggered
      expect(mockSQSClient.send).toHaveBeenCalled();
    });

    it('should validate multipart completion parameters', async () => {
      // Arrange
      mockEvent.httpMethod = 'PUT';
      mockEvent.pathParameters = {
        mediaId: 'test-media-id',
        action: 'complete',
      };
      mockEvent.body = JSON.stringify({
        // Missing uploadId and parts
      });

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toContain('uploadId and parts array are required');
    });
  });

  describe('Upload Status', () => {
    it('should return upload status for existing media', async () => {
      // Arrange
      mockEvent.httpMethod = 'GET';
      mockEvent.pathParameters = {
        mediaId: 'test-media-id',
      };

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.mediaId).toBe('test-media-id');
      expect(responseBody.data.status).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle S3 errors gracefully', async () => {
      // Arrange
      mockS3Client.send.mockRejectedValue(new Error('S3 service error'));

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
      expect(responseBody.error.message).toBe('Failed to handle upload');
    });

    it('should handle DynamoDB errors gracefully', async () => {
      // Arrange
      mockDynamoClient.send.mockRejectedValue(new Error('DynamoDB error'));

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.success).toBe(false);
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

  describe('Security Validation', () => {
    it('should generate unique media IDs', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});

      // Act
      const result1 = await handler(mockEvent, mockContext);
      const result2 = await handler(mockEvent, mockContext);

      // Assert
      const body1 = JSON.parse(result1.body);
      const body2 = JSON.parse(result2.body);
      
      expect(body1.data.mediaId).not.toBe(body2.data.mediaId);
    });

    it('should include correlation ID in responses', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.headers['X-Correlation-ID']).toBe('test-correlation-id');
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.correlationId).toBe('test-correlation-id');
    });

    it('should validate allowed file types', async () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
      
      for (const fileType of allowedTypes) {
        // Arrange
        mockEvent.body = JSON.stringify({
          fileName: `test.${fileType.split('/')[1]}`,
          fileType,
          fileSize: 1024000,
        });
        
        mockDynamoClient.send.mockResolvedValue({});

        // Act
        const result = await handler(mockEvent, mockContext);

        // Assert
        expect(result.statusCode).toBe(200);
      }
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', async () => {
      // Arrange
      mockDynamoClient.send.mockResolvedValue({});

      // Act
      const result = await handler(mockEvent, mockContext);

      // Assert
      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': expect.stringContaining('Authorization'),
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      });
    });
  });
});