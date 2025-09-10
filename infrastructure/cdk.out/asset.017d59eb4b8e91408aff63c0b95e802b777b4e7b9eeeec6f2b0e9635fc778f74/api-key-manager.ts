import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import * as crypto from 'crypto';
import { AuthMiddleware } from '../auth/auth-middleware';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const API_KEYS_TABLE = process.env.API_KEYS_TABLE!;

export interface ApiKey {
  keyId: string;
  keyHash: string;
  userId: string;
  name: string;
  description?: string;
  permissions: string[];
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  usageStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    lastRequestAt?: string;
  };
}

export interface CreateApiKeyRequest {
  name: string;
  description?: string;
  permissions: string[];
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  expiresAt?: string;
}

/**
 * API Key Management Lambda handler
 * Handles CRUD operations for API keys and validation
 */
export const handler = AuthMiddleware.withAuth(
  async (event: APIGatewayProxyEvent, context: Context, auth): Promise<APIGatewayProxyResult> => {
    console.log('API key management request:', JSON.stringify(event, null, 2));
    
    const correlationId = context.awsRequestId;
    const userId = auth.user.userId;
    const userRole = auth.user.role;
    
    try {
      const { httpMethod, pathParameters } = event;
      
      // Only admins and users can manage their own API keys
      if (!['admin', 'super_admin'].includes(userRole) && pathParameters?.userId !== userId) {
        return createErrorResponse(403, 'Insufficient permissions to manage API keys', correlationId);
      }
      
      switch (httpMethod) {
        case 'GET':
          if (pathParameters?.keyId) {
            return await getApiKey(pathParameters.keyId, userId, userRole, correlationId);
          } else {
            return await listApiKeys(event, userId, userRole, correlationId);
          }
        
        case 'POST':
          return await createApiKey(event, userId, correlationId);
        
        case 'PUT':
          if (pathParameters?.keyId) {
            return await updateApiKey(event, pathParameters.keyId, userId, userRole, correlationId);
          }
          break;
        
        case 'DELETE':
          if (pathParameters?.keyId) {
            return await deleteApiKey(pathParameters.keyId, userId, userRole, correlationId);
          }
          break;
      }
      
      return createErrorResponse(404, 'Endpoint not found', correlationId);
      
    } catch (error) {
      console.error('Error in API key management:', error);
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  ['canAccessApi'] // Required permission
);

/**
 * Create new API key
 */
async function createApiKey(
  event: APIGatewayProxyEvent,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const request: CreateApiKeyRequest = JSON.parse(event.body || '{}');
    const { name, description, permissions, rateLimit, expiresAt } = request;
    
    if (!name || !permissions || permissions.length === 0) {
      return createErrorResponse(400, 'name and permissions are required', correlationId);
    }
    
    // Validate permissions
    const validPermissions = [
      'media:upload', 'media:read', 'analysis:read', 'review:read', 'review:write'
    ];
    
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return createErrorResponse(400, `Invalid permissions: ${invalidPermissions.join(', ')}`, correlationId);
    }
    
    // Generate API key
    const keyId = `hlekkr_${crypto.randomBytes(8).toString('hex')}`;
    const apiKeySecret = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(apiKeySecret).digest('hex');
    
    const now = new Date().toISOString();
    
    const apiKey: ApiKey = {
      keyId,
      keyHash,
      userId,
      name,
      description,
      permissions,
      rateLimit: {
        requestsPerMinute: rateLimit?.requestsPerMinute || 60,
        requestsPerHour: rateLimit?.requestsPerHour || 1000,
        requestsPerDay: rateLimit?.requestsPerDay || 10000,
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      usageStats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
      },
    };
    
    // Store API key
    await dynamoClient.send(new PutItemCommand({
      TableName: API_KEYS_TABLE,
      Item: marshall(apiKey),
    }));
    
    console.log(`Created API key ${keyId} for user ${userId}`);
    
    return createSuccessResponse({
      keyId,
      apiKey: `${keyId}.${apiKeySecret}`, // Only returned once during creation
      name,
      permissions,
      rateLimit: apiKey.rateLimit,
      createdAt: now,
      expiresAt,
      message: 'API key created successfully. Store this key securely - it will not be shown again.',
    }, correlationId);
    
  } catch (error) {
    console.error('Error creating API key:', error);
    return createErrorResponse(500, 'Failed to create API key', correlationId);
  }
}

/**
 * Get API key details
 */
async function getApiKey(
  keyId: string,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
    }));
    
    if (!result.Item) {
      return createErrorResponse(404, 'API key not found', correlationId);
    }
    
    const apiKey = unmarshall(result.Item) as ApiKey;
    
    // Check permissions - users can only view their own keys
    if (apiKey.userId !== userId && !['admin', 'super_admin'].includes(userRole)) {
      return createErrorResponse(403, 'Insufficient permissions to view this API key', correlationId);
    }
    
    // Remove sensitive information
    const { keyHash, ...safeApiKey } = apiKey;
    
    return createSuccessResponse(safeApiKey, correlationId);
    
  } catch (error) {
    console.error('Error getting API key:', error);
    return createErrorResponse(500, 'Failed to get API key', correlationId);
  }
}

/**
 * List API keys for user
 */
async function listApiKeys(
  event: APIGatewayProxyEvent,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const queryParams = event.queryStringParameters || {};
    const targetUserId = queryParams.userId || userId;
    const includeInactive = queryParams.includeInactive === 'true';
    
    // Check permissions
    if (targetUserId !== userId && !['admin', 'super_admin'].includes(userRole)) {
      return createErrorResponse(403, 'Insufficient permissions to list API keys for other users', correlationId);
    }
    
    // Query API keys by user
    const result = await dynamoClient.send(new QueryCommand({
      TableName: API_KEYS_TABLE,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': targetUserId,
      }),
    }));
    
    let apiKeys = result.Items?.map(item => {
      const apiKey = unmarshall(item) as ApiKey;
      // Remove sensitive information
      const { keyHash, ...safeApiKey } = apiKey;
      return safeApiKey;
    }) || [];
    
    // Filter inactive keys if not requested
    if (!includeInactive) {
      apiKeys = apiKeys.filter(key => key.isActive);
    }
    
    return createSuccessResponse({
      apiKeys,
      totalCount: apiKeys.length,
      userId: targetUserId,
    }, correlationId);
    
  } catch (error) {
    console.error('Error listing API keys:', error);
    return createErrorResponse(500, 'Failed to list API keys', correlationId);
  }
}

/**
 * Update API key
 */
async function updateApiKey(
  event: APIGatewayProxyEvent,
  keyId: string,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const updates = JSON.parse(event.body || '{}');
    
    // Get existing API key
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
    }));
    
    if (!result.Item) {
      return createErrorResponse(404, 'API key not found', correlationId);
    }
    
    const apiKey = unmarshall(result.Item) as ApiKey;
    
    // Check permissions
    if (apiKey.userId !== userId && !['admin', 'super_admin'].includes(userRole)) {
      return createErrorResponse(403, 'Insufficient permissions to update this API key', correlationId);
    }
    
    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
    // Always update timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    // Process allowed updates
    const allowedUpdates = ['name', 'description', 'permissions', 'rateLimit', 'isActive', 'expiresAt'];
    
    Object.entries(updates).forEach(([key, value], index) => {
      if (allowedUpdates.includes(key) && value !== undefined) {
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
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    }));
    
    return createSuccessResponse({
      keyId,
      message: 'API key updated successfully',
      updatedAt: new Date().toISOString(),
    }, correlationId);
    
  } catch (error) {
    console.error('Error updating API key:', error);
    return createErrorResponse(500, 'Failed to update API key', correlationId);
  }
}

/**
 * Delete API key
 */
async function deleteApiKey(
  keyId: string,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Get existing API key
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
    }));
    
    if (!result.Item) {
      return createErrorResponse(404, 'API key not found', correlationId);
    }
    
    const apiKey = unmarshall(result.Item) as ApiKey;
    
    // Check permissions
    if (apiKey.userId !== userId && !['admin', 'super_admin'].includes(userRole)) {
      return createErrorResponse(403, 'Insufficient permissions to delete this API key', correlationId);
    }
    
    // Delete API key
    await dynamoClient.send(new DeleteItemCommand({
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
    }));
    
    console.log(`Deleted API key ${keyId} for user ${userId}`);
    
    return createSuccessResponse({
      keyId,
      message: 'API key deleted successfully',
      deletedAt: new Date().toISOString(),
    }, correlationId);
    
  } catch (error) {
    console.error('Error deleting API key:', error);
    return createErrorResponse(500, 'Failed to delete API key', correlationId);
  }
}

/**
 * Validate API key for incoming requests
 */
export async function validateApiKey(apiKeyHeader: string): Promise<{
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}> {
  try {
    if (!apiKeyHeader || !apiKeyHeader.includes('.')) {
      return { valid: false, error: 'Invalid API key format' };
    }
    
    const [keyId, secret] = apiKeyHeader.split('.');
    if (!keyId || !secret) {
      return { valid: false, error: 'Invalid API key format' };
    }
    
    // Get API key from database
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
    }));
    
    if (!result.Item) {
      return { valid: false, error: 'API key not found' };
    }
    
    const apiKey = unmarshall(result.Item) as ApiKey;
    
    // Check if key is active
    if (!apiKey.isActive) {
      return { valid: false, error: 'API key is disabled' };
    }
    
    // Check expiration
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }
    
    // Validate secret
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
    if (secretHash !== apiKey.keyHash) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    // Update last used timestamp
    await updateApiKeyUsage(keyId, true);
    
    return { valid: true, apiKey };
    
  } catch (error) {
    console.error('Error validating API key:', error);
    return { valid: false, error: 'API key validation failed' };
  }
}

/**
 * Update API key usage statistics
 */
async function updateApiKeyUsage(keyId: string, success: boolean): Promise<void> {
  try {
    const now = new Date().toISOString();
    
    await dynamoClient.send(new UpdateItemCommand({
      TableName: API_KEYS_TABLE,
      Key: marshall({ keyId }),
      UpdateExpression: 'SET lastUsedAt = :now, usageStats.lastRequestAt = :now, usageStats.totalRequests = usageStats.totalRequests + :one, usageStats.successfulRequests = usageStats.successfulRequests + :success, usageStats.failedRequests = usageStats.failedRequests + :failure',
      ExpressionAttributeValues: marshall({
        ':now': now,
        ':one': 1,
        ':success': success ? 1 : 0,
        ':failure': success ? 0 : 1,
      }),
    }));
  } catch (error) {
    console.error('Error updating API key usage:', error);
    // Don't throw error as this is not critical
  }
}

/**
 * API Key authentication middleware
 */
export function withApiKeyAuth<T = any>(
  handler: (event: APIGatewayProxyEvent, context: Context, apiKey: ApiKey) => Promise<APIGatewayProxyResult>,
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
      
      // Extract API key from header
      const apiKeyHeader = event.headers['X-Api-Key'] || event.headers['x-api-key'];
      
      if (!apiKeyHeader) {
        return createErrorResponse(401, 'API key required', context.awsRequestId);
      }
      
      // Validate API key
      const validation = await validateApiKey(apiKeyHeader);
      
      if (!validation.valid || !validation.apiKey) {
        return createErrorResponse(401, validation.error || 'Invalid API key', context.awsRequestId);
      }
      
      // Check required permissions
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every(permission => 
          validation.apiKey!.permissions.includes(permission)
        );
        
        if (!hasPermissions) {
          return createErrorResponse(403, 'Insufficient API key permissions', context.awsRequestId);
        }
      }
      
      // Call handler with validated API key
      return await handler(event, context, validation.apiKey);
      
    } catch (error) {
      console.error('Error in API key auth middleware:', error);
      return createErrorResponse(500, 'Internal server error', context.awsRequestId);
    }
  };
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