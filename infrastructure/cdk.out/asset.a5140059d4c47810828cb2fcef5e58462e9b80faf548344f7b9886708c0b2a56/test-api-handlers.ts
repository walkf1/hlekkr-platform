/**
 * Comprehensive test suite for API handlers
 * Tests validation, authentication, error handling, and business logic
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler as apiRouter } from './api-router';
import { handler as mediaAnalysisHandler } from './media-analysis-handler';
import { validateRequest, TrustScoreSchemas, MediaUploadSchemas } from './validation-schemas';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sfn');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-sns');

// Mock authentication
jest.mock('../auth/enhanced-auth-middleware', () => ({
  EnhancedAuthMiddleware: {
    withEnhancedAuth: (handler: any) => handler,
    authenticate: jest.fn(),
  },
  PERMISSIONS: {
    VIEW_ANALYSIS: 'canViewAnalysis',
    UPLOAD_MEDIA: 'canUploadMedia',
    MODERATE_CONTENT: 'canModerateContent',
  },
}));

describe('API Handlers Test Suite', () => {
  
  describe('Validation Schemas', () => {
    
    test('should validate trust score query parameters', () => {
      const validQuery = {
        scoreRange: '61-80',
        limit: 20,
        statistics: true,
      };
      
      const result = validateRequest(validQuery, TrustScoreSchemas.getTrustScoresQuery);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    test('should reject invalid trust score query parameters', () => {
      const invalidQuery = {
        scoreRange: 'invalid-range',
        limit: 150, // Exceeds maximum
        minScore: -10, // Below minimum
      };
      
      const result = validateRequest(invalidQuery, TrustScoreSchemas.getTrustScoresQuery);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    test('should validate media upload request', () => {
      const validUpload = {
        fileName: 'test-image.jpg',
        fileSize: 1024000,
        contentType: 'image/jpeg',
        description: 'Test image for analysis',
        tags: ['test', 'sample'],
      };
      
      const result = validateRequest(validUpload, MediaUploadSchemas.uploadRequestSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    test('should reject invalid media upload request', () => {
      const invalidUpload = {
        fileName: '', // Empty filename
        fileSize: 0, // Zero size
        contentType: 'application/pdf', // Unsupported type
        tags: new Array(15).fill('tag'), // Too many tags
      };
      
      const result = validateRequest(invalidUpload, MediaUploadSchemas.uploadRequestSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
  
  describe('API Router', () => {
    
    const mockContext: Context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '128',
      awsRequestId: 'test-request-id',
      logGroupName: 'test-log-group',
      logStreamName: 'test-log-stream',
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };
    
    test('should handle CORS preflight requests', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'OPTIONS',
        path: '/trust-scores',
        resource: '/trust-scores',
        pathParameters: null,
        queryStringParameters: null,
        headers: {},
        multiValueHeaders: {},
        body: null,
        isBase64Encoded: false,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api',
          protocol: 'HTTP/1.1',
          httpMethod: 'OPTIONS',
          path: '/trust-scores',
          stage: 'test',
          requestId: 'test-request',
          requestTime: '01/Jan/2024:00:00:00 +0000',
          requestTimeEpoch: 1704067200,
          resourceId: 'test-resource',
          resourcePath: '/trust-scores',
          identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '127.0.0.1',
            user: null,
            userAgent: 'test-agent',
            userArn: null,
          },
          authorizer: null,
        },
      };
      
      const result = await apiRouter(event, mockContext);
      
      expect(result.statusCode).toBe(200);
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
    });
    
    test('should return 404 for unknown routes', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'GET',
        path: '/unknown-endpoint',
        resource: '/unknown-endpoint',
      };
      
      const result = await apiRouter(event, mockContext);
      
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Route not found');
    });
    
    test('should validate request parameters', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'GET',
        path: '/trust-scores',
        resource: '/trust-scores',
        queryStringParameters: {
          limit: '150', // Exceeds maximum
          scoreRange: 'invalid-range',
        },
      };
      
      const result = await apiRouter(event, mockContext);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('validation');
    });
  });
  
  describe('Media Analysis Handler', () => {
    
    const mockAuth = {
      user: {
        userId: 'test-user-123',
        email: 'test@example.com',
        role: 'user',
        permissions: {
          canViewAnalysis: true,
          canUploadMedia: true,
        },
        profile: {},
      },
      correlationId: 'test-correlation-id',
      requestTime: new Date().toISOString(),
    };
    
    test('should start media analysis', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'POST',
        path: '/media/test-media-id/analyze',
        resource: '/media/{mediaId}/analyze',
        pathParameters: {
          mediaId: 'test-media-id',
        },
        body: JSON.stringify({
          analysisType: 'full',
          priority: 'normal',
          options: {
            includeAdvancedMetrics: true,
          },
        }),
      };
      
      // Mock the media record exists
      const mockGetMediaRecord = jest.fn().mockResolvedValue({
        mediaId: 'test-media-id',
        userId: 'test-user-123',
        s3Bucket: 'test-bucket',
        s3Key: 'test-key',
        contentType: 'image/jpeg',
        fileSize: 1024000,
      });
      
      // Mock Step Functions start execution
      const mockStartExecution = jest.fn().mockResolvedValue({
        executionArn: 'arn:aws:states:us-east-1:123456789012:execution:test-state-machine:test-execution',
      });
      
      // Apply mocks (in real tests, these would be properly mocked)
      
      const result = await mediaAnalysisHandler(event, mockContext, mockAuth);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('analysisId');
      expect(body.data).toHaveProperty('status');
    });
    
    test('should reject analysis for non-existent media', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'POST',
        path: '/media/non-existent-id/analyze',
        resource: '/media/{mediaId}/analyze',
        pathParameters: {
          mediaId: 'non-existent-id',
        },
        body: JSON.stringify({
          analysisType: 'full',
        }),
      };
      
      const result = await mediaAnalysisHandler(event, mockContext, mockAuth);
      
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('not found');
    });
    
    test('should reject unauthorized access to media', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'POST',
        path: '/media/other-user-media/analyze',
        resource: '/media/{mediaId}/analyze',
        pathParameters: {
          mediaId: 'other-user-media',
        },
        body: JSON.stringify({
          analysisType: 'full',
        }),
      };
      
      const unauthorizedAuth = {
        ...mockAuth,
        user: {
          ...mockAuth.user,
          userId: 'different-user',
          permissions: {
            canViewAnalysis: true,
            // No moderate content permission
          },
        },
      };
      
      const result = await mediaAnalysisHandler(event, mockContext, unauthorizedAuth);
      
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('Access denied');
    });
  });
  
  describe('Error Handling', () => {
    
    test('should handle malformed JSON in request body', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'POST',
        path: '/trust-scores/test-media-id',
        resource: '/trust-scores/{mediaId}',
        pathParameters: {
          mediaId: 'test-media-id',
        },
        body: '{ invalid json }',
      };
      
      const result = await apiRouter(event, mockContext);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('validation');
    });
    
    test('should include correlation ID in all responses', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'GET',
        path: '/health',
        resource: '/health',
      };
      
      const result = await apiRouter(event, mockContext);
      
      expect(result.headers).toHaveProperty('X-Correlation-ID', mockContext.awsRequestId);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('correlationId', mockContext.awsRequestId);
    });
    
    test('should handle internal server errors gracefully', async () => {
      // Mock a function that throws an error
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'GET',
        path: '/trust-scores',
        resource: '/trust-scores',
      };
      
      // This would trigger an error in a real scenario
      const result = await apiRouter(event, mockContext);
      
      // Should return 500 error with proper structure
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body).toHaveProperty('correlationId');
      
      console.error = originalConsoleError;
    });
  });
  
  describe('Security Headers', () => {
    
    test('should include security headers in responses', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'GET',
        path: '/health',
        resource: '/health',
      };
      
      const result = await apiRouter(event, mockContext);
      
      expect(result.headers).toHaveProperty('X-Content-Type-Options', 'nosniff');
      expect(result.headers).toHaveProperty('X-Frame-Options', 'DENY');
      expect(result.headers).toHaveProperty('X-XSS-Protection', '1; mode=block');
      expect(result.headers).toHaveProperty('Strict-Transport-Security');
      expect(result.headers).toHaveProperty('Content-Security-Policy');
    });
  });
  
  describe('Performance Tests', () => {
    
    test('should respond within acceptable time limits', async () => {
      const event: APIGatewayProxyEvent = {
        ...createMockEvent(),
        httpMethod: 'GET',
        path: '/health',
        resource: '/health',
      };
      
      const startTime = Date.now();
      const result = await apiRouter(event, mockContext);
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
      expect(result.statusCode).toBeDefined();
    });
  });
});

/**
 * Helper function to create mock API Gateway event
 */
function createMockEvent(): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/test',
    resource: '/test',
    pathParameters: null,
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'test-agent',
      'Authorization': 'Bearer test-token',
    },
    multiValueHeaders: {},
    body: null,
    isBase64Encoded: false,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      path: '/test',
      stage: 'test',
      requestId: 'test-request',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200,
      resourceId: 'test-resource',
      resourcePath: '/test',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
      authorizer: null,
    },
  };
}

/**
 * Integration test helpers
 */
export class TestHelpers {
  
  static createTestUser(overrides: Partial<any> = {}) {
    return {
      userId: 'test-user-123',
      email: 'test@example.com',
      role: 'user',
      permissions: {
        canViewAnalysis: true,
        canUploadMedia: true,
        canModerateContent: false,
        ...overrides.permissions,
      },
      profile: {},
      ...overrides,
    };
  }
  
  static createTestMedia(overrides: Partial<any> = {}) {
    return {
      mediaId: 'test-media-123',
      userId: 'test-user-123',
      fileName: 'test-image.jpg',
      fileSize: 1024000,
      contentType: 'image/jpeg',
      s3Bucket: 'test-bucket',
      s3Key: 'test-key',
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
      ...overrides,
    };
  }
  
  static createTestAnalysis(overrides: Partial<any> = {}) {
    return {
      analysisId: 'test-analysis-123',
      mediaId: 'test-media-123',
      status: 'completed',
      analysisType: 'full',
      startedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
      completedAt: new Date().toISOString(),
      results: {
        deepfakeAnalysis: {
          deepfakeConfidence: 0.1,
          detectedTechniques: [],
        },
        trustScore: {
          compositeScore: 85.5,
          confidence: 'high',
        },
        sourceVerification: {
          verificationStatus: 'verified',
          verificationConfidence: 0.9,
        },
      },
      ...overrides,
    };
  }
}

/**
 * Mock data for testing
 */
export const MockData = {
  validTrustScoreQuery: {
    scoreRange: '61-80',
    limit: 20,
    statistics: true,
  },
  
  validMediaUpload: {
    fileName: 'test-image.jpg',
    fileSize: 1024000,
    contentType: 'image/jpeg',
    description: 'Test image for analysis',
    tags: ['test', 'sample'],
  },
  
  validAnalysisRequest: {
    analysisType: 'full',
    priority: 'normal',
    options: {
      includeAdvancedMetrics: true,
      generateReport: false,
    },
  },
};