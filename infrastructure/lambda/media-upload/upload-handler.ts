import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { AuthMiddleware, AuthContext, PERMISSIONS } from '../auth/auth-middleware';
import { randomUUID } from 'crypto';

// Initialize AWS clients with connection reuse
const s3Client = new S3Client({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

const dynamoClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

const sfnClient = new SFNClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

// Environment variables validation
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const MEDIA_TABLE = process.env.MEDIA_TABLE;
const ANALYSIS_STATE_MACHINE_ARN = process.env.ANALYSIS_STATE_MACHINE_ARN;

if (!MEDIA_BUCKET || !MEDIA_TABLE || !ANALYSIS_STATE_MACHINE_ARN) {
  throw new Error('Missing required environment variables: MEDIA_BUCKET, MEDIA_TABLE, ANALYSIS_STATE_MACHINE_ARN');
}

// Supported file types and size limits
const SUPPORTED_TYPES = {
  'image/jpeg': { maxSize: 50 * 1024 * 1024, extensions: ['.jpg', '.jpeg'] }, // 50MB
  'image/png': { maxSize: 50 * 1024 * 1024, extensions: ['.png'] },
  'image/gif': { maxSize: 20 * 1024 * 1024, extensions: ['.gif'] },
  'image/webp': { maxSize: 30 * 1024 * 1024, extensions: ['.webp'] },
  'video/mp4': { maxSize: 500 * 1024 * 1024, extensions: ['.mp4'] }, // 500MB
  'video/quicktime': { maxSize: 500 * 1024 * 1024, extensions: ['.mov'] },
  'video/x-msvideo': { maxSize: 500 * 1024 * 1024, extensions: ['.avi'] },
  'video/webm': { maxSize: 500 * 1024 * 1024, extensions: ['.webm'] },
};

interface UploadRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface MediaRecord {
  mediaId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  s3Key: string;
  uploadedAt: string;
  status: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed';
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  analysisResults?: Record<string, any>;
}

/**
 * AWS Lambda handler for media upload operations
 * Handles presigned URL generation, upload completion, and analysis workflow initiation
 * 
 * @param event - API Gateway proxy event
 * @param context - Lambda execution context
 * @returns API Gateway proxy result with upload URLs or status
 */
export const handler = AuthMiddleware.withAuth(
  async (event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> => {
    const correlationId = context.awsRequestId;
    
    console.log('Media upload request:', {
      method: event.httpMethod,
      path: event.path,
      userId: auth.user.userId,
      correlationId,
    });

    try {
      const { httpMethod, pathParameters } = event;
      
      switch (httpMethod) {
        case 'POST':
          return await handleUploadRequest(event, auth, correlationId);
        
        case 'PUT':
          if (pathParameters?.mediaId) {
            return await handleUploadComplete(pathParameters.mediaId, event, auth, correlationId);
          }
          return createErrorResponse(400, 'Media ID is required for upload completion', correlationId);
        
        case 'GET':
          if (pathParameters?.mediaId) {
            return await handleGetUploadStatus(pathParameters.mediaId, auth, correlationId);
          }
          return await handleListUploads(event, auth, correlationId);
        
        default:
          return createErrorResponse(405, 'Method not allowed', correlationId);
      }
    } catch (error) {
      console.error('Upload handler error:', error, { correlationId });
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  [PERMISSIONS.UPLOAD_MEDIA]
);

/**
 * Handle upload request - generate presigned URL and create media record
 */
async function handleUploadRequest(
  event: APIGatewayProxyEvent, 
  auth: AuthContext, 
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const request: UploadRequest = JSON.parse(event.body || '{}');
    
    // Validate request
    const validation = validateUploadRequest(request);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error!, correlationId);
    }
    
    // Generate unique media ID and S3 key
    const mediaId = randomUUID();
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const s3Key = `uploads/${auth.user.userId}/${timestamp}/${mediaId}/${request.fileName}`;
    
    // Create media record in DynamoDB
    const mediaRecord: MediaRecord = {
      mediaId,
      userId: auth.user.userId,
      fileName: request.fileName,
      fileSize: request.fileSize,
      contentType: request.contentType,
      s3Key,
      uploadedAt: new Date().toISOString(),
      status: 'uploading',
      description: request.description,
      tags: request.tags || [],
      metadata: {
        ...request.metadata,
        correlationId,
        userAgent: event.headers['User-Agent'] || 'Unknown',
        sourceIp: event.requestContext.identity.sourceIp,
      },
    };
    
    await dynamoClient.send(new PutItemCommand({
      TableName: MEDIA_TABLE,
      Item: marshall(mediaRecord),
      ConditionExpression: 'attribute_not_exists(mediaId)',
    }));
    
    // Generate presigned URL for upload
    const putCommand = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: s3Key,
      ContentType: request.contentType,
      ContentLength: request.fileSize,
      Metadata: {
        'media-id': mediaId,
        'user-id': auth.user.userId,
        'correlation-id': correlationId,
      },
      ServerSideEncryption: 'AES256',
    });
    
    const uploadUrl = await getSignedUrl(s3Client, putCommand, { 
      expiresIn: 3600, // 1 hour
    });
    
    console.log('Upload URL generated:', { mediaId, s3Key, correlationId });
    
    return createSuccessResponse({
      mediaId,
      uploadUrl,
      s3Key,
      expiresIn: 3600,
      maxFileSize: request.fileSize,
      contentType: request.contentType,
    }, correlationId);
    
  } catch (error) {
    console.error('Upload request error:', error, { correlationId });
    
    if (error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Media record already exists', correlationId);
    }
    
    return createErrorResponse(500, 'Failed to create upload URL', correlationId);
  }
}

/**
 * Handle upload completion - verify file and start analysis workflow
 */
async function handleUploadComplete(
  mediaId: string,
  event: APIGatewayProxyEvent,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Get media record
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord) {
      return createErrorResponse(404, 'Media record not found', correlationId);
    }
    
    // Verify user owns the media
    if (mediaRecord.userId !== auth.user.userId) {
      return createErrorResponse(403, 'Access denied', correlationId);
    }
    
    // Verify file exists in S3
    try {
      const headResult = await s3Client.send(new HeadObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: mediaRecord.s3Key,
      }));
      
      // Verify file size matches
      if (headResult.ContentLength !== mediaRecord.fileSize) {
        await updateMediaStatus(mediaId, 'failed', {
          error: 'File size mismatch',
          expected: mediaRecord.fileSize,
          actual: headResult.ContentLength,
        });
        return createErrorResponse(400, 'File size mismatch', correlationId);
      }
      
    } catch (error) {
      console.error('S3 verification failed:', error, { mediaId, correlationId });
      await updateMediaStatus(mediaId, 'failed', { error: 'File not found in S3' });
      return createErrorResponse(400, 'File upload verification failed', correlationId);
    }
    
    // Update status to uploaded
    await updateMediaStatus(mediaId, 'uploaded');
    
    // Start analysis workflow
    const executionInput = {
      mediaId,
      userId: auth.user.userId,
      s3Bucket: MEDIA_BUCKET,
      s3Key: mediaRecord.s3Key,
      contentType: mediaRecord.contentType,
      fileSize: mediaRecord.fileSize,
      correlationId,
      timestamp: new Date().toISOString(),
    };
    
    const executionResult = await sfnClient.send(new StartExecutionCommand({
      stateMachineArn: ANALYSIS_STATE_MACHINE_ARN,
      name: `analysis-${mediaId}-${Date.now()}`,
      input: JSON.stringify(executionInput),
    }));
    
    // Update status to processing
    await updateMediaStatus(mediaId, 'processing', {
      executionArn: executionResult.executionArn,
      startedAt: new Date().toISOString(),
    });
    
    console.log('Analysis workflow started:', {
      mediaId,
      executionArn: executionResult.executionArn,
      correlationId,
    });
    
    return createSuccessResponse({
      mediaId,
      status: 'processing',
      message: 'Upload completed successfully, analysis started',
      executionArn: executionResult.executionArn,
    }, correlationId);
    
  } catch (error) {
    console.error('Upload completion error:', error, { mediaId, correlationId });
    
    // Update media status to failed
    await updateMediaStatus(mediaId, 'failed', { 
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    
    return createErrorResponse(500, 'Failed to complete upload', correlationId);
  }
}

/**
 * Handle get upload status
 */
async function handleGetUploadStatus(
  mediaId: string,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord) {
      return createErrorResponse(404, 'Media record not found', correlationId);
    }
    
    // Verify user owns the media
    if (mediaRecord.userId !== auth.user.userId) {
      return createErrorResponse(403, 'Access denied', correlationId);
    }
    
    return createSuccessResponse({
      mediaId: mediaRecord.mediaId,
      fileName: mediaRecord.fileName,
      fileSize: mediaRecord.fileSize,
      contentType: mediaRecord.contentType,
      status: mediaRecord.status,
      uploadedAt: mediaRecord.uploadedAt,
      description: mediaRecord.description,
      tags: mediaRecord.tags,
      analysisResults: mediaRecord.analysisResults,
    }, correlationId);
    
  } catch (error) {
    console.error('Get upload status error:', error, { mediaId, correlationId });
    return createErrorResponse(500, 'Failed to get upload status', correlationId);
  }
}

/**
 * Handle list uploads for user
 */
async function handleListUploads(
  event: APIGatewayProxyEvent,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // This would typically use a GSI on userId
    // For now, return a simple response
    return createSuccessResponse({
      message: 'List uploads endpoint - implementation needed with GSI query',
      userId: auth.user.userId,
    }, correlationId);
    
  } catch (error) {
    console.error('List uploads error:', error, { correlationId });
    return createErrorResponse(500, 'Failed to list uploads', correlationId);
  }
}

/**
 * Validate upload request
 */
function validateUploadRequest(request: UploadRequest): { valid: boolean; error?: string } {
  if (!request.fileName || !request.fileSize || !request.contentType) {
    return { valid: false, error: 'fileName, fileSize, and contentType are required' };
  }
  
  // Check supported file type
  const typeConfig = SUPPORTED_TYPES[request.contentType as keyof typeof SUPPORTED_TYPES];
  if (!typeConfig) {
    return { 
      valid: false, 
      error: `Unsupported file type: ${request.contentType}. Supported types: ${Object.keys(SUPPORTED_TYPES).join(', ')}` 
    };
  }
  
  // Check file size
  if (request.fileSize > typeConfig.maxSize) {
    return { 
      valid: false, 
      error: `File size ${request.fileSize} exceeds maximum ${typeConfig.maxSize} bytes for ${request.contentType}` 
    };
  }
  
  if (request.fileSize <= 0) {
    return { valid: false, error: 'File size must be greater than 0' };
  }
  
  // Validate file extension
  const extension = request.fileName.toLowerCase().substring(request.fileName.lastIndexOf('.'));
  if (!typeConfig.extensions.includes(extension)) {
    return { 
      valid: false, 
      error: `Invalid file extension ${extension} for ${request.contentType}. Expected: ${typeConfig.extensions.join(', ')}` 
    };
  }
  
  return { valid: true };
}

/**
 * Get media record from DynamoDB
 */
async function getMediaRecord(mediaId: string): Promise<MediaRecord | null> {
  try {
    const { GetItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { unmarshall } = await import('@aws-sdk/util-dynamodb');
    
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: MEDIA_TABLE,
      Key: marshall({ mediaId }),
    }));
    
    return result.Item ? unmarshall(result.Item) as MediaRecord : null;
  } catch (error) {
    console.error('Error getting media record:', error);
    return null;
  }
}

/**
 * Update media status in DynamoDB
 */
async function updateMediaStatus(
  mediaId: string, 
  status: MediaRecord['status'], 
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    const updateExpression = additionalData 
      ? 'SET #status = :status, #metadata = :metadata, updatedAt = :updatedAt'
      : 'SET #status = :status, updatedAt = :updatedAt';
    
    const expressionAttributeValues: any = {
      ':status': status,
      ':updatedAt': new Date().toISOString(),
    };
    
    if (additionalData) {
      expressionAttributeValues[':metadata'] = additionalData;
    }
    
    await dynamoClient.send(new UpdateItemCommand({
      TableName: MEDIA_TABLE,
      Key: marshall({ mediaId }),
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#status': 'status',
        ...(additionalData && { '#metadata': 'processingMetadata' }),
      },
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    }));
  } catch (error) {
    console.error('Error updating media status:', error);
    throw error;
  }
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