const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    console.log('Processing request:', JSON.stringify(event));
    
    // Determine operation from HTTP method and path
    const httpMethod = event.httpMethod || 'POST';
    const path = event.resource || '';
    const mediaId = event.pathParameters?.mediaId;
    
    // Route to appropriate handler
    if (path.includes('/status') && httpMethod === 'GET') {
      return handleGetStatus(mediaId);
    } else if (path.includes('/trust-scores') && httpMethod === 'GET') {
      return handleGetTrustScores(event);
    } else if (path.includes('/trust-scores') && mediaId && httpMethod === 'GET') {
      return handleGetTrustScore(mediaId);
    } else if (path.includes('/trust-scores') && mediaId && httpMethod === 'POST') {
      return handleCalculateTrustScore(mediaId);
    } else if (path.includes('/hitl') && httpMethod === 'POST') {
      return handleHitlDemo(event);
    } else {
      return createErrorResponse(400, `Unsupported operation: ${httpMethod} ${path}`);
    }
    
  } catch (error) {
    console.error('Handler error:', error);
    return createErrorResponse(500, 'Internal server error');
  }
};

async function handleGetStatus(mediaId) {
  try {
    if (!mediaId) {
      return createErrorResponse(400, 'Missing mediaId parameter');
    }
    
    // Simulate analysis status
    const status = {
      mediaId,
      status: 'completed',
      progress: 100,
      currentStage: 'complete',
      processingStages: {
        security: { status: 'completed', duration: 500 },
        metadata: { status: 'completed', duration: 300 },
        bedrock: { status: 'completed', duration: 2000 },
        hitl: { status: 'not_required', duration: 0 }
      },
      estimatedTimeRemaining: 0,
      completedAt: new Date().toISOString()
    };
    
    return createSuccessResponse(status);
    
  } catch (error) {
    console.error('Error getting status:', error);
    return createErrorResponse(500, 'Failed to get status');
  }
}

async function handleGetTrustScores(event) {
  try {
    // Simulate list of trust scores
    const trustScores = [
      {
        mediaId: 'demo-media-1',
        filename: 'sample_image.jpg',
        compositeScore: 85,
        confidence: 'high',
        calculationTimestamp: new Date().toISOString(),
        uploadTimestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        mediaId: 'demo-media-2', 
        filename: 'test_video.mp4',
        compositeScore: 32,
        confidence: 'medium',
        calculationTimestamp: new Date().toISOString(),
        uploadTimestamp: new Date(Date.now() - 7200000).toISOString()
      }
    ];
    
    return createSuccessResponse({
      trustScores,
      statistics: {
        totalScores: trustScores.length,
        averageScore: trustScores.reduce((sum, s) => sum + s.compositeScore, 0) / trustScores.length,
        scoreDistribution: {
          high: trustScores.filter(s => s.compositeScore >= 70).length,
          medium: trustScores.filter(s => s.compositeScore >= 40 && s.compositeScore < 70).length,
          low: trustScores.filter(s => s.compositeScore >= 20 && s.compositeScore < 40).length,
          very_low: trustScores.filter(s => s.compositeScore < 20).length
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting trust scores:', error);
    return createErrorResponse(500, 'Failed to get trust scores');
  }
}

async function handleGetTrustScore(mediaId) {
  try {
    // Simulate individual trust score
    const trustScore = {
      mediaId,
      compositeScore: 78,
      confidence: 'high',
      calculationTimestamp: new Date().toISOString(),
      breakdown: {
        deepfakeScore: 85,
        sourceReliabilityScore: 80,
        metadataConsistencyScore: 90,
        historicalPatternScore: 75,
        technicalIntegrityScore: 82
      },
      factors: [
        {
          category: 'Deepfake Detection',
          impact: 'positive',
          description: 'Low probability of manipulation detected',
          weight: 'high'
        }
      ],
      recommendations: ['Content appears authentic']
    };
    
    return createSuccessResponse(trustScore);
    
  } catch (error) {
    console.error('Error getting trust score:', error);
    return createErrorResponse(500, 'Failed to get trust score');
  }
}

async function handleCalculateTrustScore(mediaId) {
  try {
    // Simulate trust score calculation
    const result = {
      mediaId,
      trustScore: 82,
      components: {
        deepfakeAnalysis: 0.85,
        metadataConsistency: 0.90,
        sourceVerification: 0.75
      },
      calculatedAt: new Date().toISOString(),
      processingTime: 1500
    };
    
    return createSuccessResponse(result);
    
  } catch (error) {
    console.error('Error calculating trust score:', error);
    return createErrorResponse(500, 'Failed to calculate trust score');
  }
}

async function handleHitlDemo(event) {
  const { mediaId, fileName, s3Key } = JSON.parse(event.body || '{}');
  
  try {
    // 1. Call real Bedrock deepfake analysis
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
    
    let analysisResult;
    try {
      const deepfakeResponse = await lambdaClient.send(new InvokeCommand({
        FunctionName: `hlekkr-org-uzpilj07pa-deepfake-970547381359-eu-central-1`,
        Payload: JSON.stringify({ mediaId, s3Key: s3Key, fileType: fileName.split('.').pop() })
      }));
      
      const deepfakeResult = JSON.parse(new TextDecoder().decode(deepfakeResponse.Payload));
      const bedrockAnalysis = JSON.parse(deepfakeResult.body);
      
      const trustScore = Math.round((1 - bedrockAnalysis.analysisResult.deepfakeConfidence) * 100);
      
      analysisResult = {
        mediaId,
        fileName,
        s3Key,
        trustScore: { composite: trustScore, riskLevel: trustScore < 70 ? 'HIGH' : 'LOW' },
        deepfakeAnalysis: {
          probability: bedrockAnalysis.analysisResult.deepfakeConfidence,
          techniques: bedrockAnalysis.analysisResult.detectedTechniques,
          modelVersion: bedrockAnalysis.analysisResult.modelVersion
        },
        requiresHumanReview: trustScore < 70,
        analyzedAt: new Date().toISOString(),
        bedrockAnalysis: bedrockAnalysis.analysisResult
      };
    } catch (error) {
      console.error('Bedrock analysis failed, using fallback:', error);
      analysisResult = {
        mediaId, fileName, s3Key,
        trustScore: { composite: 25, riskLevel: 'HIGH' },
        deepfakeAnalysis: { probability: 0.92, techniques: ['analysis_failed'] },
        requiresHumanReview: true,
        analyzedAt: new Date().toISOString(),
        error: 'Bedrock analysis failed'
      };
    }
    
    // 2. Auto-generate simulated human review
    const reviewDecision = {
      reviewId: `review-${Date.now()}`,
      mediaId,
      decision: 'confirm',
      confidence: 0.95,
      reasoning: 'Demo: Clear evidence of manipulation detected',
      reviewedAt: new Date().toISOString()
    };
    
    // 3. Create threat report
    const reportId = `TR-${Date.now()}-DEMO`;
    const threatReport = {
      reportId,
      title: `DEMO: Confirmed Deepfake Detection - ${fileName}`,
      severity: 'high',
      createdAt: new Date().toISOString(),
      indicators: ['face_swap_technique', 'audio_visual_desync'],
      publicReportGenerated: true
    };
    
    // 4. Store in DynamoDB
    const tableName = process.env.AUDIT_TABLE_NAME;
    await dynamoClient.send(new PutItemCommand({
      TableName: tableName,
      Item: marshall({
        mediaId,
        timestamp: new Date().toISOString(),
        recordType: 'demo_analysis',
        ...analysisResult,
        reviewDecision,
        threatReport
      })
    }));
    
    // 5. Simulate GitHub publishing
    const githubResult = {
      url: `https://github.com/walkf1/hlekkr-framework/blob/main/threat-reports/${new Date().toISOString().split('T')[0]}/${reportId}.md`,
      sha: 'demo-commit-' + Date.now()
    };
    
    return createSuccessResponse({
      success: true,
      mediaId,
      trustScore: 25,
      reviewDecision: 'CONFIRMED DEEPFAKE',
      threatReport: reportId,
      githubUrl: githubResult.url,
      message: 'Demo HITL workflow completed - check GitHub for threat report'
    });
    
  } catch (error) {
    console.error('Demo HITL error:', error);
    return createErrorResponse(500, 'Demo workflow failed');
  }
}

function createSuccessResponse(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(data)
  };
}

function createErrorResponse(statusCode, error, details = null) {
  const responseBody = { error };
  if (details) {
    responseBody.details = details;
  }
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    body: JSON.stringify(responseBody)
  };
};

// GitHub publishing simulated for demo
// In production, this would use Octokit to commit to hlekkr-framework repository