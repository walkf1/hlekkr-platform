import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { marshall } from '@aws-sdk/util-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { EnhancedAuthMiddleware, AuthenticatedRequest, ENDPOINT_RATE_LIMITS } from './auth-middleware-enhanced';

// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

// Environment variables
const MEDIA_BUCKET = process.env.MEDIA_BUCKET!;
const MEDIA_ANALYSIS_TABLE = process.env.MEDIA_ANALYSIS_TABLE!;
const ANALYSIS_QUEUE_URL = process.env.ANALYSIS_QUEUE_URL!;

interface UploadRequest {
  fileName: string;
  fileSize: number;
  fileType: string;
  metadata?: Record<string, any>;
}

interface UploadResponse {
  mediaId: string;
  uploadUrl?: string;
  multipartUpload?: {
    uploadId: string;
    presignedUrls: string[];
  };
}

/**
 * Media upload API endpoint handler with enhanced authentication and rate limiting
 * Handles file uploads with validation, S3 storage, and analysis triggering
 */
export const handler = EnhancedAuthMiddleware.withAuthAndRateLimit(
  async (event: AuthenticatedRequest, context: Context): Promise<APIGatewayProxyResult> => {
    console.log('Media upload request:', { 
      method: event.httpMethod, 
      path: event.path,
      userId: event.user.userId,
      correlationId: event.correlationId 
    });
    
    const correlationId = event.correlationId;
    const userId = event.user.userId;
    
    try {
      const { httpMethod, pathParameters } = event;
      
      switch (httpMethod) {
        case 'POST':
          if (pathParameters?.action === 'initiate') {
            return await initiateUpload(event, userId, correlationId);
          } else {
            return await handleDirectUpload(event, userId, correlationId);
          }
        
        case 'PUT':
          if (pathParameters?.mediaId && pathParameters?.action === 'complete') {
            return await completeMultipartUpload(event, userId, correlationId);
          }
          break;
        
        case 'GET':
          if (pathParameters?.mediaId) {
            return await getUploadStatus(pathParameters.mediaId, userId, correlationId);
          }
          break;
      }
      
      return createErrorResponse(404, 'Endpoint not found', correlationId);
      
    } catch (error) {
      console.error('Error in media upload:', error);
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  ['canUploadMedia'], // Required permission
  ENDPOINT_RATE_LIMITS['/media'] // Custom rate limits for media uploads
);

/**
 * Initiate file upload (for large files using multipart upload)
 */
async function initiateUpload(event: APIGatewayProxyEvent, userId: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const uploadRequest: UploadRequest = JSON.parse(event.body || '{}');
    const { fileName, fileSize, fileType, metadata = {} } = uploadRequest;
    
    // Validate request
    if (!fileName || !fileSize || !fileType) {
      return createErrorResponse(400, 'fileName, fileSize, and fileType are required', correlationId);
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'];
    if (!allowedTypes.includes(fileType)) {
      return createErrorResponse(400, `File type ${fileType} not supported`, correlationId);
    }
    
    // Validate file size (max 500MB)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (fileSize > maxSize) {
      return createErrorResponse(400, `File size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`, correlationId);
    }
    
    // Generate media ID and S3 key
    const mediaId = `media-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const s3Key = `uploads/${userId}/${mediaId}/${fileName}`;
    
    let uploadResponse: UploadResponse;
    
    // Use multipart upload for files larger than 100MB
    if (fileSize > 100 * 1024 * 1024) {
      uploadResponse = await initiateMultipartUpload(mediaId, s3Key, fileType, fileSize);
    } else {
      uploadResponse = await generatePresignedUrl(mediaId, s3Key, fileType);
    }
    
    // Store media record in DynamoDB
    await createMediaRecord(mediaId, userId, fileName, fileSize, fileType, s3Key, metadata, correlationId);
    
    return createSuccessResponse(uploadResponse, correlationId);
    
  } catch (error) {
    console.error('Error initiating upload:', error);
    return createErrorResponse(500, 'Failed to initiate upload', correlationId);
  }
}

/**
 * Handle direct upload for smaller files
 */
async function handleDirectUpload(event: APIGatewayProxyEvent, userId: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // For demo purposes, return presigned URL for direct upload
    const uploadRequest: UploadRequest = JSON.parse(event.body || '{}');
    const { fileName, fileSize, fileType, metadata = {} } = uploadRequest;
    
    if (!fileName || !fileType) {
      return createErrorResponse(400, 'fileName and fileType are required', correlationId);
    }
    
    const mediaId = `media-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const s3Key = `uploads/${userId}/${mediaId}/${fileName}`;
    
    // Generate presigned URL for direct upload
    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: s3Key,
        ContentType: fileType,
        Metadata: {
          userId,
          mediaId,
          originalFileName: fileName,
          correlationId,
        },
      }),
      { expiresIn: 3600 } // 1 hour
    );
    
    // Store media record
    await createMediaRecord(mediaId, userId, fileName, fileSize || 0, fileType, s3Key, metadata, correlationId);
    
    return createSuccessResponse({
      mediaId,
      uploadUrl,
    }, correlationId);
    
  } catch (error) {
    console.error('Error handling direct upload:', error);
    return createErrorResponse(500, 'Failed to handle upload', correlationId);
  }
}

/**
 * Initiate multipart upload for large files
 */
async function initiateMultipartUpload(mediaId: string, s3Key: string, fileType: string, fileSize: number): Promise<UploadResponse> {
  const createMultipartCommand = new CreateMultipartUploadCommand({
    Bucket: MEDIA_BUCKET,
    Key: s3Key,
    ContentType: fileType,
    Metadata: {
      mediaId,
      fileSize: fileSize.toString(),
    },
  });
  
  const multipartResult = await s3Client.send(createMultipartCommand);
  const uploadId = multipartResult.UploadId!;
  
  // Calculate number of parts (5MB per part minimum)
  const partSize = 5 * 1024 * 1024; // 5MB
  const numParts = Math.ceil(fileSize / partSize);
  
  // Generate presigned URLs for each part
  const presignedUrls: string[] = [];
  for (let partNumber = 1; partNumber <= numParts; partNumber++) {
    const uploadPartCommand = new UploadPartCommand({
      Bucket: MEDIA_BUCKET,
      Key: s3Key,
      PartNumber: partNumber,
      UploadId: uploadId,
    });
    
    const presignedUrl = await getSignedUrl(s3Client, uploadPartCommand, { expiresIn: 3600 });
    presignedUrls.push(presignedUrl);
  }
  
  return {
    mediaId,
    multipartUpload: {
      uploadId,
      presignedUrls,
    },
  };
}

/**
 * Generate presigned URL for direct upload
 */
async function generatePresignedUrl(mediaId: string, s3Key: string, fileType: string): Promise<UploadResponse> {
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: s3Key,
      ContentType: fileType,
    }),
    { expiresIn: 3600 }
  );
  
  return {
    mediaId,
    uploadUrl,
  };
}

/**
 * Complete multipart upload
 */
async function completeMultipartUpload(event: APIGatewayProxyEvent, userId: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const mediaId = event.pathParameters?.mediaId!;
    const { uploadId, parts } = JSON.parse(event.body || '{}');
    
    if (!uploadId || !parts || !Array.isArray(parts)) {
      return createErrorResponse(400, 'uploadId and parts array are required', correlationId);
    }
    
    // Get media record to find S3 key
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord || mediaRecord.userId !== userId) {
      return createErrorResponse(404, 'Media record not found', correlationId);
    }
    
    // Complete multipart upload
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: MEDIA_BUCKET,
      Key: mediaRecord.s3Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });
    
    await s3Client.send(completeCommand);
    
    // Update media record status and trigger analysis
    await updateMediaStatus(mediaId, 'uploaded', correlationId);
    await triggerAnalysis(mediaId, correlationId);
    
    return createSuccessResponse({
      mediaId,
      status: 'uploaded',
      message: 'Upload completed successfully',
    }, correlationId);
    
  } catch (error) {
    console.error('Error completing multipart upload:', error);
    return createErrorResponse(500, 'Failed to complete upload', correlationId);
  }
}

/**
 * Get upload status
 */
async function getUploadStatus(mediaId: string, userId: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const mediaRecord = await getMediaRecord(mediaId);
    
    if (!mediaRecord || mediaRecord.userId !== userId) {
      return createErrorResponse(404, 'Media record not found', correlationId);
    }
    
    return createSuccessResponse({
      mediaId,
      status: mediaRecord.status,
      fileName: mediaRecord.fileName,
      fileSize: mediaRecord.fileSize,
      fileType: mediaRecord.fileType,
      uploadedAt: mediaRecord.uploadedAt,
      analysisStatus: mediaRecord.analysisStatus,
    }, correlationId);
    
  } catch (error) {
    console.error('Error getting upload status:', error);
    return createErrorResponse(500, 'Failed to get upload status', correlationId);
  }
}

/**
 * Create media record in DynamoDB
 */
async function createMediaRecord(
  mediaId: string,
  userId: string,
  fileName: string,
  fileSize: number,
  fileType: string,
  s3Key: string,
  metadata: Record<string, any>,
  correlationId: string
): Promise<void> {
  const now = new Date().toISOString();
  
  await dynamoClient.send(new PutItemCommand({
    TableName: MEDIA_ANALYSIS_TABLE,
    Item: marshall({
      mediaId,
      userId,
      fileName,
      fileSize,
      fileType,
      s3Key,
      status: 'uploading',
      analysisStatus: 'pending',
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
      metadata,
      correlationId,
    }),
  }));
}

/**
 * Get media record from DynamoDB
 */
async function getMediaRecord(mediaId: string): Promise<any> {
  // Implementation would query DynamoDB
  // For demo, return mock data
  return {
    mediaId,
    userId: 'demo-user',
    s3Key: `uploads/demo-user/${mediaId}/file.mp4`,
    status: 'uploaded',
    analysisStatus: 'completed',
  };
}

/**
 * Update media status
 */
async function updateMediaStatus(mediaId: string, status: string, correlationId: string): Promise<void> {
  // Implementation would update DynamoDB record
  console.log(`Updating media ${mediaId} status to ${status}`);
}

/**
 * Trigger analysis pipeline
 */
async function triggerAnalysis(mediaId: string, correlationId: string): Promise<void> {
  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: ANALYSIS_QUEUE_URL,
      MessageBody: JSON.stringify({
        mediaId,
        action: 'analyze',
        correlationId,
        timestamp: new Date().toISOString(),
      }),
    }));
    
    console.log(`Triggered analysis for media ${mediaId}`);
  } catch (error) {
    console.error('Error triggering analysis:', error);
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