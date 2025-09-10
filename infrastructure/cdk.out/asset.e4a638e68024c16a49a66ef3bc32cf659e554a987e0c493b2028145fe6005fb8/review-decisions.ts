import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { EnhancedAuthMiddleware, AuthenticatedRequest, ENDPOINT_RATE_LIMITS } from './auth-middleware-enhanced';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

// Environment variables
const REVIEW_DECISIONS_TABLE = process.env.REVIEW_DECISIONS_TABLE!;
const MEDIA_ANALYSIS_TABLE = process.env.MEDIA_ANALYSIS_TABLE!;
const THREAT_INTELLIGENCE_QUEUE = process.env.THREAT_INTELLIGENCE_QUEUE!;
const REVIEW_NOTIFICATIONS_TOPIC = process.env.REVIEW_NOTIFICATIONS_TOPIC!;

interface ReviewDecision {
  reviewId: string;
  mediaId: string;
  moderatorId: string;
  decision: 'confirm' | 'reject' | 'uncertain' | 'escalate';
  confidence: number;
  notes: string;
  tags: string[];
  findings?: {
    manipulationTechniques?: string[];
    suspiciousPatterns?: string[];
    technicalDetails?: Record<string, any>;
  };
  reviewStartedAt: string;
  reviewCompletedAt: string;
}

interface ReviewQueueItem {
  mediaId: string;
  fileName: string;
  trustScore: number;
  deepfakeProbability: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedModerator?: string;
  queuedAt: string;
  estimatedReviewTime: number;
}

/**
 * Human review decision API endpoint handler with enhanced authentication and rate limiting
 * Handles moderator review submissions and workflow management
 */
export const handler = EnhancedAuthMiddleware.withAuthAndRateLimit(
  async (event: AuthenticatedRequest, context: Context): Promise<APIGatewayProxyResult> => {
    console.log('Review decisions request:', { 
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
      
      // Check moderator permissions
      if (!['moderator', 'admin', 'super_admin'].includes(userRole)) {
        return createErrorResponse(403, 'Insufficient permissions for review operations', correlationId);
      }
      
      switch (httpMethod) {
        case 'GET':
          if (pathParameters?.action === 'queue') {
            return await getReviewQueue(queryStringParameters || {}, userId, userRole, correlationId);
          } else if (pathParameters?.reviewId) {
            return await getReviewDecision(pathParameters.reviewId, userId, userRole, correlationId);
          } else {
            return await listReviewDecisions(queryStringParameters || {}, userId, userRole, correlationId);
          }
        
        case 'POST':
          if (pathParameters?.action === 'start') {
            return await startReview(event, userId, correlationId);
          } else {
            return await submitReviewDecision(event, userId, correlationId);
          }
        
        case 'PUT':
          if (pathParameters?.reviewId && pathParameters?.action === 'update') {
            return await updateReviewDecision(event, userId, correlationId);
          } else if (pathParameters?.mediaId && pathParameters?.action === 'assign') {
            return await assignReview(event, userId, correlationId);
          }
          break;
      }
      
      return createErrorResponse(404, 'Endpoint not found', correlationId);
      
    } catch (error) {
      console.error('Error in review decisions:', error);
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  ['canModerateContent'], // Required permission
  ENDPOINT_RATE_LIMITS['/review/decisions'] // Custom rate limits for review decisions
);

/**
 * Get review queue for moderator
 */
async function getReviewQueue(
  queryParams: Record<string, string>,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const priority = queryParams.priority;
    const assignedOnly = queryParams.assignedOnly === 'true';
    const limit = Math.min(parseInt(queryParams.limit || '20'), 100);
    
    // For demo, generate mock review queue
    const queueItems = generateMockReviewQueue(userId, userRole, priority, assignedOnly, limit);
    
    return createSuccessResponse({
      queue: queueItems,
      totalPending: queueItems.length,
      assignedToMe: queueItems.filter(item => item.assignedModerator === userId).length,
      priorityDistribution: {
        critical: queueItems.filter(item => item.priority === 'critical').length,
        high: queueItems.filter(item => item.priority === 'high').length,
        medium: queueItems.filter(item => item.priority === 'medium').length,
        low: queueItems.filter(item => item.priority === 'low').length,
      },
      estimatedWorkload: queueItems.reduce((sum, item) => sum + item.estimatedReviewTime, 0),
    }, correlationId);
    
  } catch (error) {
    console.error('Error getting review queue:', error);
    return createErrorResponse(500, 'Failed to fetch review queue', correlationId);
  }
}

/**
 * Start review for a media item
 */
async function startReview(
  event: APIGatewayProxyEvent,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const { mediaId, priority } = JSON.parse(event.body || '{}');
    
    if (!mediaId) {
      return createErrorResponse(400, 'mediaId is required', correlationId);
    }
    
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const now = new Date().toISOString();
    
    // For demo, simulate starting review
    console.log(`Starting review ${reviewId} for media ${mediaId} by moderator ${userId}`);
    
    // Update media analysis status
    await updateMediaReviewStatus(mediaId, 'in_review', userId, correlationId);
    
    // Send notification
    await sendReviewNotification('review_started', {
      reviewId,
      mediaId,
      moderatorId: userId,
      startedAt: now,
    }, correlationId);
    
    return createSuccessResponse({
      reviewId,
      mediaId,
      status: 'in_review',
      assignedModerator: userId,
      startedAt: now,
      message: 'Review started successfully',
    }, correlationId);
    
  } catch (error) {
    console.error('Error starting review:', error);
    return createErrorResponse(500, 'Failed to start review', correlationId);
  }
}

/**
 * Submit review decision
 */
async function submitReviewDecision(
  event: APIGatewayProxyEvent,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const decisionData: Partial<ReviewDecision> = JSON.parse(event.body || '{}');
    
    const { mediaId, decision, confidence, notes, tags = [], findings = {} } = decisionData;
    
    if (!mediaId || !decision || confidence === undefined || !notes) {
      return createErrorResponse(400, 'mediaId, decision, confidence, and notes are required', correlationId);
    }
    
    if (!['confirm', 'reject', 'uncertain', 'escalate'].includes(decision)) {
      return createErrorResponse(400, 'Invalid decision value', correlationId);
    }
    
    if (confidence < 0 || confidence > 1) {
      return createErrorResponse(400, 'Confidence must be between 0 and 1', correlationId);
    }
    
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const now = new Date().toISOString();
    
    const reviewDecision: ReviewDecision = {
      reviewId,
      mediaId,
      moderatorId: userId,
      decision,
      confidence,
      notes,
      tags,
      findings,
      reviewStartedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
      reviewCompletedAt: now,
    };
    
    // Store review decision
    await storeReviewDecision(reviewDecision, correlationId);
    
    // Update media analysis status
    await updateMediaReviewStatus(mediaId, 'completed', userId, correlationId);
    
    // Trigger threat intelligence processing for confirmed threats
    if (decision === 'confirm' && confidence >= 0.7) {
      await triggerThreatIntelligenceProcessing(reviewDecision, correlationId);
    }
    
    // Send notification
    await sendReviewNotification('review_completed', {
      reviewId,
      mediaId,
      moderatorId: userId,
      decision,
      confidence,
      completedAt: now,
    }, correlationId);
    
    return createSuccessResponse({
      reviewId,
      status: 'completed',
      decision,
      confidence,
      threatIntelligenceTriggered: decision === 'confirm' && confidence >= 0.7,
      message: 'Review decision submitted successfully',
    }, correlationId);
    
  } catch (error) {
    console.error('Error submitting review decision:', error);
    return createErrorResponse(500, 'Failed to submit review decision', correlationId);
  }
}

/**
 * Get specific review decision
 */
async function getReviewDecision(
  reviewId: string,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    // For demo, return mock review decision
    const mockDecision = generateMockReviewDecision(reviewId, userId);
    
    if (!mockDecision) {
      return createErrorResponse(404, 'Review decision not found', correlationId);
    }
    
    return createSuccessResponse(mockDecision, correlationId);
    
  } catch (error) {
    console.error('Error getting review decision:', error);
    return createErrorResponse(500, 'Failed to fetch review decision', correlationId);
  }
}

/**
 * List review decisions with filtering
 */
async function listReviewDecisions(
  queryParams: Record<string, string>,
  userId: string,
  userRole: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const moderatorId = queryParams.moderatorId;
    const decision = queryParams.decision;
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const limit = Math.min(parseInt(queryParams.limit || '20'), 100);
    
    // For demo, generate mock review decisions
    const decisions = generateMockReviewDecisions(userId, userRole, {
      moderatorId,
      decision,
      startDate,
      endDate,
      limit,
    });
    
    return createSuccessResponse({
      decisions,
      totalCount: decisions.length,
      filters: {
        moderatorId,
        decision,
        startDate,
        endDate,
      },
    }, correlationId);
    
  } catch (error) {
    console.error('Error listing review decisions:', error);
    return createErrorResponse(500, 'Failed to list review decisions', correlationId);
  }
}

/**
 * Update existing review decision
 */
async function updateReviewDecision(
  event: APIGatewayProxyEvent,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const reviewId = event.pathParameters?.reviewId!;
    const updates = JSON.parse(event.body || '{}');
    
    // For demo, simulate update
    console.log(`Updating review ${reviewId} with:`, updates);
    
    return createSuccessResponse({
      reviewId,
      status: 'updated',
      updatedAt: new Date().toISOString(),
      message: 'Review decision updated successfully',
    }, correlationId);
    
  } catch (error) {
    console.error('Error updating review decision:', error);
    return createErrorResponse(500, 'Failed to update review decision', correlationId);
  }
}

/**
 * Assign review to moderator
 */
async function assignReview(
  event: APIGatewayProxyEvent,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResult> {
  try {
    const mediaId = event.pathParameters?.mediaId!;
    const { moderatorId, priority } = JSON.parse(event.body || '{}');
    
    if (!moderatorId) {
      return createErrorResponse(400, 'moderatorId is required', correlationId);
    }
    
    // For demo, simulate assignment
    console.log(`Assigning media ${mediaId} to moderator ${moderatorId} with priority ${priority}`);
    
    await updateMediaReviewStatus(mediaId, 'assigned', moderatorId, correlationId);
    
    return createSuccessResponse({
      mediaId,
      assignedModerator: moderatorId,
      priority: priority || 'medium',
      assignedAt: new Date().toISOString(),
      message: 'Review assigned successfully',
    }, correlationId);
    
  } catch (error) {
    console.error('Error assigning review:', error);
    return createErrorResponse(500, 'Failed to assign review', correlationId);
  }
}

/**
 * Store review decision in DynamoDB
 */
async function storeReviewDecision(decision: ReviewDecision, correlationId: string): Promise<void> {
  try {
    await dynamoClient.send(new PutItemCommand({
      TableName: REVIEW_DECISIONS_TABLE,
      Item: marshall({
        ...decision,
        createdAt: new Date().toISOString(),
        correlationId,
      }),
    }));
    
    console.log(`Stored review decision ${decision.reviewId}`);
  } catch (error) {
    console.error('Error storing review decision:', error);
    throw error;
  }
}

/**
 * Update media review status
 */
async function updateMediaReviewStatus(
  mediaId: string,
  status: string,
  moderatorId: string,
  correlationId: string
): Promise<void> {
  try {
    // For demo, just log the update
    console.log(`Updating media ${mediaId} review status to ${status} by ${moderatorId}`);
  } catch (error) {
    console.error('Error updating media review status:', error);
  }
}

/**
 * Trigger threat intelligence processing
 */
async function triggerThreatIntelligenceProcessing(decision: ReviewDecision, correlationId: string): Promise<void> {
  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: THREAT_INTELLIGENCE_QUEUE,
      MessageBody: JSON.stringify({
        operation: 'process_review_decision',
        decisionData: decision,
        mediaId: decision.mediaId,
        reviewId: decision.reviewId,
        moderatorId: decision.moderatorId,
        correlationId,
        timestamp: new Date().toISOString(),
      }),
    }));
    
    console.log(`Triggered threat intelligence processing for review ${decision.reviewId}`);
  } catch (error) {
    console.error('Error triggering threat intelligence processing:', error);
  }
}

/**
 * Send review notification
 */
async function sendReviewNotification(
  eventType: string,
  data: Record<string, any>,
  correlationId: string
): Promise<void> {
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: REVIEW_NOTIFICATIONS_TOPIC,
      Subject: `Review ${eventType}: ${data.mediaId}`,
      Message: JSON.stringify({
        eventType,
        ...data,
        correlationId,
        timestamp: new Date().toISOString(),
      }),
    }));
    
    console.log(`Sent review notification: ${eventType}`);
  } catch (error) {
    console.error('Error sending review notification:', error);
  }
}

/**
 * Generate mock review queue for demo
 */
function generateMockReviewQueue(
  userId: string,
  userRole: string,
  priority?: string,
  assignedOnly?: boolean,
  limit?: number
): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = [];
  const priorities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
  
  for (let i = 0; i < (limit || 10); i++) {
    const itemPriority = priority ? priority as any : priorities[Math.floor(Math.random() * priorities.length)];
    const isAssigned = Math.random() > 0.6;
    const assignedModerator = isAssigned ? (Math.random() > 0.5 ? userId : `moderator_${Math.floor(Math.random() * 3) + 1}`) : undefined;
    
    if (assignedOnly && assignedModerator !== userId) continue;
    if (priority && itemPriority !== priority) continue;
    
    items.push({
      mediaId: `media-${Date.now() - i * 1000}-${Math.random().toString(36).substr(2, 8)}`,
      fileName: `suspicious_content_${i + 1}.mp4`,
      trustScore: Math.random() * 40 + 10, // Low trust scores (10-50)
      deepfakeProbability: Math.random() * 0.6 + 0.4, // High deepfake probability (0.4-1.0)
      priority: itemPriority,
      assignedModerator,
      queuedAt: new Date(Date.now() - i * 600000).toISOString(), // Queued in last few hours
      estimatedReviewTime: Math.floor(Math.random() * 20 + 10), // 10-30 minutes
    });
  }
  
  return items.sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

/**
 * Generate mock review decision
 */
function generateMockReviewDecision(reviewId: string, userId: string): ReviewDecision | null {
  const decisions: Array<'confirm' | 'reject' | 'uncertain' | 'escalate'> = ['confirm', 'reject', 'uncertain', 'escalate'];
  const decision = decisions[Math.floor(Math.random() * decisions.length)];
  
  return {
    reviewId,
    mediaId: `media-${Math.random().toString(36).substr(2, 8)}`,
    moderatorId: userId,
    decision,
    confidence: Math.random() * 0.4 + 0.6, // 0.6-1.0
    notes: decision === 'confirm' 
      ? 'Clear evidence of deepfake manipulation detected in facial features and audio synchronization.'
      : 'No significant manipulation detected. Content appears authentic.',
    tags: decision === 'confirm' 
      ? ['deepfake', 'face-manipulation', 'high-confidence']
      : ['authentic', 'verified', 'no-manipulation'],
    findings: decision === 'confirm' ? {
      manipulationTechniques: ['face_swap', 'expression_transfer'],
      suspiciousPatterns: ['temporal_inconsistency', 'lighting_mismatch'],
      technicalDetails: {
        artifactScore: 0.87,
        temporalConsistency: 0.23,
        facialLandmarkDeviation: 0.91,
      },
    } : undefined,
    reviewStartedAt: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
    reviewCompletedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
  };
}

/**
 * Generate mock review decisions list
 */
function generateMockReviewDecisions(
  userId: string,
  userRole: string,
  filters: Record<string, any>
): ReviewDecision[] {
  const decisions: ReviewDecision[] = [];
  const limit = filters.limit || 20;
  
  for (let i = 0; i < limit; i++) {
    const decision = generateMockReviewDecision(`review-${i}`, userId);
    if (decision) {
      decisions.push(decision);
    }
  }
  
  return decisions;
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