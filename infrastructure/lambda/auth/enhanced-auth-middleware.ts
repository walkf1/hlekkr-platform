/**
 * Enhanced authentication middleware with advanced security features
 * Includes rate limiting, session management, audit logging, and threat detection
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { AuthMiddleware, AuthContext, AuthError, PERMISSIONS } from './auth-middleware';
import { createErrorResponse, createAuthErrorResponse, createRateLimitResponse } from '../api/error-handler';
import { randomUUID } from 'crypto';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

// Environment variables
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;
const SECURITY_EVENTS_TABLE = process.env.SECURITY_EVENTS_TABLE || `hlekkr-security-events-${process.env.AWS_ACCOUNT_ID}-${process.env.AWS_REGION}`;
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || `hlekkr-rate-limits-${process.env.AWS_ACCOUNT_ID}-${process.env.AWS_REGION}`;
const SECURITY_ALERTS_TOPIC = process.env.SECURITY_ALERTS_TOPIC_ARN;

interface SecurityEvent {
  eventId: string;
  userId: string;
  eventType: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  correlationId: string;
}

interface RateLimitConfig {
  requests: number;
  windowMs: number;
  burstLimit?: number;
}

interface ThreatIndicator {
  type: 'suspicious_ip' | 'rapid_requests' | 'unusual_pattern' | 'failed_auth' | 'privilege_escalation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  details: Record<string, any>;
}

/**
 * Enhanced authentication middleware with security features
 */
export class EnhancedAuthMiddleware extends AuthMiddleware {
  
  /**
   * Rate limiting configurations by endpoint pattern
   */
  private static readonly RATE_LIMITS: Record<string, RateLimitConfig> = {
    '/trust-scores': { requests: 100, windowMs: 60000 }, // 100 requests per minute
    '/source-verification': { requests: 50, windowMs: 60000 }, // 50 requests per minute
    '/chain-of-custody': { requests: 200, windowMs: 60000 }, // 200 requests per minute
    '/discrepancies': { requests: 20, windowMs: 60000 }, // 20 requests per minute (expensive operation)
    '/media': { requests: 30, windowMs: 60000, burstLimit: 10 }, // 30 uploads per minute, max 10 in burst
    'default': { requests: 200, windowMs: 60000 }, // Default rate limit
  };

  /**
   * Suspicious activity thresholds
   */
  private static readonly THREAT_THRESHOLDS = {
    FAILED_AUTH_ATTEMPTS: 5,
    RAPID_REQUEST_THRESHOLD: 50, // requests per minute
    UNUSUAL_LOCATION_THRESHOLD: 0.8, // confidence threshold
    PRIVILEGE_ESCALATION_THRESHOLD: 3, // attempts
  };

  /**
   * Enhanced authentication with security monitoring
   */
  static async authenticateWithSecurity(
    event: APIGatewayProxyEvent, 
    context: Context, 
    requiredPermissions?: string[]
  ): Promise<AuthContext> {
    const correlationId = context.awsRequestId;
    const startTime = Date.now();
    
    try {
      // Extract request metadata
      const requestMetadata = EnhancedAuthMiddleware.extractRequestMetadata(event);
      
      // Check for immediate security threats
      const threatIndicators = await EnhancedAuthMiddleware.detectThreats(requestMetadata, correlationId);
      
      if (threatIndicators.some(t => t.severity === 'critical')) {
        await EnhancedAuthMiddleware.logSecurityEvent({
          eventId: randomUUID(),
          userId: 'unknown',
          eventType: 'critical_threat_detected',
          timestamp: new Date().toISOString(),
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          details: { threats: threatIndicators },
          severity: 'critical',
          correlationId,
        });
        
        throw new AuthError('Access denied due to security policy', 403);
      }
      
      // Perform standard authentication
      const auth = await EnhancedAuthMiddleware.authenticate(event, context, requiredPermissions);
      
      // Check rate limits
      const rateLimitResult = await EnhancedAuthMiddleware.checkRateLimit(
        auth.user.userId,
        event.resource,
        requestMetadata.ipAddress,
        correlationId
      );
      
      if (!rateLimitResult.allowed) {
        await EnhancedAuthMiddleware.logSecurityEvent({
          eventId: randomUUID(),
          userId: auth.user.userId,
          eventType: 'rate_limit_exceeded',
          timestamp: new Date().toISOString(),
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          details: { 
            resource: event.resource,
            currentCount: rateLimitResult.currentCount,
            limit: rateLimitResult.limit 
          },
          severity: 'medium',
          correlationId,
        });
        
        throw new AuthError('Rate limit exceeded', 429);
      }
      
      // Enhanced user behavior analysis
      await EnhancedAuthMiddleware.analyzeUserBehavior(auth.user.userId, requestMetadata, correlationId);
      
      // Log successful authentication
      await EnhancedAuthMiddleware.logSecurityEvent({
        eventId: randomUUID(),
        userId: auth.user.userId,
        eventType: 'successful_authentication',
        timestamp: new Date().toISOString(),
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        details: { 
          resource: event.resource,
          method: event.httpMethod,
          permissions: requiredPermissions,
          responseTime: Date.now() - startTime
        },
        severity: 'low',
        correlationId,
      });
      
      return auth;
      
    } catch (error) {
      // Log authentication failure
      const requestMetadata = EnhancedAuthMiddleware.extractRequestMetadata(event);
      
      await EnhancedAuthMiddleware.logSecurityEvent({
        eventId: randomUUID(),
        userId: 'unknown',
        eventType: 'authentication_failed',
        timestamp: new Date().toISOString(),
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        details: { 
          error: error.message,
          resource: event.resource,
          method: event.httpMethod,
          responseTime: Date.now() - startTime
        },
        severity: error instanceof AuthError && error.statusCode === 429 ? 'medium' : 'high',
        correlationId,
      });
      
      throw error;
    }
  }

  /**
   * Enhanced authentication wrapper with security features
   */
  static withEnhancedAuth<T = any>(
    handler: (event: APIGatewayProxyEvent, context: Context, auth: AuthContext) => Promise<APIGatewayProxyResult>,
    requiredPermissions?: string[]
  ) {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      const correlationId = context.awsRequestId;
      
      try {
        // Handle preflight OPTIONS requests
        if (event.httpMethod === 'OPTIONS') {
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
              'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
              'Access-Control-Max-Age': '86400',
            },
            body: '',
          };
        }
        
        // Enhanced authentication with security monitoring
        const auth = await EnhancedAuthMiddleware.authenticateWithSecurity(event, context, requiredPermissions);
        
        // Execute handler
        const result = await handler(event, context, auth);
        
        // Add security headers to response
        return EnhancedAuthMiddleware.addSecurityHeaders(result, correlationId);
        
      } catch (error) {
        console.error('Enhanced auth handler error:', error, { correlationId });
        
        if (error instanceof AuthError) {
          if (error.statusCode === 429) {
            return createRateLimitResponse(correlationId);
          }
          return createAuthErrorResponse(error.message, correlationId, error.statusCode);
        }
        
        return createErrorResponse(500, 'Internal server error', correlationId);
      }
    };
  }

  /**
   * Extract request metadata for security analysis
   */
  private static extractRequestMetadata(event: APIGatewayProxyEvent) {
    return {
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.headers['User-Agent'] || event.headers['user-agent'] || 'Unknown',
      country: event.headers['CloudFront-Viewer-Country'] || 'Unknown',
      referer: event.headers['Referer'] || event.headers['referer'] || '',
      acceptLanguage: event.headers['Accept-Language'] || event.headers['accept-language'] || '',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detect security threats in request
   */
  private static async detectThreats(
    requestMetadata: any, 
    correlationId: string
  ): Promise<ThreatIndicator[]> {
    const threats: ThreatIndicator[] = [];
    
    try {
      // Check for suspicious IP addresses
      const ipThreat = await EnhancedAuthMiddleware.checkSuspiciousIP(requestMetadata.ipAddress);
      if (ipThreat) {
        threats.push(ipThreat);
      }
      
      // Check for unusual user agent patterns
      const uaThreat = EnhancedAuthMiddleware.checkSuspiciousUserAgent(requestMetadata.userAgent);
      if (uaThreat) {
        threats.push(uaThreat);
      }
      
      // Check for rapid requests from same IP
      const rapidRequestThreat = await EnhancedAuthMiddleware.checkRapidRequests(requestMetadata.ipAddress);
      if (rapidRequestThreat) {
        threats.push(rapidRequestThreat);
      }
      
    } catch (error) {
      console.error('Error detecting threats:', error, { correlationId });
    }
    
    return threats;
  }

  /**
   * Check if IP address is suspicious
   */
  private static async checkSuspiciousIP(ipAddress: string): Promise<ThreatIndicator | null> {
    // In production, integrate with threat intelligence services
    // For now, implement basic checks
    
    // Check for private/local IPs in production
    if (process.env.ENVIRONMENT === 'production') {
      const privateIPRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/;
      if (privateIPRegex.test(ipAddress)) {
        return {
          type: 'suspicious_ip',
          severity: 'medium',
          confidence: 0.8,
          details: { reason: 'private_ip_in_production', ipAddress }
        };
      }
    }
    
    // Check against known malicious IP ranges (implement with external service)
    // This is a placeholder for actual threat intelligence integration
    
    return null;
  }

  /**
   * Check for suspicious user agent patterns
   */
  private static checkSuspiciousUserAgent(userAgent: string): ThreatIndicator | null {
    const suspiciousPatterns = [
      /bot|crawler|spider/i,
      /curl|wget|python|java/i,
      /^$/,
      /.{0,10}$/, // Very short user agents
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(userAgent)) {
        return {
          type: 'unusual_pattern',
          severity: 'low',
          confidence: 0.6,
          details: { reason: 'suspicious_user_agent', userAgent }
        };
      }
    }
    
    return null;
  }

  /**
   * Check for rapid requests from same IP
   */
  private static async checkRapidRequests(ipAddress: string): Promise<ThreatIndicator | null> {
    try {
      const now = Date.now();
      const windowStart = now - 60000; // 1 minute window
      
      // Query recent requests from this IP
      const result = await dynamoClient.send(new QueryCommand({
        TableName: RATE_LIMIT_TABLE,
        KeyConditionExpression: 'ipAddress = :ip AND #timestamp BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: marshall({
          ':ip': ipAddress,
          ':start': windowStart,
          ':end': now
        })
      }));
      
      const requestCount = result.Items?.length || 0;
      
      if (requestCount > EnhancedAuthMiddleware.THREAT_THRESHOLDS.RAPID_REQUEST_THRESHOLD) {
        return {
          type: 'rapid_requests',
          severity: 'high',
          confidence: 0.9,
          details: { 
            requestCount, 
            threshold: EnhancedAuthMiddleware.THREAT_THRESHOLDS.RAPID_REQUEST_THRESHOLD,
            ipAddress 
          }
        };
      }
      
    } catch (error) {
      console.error('Error checking rapid requests:', error);
    }
    
    return null;
  }

  /**
   * Enhanced rate limiting with burst detection
   */
  private static async checkRateLimit(
    userId: string,
    resource: string,
    ipAddress: string,
    correlationId: string
  ): Promise<{ allowed: boolean; currentCount: number; limit: number; retryAfter?: number }> {
    try {
      // Get rate limit configuration for resource
      const config = EnhancedAuthMiddleware.getRateLimitConfig(resource);
      const now = Date.now();
      const windowStart = now - config.windowMs;
      
      // Create composite key for user + resource
      const rateLimitKey = `${userId}:${resource}`;
      
      // Query current usage in window
      const result = await dynamoClient.send(new QueryCommand({
        TableName: RATE_LIMIT_TABLE,
        KeyConditionExpression: 'rateLimitKey = :key AND #timestamp BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: marshall({
          ':key': rateLimitKey,
          ':start': windowStart,
          ':end': now
        })
      }));
      
      const currentCount = result.Items?.length || 0;
      
      // Check burst limit if configured
      if (config.burstLimit) {
        const recentRequests = result.Items?.filter(item => {
          const timestamp = unmarshall(item).timestamp;
          return timestamp > (now - 10000); // Last 10 seconds
        }).length || 0;
        
        if (recentRequests >= config.burstLimit) {
          return {
            allowed: false,
            currentCount: recentRequests,
            limit: config.burstLimit,
            retryAfter: 10
          };
        }
      }
      
      // Check main rate limit
      if (currentCount >= config.requests) {
        return {
          allowed: false,
          currentCount,
          limit: config.requests,
          retryAfter: Math.ceil(config.windowMs / 1000)
        };
      }
      
      // Record this request
      await dynamoClient.send(new PutItemCommand({
        TableName: RATE_LIMIT_TABLE,
        Item: marshall({
          rateLimitKey,
          timestamp: now,
          userId,
          resource,
          ipAddress,
          correlationId,
          ttl: Math.floor((now + config.windowMs * 2) / 1000) // TTL for cleanup
        })
      }));
      
      return {
        allowed: true,
        currentCount: currentCount + 1,
        limit: config.requests
      };
      
    } catch (error) {
      console.error('Error checking rate limit:', error, { correlationId });
      // Allow request on error to avoid blocking legitimate users
      return { allowed: true, currentCount: 0, limit: 1000 };
    }
  }

  /**
   * Get rate limit configuration for resource
   */
  private static getRateLimitConfig(resource: string): RateLimitConfig {
    // Find matching rate limit configuration
    for (const [pattern, config] of Object.entries(EnhancedAuthMiddleware.RATE_LIMITS)) {
      if (pattern === 'default') continue;
      
      if (resource.includes(pattern)) {
        return config;
      }
    }
    
    return EnhancedAuthMiddleware.RATE_LIMITS.default;
  }

  /**
   * Analyze user behavior for anomalies
   */
  private static async analyzeUserBehavior(
    userId: string,
    requestMetadata: any,
    correlationId: string
  ): Promise<void> {
    try {
      // Get recent user activity
      const recentActivity = await EnhancedAuthMiddleware.getRecentUserActivity(userId);
      
      // Check for unusual location
      const locationAnomaly = EnhancedAuthMiddleware.detectLocationAnomaly(
        recentActivity,
        requestMetadata.country
      );
      
      if (locationAnomaly) {
        await EnhancedAuthMiddleware.logSecurityEvent({
          eventId: randomUUID(),
          userId,
          eventType: 'unusual_location',
          timestamp: new Date().toISOString(),
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          details: locationAnomaly,
          severity: 'medium',
          correlationId,
        });
      }
      
      // Check for unusual time patterns
      const timeAnomaly = EnhancedAuthMiddleware.detectTimeAnomaly(recentActivity);
      
      if (timeAnomaly) {
        await EnhancedAuthMiddleware.logSecurityEvent({
          eventId: randomUUID(),
          userId,
          eventType: 'unusual_time_pattern',
          timestamp: new Date().toISOString(),
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          details: timeAnomaly,
          severity: 'low',
          correlationId,
        });
      }
      
    } catch (error) {
      console.error('Error analyzing user behavior:', error, { correlationId });
    }
  }

  /**
   * Get recent user activity for behavior analysis
   */
  private static async getRecentUserActivity(userId: string): Promise<any[]> {
    try {
      const result = await dynamoClient.send(new QueryCommand({
        TableName: SECURITY_EVENTS_TABLE,
        KeyConditionExpression: 'userId = :userId AND #timestamp > :since',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: marshall({
          ':userId': userId,
          ':since': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
        }),
        Limit: 100,
        ScanIndexForward: false // Most recent first
      }));
      
      return result.Items?.map(item => unmarshall(item)) || [];
      
    } catch (error) {
      console.error('Error getting recent user activity:', error);
      return [];
    }
  }

  /**
   * Detect location anomalies
   */
  private static detectLocationAnomaly(recentActivity: any[], currentCountry: string): any | null {
    if (!currentCountry || currentCountry === 'Unknown') return null;
    
    const recentCountries = recentActivity
      .filter(activity => activity.details?.country)
      .map(activity => activity.details.country)
      .slice(0, 20); // Last 20 activities
    
    if (recentCountries.length === 0) return null;
    
    // Check if current country is significantly different from recent pattern
    const countryFrequency = recentCountries.reduce((acc, country) => {
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});
    
    const totalActivities = recentCountries.length;
    const currentCountryFreq = countryFrequency[currentCountry] || 0;
    const currentCountryRatio = currentCountryFreq / totalActivities;
    
    // If current country represents less than 10% of recent activity, flag as anomaly
    if (currentCountryRatio < 0.1 && totalActivities >= 5) {
      return {
        currentCountry,
        recentCountries: Object.keys(countryFrequency),
        confidence: 1 - currentCountryRatio,
        reason: 'unusual_geographic_location'
      };
    }
    
    return null;
  }

  /**
   * Detect time pattern anomalies
   */
  private static detectTimeAnomaly(recentActivity: any[]): any | null {
    if (recentActivity.length < 10) return null;
    
    const currentHour = new Date().getHours();
    
    // Analyze typical activity hours
    const activityHours = recentActivity
      .map(activity => new Date(activity.timestamp).getHours())
      .slice(0, 50); // Last 50 activities
    
    const hourFrequency = activityHours.reduce((acc, hour) => {
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});
    
    const totalActivities = activityHours.length;
    const currentHourFreq = hourFrequency[currentHour] || 0;
    const currentHourRatio = currentHourFreq / totalActivities;
    
    // If current hour represents less than 5% of recent activity, flag as anomaly
    if (currentHourRatio < 0.05 && totalActivities >= 20) {
      return {
        currentHour,
        typicalHours: Object.keys(hourFrequency).filter(h => hourFrequency[h] > totalActivities * 0.1),
        confidence: 1 - currentHourRatio,
        reason: 'unusual_time_pattern'
      };
    }
    
    return null;
  }

  /**
   * Log security event
   */
  private static async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Store in DynamoDB
      await dynamoClient.send(new PutItemCommand({
        TableName: SECURITY_EVENTS_TABLE,
        Item: marshall({
          ...event,
          ttl: Math.floor((Date.now() + 90 * 24 * 60 * 60 * 1000) / 1000) // 90 days retention
        })
      }));
      
      // Send alert for high/critical severity events
      if (event.severity === 'high' || event.severity === 'critical') {
        await EnhancedAuthMiddleware.sendSecurityAlert(event);
      }
      
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  /**
   * Send security alert
   */
  private static async sendSecurityAlert(event: SecurityEvent): Promise<void> {
    if (!SECURITY_ALERTS_TOPIC) return;
    
    try {
      await snsClient.send(new PublishCommand({
        TopicArn: SECURITY_ALERTS_TOPIC,
        Subject: `Security Alert: ${event.eventType}`,
        Message: JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          severity: event.severity,
          userId: event.userId,
          timestamp: event.timestamp,
          ipAddress: event.ipAddress,
          details: event.details,
          correlationId: event.correlationId,
        }, null, 2),
        MessageAttributes: {
          severity: {
            DataType: 'String',
            StringValue: event.severity
          },
          eventType: {
            DataType: 'String',
            StringValue: event.eventType
          }
        }
      }));
      
    } catch (error) {
      console.error('Error sending security alert:', error);
    }
  }

  /**
   * Add security headers to response
   */
  private static addSecurityHeaders(
    result: APIGatewayProxyResult,
    correlationId: string
  ): APIGatewayProxyResult {
    return {
      ...result,
      headers: {
        ...result.headers,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Correlation-ID': correlationId,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      }
    };
  }
}

/**
 * Export enhanced middleware for use in handlers
 */
export { EnhancedAuthMiddleware as AuthMiddleware };