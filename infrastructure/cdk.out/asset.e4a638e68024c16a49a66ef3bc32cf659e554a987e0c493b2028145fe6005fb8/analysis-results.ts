import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EnhancedAuthMiddleware, AuthenticatedRequest, ENDPOINT_RATE_LIMITS } from './auth-middleware-enhanced';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Environment variables
const MEDIA_ANALYSIS_TABLE = process.env.MEDIA_ANALYSIS_TABLE!;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET!;

interface AnalysisFilters {
  trustScoreMin?: number;
  trustScoreMax?: number;
  reviewStatus?: string[];
  deepfakeProbabilityMin?: number;
  deepfakeProbabilityMax?: number;
  sourceStatus?: string[];
  fileTypes?: string[];
  startDate?: string;
  endDate?: string;
  limit?: number;
  lastEvaluatedKey?: string;
}

/**
 * Analysis results API endpoint handler with enhanced authentication and rate limiting
 * Fetches media analysis results with filtering, pagination, and detailed views
 */
export const handler = EnhancedAuthMiddleware.withAuthAndRateLimit(
  async (event: AuthenticatedRequest, context: Context): Promise<APIGatewayProxyResult> => {
    console.log('Analysis results request:', { 
      method: event.httpMethod, 
      path: event.path,
      userId: event.user.userId,
      correlationId: event.correlationId 
    });
    
    const correlationId = event.correlationId;
    const userId = event.user.userId;
    const userRole = event.user.role;
    
    try {
      const { httpMethod, pathParameters, queryStringParameters } = event;
      
      switch (httpMethod) {
        case 'GET':
          if (pathParameters?.mediaId) {
            return await getAnalysisDetail(pathParameters.mediaId, userId, userRole, correlationId);
          } else {
            return await listAnalysisResults(queryStringParameters || {}, userId, userRole, correlationId);
          }
        
        case 'POST':
          if (pathParameters?.action === 'reanalyze') {
            return await triggerReanalysis(event, userId, correlationId);
          }
          break;
      }
      
      return createErrorResponse(404, 'Endpoint not found', correlationId);
      
    } catch (error) {
      console.error('Error in analysis results:', error);
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  ['canViewAnalysis'], // Required permission
  ENDPOINT_RATE_LIMITS['/analysis/results'] // Custom rate limits for analysis results
);

/**
 * List analysis results with filtering and pagination
 */
async function listAnalysisResults(
  queryParams: Record<string, string>,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const filters: AnalysisFilters = parseFilters(queryParams);
    const limit = Math.min(filters.limit || 20, 100); // Max 100 items per request
    
    // For demo, return mock data with realistic analysis results
    const mockResults = generateMockAnalysisResults(userId, userRole, filters, limit);
    
    return createSuccessResponse({
      results: mockResults.items,
      totalCount: mockResults.totalCount,
      currentPage: 1,
      totalPages: Math.ceil(mockResults.totalCount / limit),
      hasNextPage: mockResults.totalCount > limit,
      hasPreviousPage: false,
      filters: filters,
    }, correlationId);
    
  } catch (error) {
    console.error('Error listing analysis results:', error);
    return createErrorResponse(500, 'Failed to fetch analysis results', correlationId);
  }
}

/**
 * Get detailed analysis for specific media item
 */
async function getAnalysisDetail(
  mediaId: string,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // For demo, return detailed mock analysis result
    const detailedResult = generateDetailedMockResult(mediaId, userId);
    
    if (!detailedResult) {
      return createErrorResponse(404, 'Analysis result not found', correlationId);
    }
    
    // Check permissions - users can only view their own results unless they're moderator/admin
    if (detailedResult.userId !== userId && !['moderator', 'admin', 'super_admin'].includes(userRole)) {
      return createErrorResponse(403, 'Insufficient permissions to view this analysis', correlationId);
    }
    
    // Generate presigned URL for media preview
    if (detailedResult.s3Key) {
      try {
        detailedResult.mediaUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: MEDIA_BUCKET,
            Key: detailedResult.s3Key,
          }),
          { expiresIn: 3600 } // 1 hour
        );
      } catch (error) {
        console.error('Error generating media URL:', error);
        // Continue without media URL
      }
    }
    
    return createSuccessResponse(detailedResult, correlationId);
    
  } catch (error) {
    console.error('Error getting analysis detail:', error);
    return createErrorResponse(500, 'Failed to fetch analysis detail', correlationId);
  }
}

/**
 * Trigger reanalysis of media item
 */
async function triggerReanalysis(
  event: APIGatewayProxyEvent,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const { mediaId, options } = JSON.parse(event.body || '{}');
    
    if (!mediaId) {
      return createErrorResponse(400, 'mediaId is required', correlationId);
    }
    
    // For demo, simulate reanalysis trigger
    console.log(`Triggering reanalysis for media ${mediaId} with options:`, options);
    
    return createSuccessResponse({
      mediaId,
      status: 'reanalysis_queued',
      message: 'Reanalysis has been queued and will begin shortly',
      estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    }, correlationId);
    
  } catch (error) {
    console.error('Error triggering reanalysis:', error);
    return createErrorResponse(500, 'Failed to trigger reanalysis', correlationId);
  }
}

/**
 * Parse query parameters into filters
 */
function parseFilters(queryParams: Record<string, string>): AnalysisFilters {
  const filters: AnalysisFilters = {};
  
  if (queryParams.trustScoreMin) filters.trustScoreMin = parseFloat(queryParams.trustScoreMin);
  if (queryParams.trustScoreMax) filters.trustScoreMax = parseFloat(queryParams.trustScoreMax);
  if (queryParams.deepfakeProbabilityMin) filters.deepfakeProbabilityMin = parseFloat(queryParams.deepfakeProbabilityMin);
  if (queryParams.deepfakeProbabilityMax) filters.deepfakeProbabilityMax = parseFloat(queryParams.deepfakeProbabilityMax);
  if (queryParams.reviewStatus) filters.reviewStatus = queryParams.reviewStatus.split(',');
  if (queryParams.sourceStatus) filters.sourceStatus = queryParams.sourceStatus.split(',');
  if (queryParams.fileTypes) filters.fileTypes = queryParams.fileTypes.split(',');
  if (queryParams.startDate) filters.startDate = queryParams.startDate;
  if (queryParams.endDate) filters.endDate = queryParams.endDate;
  if (queryParams.limit) filters.limit = parseInt(queryParams.limit);
  if (queryParams.lastEvaluatedKey) filters.lastEvaluatedKey = queryParams.lastEvaluatedKey;
  
  return filters;
}

/**
 * Generate mock analysis results for demo
 */
function generateMockAnalysisResults(userId: string, userRole: string, filters: AnalysisFilters, limit: number) {
  const mockItems = [];
  const totalCount = 47; // Mock total count
  
  for (let i = 0; i < Math.min(limit, 20); i++) {
    const mediaId = `media-${Date.now() - i * 1000}-${Math.random().toString(36).substr(2, 8)}`;
    const trustScore = Math.random() * 100;
    const deepfakeProb = Math.random();
    
    // Apply filters
    if (filters.trustScoreMin && trustScore < filters.trustScoreMin) continue;
    if (filters.trustScoreMax && trustScore > filters.trustScoreMax) continue;
    if (filters.deepfakeProbabilityMin && deepfakeProb < filters.deepfakeProbabilityMin) continue;
    if (filters.deepfakeProbabilityMax && deepfakeProb > filters.deepfakeProbabilityMax) continue;
    
    const reviewStatuses = ['pending', 'in_review', 'completed', 'not_required'];
    const reviewStatus = reviewStatuses[Math.floor(Math.random() * reviewStatuses.length)];
    
    if (filters.reviewStatus && !filters.reviewStatus.includes(reviewStatus)) continue;
    
    mockItems.push({
      mediaId,
      fileName: `sample_video_${i + 1}.mp4`,
      fileType: 'video/mp4',
      fileSize: Math.floor(Math.random() * 50000000) + 1000000, // 1MB to 50MB
      uploadedAt: new Date(Date.now() - i * 3600000).toISOString(),
      analyzedAt: new Date(Date.now() - i * 3600000 + 300000).toISOString(),
      trustScore: {
        composite: Math.round(trustScore * 10) / 10,
        breakdown: {
          deepfakeScore: Math.round((100 - deepfakeProb * 100) * 10) / 10,
          sourceReliabilityScore: Math.round((Math.random() * 40 + 60) * 10) / 10,
          metadataConsistencyScore: Math.round((Math.random() * 30 + 70) * 10) / 10,
          technicalQualityScore: Math.round((Math.random() * 20 + 80) * 10) / 10,
        },
        confidence: trustScore > 80 ? 'high' : trustScore > 60 ? 'medium' : 'low',
        version: '2.1.0',
      },
      deepfakeAnalysis: {
        probability: Math.round(deepfakeProb * 1000) / 1000,
        confidence: Math.round((Math.random() * 0.3 + 0.7) * 1000) / 1000,
        techniques: deepfakeProb > 0.7 ? ['face_swap', 'voice_clone'] : deepfakeProb > 0.4 ? ['face_swap'] : [],
        modelVersion: 'deepfake-detector-v3.2',
        processingTime: Math.floor(Math.random() * 30000) + 5000,
      },
      sourceVerification: {
        status: Math.random() > 0.8 ? 'suspicious' : Math.random() > 0.6 ? 'verified' : 'unknown',
        reputationScore: Math.floor(Math.random() * 100),
        verificationMethod: 'domain_analysis',
        lastChecked: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      },
      reviewStatus: {
        status: reviewStatus,
        assignedModerator: reviewStatus === 'in_review' ? 'moderator_' + Math.floor(Math.random() * 3 + 1) : undefined,
        reviewStarted: reviewStatus !== 'pending' ? new Date(Date.now() - Math.random() * 3600000).toISOString() : undefined,
        reviewCompleted: reviewStatus === 'completed' ? new Date(Date.now() - Math.random() * 1800000).toISOString() : undefined,
      },
      threatIntelligence: deepfakeProb > 0.8 ? {
        reportGenerated: true,
        threatLevel: 'high',
        indicators: Math.floor(Math.random() * 10) + 1,
        reportId: `threat-${Math.random().toString(36).substr(2, 8)}`,
      } : undefined,
    });
  }
  
  return {
    items: mockItems,
    totalCount,
  };
}

/**
 * Generate detailed mock result for specific media
 */
function generateDetailedMockResult(mediaId: string, userId: string) {
  const trustScore = Math.random() * 100;
  const deepfakeProb = Math.random();
  
  return {
    mediaId,
    userId,
    fileName: 'detailed_sample.mp4',
    fileType: 'video/mp4',
    fileSize: 25600000,
    s3Key: `uploads/${userId}/${mediaId}/detailed_sample.mp4`,
    uploadedAt: new Date(Date.now() - 3600000).toISOString(),
    analyzedAt: new Date(Date.now() - 3300000).toISOString(),
    trustScore: {
      composite: Math.round(trustScore * 10) / 10,
      breakdown: {
        deepfakeScore: Math.round((100 - deepfakeProb * 100) * 10) / 10,
        sourceReliabilityScore: 75.5,
        metadataConsistencyScore: 82.3,
        technicalQualityScore: 91.2,
      },
      confidence: trustScore > 80 ? 'high' : trustScore > 60 ? 'medium' : 'low',
      version: '2.1.0',
    },
    deepfakeAnalysis: {
      probability: Math.round(deepfakeProb * 1000) / 1000,
      confidence: 0.89,
      techniques: deepfakeProb > 0.7 ? ['face_swap', 'voice_clone'] : deepfakeProb > 0.4 ? ['face_swap'] : [],
      modelVersion: 'deepfake-detector-v3.2',
      processingTime: 18500,
    },
    sourceVerification: {
      status: 'verified',
      domain: 'trusted-source.com',
      reputationScore: 85,
      verificationMethod: 'domain_analysis',
      lastChecked: new Date(Date.now() - 1800000).toISOString(),
    },
    metadataAnalysis: {
      consistent: true,
      anomalies: [],
      extractedData: {
        camera: 'iPhone 13 Pro',
        location: 'San Francisco, CA',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
      },
      verificationStatus: 'passed',
    },
    reviewStatus: {
      status: 'completed',
      assignedModerator: 'alice_moderator',
      reviewStarted: new Date(Date.now() - 1800000).toISOString(),
      reviewCompleted: new Date(Date.now() - 900000).toISOString(),
      moderatorDecision: {
        decision: deepfakeProb > 0.7 ? 'confirm' : 'reject',
        confidence: 0.92,
        notes: deepfakeProb > 0.7 ? 'Clear evidence of face manipulation detected' : 'No manipulation detected, appears authentic',
        tags: deepfakeProb > 0.7 ? ['deepfake', 'face-swap', 'high-confidence'] : ['authentic', 'verified'],
      },
    },
    threatIntelligence: deepfakeProb > 0.8 ? {
      reportGenerated: true,
      threatLevel: 'high',
      indicators: 7,
      reportId: 'threat-abc123def456',
    } : undefined,
    processingHistory: [
      {
        stage: 'upload',
        status: 'completed',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        duration: 2000,
      },
      {
        stage: 'metadata_extraction',
        status: 'completed',
        timestamp: new Date(Date.now() - 3580000).toISOString(),
        duration: 5000,
      },
      {
        stage: 'deepfake_analysis',
        status: 'completed',
        timestamp: new Date(Date.now() - 3360000).toISOString(),
        duration: 18500,
      },
      {
        stage: 'source_verification',
        status: 'completed',
        timestamp: new Date(Date.now() - 3320000).toISOString(),
        duration: 8000,
      },
      {
        stage: 'trust_score_calculation',
        status: 'completed',
        timestamp: new Date(Date.now() - 3300000).toISOString(),
        duration: 1500,
      },
    ],
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