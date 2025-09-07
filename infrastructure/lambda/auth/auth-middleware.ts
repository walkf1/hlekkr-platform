import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { UserProfile } from '../../lib/constructs/user-profiles-table';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID!;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;

// Create JWT verifier
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'access',
  clientId: USER_POOL_CLIENT_ID,
});

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  permissions: Record<string, any>;
  profile: UserProfile;
}

export interface AuthContext {
  user: AuthenticatedUser;
  correlationId: string;
  requestTime: string;
}

/**
 * Authentication middleware for Lambda functions
 * Verifies JWT tokens and loads user profile
 */
export class AuthMiddleware {
  /**
   * Authenticate and authorize a request
   */
  static async authenticate(event: APIGatewayProxyEvent, context: Context, requiredPermissions?: string[]): Promise<AuthContext> {
    const correlationId = context.awsRequestId;
    const requestTime = new Date().toISOString();
    
    try {
      // Extract token from Authorization header
      const authHeader = event.headers.Authorization || event.headers.authorization;
      if (!authHeader) {
        throw new AuthError('Missing Authorization header', 401);
      }
      
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        throw new AuthError('Invalid Authorization header format', 401);
      }
      
      // Verify JWT token
      const payload = await jwtVerifier.verify(token);
      console.log('JWT payload verified:', { sub: payload.sub, email: payload.email, correlationId });
      
      // Load user profile from DynamoDB
      const userProfile = await AuthMiddleware.getUserProfile(payload.sub);
      if (!userProfile) {
        throw new AuthError('User profile not found', 404);
      }
      
      // Check if user is active
      if (!userProfile.isActive) {
        throw new AuthError('User account is disabled', 403);
      }
      
      // Check required permissions
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermissions = AuthMiddleware.checkPermissions(userProfile, requiredPermissions);
        if (!hasPermissions) {
          throw new AuthError('Insufficient permissions', 403);
        }
      }
      
      // Update last login time
      await AuthMiddleware.updateLastLogin(payload.sub, event, correlationId);
      
      const authenticatedUser: AuthenticatedUser = {
        userId: payload.sub,
        email: payload.email || userProfile.email,
        role: userProfile.role,
        permissions: userProfile.permissions,
        profile: userProfile,
      };
      
      return {
        user: authenticatedUser,
        correlationId,
        requestTime,
      };
    } catch (error) {
      console.error('Authentication failed:', error, { correlationId });
      
      if (error instanceof AuthError) {
        throw error;
      }
      
      throw new AuthError('Authentication failed', 401);
    }
  }
  
  /**
   * Create an authenticated Lambda handler wrapper
   */
  static withAuth<T = any>(
    handler: (event: APIGatewayProxyEvent, context: Context, auth: AuthContext) => Promise<APIGatewayProxyResult>,
    requiredPermissions?: string[]
  ) {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      try {
        // Handle preflight OPTIONS requests
        if (event.httpMethod === 'OPTIONS') {
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
              'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            },
            body: '',
          };
        }
        
        // Authenticate the request
        const auth = await AuthMiddleware.authenticate(event, context, requiredPermissions);
        
        // Call the actual handler with authentication context
        return await handler(event, context, auth);
      } catch (error) {
        console.error('Handler error:', error);
        
        if (error instanceof AuthError) {
          return {
            statusCode: error.statusCode,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
              success: false,
              error: {
                message: error.message,
                code: error.statusCode,
              },
              correlationId: context.awsRequestId,
            }),
          };
        }
        
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: {
              message: 'Internal server error',
              code: 500,
            },
            correlationId: context.awsRequestId,
          }),
        };
      }
    };
  }
  
  /**
   * Get user profile from DynamoDB
   */
  private static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const result = await dynamoClient.send(new GetItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: marshall({ userId }),
      }));
      
      if (!result.Item) {
        return null;
      }
      
      return unmarshall(result.Item) as UserProfile;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw new Error('Failed to load user profile');
    }
  }
  
  /**
   * Check if user has required permissions
   */
  private static checkPermissions(userProfile: UserProfile, requiredPermissions: string[]): boolean {
    const userPermissions = userProfile.permissions;
    
    return requiredPermissions.every(permission => {
      // Check if permission exists and is true
      return userPermissions[permission] === true;
    });
  }
  
  /**
   * Update user's last login time and login history
   */
  private static async updateLastLogin(userId: string, event: APIGatewayProxyEvent, correlationId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const ipAddress = event.requestContext.identity.sourceIp;
      const userAgent = event.headers['User-Agent'] || event.headers['user-agent'] || 'Unknown';
      
      // Create login history entry
      const loginEntry = {
        timestamp: now,
        ipAddress,
        userAgent,
        success: true,
        correlationId,
      };
      
      await dynamoClient.send(new UpdateItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: marshall({ userId }),
        UpdateExpression: 'SET lastLoginAt = :lastLoginAt, #security.#loginHistory = list_append(if_not_exists(#security.#loginHistory, :emptyList), :loginEntry)',
        ExpressionAttributeNames: {
          '#security': 'security',
          '#loginHistory': 'loginHistory',
        },
        ExpressionAttributeValues: marshall({
          ':lastLoginAt': now,
          ':loginEntry': [loginEntry],
          ':emptyList': [],
        }),
      }));
    } catch (error) {
      console.error('Error updating last login:', error);
      // Don't throw error as this is not critical for authentication
    }
  }
  
  /**
   * Rate limiting check
   */
  static async checkRateLimit(userId: string, action: string, limit: number, windowMs: number): Promise<boolean> {
    // Implementation would use DynamoDB or Redis to track request counts
    // For now, return true (no rate limiting)
    return true;
  }
  
  /**
   * Log security event
   */
  static async logSecurityEvent(userId: string, event: string, details: any, correlationId: string): Promise<void> {
    try {
      console.log('Security event:', {
        userId,
        event,
        details,
        timestamp: new Date().toISOString(),
        correlationId,
      });
      
      // In production, you might want to send this to a security monitoring service
      // or store in a dedicated security events table
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }
}

/**
 * Custom authentication error class
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Permission constants for easy reference
 */
export const PERMISSIONS = {
  UPLOAD_MEDIA: 'canUploadMedia',
  VIEW_ANALYSIS: 'canViewAnalysis',
  MODERATE_CONTENT: 'canModerateContent',
  MANAGE_USERS: 'canManageUsers',
  ACCESS_API: 'canAccessApi',
  EXPORT_DATA: 'canExportData',
  VIEW_REPORTS: 'canViewReports',
  MANAGE_SYSTEM: 'canManageSystem',
} as const;

/**
 * Role-based permission helpers
 */
export const ROLE_PERMISSIONS = {
  user: [PERMISSIONS.UPLOAD_MEDIA, PERMISSIONS.VIEW_ANALYSIS, PERMISSIONS.ACCESS_API],
  moderator: [
    PERMISSIONS.UPLOAD_MEDIA,
    PERMISSIONS.VIEW_ANALYSIS,
    PERMISSIONS.MODERATE_CONTENT,
    PERMISSIONS.ACCESS_API,
    PERMISSIONS.VIEW_REPORTS,
  ],
  admin: [
    PERMISSIONS.UPLOAD_MEDIA,
    PERMISSIONS.VIEW_ANALYSIS,
    PERMISSIONS.MODERATE_CONTENT,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.ACCESS_API,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.VIEW_REPORTS,
  ],
  super_admin: Object.values(PERMISSIONS),
} as const;

/**
 * Utility function to create API Gateway authorizer response
 */
export function createAuthorizerResponse(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, any>
) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context: context || {},
  };
}