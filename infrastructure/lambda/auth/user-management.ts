import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand, AdminGetUserCommand, ListUsersCommand, AdminSetUserPasswordCommand, AdminEnableUserCommand, AdminDisableUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { UserProfile, CreateUserProfileRequest, UpdateUserProfileRequest } from '../../lib/constructs/user-profiles-table';

// Initialize AWS clients
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID!;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;

interface AuthenticatedEvent extends APIGatewayProxyEvent {
  requestContext: APIGatewayProxyEvent['requestContext'] & {
    authorizer: {
      claims: {
        sub: string;
        email: string;
        'cognito:groups'?: string;
        'custom:role'?: string;
      };
    };
  };
}

/**
 * Lambda handler for user management operations
 * Supports CRUD operations for user profiles and Cognito user management
 */
export const handler = async (event: AuthenticatedEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('User management request:', JSON.stringify(event, null, 2));
  
  const correlationId = context.awsRequestId;
  const requesterId = event.requestContext.authorizer.claims.sub;
  const requesterRole = event.requestContext.authorizer.claims['custom:role'] || 'user';
  
  try {
    const { httpMethod, pathParameters, body } = event;
    const userId = pathParameters?.userId;
    
    // Route to appropriate handler based on HTTP method and path
    switch (httpMethod) {
      case 'GET':
        if (userId) {
          return await getUserProfile(userId, requesterId, requesterRole, correlationId);
        } else {
          return await listUsers(event, requesterId, requesterRole, correlationId);
        }
      
      case 'POST':
        return await createUser(JSON.parse(body || '{}'), requesterId, requesterRole, correlationId);
      
      case 'PUT':
        if (!userId) {
          return createErrorResponse(400, 'User ID is required for updates', correlationId);
        }
        return await updateUser(userId, JSON.parse(body || '{}'), requesterId, requesterRole, correlationId);
      
      case 'DELETE':
        if (!userId) {
          return createErrorResponse(400, 'User ID is required for deletion', correlationId);
        }
        return await deleteUser(userId, requesterId, requesterRole, correlationId);
      
      default:
        return createErrorResponse(405, 'Method not allowed', correlationId);
    }
  } catch (error) {
    console.error('Error in user management:', error);
    return createErrorResponse(500, 'Internal server error', correlationId);
  }
};

/**
 * Get user profile by ID
 */
async function getUserProfile(userId: string, requesterId: string, requesterRole: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // Check permissions - users can only view their own profile unless they're admin/moderator
    if (userId !== requesterId && !['admin', 'moderator', 'super_admin'].includes(requesterRole)) {
      return createErrorResponse(403, 'Insufficient permissions to view this user profile', correlationId);
    }
    
    // Get user profile from DynamoDB
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: marshall({ userId }),
    }));
    
    if (!result.Item) {
      return createErrorResponse(404, 'User profile not found', correlationId);
    }
    
    const userProfile = unmarshall(result.Item) as UserProfile;
    
    // Remove sensitive information for non-admin users
    if (requesterRole !== 'admin' && requesterRole !== 'super_admin') {
      delete (userProfile as any).security;
      delete (userProfile as any).compliance;
    }
    
    return createSuccessResponse(userProfile, correlationId);
  } catch (error) {
    console.error('Error getting user profile:', error);
    return createErrorResponse(500, 'Failed to retrieve user profile', correlationId);
  }
}

/**
 * List users with filtering and pagination
 */
async function listUsers(event: AuthenticatedEvent, requesterId: string, requesterRole: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // Only admin and moderators can list users
    if (!['admin', 'moderator', 'super_admin'].includes(requesterRole)) {
      return createErrorResponse(403, 'Insufficient permissions to list users', correlationId);
    }
    
    const queryParams = event.queryStringParameters || {};
    const role = queryParams.role;
    const organization = queryParams.organization;
    const isActive = queryParams.isActive;
    const limit = parseInt(queryParams.limit || '20');
    const lastEvaluatedKey = queryParams.lastEvaluatedKey ? JSON.parse(decodeURIComponent(queryParams.lastEvaluatedKey)) : undefined;
    
    let queryCommand;
    
    if (role) {
      // Query by role using GSI
      queryCommand = new QueryCommand({
        TableName: USER_PROFILES_TABLE,
        IndexName: 'RoleIndex',
        KeyConditionExpression: '#role = :role',
        ExpressionAttributeNames: {
          '#role': 'role',
        },
        ExpressionAttributeValues: marshall({
          ':role': role,
        }),
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey ? marshall(lastEvaluatedKey) : undefined,
      });
    } else if (organization) {
      // Query by organization using GSI
      queryCommand = new QueryCommand({
        TableName: USER_PROFILES_TABLE,
        IndexName: 'OrganizationIndex',
        KeyConditionExpression: 'organization = :organization',
        ExpressionAttributeValues: marshall({
          ':organization': organization,
        }),
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey ? marshall(lastEvaluatedKey) : undefined,
      });
    } else {
      // Scan all users (expensive operation, should be limited)
      queryCommand = new QueryCommand({
        TableName: USER_PROFILES_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: 'isActive = :isActive',
        ExpressionAttributeValues: marshall({
          ':isActive': isActive || 'true',
        }),
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey ? marshall(lastEvaluatedKey) : undefined,
      });
    }
    
    const result = await dynamoClient.send(queryCommand);
    const users = result.Items?.map(item => {
      const user = unmarshall(item) as UserProfile;
      // Remove sensitive information
      delete (user as any).security;
      delete (user as any).compliance;
      return user;
    }) || [];
    
    return createSuccessResponse({
      users,
      lastEvaluatedKey: result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : null,
      count: users.length,
    }, correlationId);
  } catch (error) {
    console.error('Error listing users:', error);
    return createErrorResponse(500, 'Failed to list users', correlationId);
  }
}

/**
 * Create a new user
 */
async function createUser(request: CreateUserProfileRequest, requesterId: string, requesterRole: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // Only admins can create users
    if (!['admin', 'super_admin'].includes(requesterRole)) {
      return createErrorResponse(403, 'Insufficient permissions to create users', correlationId);
    }
    
    const { email, givenName, familyName, role = 'user', organization, phoneNumber } = request;
    
    // Validate required fields
    if (!email || !givenName || !familyName) {
      return createErrorResponse(400, 'Email, given name, and family name are required', correlationId);
    }
    
    // Create user in Cognito
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'given_name', Value: givenName },
        { Name: 'family_name', Value: familyName },
        { Name: 'custom:role', Value: role },
        ...(organization ? [{ Name: 'custom:organization', Value: organization }] : []),
        ...(phoneNumber ? [{ Name: 'phone_number', Value: phoneNumber }] : []),
      ],
      MessageAction: 'SEND',
      TemporaryPassword: generateTemporaryPassword(),
    });
    
    const cognitoResult = await cognitoClient.send(createUserCommand);
    const userId = cognitoResult.User?.Username!;
    
    // Create user profile in DynamoDB
    const userProfile: UserProfile = {
      userId,
      email,
      role: role as any,
      organization,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      emailVerified: false,
      mfaEnabled: false,
      givenName,
      familyName,
      phoneNumber,
      preferences: {
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        notifications: {
          email: true,
          sms: false,
          push: true,
          analysisComplete: true,
          reviewAssigned: true,
          threatDetected: true,
        },
        dashboard: {
          defaultView: 'grid',
          itemsPerPage: 20,
          autoRefresh: true,
          refreshInterval: 30000,
        },
      },
      permissions: getDefaultPermissions(role as any),
      statistics: {
        totalUploads: 0,
        totalAnalyses: 0,
        totalReviews: 0,
        storageUsed: 0,
      },
      security: {
        failedLoginAttempts: 0,
        trustedDevices: [],
        loginHistory: [],
      },
      compliance: {
        dataRetentionConsent: false,
        marketingConsent: false,
      },
    };
    
    await dynamoClient.send(new PutItemCommand({
      TableName: USER_PROFILES_TABLE,
      Item: marshall(userProfile),
    }));
    
    console.log(`User created successfully: ${userId}`, { correlationId });
    
    return createSuccessResponse({
      userId,
      message: 'User created successfully',
      temporaryPassword: 'Sent via email',
    }, correlationId);
  } catch (error) {
    console.error('Error creating user:', error);
    return createErrorResponse(500, 'Failed to create user', correlationId);
  }
}

/**
 * Update user profile
 */
async function updateUser(userId: string, updates: UpdateUserProfileRequest['updates'], requesterId: string, requesterRole: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // Check permissions - users can only update their own profile unless they're admin
    if (userId !== requesterId && !['admin', 'super_admin'].includes(requesterRole)) {
      return createErrorResponse(403, 'Insufficient permissions to update this user profile', correlationId);
    }
    
    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    // Process updates
    Object.entries(updates).forEach(([key, value], index) => {
      if (key !== 'userId' && key !== 'createdAt' && value !== undefined) {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      }
    });
    
    if (updateExpressions.length === 1) {
      return createErrorResponse(400, 'No valid updates provided', correlationId);
    }
    
    await dynamoClient.send(new UpdateItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: marshall({ userId }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    }));
    
    console.log(`User updated successfully: ${userId}`, { correlationId });
    
    return createSuccessResponse({
      userId,
      message: 'User profile updated successfully',
    }, correlationId);
  } catch (error) {
    console.error('Error updating user:', error);
    return createErrorResponse(500, 'Failed to update user profile', correlationId);
  }
}

/**
 * Delete user
 */
async function deleteUser(userId: string, requesterId: string, requesterRole: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // Only admins can delete users
    if (!['admin', 'super_admin'].includes(requesterRole)) {
      return createErrorResponse(403, 'Insufficient permissions to delete users', correlationId);
    }
    
    // Prevent self-deletion
    if (userId === requesterId) {
      return createErrorResponse(400, 'Cannot delete your own account', correlationId);
    }
    
    // Delete from Cognito
    await cognitoClient.send(new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
    }));
    
    // Delete from DynamoDB
    await dynamoClient.send(new DeleteItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: marshall({ userId }),
    }));
    
    console.log(`User deleted successfully: ${userId}`, { correlationId });
    
    return createSuccessResponse({
      userId,
      message: 'User deleted successfully',
    }, correlationId);
  } catch (error) {
    console.error('Error deleting user:', error);
    return createErrorResponse(500, 'Failed to delete user', correlationId);
  }
}

/**
 * Get default permissions based on role
 */
function getDefaultPermissions(role: 'user' | 'moderator' | 'admin' | 'super_admin') {
  const basePermissions = {
    canUploadMedia: true,
    canViewAnalysis: true,
    canModerateContent: false,
    canManageUsers: false,
    canAccessApi: true,
    canExportData: false,
    canViewReports: false,
    canManageSystem: false,
    maxUploadSize: 100 * 1024 * 1024, // 100MB
    maxUploadsPerDay: 50,
    allowedFileTypes: ['image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg'],
  };
  
  switch (role) {
    case 'moderator':
      return {
        ...basePermissions,
        canModerateContent: true,
        canViewReports: true,
        maxUploadSize: 500 * 1024 * 1024, // 500MB
        maxUploadsPerDay: 200,
      };
    
    case 'admin':
      return {
        ...basePermissions,
        canModerateContent: true,
        canManageUsers: true,
        canExportData: true,
        canViewReports: true,
        maxUploadSize: 1024 * 1024 * 1024, // 1GB
        maxUploadsPerDay: 1000,
      };
    
    case 'super_admin':
      return {
        ...basePermissions,
        canModerateContent: true,
        canManageUsers: true,
        canExportData: true,
        canViewReports: true,
        canManageSystem: true,
        maxUploadSize: 5 * 1024 * 1024 * 1024, // 5GB
        maxUploadsPerDay: 10000,
      };
    
    default:
      return basePermissions;
  }
}

/**
 * Generate a secure temporary password
 */
function generateTemporaryPassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  // Ensure at least one character from each required category
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // Digit
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Symbol
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Create success response
 */
function createSuccessResponse(data: any, correlationId: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: true,
      data,
      correlationId,
    }),
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode: number, message: string, correlationId: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: false,
      error: {
        message,
        code: statusCode,
      },
      correlationId,
    }),
  };
}