/**
 * Comprehensive media analysis handler
 * Orchestrates deepfake detection, trust score calculation, and source verification
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { EnhancedAuthMiddleware, AuthContext, PERMISSIONS } from '../auth/enhanced-auth-middleware';
import { createSuccessResponse, createErrorResponse, createNotFoundResponse, withErrorHandler } from './error-handler';
import { validateRequest, MediaUploadSchemas } from './validation-schemas';
import { randomUUID } from 'crypto';

// Initialize AWS clients
const sfnClient = new SFNClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// Environment variables
const ANALYSIS_STATE_MACHINE_ARN = process.env.ANALYSIS_STATE_MACHINE_ARN!;
const MEDIA_TABLE = process.env.MEDIA_TABLE!;
const AUDIT_TABLE = process.env.AUDIT_TABLE!;
const DEEPFAKE_DETECTOR_FUNCTION = process.env.DEEPFAKE_DETECTOR_FUNCTION!;
const TRUST_SCORE_CALCULATOR_FUNCTION = process.env.TRUST_SCORE_CALCULATOR_FUNCTION!;
const SOURCE_VERIFIER_FUNCTION = process.env.SOURCE_VERIFIER_FUNCTION!;

interface AnalysisRequest {
  mediaId: string;
  analysisType?: 'full' | 'deepfake_only' | 'trust_score_only' | 'source_only';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  options?: {
    forceReanalysis?: boolean;
    includeAdvancedMetrics?: boolean;
    generateReport?: boolean;
  };
}

interface AnalysisResult {
  analysisId: string;
  mediaId: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  analysisType: string;
  startedAt: string;
  completedAt?: string;
  results?: {
    deepfakeAnalysis?: any;
    trustScore?: any;
    sourceVerification?: any;
    overallAssessment?: any;
  };
  executionArn?: string;
  error?: string;
}

/**
 * Main handler for media analysis operations
 */
export const handler = EnhancedAuthMiddleware.withEnhancedAuth(
  async (event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> => {
    const correlationId = context.awsRequestId;
    
    console.log('Media analysis request:', {
      method: event.httpMethod,
      path: event.path,
      mediaId: event.pathParameters?.mediaId,
      userId: auth.user.userId,
      correlationId,
    });

    try {
      const { httpMethod, pathParameters } = event;
      const mediaId = pathParameters?.mediaId;

      switch (httpMethod) {
        case 'POST':
          if (mediaId) {
            return await handleStartAnalysis(mediaId, event, auth, correlationId);
          }
          return createErrorResponse(400, 'Media ID is required', correlationId);

        case 'GET':
          if (mediaId) {
            const analysisId = event.queryStringParameters?.analysisId;
            if (analysisId) {
              return await handleGetAnalysisStatus(mediaId, analysisId, auth, correlationId);
            }
            return await handleGetMediaAnalyses(mediaId, auth, correlationId);
          }
          return createErrorResponse(400, 'Media ID is required', correlationId);

        case 'DELETE':
          if (mediaId) {
            const analysisId = event.queryStringParameters?.analysisId;
            if (analysisId) {
              return await handleCancelAnalysis(mediaId, analysisId, auth, correlationId);
            }
          }
          return createErrorResponse(400, 'Media ID and Analysis ID are required', correlationId);

        default:
          return createErrorResponse(405, 'Method not allowed', correlationId);
      }
    } catch (error) {
      console.error('Media analysis handler error:', error, { correlationId });
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  [PERMISSIONS.VIEW_ANALYSIS]
);

/**
 * Start comprehensive media analysis
 */
async function handleStartAnalysis(
  mediaId: string,
  event: APIGatewayProxyEvent,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    const request: AnalysisRequest = event.body ? JSON.parse(event.body) : {};
    request.mediaId = mediaId;

    // Validate media exists and user has access
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord) {
      return createNotFoundResponse('Media', correlationId);
    }

    // Check if user owns the media or has appropriate permissions
    if (mediaRecord.userId !== auth.user.userId && !auth.user.permissions[PERMISSIONS.MODERATE_CONTENT]) {
      return createErrorResponse(403, 'Access denied', correlationId);
    }

    // Check if analysis is already in progress
    const existingAnalysis = await getActiveAnalysis(mediaId);
    if (existingAnalysis && !request.options?.forceReanalysis) {
      return createSuccessResponse({
        message: 'Analysis already in progress',
        analysis: existingAnalysis,
      }, correlationId);
    }

    // Create analysis record
    const analysisId = randomUUID();
    const analysisRecord: AnalysisResult = {
      analysisId,
      mediaId,
      status: 'started',
      analysisType: request.analysisType || 'full',
      startedAt: new Date().toISOString(),
    };

    // Determine analysis workflow based on type
    const analysisResult = await startAnalysisWorkflow(
      analysisRecord,
      mediaRecord,
      request,
      auth.user.userId,
      correlationId
    );

    return createSuccessResponse({
      analysisId,
      status: analysisResult.status,
      message: 'Analysis started successfully',
      executionArn: analysisResult.executionArn,
      estimatedCompletionTime: analysisResult.estimatedCompletionTime,
    }, correlationId);

  } catch (error) {
    console.error('Error starting analysis:', error, { mediaId, correlationId });
    return createErrorResponse(500, 'Failed to start analysis', correlationId);
  }
}

/**
 * Get analysis status
 */
async function handleGetAnalysisStatus(
  mediaId: string,
  analysisId: string,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Get analysis record
    const analysis = await getAnalysisRecord(analysisId);
    if (!analysis) {
      return createNotFoundResponse('Analysis', correlationId);
    }

    // Verify media ID matches
    if (analysis.mediaId !== mediaId) {
      return createErrorResponse(400, 'Analysis does not belong to specified media', correlationId);
    }

    // Check user access
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord) {
      return createNotFoundResponse('Media', correlationId);
    }

    if (mediaRecord.userId !== auth.user.userId && !auth.user.permissions[PERMISSIONS.MODERATE_CONTENT]) {
      return createErrorResponse(403, 'Access denied', correlationId);
    }

    // Update analysis status if execution is still running
    if (analysis.executionArn && (analysis.status === 'started' || analysis.status === 'in_progress')) {
      const updatedAnalysis = await updateAnalysisFromExecution(analysis);
      return createSuccessResponse(updatedAnalysis, correlationId);
    }

    return createSuccessResponse(analysis, correlationId);

  } catch (error) {
    console.error('Error getting analysis status:', error, { mediaId, analysisId, correlationId });
    return createErrorResponse(500, 'Failed to get analysis status', correlationId);
  }
}

/**
 * Get all analyses for a media item
 */
async function handleGetMediaAnalyses(
  mediaId: string,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Verify media exists and user has access
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord) {
      return createNotFoundResponse('Media', correlationId);
    }

    if (mediaRecord.userId !== auth.user.userId && !auth.user.permissions[PERMISSIONS.MODERATE_CONTENT]) {
      return createErrorResponse(403, 'Access denied', correlationId);
    }

    // Get all analyses for this media
    const analyses = await getMediaAnalyses(mediaId);

    return createSuccessResponse({
      mediaId,
      analyses,
      totalCount: analyses.length,
    }, correlationId);

  } catch (error) {
    console.error('Error getting media analyses:', error, { mediaId, correlationId });
    return createErrorResponse(500, 'Failed to get media analyses', correlationId);
  }
}

/**
 * Cancel running analysis
 */
async function handleCancelAnalysis(
  mediaId: string,
  analysisId: string,
  auth: AuthContext,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // Get analysis record
    const analysis = await getAnalysisRecord(analysisId);
    if (!analysis) {
      return createNotFoundResponse('Analysis', correlationId);
    }

    // Verify media ID matches
    if (analysis.mediaId !== mediaId) {
      return createErrorResponse(400, 'Analysis does not belong to specified media', correlationId);
    }

    // Check user access
    const mediaRecord = await getMediaRecord(mediaId);
    if (!mediaRecord) {
      return createNotFoundResponse('Media', correlationId);
    }

    if (mediaRecord.userId !== auth.user.userId && !auth.user.permissions[PERMISSIONS.MODERATE_CONTENT]) {
      return createErrorResponse(403, 'Access denied', correlationId);
    }

    // Check if analysis can be cancelled
    if (analysis.status === 'completed' || analysis.status === 'failed' || analysis.status === 'cancelled') {
      return createErrorResponse(400, `Cannot cancel analysis with status: ${analysis.status}`, correlationId);
    }

    // Cancel the execution if it exists
    if (analysis.executionArn) {
      try {
        const { StopExecutionCommand } = await import('@aws-sdk/client-sfn');
        await sfnClient.send(new StopExecutionCommand({
          executionArn: analysis.executionArn,
          cause: `Cancelled by user ${auth.user.userId}`,
        }));
      } catch (error) {
        console.warn('Failed to stop execution:', error);
      }
    }

    // Update analysis status
    const updatedAnalysis = await updateAnalysisStatus(analysisId, 'cancelled', {
      cancelledBy: auth.user.userId,
      cancelledAt: new Date().toISOString(),
    });

    return createSuccessResponse({
      message: 'Analysis cancelled successfully',
      analysis: updatedAnalysis,
    }, correlationId);

  } catch (error) {
    console.error('Error cancelling analysis:', error, { mediaId, analysisId, correlationId });
    return createErrorResponse(500, 'Failed to cancel analysis', correlationId);
  }
}

/**
 * Start analysis workflow based on type
 */
async function startAnalysisWorkflow(
  analysisRecord: AnalysisResult,
  mediaRecord: any,
  request: AnalysisRequest,
  userId: string,
  correlationId: string
): Promise<{ status: string; executionArn?: string; estimatedCompletionTime?: string }> {
  
  const analysisType = request.analysisType || 'full';
  
  if (analysisType === 'full') {
    // Start comprehensive analysis using Step Functions
    return await startStepFunctionAnalysis(analysisRecord, mediaRecord, request, userId, correlationId);
  } else {
    // Start specific analysis using direct Lambda invocation
    return await startDirectAnalysis(analysisRecord, mediaRecord, request, userId, correlationId);
  }
}

/**
 * Start comprehensive analysis using Step Functions
 */
async function startStepFunctionAnalysis(
  analysisRecord: AnalysisResult,
  mediaRecord: any,
  request: AnalysisRequest,
  userId: string,
  correlationId: string
): Promise<{ status: string; executionArn: string; estimatedCompletionTime: string }> {
  
  const executionInput = {
    analysisId: analysisRecord.analysisId,
    mediaId: analysisRecord.mediaId,
    userId,
    s3Bucket: mediaRecord.s3Bucket,
    s3Key: mediaRecord.s3Key,
    contentType: mediaRecord.contentType,
    fileSize: mediaRecord.fileSize,
    analysisOptions: request.options || {},
    priority: request.priority || 'normal',
    correlationId,
    timestamp: new Date().toISOString(),
  };

  const executionResult = await sfnClient.send(new StartExecutionCommand({
    stateMachineArn: ANALYSIS_STATE_MACHINE_ARN,
    name: `analysis-${analysisRecord.analysisId}-${Date.now()}`,
    input: JSON.stringify(executionInput),
  }));

  // Store analysis record with execution ARN
  await storeAnalysisRecord({
    ...analysisRecord,
    status: 'in_progress',
    executionArn: executionResult.executionArn,
  });

  // Estimate completion time based on file size and type
  const estimatedDuration = estimateAnalysisDuration(mediaRecord.fileSize, mediaRecord.contentType);
  const estimatedCompletionTime = new Date(Date.now() + estimatedDuration).toISOString();

  return {
    status: 'in_progress',
    executionArn: executionResult.executionArn!,
    estimatedCompletionTime,
  };
}

/**
 * Start specific analysis using direct Lambda invocation
 */
async function startDirectAnalysis(
  analysisRecord: AnalysisResult,
  mediaRecord: any,
  request: AnalysisRequest,
  userId: string,
  correlationId: string
): Promise<{ status: string; estimatedCompletionTime: string }> {
  
  const analysisType = request.analysisType!;
  let functionName: string;
  
  switch (analysisType) {
    case 'deepfake_only':
      functionName = DEEPFAKE_DETECTOR_FUNCTION;
      break;
    case 'trust_score_only':
      functionName = TRUST_SCORE_CALCULATOR_FUNCTION;
      break;
    case 'source_only':
      functionName = SOURCE_VERIFIER_FUNCTION;
      break;
    default:
      throw new Error(`Unsupported analysis type: ${analysisType}`);
  }

  const payload = {
    mediaId: analysisRecord.mediaId,
    analysisId: analysisRecord.analysisId,
    userId,
    s3Bucket: mediaRecord.s3Bucket,
    s3Key: mediaRecord.s3Key,
    contentType: mediaRecord.contentType,
    fileSize: mediaRecord.fileSize,
    options: request.options || {},
    correlationId,
  };

  // Invoke Lambda function asynchronously
  await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event', // Async invocation
    Payload: JSON.stringify(payload),
  }));

  // Store analysis record
  await storeAnalysisRecord({
    ...analysisRecord,
    status: 'in_progress',
  });

  // Estimate completion time
  const estimatedDuration = estimateAnalysisDuration(mediaRecord.fileSize, mediaRecord.contentType, analysisType);
  const estimatedCompletionTime = new Date(Date.now() + estimatedDuration).toISOString();

  return {
    status: 'in_progress',
    estimatedCompletionTime,
  };
}

/**
 * Estimate analysis duration based on file characteristics
 */
function estimateAnalysisDuration(fileSize: number, contentType: string, analysisType?: string): number {
  const baseDuration = 30000; // 30 seconds base
  const sizeFactor = Math.log10(fileSize / 1024 / 1024 + 1) * 10000; // Size-based factor
  
  let typeFactor = 1;
  if (contentType.startsWith('video/')) {
    typeFactor = 3; // Videos take longer
  }
  
  let analysisFactor = 1;
  if (analysisType === 'full') {
    analysisFactor = 2.5; // Full analysis takes longer
  } else if (analysisType === 'deepfake_only') {
    analysisFactor = 2;
  }
  
  return Math.min(baseDuration + sizeFactor * typeFactor * analysisFactor, 600000); // Max 10 minutes
}

/**
 * Helper functions for database operations
 */

async function getMediaRecord(mediaId: string): Promise<any | null> {
  try {
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: MEDIA_TABLE,
      Key: marshall({ mediaId }),
    }));
    
    return result.Item ? unmarshall(result.Item) : null;
  } catch (error) {
    console.error('Error getting media record:', error);
    return null;
  }
}

async function getAnalysisRecord(analysisId: string): Promise<AnalysisResult | null> {
  try {
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: AUDIT_TABLE,
      Key: marshall({ 
        mediaId: analysisId, // Using analysisId as partition key
        timestamp: 'ANALYSIS_RECORD' // Fixed sort key for analysis records
      }),
    }));
    
    return result.Item ? unmarshall(result.Item) as AnalysisResult : null;
  } catch (error) {
    console.error('Error getting analysis record:', error);
    return null;
  }
}

async function getActiveAnalysis(mediaId: string): Promise<AnalysisResult | null> {
  // Implementation would query for active analyses for this media
  // This is a simplified version
  return null;
}

async function getMediaAnalyses(mediaId: string): Promise<AnalysisResult[]> {
  // Implementation would query all analyses for this media
  // This is a simplified version
  return [];
}

async function storeAnalysisRecord(analysis: AnalysisResult): Promise<void> {
  try {
    await dynamoClient.send(new UpdateItemCommand({
      TableName: AUDIT_TABLE,
      Key: marshall({
        mediaId: analysis.analysisId,
        timestamp: 'ANALYSIS_RECORD'
      }),
      UpdateExpression: 'SET #data = :data, #eventType = :eventType, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#eventType': 'eventType'
      },
      ExpressionAttributeValues: marshall({
        ':data': analysis,
        ':eventType': 'analysis_record',
        ':updatedAt': new Date().toISOString()
      })
    }));
  } catch (error) {
    console.error('Error storing analysis record:', error);
    throw error;
  }
}

async function updateAnalysisStatus(
  analysisId: string, 
  status: string, 
  additionalData?: Record<string, any>
): Promise<AnalysisResult> {
  try {
    const updateData = {
      status,
      updatedAt: new Date().toISOString(),
      ...additionalData
    };
    
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updateData.completedAt = new Date().toISOString();
    }
    
    await dynamoClient.send(new UpdateItemCommand({
      TableName: AUDIT_TABLE,
      Key: marshall({
        mediaId: analysisId,
        timestamp: 'ANALYSIS_RECORD'
      }),
      UpdateExpression: 'SET #data.#status = :status, #data.updatedAt = :updatedAt' + 
        (updateData.completedAt ? ', #data.completedAt = :completedAt' : ''),
      ExpressionAttributeNames: {
        '#data': 'data',
        '#status': 'status'
      },
      ExpressionAttributeValues: marshall({
        ':status': status,
        ':updatedAt': updateData.updatedAt,
        ...(updateData.completedAt && { ':completedAt': updateData.completedAt })
      })
    }));
    
    // Return updated record
    const updatedRecord = await getAnalysisRecord(analysisId);
    return updatedRecord!;
    
  } catch (error) {
    console.error('Error updating analysis status:', error);
    throw error;
  }
}

async function updateAnalysisFromExecution(analysis: AnalysisResult): Promise<AnalysisResult> {
  if (!analysis.executionArn) return analysis;
  
  try {
    const executionResult = await sfnClient.send(new DescribeExecutionCommand({
      executionArn: analysis.executionArn
    }));
    
    let status = analysis.status;
    let results = analysis.results;
    
    switch (executionResult.status) {
      case 'RUNNING':
        status = 'in_progress';
        break;
      case 'SUCCEEDED':
        status = 'completed';
        if (executionResult.output) {
          results = JSON.parse(executionResult.output);
        }
        break;
      case 'FAILED':
      case 'TIMED_OUT':
      case 'ABORTED':
        status = 'failed';
        break;
    }
    
    if (status !== analysis.status) {
      return await updateAnalysisStatus(analysis.analysisId, status, { results });
    }
    
    return analysis;
    
  } catch (error) {
    console.error('Error updating analysis from execution:', error);
    return analysis;
  }
}