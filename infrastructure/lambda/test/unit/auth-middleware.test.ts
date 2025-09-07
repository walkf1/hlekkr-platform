import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { EnhancedAuthMiddleware, AuthError } from '../../api/auth-middleware-enhanced';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('aws-jwt-verify');

// Mock environment variables
process.env.USER_POOL_ID = 'test-pool-id';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.RATE_LIMIT_TABLE = 'test-rate-limit-table';
process.env.USER_PROFILES_TABLE = 'test-user-profiles-table';

describe('EnhancedAuthMiddleware', () => {
  let mockEvent: APIGatewayProxyEvent;
  let mockContext: Context;
  let mockJwtVerifier: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock JWT verifier
    mockJwtVerifier = {
      verify: vi.fn(),
    };
    (CognitoJwtVerifier.create as any) = vi.fn().mockReturnValue(mockJwtVerifier);

    // Create mock event
    mockEvent = {
      httpMethod: 'GET',
      path: '/test',
      resource: '/test',
      headers: {
        Authorization: 'Bearer valid-jwt-token',
      },
      requestContext: {
        identity: {
          sourceIp: '127.0.0.1',
        },
      },
    } as any;

    // Create mock context
    mockContext = {
      awsRequestId: 'test-correlation-id',
      functionName: 'test-function',
      getRemainingTimeInMillis: () => 30000,
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticateWithRateLimit', () => {
    it('should successfully authenticate valid JWT token', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      // Mock DynamoDB responses
      const mockDynamoClient = {
        send: vi.fn()
          .mockResolvedValueOnce({ Item: null }) // User profile not found
          .mockResolvedValueOnce({}) // Create user profile
          .mockResolvedValueOnce({ Item: null }) // Rate limit data not found
          .mockResolvedValueOnce({}) // Update rate limit data
          .mockResolvedValueOnce({}), // Update user activity
      };

      vi.doMock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: vi.fn(() => mockDynamoClient),
        GetItemCommand: vi.fn(),
        PutItemCommand: vi.fn(),
        UpdateItemCommand: vi.fn(),
      }));

      vi.doMock('@aws-sdk/util-dynamodb', () => ({
        marshall: vi.fn((obj) => obj),
        unmarshall: vi.fn((obj) => obj),
      }));

      // Act
      const result = await EnhancedAuthMiddleware.authenticateWithRateLimit(
        mockEvent,
        mockContext,
        ['canViewAnalysis']
      );

      // Assert
      expect(result.user).toBeDefined();
      expect(result.user.userId).toBe('test-user-id');
      expect(result.user.email).toBe('test@example.com');
      expect(result.rateLimitPassed).toBe(true);
      expect(mockJwtVerifier.verify).toHaveBeenCalledWith('valid-jwt-token');
    });

    it('should throw AuthError for missing Authorization header', async () => {
      // Arrange
      mockEvent.headers = {};

      // Act & Assert
      await expect(
        EnhancedAuthMiddleware.authenticateWithRateLimit(mockEvent, mockContext)
      ).rejects.toThrow(AuthError);
    });

    it('should throw AuthError for invalid Authorization header format', async () => {
      // Arrange
      mockEvent.headers.Authorization = 'InvalidFormat';

      // Act & Assert
      await expect(
        EnhancedAuthMiddleware.authenticateWithRateLimit(mockEvent, mockContext)
      ).rejects.toThrow(AuthError);
    });

    it('should throw AuthError for expired JWT token', async () => {
      // Arrange
      mockJwtVerifier.verify.mockRejectedValue(new Error('Token expired'));

      // Act & Assert
      await expect(
        EnhancedAuthMiddleware.authenticateWithRateLimit(mockEvent, mockContext)
      ).rejects.toThrow(AuthError);
    });

    it('should enforce rate limits correctly', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      // Mock rate limit exceeded scenario
      const mockRateLimitData = {
        rateLimitKey: 'test-user-id:GET:/test',
        minuteRequests: 100, // Exceeds default limit of 60
        hourRequests: 50,
        dayRequests: 100,
        lastMinute: Math.floor(Date.now() / 60000),
        lastHour: Math.floor(Date.now() / 3600000),
        lastDay: Math.floor(Date.now() / 86400000),
        burstCount: 5,
        lastBurstReset: Date.now(),
      };

      const mockDynamoClient = {
        send: vi.fn()
          .mockResolvedValueOnce({ Item: null }) // User profile not found
          .mockResolvedValueOnce({}) // Create user profile
          .mockResolvedValueOnce({ Item: mockRateLimitData }) // Rate limit data found
          .mockResolvedValueOnce({}), // Update user activity
      };

      vi.doMock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: vi.fn(() => mockDynamoClient),
        GetItemCommand: vi.fn(),
        PutItemCommand: vi.fn(),
        UpdateItemCommand: vi.fn(),
      }));

      vi.doMock('@aws-sdk/util-dynamodb', () => ({
        marshall: vi.fn((obj) => obj),
        unmarshall: vi.fn((obj) => mockRateLimitData),
      }));

      // Act
      const result = await EnhancedAuthMiddleware.authenticateWithRateLimit(
        mockEvent,
        mockContext
      );

      // Assert
      expect(result.rateLimitPassed).toBe(false);
    });
  });

  describe('withAuthAndRateLimit', () => {
    it('should handle OPTIONS requests without authentication', async () => {
      // Arrange
      mockEvent.httpMethod = 'OPTIONS';
      const mockHandler = vi.fn();

      const wrappedHandler = EnhancedAuthMiddleware.withAuthAndRateLimit(mockHandler);

      // Act
      const result = await wrappedHandler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should call handler with authenticated request', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      const mockHandler = vi.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      });

      const mockDynamoClient = {
        send: vi.fn()
          .mockResolvedValueOnce({ Item: null })
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({ Item: null })
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({}),
      };

      vi.doMock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: vi.fn(() => mockDynamoClient),
        GetItemCommand: vi.fn(),
        PutItemCommand: vi.fn(),
        UpdateItemCommand: vi.fn(),
      }));

      const wrappedHandler = EnhancedAuthMiddleware.withAuthAndRateLimit(mockHandler);

      // Act
      const result = await wrappedHandler(mockEvent, mockContext);

      // Assert
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockEvent,
          user: expect.objectContaining({
            userId: 'test-user-id',
            email: 'test@example.com',
          }),
          correlationId: 'test-correlation-id',
        }),
        mockContext
      );
      expect(result.statusCode).toBe(200);
    });

    it('should return rate limit error when rate limit exceeded', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      const mockRateLimitData = {
        minuteRequests: 100, // Exceeds limit
        hourRequests: 50,
        dayRequests: 100,
        lastMinute: Math.floor(Date.now() / 60000),
      };

      const mockDynamoClient = {
        send: vi.fn()
          .mockResolvedValueOnce({ Item: null })
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({ Item: mockRateLimitData }),
      };

      vi.doMock('@aws-sdk/util-dynamodb', () => ({
        marshall: vi.fn((obj) => obj),
        unmarshall: vi.fn((obj) => mockRateLimitData),
      }));

      const mockHandler = vi.fn();
      const wrappedHandler = EnhancedAuthMiddleware.withAuthAndRateLimit(mockHandler);

      // Act
      const result = await wrappedHandler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(429);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(JSON.parse(result.body).error.type).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should enforce required permissions', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      const mockUserProfile = {
        userId: 'test-user-id',
        permissions: {
          canViewAnalysis: false, // Missing required permission
        },
      };

      const mockDynamoClient = {
        send: vi.fn()
          .mockResolvedValueOnce({ Item: mockUserProfile }),
      };

      vi.doMock('@aws-sdk/util-dynamodb', () => ({
        marshall: vi.fn((obj) => obj),
        unmarshall: vi.fn((obj) => mockUserProfile),
      }));

      const mockHandler = vi.fn();
      const wrappedHandler = EnhancedAuthMiddleware.withAuthAndRateLimit(
        mockHandler,
        ['canViewAnalysis'] // Required permission
      );

      // Act
      const result = await wrappedHandler(mockEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(403);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      const mockDynamoClient = {
        send: vi.fn().mockRejectedValue(new Error('DynamoDB error')),
      };

      vi.doMock('@aws-sdk/client-dynamodb', () => ({
        DynamoDBClient: vi.fn(() => mockDynamoClient),
        GetItemCommand: vi.fn(),
      }));

      // Act & Assert
      await expect(
        EnhancedAuthMiddleware.authenticateWithRateLimit(mockEvent, mockContext)
      ).rejects.toThrow('Failed to load user profile');
    });

    it('should handle JWT verification errors', async () => {
      // Arrange
      mockJwtVerifier.verify.mockRejectedValue(new Error('Invalid token'));

      // Act & Assert
      await expect(
        EnhancedAuthMiddleware.authenticateWithRateLimit(mockEvent, mockContext)
      ).rejects.toThrow();
    });
  });

  describe('CORS Handling', () => {
    it('should add CORS headers to successful responses', async () => {
      // Arrange
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
      };

      mockJwtVerifier.verify.mockResolvedValue(mockPayload);

      const mockHandler = vi.fn().mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ success: true }),
      });

      const mockDynamoClient = {
        send: vi.fn()
          .mockResolvedValue({ Item: null })
          .mockResolvedValue({})
          .mockResolvedValue({ Item: null })
          .mockResolvedValue({})
          .mockResolvedValue({}),
      };

      const wrappedHandler = EnhancedAuthMiddleware.withAuthAndRateLimit(mockHandler);

      // Act
      const result = await wrappedHandler(mockEvent, mockContext);

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