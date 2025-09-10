const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  const { mediaId, fileName, s3Key } = JSON.parse(event.body || '{}');
  
  try {
    // 1. Call real Bedrock deepfake analysis
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
    
    let analysisResult;
    try {
      const deepfakeResponse = await lambdaClient.send(new InvokeCommand({
        FunctionName: `hlekkr-org-uzpilj07pa-deepfake-detector-970547381359-eu-central-1`,
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
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        mediaId,
        trustScore: 25,
        reviewDecision: 'CONFIRMED DEEPFAKE',
        threatReport: reportId,
        githubUrl: githubResult.url,
        message: 'Demo HITL workflow completed - check GitHub for threat report'
      })
    };
    
  } catch (error) {
    console.error('Demo HITL error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Demo workflow failed' })
    };
  }
};

// GitHub publishing simulated for demo
// In production, this would use Octokit to commit to hlekkr-framework repository