import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE!;

export interface RateLimitConfig {
  endpoint: string;
  method: string;
  windowMs: number;
  maxRequests: number;
  userRole?: string;
}

export interface RateLimitRecord {
  key: string;
  requests: number;
  windowStart: number;
  lastRequest: number;
  ttl: number;
}

/**
 * Rate limiting middleware for API endpoints
 */
export class RateLimiter {
  private static readonly DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
    // Media upload limits
    'POST:/media': { endpoint: '/media', method: 'POST', windowMs: 60000, maxRequests: 10 }, // 10 uploads per minute
    'POST:/media/initiate': { endpoint: '/media/initiate', method: 'POST', windowMs: 60000, maxRequests: 5 }, // 5 multipart initiations per minute
    
    // Analysis results limits
    'GET:/analysis/results': { endpoint: '/analysis/results', method: 'GET', windowMs: 60000, maxRequests: 60 }, // 60 requests per minute
    'GET:/analysis/results/*': { endpoint: '/analysis/results/*', method: 'GET', windowMs: 60000, maxRequests: 30 }, // 30 detail views per minute
    
    // Review decision limits
    'POST:/review/decisions': { endpoint: '/review/decisions', method: 'POST', windowMs: 60000, maxRequests: 20 }, // 20 decisions per minute
    'GET:/review/queue': { endpoint: '/review/queue', method: 'GET', windowMs: 60000, maxRequests: 30 }, // 30 queue checks per minute
    
    // Authentication limits
    'POST:/auth/login': { endpoint: '/auth/login', method: 'POST', windowMs: 300000, maxRequests: 5 }, // 5 login attempts per 5 minutes
    'POST:/auth/refresh': { endpoint: '/auth/refresh', method: 'POST', windowMs: 60000, maxRequests: 10 }, // 10 token refreshes per minute
  };

  private static readonly ROLE_MULTIPLIERS: Record<string, number> = {
    'user': 1.0,
    'moderator': 2.0,
    'admin': 5.0,
    'super_admin': 10.0,
  };

  /**
   * Check rate limit for a request
   */
  static async checkRateLimit(
    event: APIGatewayProxyEvent,
    userId: string,
    userRole: string = 'user'
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number; error?: string }> {
    try {
      const { httpMethod, path } = event;
      const endpoint = this.normalizeEndpoint(path);
      const limitKey = `${httpMethod}:${endpoint}`;
      
      // Get rate limit configuration
      const config = this.getRateLimitConfig(limitKey, userRole);
      if (!config) {
        // No rate limit configured, allow request
        return { allowed: true, remaining: -1, resetTime: 0 };
      }

      // Create rate limit key
      const rateLimitKey = `${userId}:${limitKey}`;
      const now = Date.now();
      const windowStart = Math.floor(now / config.windowMs) * config.windowMs;

      // Get current rate limit record
      const record = await this.getRateLimitRecord(rateLimitKey);

      if (!record || record.windowStart < windowStart) {
        // New window, reset counter
        const newRecord: RateLimitRecord = {
          key: rateLimitKey,
          requests: 1,
          windowStart,
          lastRequest: now,
          ttl: Math.floor((windowStart + config.windowMs * 2) / 1000), // TTL 2 windows ahead
        };

        await this.saveRateLimitRecord(newRecord);
        
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetTime: windowStart + config.windowMs,
        };
      }

      // Check if limit exceeded
      if (record.requests >= config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: windowStart + config.windowMs,
          error: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`,
        };
      }

      // Increment counter
      const updatedRecord: RateLimitRecord = {
        ...record,
        requests: record.requests + 1,
        lastRequest: now,
      };

      await this.saveRateLimitRecord(updatedRecord);

      return {
        allowed: true,
        remaining: config.maxRequests - updatedRecord.requests,
        resetTime: windowStart + config.windowMs,
      };

    } catch (error) {
      console.error('Error checking rate limit:', error);
      // On error, allow request to avoid blocking legitimate traffic
      return { allowed: true, remaining: -1, resetTime: 0 };
    }
  }

  /**
   * Create rate limit middleware wrapper
   */
  static withRateLimit<T = any>(
    handler: (event: APIGatewayProxyEvent, context: Context, rateLimitInfo: any) => Promise<APIGatewayProxyResult>,
    customConfig?: Partial<RateLimitConfig>
  ) {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      try {
        // Extract user information from event (assumes authentication middleware has run)
        const userId = event.requestContext.authorizer?.claims?.sub || 
                      event.headers['X-User-ID'] || 
                      event.requestContext.identity.sourceIp; // Fallback to IP for unauthenticated requests
        
        const userRole = event.requestContext.authorizer?.claims?.['custom:role'] || 'user';

        // Check rate limit
        const rateLimitResult = await RateLimiter.checkRateLimit(event, userId, userRole);

        if (!rateLimitResult.allowed) {
          return {
            statusCode: 429,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'X-RateLimit-Limit': RateLimiter.getRateLimitConfig(`${event.httpMethod}:${RateLimiter.normalizeEndpoint(event.path)}`, userRole)?.maxRequests.toString() || '0',
              'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
              'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
              'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
            },
            body: JSON.stringify({
              success: false,
              error: {
                message: rateLimitResult.error || 'Rate limit exceeded',
                code: 429,
                retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
              },
              correlationId: context.awsRequestId,
            }),
          };
        }

        // Add rate limit headers to response
        const response = await handler(event, context, rateLimitResult);
        
        return {
          ...response,
          headers: {
            ...response.headers,
            'X-RateLimit-Limit': RateLimiter.getRateLimitConfig(`${event.httpMethod}:${RateLimiter.normalizeEndpoint(event.path)}`, userRole)?.maxRequests.toString() || '0',
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          },
        };

      } catch (error) {
        console.error('Error in rate limit middleware:', error);
        // On error, proceed without rate limiting
        return await handler(event, context, { allowed: true, remaining: -1, resetTime: 0 });
      }
    };
  }

  /**
   * Get rate limit record from DynamoDB
   */
  private static async getRateLimitRecord(key: string): Promise<RateLimitRecord | null> {
    try {
      const result = await dynamoClient.send(new GetItemCommand({
        TableName: RATE_LIMIT_TABLE,
        Key: marshall({ key }),
      }));

      if (!result.Item) {
        return null;
      }

      return unmarshall(result.Item) as RateLimitRecord;
    } catch (error) {
      console.error('Error getting rate limit record:', error);
      return null;
    }
  }

  /**
   * Save rate limit record to DynamoDB
   */
  private static async saveRateLimitRecord(record: RateLimitRecord): Promise<void> {
    try {
      await dynamoClient.send(new PutItemCommand({
        TableName: RATE_LIMIT_TABLE,
        Item: marshall(record),
      }));
    } catch (error) {
      console.error('Error saving rate limit record:', error);
      throw error;
    }
  }

  /**
   * Get rate limit configuration for endpoint
   */
  private static getRateLimitConfig(limitKey: string, userRole: string): RateLimitConfig | null {
    const baseConfig = this.DEFAULT_LIMITS[limitKey];
    if (!baseConfig) {
      return null;
    }

    // Apply role-based multiplier
    const multiplier = this.ROLE_MULTIPLIERS[userRole] || 1.0;
    
    return {
      ...baseConfig,
      maxRequests: Math.floor(baseConfig.maxRequests * multiplier),
    };
  }

  /**
   * Normalize endpoint path for rate limiting
   */
  private static normalizeEndpoint(path: string): string {
    // Replace path parameters with wildcards
    return path
      .replace(/\/[a-fA-F0-9-]{36}/, '/*') // UUIDs
      .replace(/\/[a-zA-Z0-9-]+$/, '/*') // Generic IDs at end of path
      .replace(/\/\d+$/, '/*'); // Numeric IDs
  }

  /**
   * Get rate limit statistics for monitoring
   */
  static async getRateLimitStats(userId?: string, timeRange?: { start: number; end: number }): Promise<{
    totalRequests: number;
    blockedRequests: number;
    topEndpoints: Array<{ endpoint: string; requests: number }>;
    topUsers: Array<{ userId: string; requests: number }>;
  }> {
    // Implementation would query DynamoDB for statistics
    // For demo, return mock statistics
    return {
      totalRequests: 1250,
      blockedRequests: 23,
      topEndpoints: [
        { endpoint: 'GET:/analysis/results', requests: 450 },
        { endpoint: 'POST:/media', requests: 320 },
        { endpoint: 'GET:/review/queue', requests: 180 },
      ],
      topUsers: [
        { userId: 'user-123', requests: 89 },
        { userId: 'moderator-456', requests: 156 },
        { userId: 'admin-789', requests: 67 },
      ],
    };
  }

  /**
   * Clear rate limit for user (admin function)
   */
  static async clearRateLimit(userId: string, endpoint?: string): Promise<void> {
    try {
      if (endpoint) {
        // Clear specific endpoint rate limit
        const key = `${userId}:${endpoint}`;
        await dynamoClient.send(new UpdateItemCommand({
          TableName: RATE_LIMIT_TABLE,
          Key: marshall({ key }),
          UpdateExpression: 'SET requests = :zero',
          ExpressionAttributeValues: marshall({ ':zero': 0 }),
        }));
      } else {
        // Clear all rate limits for user (would need to scan and update)
        console.log(`Clearing all rate limits for user ${userId}`);
      }
    } catch (error) {
      console.error('Error clearing rate limit:', error);
      throw error;
    }
  }
}