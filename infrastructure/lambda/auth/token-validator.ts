import { APIGatewayAuthorizerEvent, APIGatewayAuthorizerResult, Context } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Initialize AWS clients with connection reuse
const dynamoClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

// Environment variables validation
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;

if (!USER_POOL_ID || !USER_POOL_CLIENT_ID || !USER_PROFILES_TABLE) {
  throw new Error('Missing required environment variables: USER_POOL_ID, USER_POOL_CLIENT_ID, USER_PROFILES_TABLE');
}

// Create JWT verifier with caching
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'access',
  clientId: USER_POOL_CLIENT_ID,
});

interface UserProfile {
  userId: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  isActive: boolean;
  security?: {
    accountLockedUntil?: string;
    failedLoginAttempts?: number;
  };
}

/**
 * AWS Lambda authorizer for API Gateway
 * Validates JWT tokens and returns authorization policy
 * 
 * @param event - API Gateway authorizer event
 * @param context - Lambda execution context
 * @returns API Gateway authorizer result with policy and context
 */
export const handler = async (
  event: APIGatewayAuthorizerEvent, 
  context: Context
): Promise<APIGatewayAuthorizerResult> => {
  const correlationId = context.awsRequestId;
  
  console.log('Token validation request:', {
    methodArn: event.methodArn,
    authorizationToken: event.authorizationToken ? 'present' : 'missing',
    correlationId,
  });

  try {
    // Extract token from authorization header
    const token = extractToken(event.authorizationToken);
    if (!token) {
      console.error('No valid token found in authorization header', { correlationId });
      throw new Error('Unauthorized');
    }

    // Verify JWT token
    const payload = await jwtVerifier.verify(token);
    console.log('JWT token verified:', { 
      sub: payload.sub, 
      email: payload.email,
      exp: payload.exp,
      correlationId,
    });

    // Load user profile
    const userProfile = await getUserProfile(payload.sub);
    if (!userProfile) {
      console.error('User profile not found:', { userId: payload.sub, correlationId });
      throw new Error('User not found');
    }

    // Check if user is active
    if (!userProfile.isActive) {
      console.error('User account is disabled:', { userId: payload.sub, correlationId });
      throw new Error('Account disabled');
    }

    // Check if account is locked
    if (userProfile.security?.accountLockedUntil) {
      const lockUntil = new Date(userProfile.security.accountLockedUntil);
      if (lockUntil > new Date()) {
        console.error('User account is locked:', { 
          userId: payload.sub, 
          lockUntil: lockUntil.toISOString(),
          correlationId,
        });
        throw new Error('Account locked');
      }
    }

    // Create authorization context
    const authContext = {
      userId: payload.sub,
      email: payload.email || userProfile.email,
      role: userProfile.role,
      permissions: JSON.stringify(userProfile.permissions),
      correlationId,
      tokenExp: payload.exp.toString(),
      requestTime: new Date().toISOString(),
    };

    console.log('Authorization successful:', {
      userId: payload.sub,
      role: userProfile.role,
      correlationId,
    });

    // Return allow policy with user context
    return createAuthorizerResponse(
      payload.sub,
      'Allow',
      event.methodArn,
      authContext
    );

  } catch (error) {
    console.error('Token validation failed:', error, { correlationId });
    
    // For security, return a generic deny response
    // Don't expose specific error details to prevent information leakage
    return createAuthorizerResponse(
      'unauthorized',
      'Deny',
      event.methodArn
    );
  }
};

/**
 * Extract JWT token from authorization header
 */
function extractToken(authorizationToken: string): string | null {
  if (!authorizationToken) {
    return null;
  }

  // Handle "Bearer <token>" format
  const bearerMatch = authorizationToken.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  // Handle direct token (fallback)
  if (authorizationToken.includes('.')) {
    return authorizationToken;
  }

  return null;
}

/**
 * Get user profile from DynamoDB
 */
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: marshall({ userId }),
      ProjectionExpression: 'userId, email, #role, permissions, isActive, security',
      ExpressionAttributeNames: {
        '#role': 'role', // 'role' is a reserved keyword in DynamoDB
      },
    }));

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as UserProfile;
  } catch (error) {
    console.error('Error getting user profile:', error, { userId });
    throw new Error('Failed to load user profile');
  }
}

/**
 * Create API Gateway authorizer response
 */
function createAuthorizerResponse(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, any>
): APIGatewayAuthorizerResult {
  // Generate policy for the entire API
  const resourceArn = resource.split('/').slice(0, 2).join('/') + '/*';
  
  const response: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resourceArn,
        },
      ],
    },
  };

  // Add context if provided (only for Allow responses)
  if (context && effect === 'Allow') {
    response.context = context;
  }

  // Add usage identifier for API Gateway usage plans
  if (effect === 'Allow') {
    response.usageIdentifierKey = principalId;
  }

  return response;
}

/**
 * Utility function for testing token validation
 * This can be used by other Lambda functions for manual token validation
 */
export async function validateTokenManually(token: string): Promise<{
  valid: boolean;
  payload?: any;
  userProfile?: UserProfile;
  error?: string;
}> {
  try {
    const cleanToken = extractToken(token);
    if (!cleanToken) {
      return { valid: false, error: 'Invalid token format' };
    }

    const payload = await jwtVerifier.verify(cleanToken);
    const userProfile = await getUserProfile(payload.sub);

    if (!userProfile) {
      return { valid: false, error: 'User profile not found' };
    }

    if (!userProfile.isActive) {
      return { valid: false, error: 'User account is disabled' };
    }

    if (userProfile.security?.accountLockedUntil) {
      const lockUntil = new Date(userProfile.security.accountLockedUntil);
      if (lockUntil > new Date()) {
        return { valid: false, error: 'Account is locked' };
      }
    }

    return {
      valid: true,
      payload,
      userProfile,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Token validation failed',
    };
  }
}

/**
 * Permission checking utility
 */
export function hasPermission(
  userPermissions: Record<string, boolean>,
  requiredPermission: string
): boolean {
  return userPermissions[requiredPermission] === true;
}

/**
 * Role-based permission checking
 */
export function hasAnyRole(userRole: string, allowedRoles: string[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Check if token is expired
 */
export function isTokenExpired(exp: number): boolean {
  return Date.now() >= exp * 1000;
}