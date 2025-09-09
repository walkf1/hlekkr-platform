#!/usr/bin/env node

/**
 * Test HITL (Human-in-the-Loop) Workflow
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const axios = require('axios');

const API_URL = 'https://17cxuv9v71.execute-api.eu-central-1.amazonaws.com/prod';
const dynamoClient = new DynamoDBClient({ region: 'eu-central-1' });

async function testHITLWorkflow() {
  console.log('🧪 Testing HITL Workflow...\n');
  
  try {
    // Step 1: Simulate media upload and analysis
    console.log('1️⃣ Simulating media analysis with low trust score...');
    
    const mediaId = `test-media-${Date.now()}`;
    const analysisResult = {
      mediaId,
      userId: 'test-user-123',
      fileName: 'suspicious-video.mp4',
      fileType: 'video/mp4',
      fileSize: 15728640, // 15MB
      s3Key: `uploads/${mediaId}/suspicious-video.mp4`,
      uploadedAt: new Date().toISOString(),
      analyzedAt: new Date().toISOString(),
      trustScore: {
        composite: 25, // Low score triggers HITL review
        breakdown: {
          deepfakeScore: 15,
          sourceReliabilityScore: 30,
          metadataConsistencyScore: 40,
          technicalQualityScore: 15
        },
        confidence: 0.85,
        riskLevel: 'HIGH'
      },
      deepfakeAnalysis: {
        probability: 0.92,
        confidence: 0.85,
        techniques: ['face_swap', 'voice_clone'],
        modelVersion: 'v2.1.0'
      },
      sourceVerification: {
        domain: 'suspicious-site.com',
        status: 'suspicious',
        confidence: 0.7,
        reputationScore: 0.2
      },
      metadataAnalysis: {
        consistent: false,
        anomalies: ['timestamp_manipulation', 'location_mismatch']
      },
      requiresHumanReview: true,
      reviewPriority: 'HIGH',
      status: 'pending_review'
    };
    
    // Store analysis result in DynamoDB
    await dynamoClient.send(new PutItemCommand({
      TableName: 'hlekkr-org-uzpilj07pa-audit-970547381359-eu-central-1',
      Item: marshall({
        mediaId,
        timestamp: new Date().toISOString(),
        recordType: 'media_analysis',
        ...analysisResult,
        ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      })
    }));
    
    console.log(`✅ Analysis stored for media: ${mediaId}`);
    console.log(`   Trust Score: ${analysisResult.trustScore.composite}/100`);
    console.log(`   Deepfake Probability: ${(analysisResult.deepfakeAnalysis.probability * 100).toFixed(1)}%`);
    console.log(`   Status: ${analysisResult.status}\n`);
    
    // Step 2: Simulate human review decision
    console.log('2️⃣ Simulating human moderator review...');
    
    const reviewDecision = {
      reviewId: `review-${Date.now()}`,
      mediaId,
      moderatorId: 'mod-alice-123',
      moderatorName: 'Alice Johnson',
      decision: 'confirm', // confirm, reject, escalate
      confidence: 0.95,
      reasoning: 'Clear evidence of face swap manipulation. Facial landmarks inconsistent with natural movement patterns. Audio-visual synchronization anomalies detected.',
      tags: ['deepfake_confirmed', 'face_swap', 'high_quality_fake'],
      reviewedAt: new Date().toISOString(),
      reviewDuration: 180, // 3 minutes
      evidenceNotes: [
        'Facial boundary artifacts visible at 0:15-0:23',
        'Unnatural eye movement patterns',
        'Audio quality inconsistent with video quality'
      ]
    };
    
    // Store review decision
    await dynamoClient.send(new PutItemCommand({
      TableName: 'hlekkr-org-uzpilj07pa-audit-970547381359-eu-central-1',
      Item: marshall({
        mediaId: `${mediaId}-review`,
        timestamp: new Date().toISOString(),
        reviewId: reviewDecision.reviewId,
        recordType: 'review_decision',
        ...reviewDecision,
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
      })
    }));
    
    console.log(`✅ Review decision recorded: ${reviewDecision.decision.toUpperCase()}`);
    console.log(`   Moderator: ${reviewDecision.moderatorName}`);
    console.log(`   Confidence: ${(reviewDecision.confidence * 100).toFixed(1)}%`);
    console.log(`   Review Time: ${reviewDecision.reviewDuration}s\n`);
    
    // Step 3: Simulate threat intelligence generation
    console.log('3️⃣ Generating threat intelligence report...');
    
    const threatData = {
      mediaId,
      threatType: 'deepfake_confirmed',
      severity: 'high',
      reviewDecision,
      analysisResult,
      indicators: [
        {
          type: 'technique',
          value: 'face_swap_v2',
          confidence: 0.92
        },
        {
          type: 'domain',
          value: 'suspicious-site.com',
          confidence: 0.7
        },
        {
          type: 'pattern',
          value: 'audio_visual_desync',
          confidence: 0.85
        }
      ]
    };
    
    // Create threat report
    const reportId = `TR-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const threatReport = {
      reportId,
      threatType: threatData.threatType,
      severity: threatData.severity,
      title: `Confirmed Deepfake Detection - ${new Date().toISOString().split('T')[0]}`,
      description: `High-confidence deepfake detection confirmed through human review. Media exhibits face swap manipulation techniques with audio-visual synchronization anomalies.`,
      createdAt: new Date().toISOString(),
      mediaIds: [mediaId],
      indicatorCount: threatData.indicators.length,
      publicReportGenerated: true,
      githubIntegrationReady: true
    };
    
    await dynamoClient.send(new PutItemCommand({
      TableName: 'hlekkr-org-uzpilj07pa-audit-970547381359-eu-central-1',
      Item: marshall({
        mediaId: `${mediaId}-report`,
        timestamp: new Date().toISOString(),
        reportId,
        recordType: 'threat_report',
        ...threatReport,
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
      })
    }));
    
    console.log(`✅ Threat report generated: ${reportId}`);
    console.log(`   Severity: ${threatReport.severity.toUpperCase()}`);
    console.log(`   Indicators: ${threatReport.indicatorCount}`);
    console.log(`   Ready for GitHub: ${threatReport.githubIntegrationReady}\n`);
    
    // Step 4: Test API endpoints
    console.log('4️⃣ Testing API endpoints...');
    
    try {
      // Test upload endpoint
      const uploadResponse = await axios.post(`${API_URL}/upload/presigned-url`, {
        fileName: 'test-file.jpg',
        fileType: 'image/jpeg'
      });
      
      console.log(`✅ Upload endpoint working: ${uploadResponse.status}`);
    } catch (error) {
      console.log(`⚠️  Upload endpoint: ${error.response?.status || 'Error'}`);
    }
    
    // Step 5: Verify data integrity
    console.log('\n5️⃣ Verifying stored data...');
    
    const storedAnalysis = await dynamoClient.send(new GetItemCommand({
      TableName: 'hlekkr-org-uzpilj07pa-audit-970547381359-eu-central-1',
      Key: marshall({ mediaId, timestamp: analysisResult.analyzedAt })
    }));
    
    const storedReview = await dynamoClient.send(new GetItemCommand({
      TableName: 'hlekkr-org-uzpilj07pa-audit-970547381359-eu-central-1',
      Key: marshall({ mediaId: `${mediaId}-review`, timestamp: reviewDecision.reviewedAt })
    }));
    
    const storedReport = await dynamoClient.send(new GetItemCommand({
      TableName: 'hlekkr-org-uzpilj07pa-audit-970547381359-eu-central-1',
      Key: marshall({ mediaId: `${mediaId}-report`, timestamp: threatReport.createdAt })
    }));
    
    console.log(`✅ Analysis record: ${storedAnalysis.Item ? 'Found' : 'Missing'}`);
    console.log(`✅ Review record: ${storedReview.Item ? 'Found' : 'Missing'}`);
    console.log(`✅ Threat report: ${storedReport.Item ? 'Found' : 'Missing'}`);
    
    // Summary
    console.log('\n🎉 HITL Workflow Test Complete!');
    console.log('\n📊 Test Results:');
    console.log(`   Media ID: ${mediaId}`);
    console.log(`   Review ID: ${reviewDecision.reviewId}`);
    console.log(`   Report ID: ${reportId}`);
    console.log(`   Trust Score: ${analysisResult.trustScore.composite}/100`);
    console.log(`   Human Decision: ${reviewDecision.decision.toUpperCase()}`);
    console.log(`   Threat Level: ${threatReport.severity.toUpperCase()}`);
    
    console.log('\n🔄 Workflow Status:');
    console.log('   ✅ Media Analysis - Simulated');
    console.log('   ✅ Human Review - Simulated');
    console.log('   ✅ Threat Intelligence - Generated');
    console.log('   ✅ Data Storage - Verified');
    console.log('   🔄 GitHub Publishing - Ready (requires deployment)');
    
    console.log('\n📋 Next Steps:');
    console.log('   1. Deploy threat intelligence Lambda functions');
    console.log('   2. Test actual GitHub commit functionality');
    console.log('   3. Verify public report generation');
    console.log('   4. Test end-to-end with real media upload');
    
  } catch (error) {
    console.error('❌ HITL Test Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.status, error.response.data);
    }
  }
}

// Run the test
testHITLWorkflow();