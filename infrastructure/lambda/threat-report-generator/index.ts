import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, SQSEvent } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, QueryCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Octokit } from '@octokit/rest';
import * as crypto from 'crypto';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

// Environment variables
const THREAT_INTELLIGENCE_TABLE = process.env.THREAT_INTELLIGENCE_TABLE!;
const MEDIA_ANALYSIS_TABLE = process.env.MEDIA_ANALYSIS_TABLE!;
const REVIEW_DECISIONS_TABLE = process.env.REVIEW_DECISIONS_TABLE!;
const THREAT_REPORTS_BUCKET = process.env.THREAT_REPORTS_BUCKET!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'hlekkr';
const GITHUB_REPO = process.env.GITHUB_REPO || 'hlekkr-framework';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

// GitHub client
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

export interface ThreatReport {
  reportId: string;
  threatType: 'deepfake_confirmed' | 'coordinated_campaign' | 'novel_technique' | 'mass_distribution';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  mediaIds: string[];
  indicators: ThreatIndicator[];
  mitigationRecommendations: string[];
  technicalDetails: TechnicalDetails;
  publicReport: PublicReport;
  metadata: Record<string, any>;
}

export interface ThreatIndicator {
  type: 'content_hash' | 'domain' | 'technique' | 'pattern' | 'signature';
  value: string;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  context: Record<string, any>;
}

export interface TechnicalDetails {
  manipulationTechniques: string[];
  detectionMethods: string[];
  evasionAttempts: string[];
  artifactAnalysis: Record<string, any>;
  modelVersions: string[];
  processingMetadata: Record<string, any>;
}

export interface PublicReport {
  sanitizedDescription: string;
  generalIndicators: string[];
  mitigationGuidance: string[];
  technicalSummary: string;
  impactAssessment: string;
  recommendedActions: string[];
}

export interface GitHubCommitData {
  reportId: string;
  fileName: string;
  content: string;
  commitMessage: string;
  branch: string;
  sha?: string;
}

/**
 * Lambda handler for threat report generation and GitHub publishing
 */
export const handler = async (event: APIGatewayProxyEvent | SQSEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('Threat report generator invoked:', JSON.stringify(event, null, 2));
  
  const correlationId = context.awsRequestId;
  
  try {
    // Handle different event types
    if ('Records' in event) {
      // SQS event from threat intelligence processor
      return await handleSQSEvent(event as SQSEvent, correlationId);
    } else {
      // API Gateway event for manual report generation
      return await handleAPIEvent(event as APIGatewayProxyEvent, correlationId);
    }
  } catch (error) {
    console.error('Error in threat report generator:', error);
    return createErrorResponse(500, 'Internal server error', correlationId);
  }
};

/**
 * Handle SQS event from threat intelligence processor
 */
async function handleSQSEvent(event: SQSEvent, correlationId: string): Promise<APIGatewayProxyResult> {
  const results = [];
  
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      const threatData = messageBody.threatData || messageBody;
      
      console.log('Processing threat data:', threatData);
      
      // Generate comprehensive threat report
      const threatReport = await generateThreatReport(threatData, correlationId);
      
      // Store the report
      await storeThreatReport(threatReport, correlationId);
      
      // Generate public report version
      const publicReport = await generatePublicReport(threatReport, correlationId);
      
      // Commit to GitHub
      const commitResult = await commitToGitHub(publicReport, threatReport, correlationId);
      
      // Send notifications
      await sendThreatNotification(threatReport, commitResult, correlationId);
      
      results.push({
        reportId: threatReport.reportId,
        status: 'success',
        githubCommit: commitResult.sha,
        publicReportUrl: commitResult.url,
      });
      
    } catch (error) {
      console.error('Error processing SQS record:', error);
      results.push({
        messageId: record.messageId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return createSuccessResponse({
    processed: results.length,
    results,
  }, correlationId);
}

/**
 * Handle API Gateway event for manual report generation
 */
async function handleAPIEvent(event: APIGatewayProxyEvent, correlationId: string): Promise<APIGatewayProxyResult> {
  const { httpMethod, pathParameters, body } = event;
  
  switch (httpMethod) {
    case 'POST':
      if (pathParameters?.action === 'generate') {
        return await handleGenerateReport(JSON.parse(body || '{}'), correlationId);
      }
      break;
    
    case 'GET':
      if (pathParameters?.reportId) {
        return await handleGetReport(pathParameters.reportId, correlationId);
      }
      break;
    
    case 'PUT':
      if (pathParameters?.reportId && pathParameters?.action === 'publish') {
        return await handlePublishReport(pathParameters.reportId, correlationId);
      }
      break;
  }
  
  return createErrorResponse(404, 'Endpoint not found', correlationId);
}

/**
 * Generate comprehensive threat report from threat intelligence data
 */
async function generateThreatReport(threatData: any, correlationId: string): Promise<ThreatReport> {
  try {
    const reportId = `TR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const currentTime = new Date().toISOString();
    
    // Extract media IDs from threat data
    const mediaIds = extractMediaIds(threatData);
    
    // Gather comprehensive analysis data
    const analysisData = await gatherAnalysisData(mediaIds, correlationId);
    
    // Extract threat indicators
    const indicators = await extractThreatIndicators(threatData, analysisData, correlationId);
    
    // Generate technical details
    const technicalDetails = await generateTechnicalDetails(analysisData, indicators, correlationId);
    
    // Classify threat
    const { threatType, severity } = classifyThreat(threatData, indicators, technicalDetails);
    
    // Generate report content
    const title = generateThreatTitle(threatType, severity, indicators.length);
    const description = generateThreatDescription(threatData, analysisData, indicators);
    const mitigationRecommendations = generateMitigationRecommendations(threatType, indicators, technicalDetails);
    
    // Create public report version
    const publicReport = await createPublicReportData(
      title, description, indicators, technicalDetails, mitigationRecommendations
    );
    
    const threatReport: ThreatReport = {
      reportId,
      threatType,
      severity,
      title,
      description,
      createdAt: currentTime,
      updatedAt: currentTime,
      mediaIds,
      indicators,
      mitigationRecommendations,
      technicalDetails,
      publicReport,
      metadata: {
        correlationId,
        sourceData: threatData,
        generationMethod: 'automated',
        analysisVersion: '2.1.0',
      },
    };
    
    console.log(`Generated threat report ${reportId} with ${indicators.length} indicators`);
    return threatReport;
    
  } catch (error) {
    console.error('Error generating threat report:', error);
    throw new Error(`Failed to generate threat report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract media IDs from threat data
 */
function extractMediaIds(threatData: any): string[] {
  const mediaIds = new Set<string>();
  
  // Extract from various possible locations in threat data
  if (threatData.mediaId) {
    mediaIds.add(threatData.mediaId);
  }
  
  if (threatData.mediaIds && Array.isArray(threatData.mediaIds)) {
    threatData.mediaIds.forEach((id: string) => mediaIds.add(id));
  }
  
  if (threatData.indicators && Array.isArray(threatData.indicators)) {
    threatData.indicators.forEach((indicator: any) => {
      if (indicator.associatedMediaIds && Array.isArray(indicator.associatedMediaIds)) {
        indicator.associatedMediaIds.forEach((id: string) => mediaIds.add(id));
      }
    });
  }
  
  return Array.from(mediaIds);
}

/**
 * Gather comprehensive analysis data for media items
 */
async function gatherAnalysisData(mediaIds: string[], correlationId: string): Promise<any[]> {
  const analysisData = [];
  
  for (const mediaId of mediaIds) {
    try {
      // Get media analysis results
      const analysisResult = await dynamoClient.send(new GetItemCommand({
        TableName: MEDIA_ANALYSIS_TABLE,
        Key: marshall({ mediaId }),
      }));
      
      if (analysisResult.Item) {
        const analysis = unmarshall(analysisResult.Item);
        
        // Get review decisions
        const reviewResult = await dynamoClient.send(new QueryCommand({
          TableName: REVIEW_DECISIONS_TABLE,
          IndexName: 'MediaIdIndex',
          KeyConditionExpression: 'mediaId = :mediaId',
          ExpressionAttributeValues: marshall({
            ':mediaId': mediaId,
          }),
        }));
        
        const reviews = reviewResult.Items?.map(item => unmarshall(item)) || [];
        
        analysisData.push({
          mediaId,
          analysis,
          reviews,
        });
      }
    } catch (error) {
      console.error(`Error gathering analysis data for ${mediaId}:`, error);
    }
  }
  
  return analysisData;
}

/**
 * Extract and enrich threat indicators
 */
async function extractThreatIndicators(threatData: any, analysisData: any[], correlationId: string): Promise<ThreatIndicator[]> {
  const indicators: ThreatIndicator[] = [];
  const currentTime = new Date().toISOString();
  
  // Process existing indicators from threat data
  if (threatData.indicators && Array.isArray(threatData.indicators)) {
    for (const rawIndicator of threatData.indicators) {
      indicators.push({
        type: rawIndicator.indicator_type || rawIndicator.type,
        value: rawIndicator.indicator_value || rawIndicator.value,
        confidence: rawIndicator.confidence || 0.8,
        firstSeen: rawIndicator.first_seen || rawIndicator.firstSeen || currentTime,
        lastSeen: rawIndicator.last_seen || rawIndicator.lastSeen || currentTime,
        occurrences: rawIndicator.occurrence_count || rawIndicator.occurrences || 1,
        context: rawIndicator.metadata || rawIndicator.context || {},
      });
    }
  }
  
  // Extract additional indicators from analysis data
  for (const data of analysisData) {
    const { analysis, reviews } = data;
    
    // Content hash indicators
    if (analysis.contentHash) {
      indicators.push({
        type: 'content_hash',
        value: analysis.contentHash,
        confidence: 0.9,
        firstSeen: currentTime,
        lastSeen: currentTime,
        occurrences: 1,
        context: {
          mediaId: data.mediaId,
          fileType: analysis.fileType,
          fileSize: analysis.fileSize,
        },
      });
    }
    
    // Domain indicators from source verification
    if (analysis.sourceVerification?.domain && analysis.sourceVerification.status === 'suspicious') {
      indicators.push({
        type: 'domain',
        value: analysis.sourceVerification.domain,
        confidence: analysis.sourceVerification.confidence || 0.7,
        firstSeen: currentTime,
        lastSeen: currentTime,
        occurrences: 1,
        context: {
          mediaId: data.mediaId,
          reputationScore: analysis.sourceVerification.reputationScore,
          verificationMethod: analysis.sourceVerification.verificationMethod,
        },
      });
    }
    
    // Technique indicators from deepfake analysis
    if (analysis.deepfakeAnalysis?.techniques) {
      for (const technique of analysis.deepfakeAnalysis.techniques) {
        indicators.push({
          type: 'technique',
          value: technique,
          confidence: analysis.deepfakeAnalysis.confidence || 0.8,
          firstSeen: currentTime,
          lastSeen: currentTime,
          occurrences: 1,
          context: {
            mediaId: data.mediaId,
            probability: analysis.deepfakeAnalysis.probability,
            modelVersion: analysis.deepfakeAnalysis.modelVersion,
          },
        });
      }
    }
    
    // Pattern indicators from metadata analysis
    if (analysis.metadataAnalysis?.anomalies) {
      for (const anomaly of analysis.metadataAnalysis.anomalies) {
        const patternHash = crypto.createHash('sha256').update(JSON.stringify(anomaly)).digest('hex').substring(0, 16);
        indicators.push({
          type: 'pattern',
          value: patternHash,
          confidence: 0.6,
          firstSeen: currentTime,
          lastSeen: currentTime,
          occurrences: 1,
          context: {
            mediaId: data.mediaId,
            anomalyType: anomaly,
            metadataConsistency: analysis.metadataAnalysis.consistent,
          },
        });
      }
    }
  }
  
  // Deduplicate indicators by type and value
  const uniqueIndicators = new Map<string, ThreatIndicator>();
  for (const indicator of indicators) {
    const key = `${indicator.type}:${indicator.value}`;
    if (uniqueIndicators.has(key)) {
      const existing = uniqueIndicators.get(key)!;
      existing.occurrences += indicator.occurrences;
      existing.confidence = Math.max(existing.confidence, indicator.confidence);
    } else {
      uniqueIndicators.set(key, indicator);
    }
  }
  
  return Array.from(uniqueIndicators.values());
}

/**
 * Generate technical details section
 */
async function generateTechnicalDetails(analysisData: any[], indicators: ThreatIndicator[], correlationId: string): Promise<TechnicalDetails> {
  const manipulationTechniques = new Set<string>();
  const detectionMethods = new Set<string>();
  const evasionAttempts = new Set<string>();
  const modelVersions = new Set<string>();
  const artifactAnalysis: Record<string, any> = {};
  const processingMetadata: Record<string, any> = {};
  
  // Aggregate technical data from analysis results
  for (const data of analysisData) {
    const { analysis } = data;
    
    // Manipulation techniques
    if (analysis.deepfakeAnalysis?.techniques) {
      analysis.deepfakeAnalysis.techniques.forEach((tech: string) => manipulationTechniques.add(tech));
    }
    
    // Detection methods
    if (analysis.deepfakeAnalysis?.modelVersion) {
      detectionMethods.add(`deepfake-detector-${analysis.deepfakeAnalysis.modelVersion}`);
      modelVersions.add(analysis.deepfakeAnalysis.modelVersion);
    }
    
    if (analysis.sourceVerification?.verificationMethod) {
      detectionMethods.add(`source-verification-${analysis.sourceVerification.verificationMethod}`);
    }
    
    // Evasion attempts
    if (analysis.metadataAnalysis?.anomalies) {
      analysis.metadataAnalysis.anomalies.forEach((anomaly: string) => {
        if (anomaly.includes('timestamp') || anomaly.includes('location') || anomaly.includes('device')) {
          evasionAttempts.add(`metadata-manipulation-${anomaly}`);
        }
      });
    }
    
    // Artifact analysis
    artifactAnalysis[data.mediaId] = {
      trustScore: analysis.trustScore,
      deepfakeScore: analysis.deepfakeAnalysis?.probability,
      sourceScore: analysis.sourceVerification?.reputationScore,
      metadataScore: analysis.metadataAnalysis?.consistent ? 1.0 : 0.0,
    };
  }
  
  // Processing metadata
  processingMetadata.totalMediaAnalyzed = analysisData.length;
  processingMetadata.indicatorsExtracted = indicators.length;
  processingMetadata.averageConfidence = indicators.length > 0 
    ? indicators.reduce((sum, ind) => sum + ind.confidence, 0) / indicators.length 
    : 0;
  processingMetadata.generatedAt = new Date().toISOString();
  processingMetadata.correlationId = correlationId;
  
  return {
    manipulationTechniques: Array.from(manipulationTechniques),
    detectionMethods: Array.from(detectionMethods),
    evasionAttempts: Array.from(evasionAttempts),
    artifactAnalysis,
    modelVersions: Array.from(modelVersions),
    processingMetadata,
  };
}

/**
 * Classify threat type and severity
 */
function classifyThreat(threatData: any, indicators: ThreatIndicator[], technicalDetails: TechnicalDetails): { threatType: ThreatReport['threatType']; severity: ThreatReport['severity'] } {
  let threatType: ThreatReport['threatType'] = 'deepfake_confirmed';
  let severity: ThreatReport['severity'] = 'medium';
  
  // Determine threat type
  const techniqueCount = technicalDetails.manipulationTechniques.length;
  const indicatorCount = indicators.length;
  const avgConfidence = indicators.length > 0 
    ? indicators.reduce((sum, ind) => sum + ind.confidence, 0) / indicators.length 
    : 0;
  
  if (indicatorCount >= 10 || techniqueCount >= 3) {
    threatType = 'coordinated_campaign';
  } else if (technicalDetails.manipulationTechniques.some(tech => tech.includes('novel') || tech.includes('unknown'))) {
    threatType = 'novel_technique';
  } else if (indicators.some(ind => ind.occurrences > 5)) {
    threatType = 'mass_distribution';
  }
  
  // Determine severity
  if (avgConfidence >= 0.9 && (threatType === 'coordinated_campaign' || threatType === 'novel_technique')) {
    severity = 'critical';
  } else if (avgConfidence >= 0.8 || indicatorCount >= 5) {
    severity = 'high';
  } else if (avgConfidence >= 0.6 || indicatorCount >= 2) {
    severity = 'medium';
  } else {
    severity = 'low';
  }
  
  return { threatType, severity };
}

/**
 * Generate threat report title
 */
function generateThreatTitle(threatType: ThreatReport['threatType'], severity: ThreatReport['severity'], indicatorCount: number): string {
  const severityLabel = severity.toUpperCase();
  const date = new Date().toISOString().split('T')[0];
  
  const titles = {
    deepfake_confirmed: `${severityLabel}: Confirmed Deepfake Content Detection`,
    coordinated_campaign: `${severityLabel}: Coordinated Deepfake Campaign Identified`,
    novel_technique: `${severityLabel}: Novel Manipulation Technique Discovered`,
    mass_distribution: `${severityLabel}: Mass Distribution of Manipulated Content`,
  };
  
  return `${titles[threatType]} - ${date} (${indicatorCount} indicators)`;
}

/**
 * Generate threat description
 */
function generateThreatDescription(threatData: any, analysisData: any[], indicators: ThreatIndicator[]): string {
  const mediaCount = analysisData.length;
  const indicatorCount = indicators.length;
  const avgConfidence = indicators.length > 0 
    ? indicators.reduce((sum, ind) => sum + ind.confidence, 0) / indicators.length 
    : 0;
  
  let description = `This threat report documents the analysis of ${mediaCount} media item(s) that have been identified as containing manipulated content through human review and automated analysis. `;
  
  description += `The analysis extracted ${indicatorCount} threat indicators with an average confidence of ${(avgConfidence * 100).toFixed(1)}%. `;
  
  // Add technique-specific details
  const techniques = indicators.filter(ind => ind.type === 'technique').map(ind => ind.value);
  if (techniques.length > 0) {
    description += `Manipulation techniques identified include: ${techniques.join(', ')}. `;
  }
  
  // Add domain information
  const domains = indicators.filter(ind => ind.type === 'domain').map(ind => ind.value);
  if (domains.length > 0) {
    description += `Suspicious domains associated with distribution: ${domains.join(', ')}. `;
  }
  
  description += `This report provides technical details, indicators of compromise, and recommended mitigation strategies for detection and prevention of similar threats.`;
  
  return description;
}

/**
 * Generate mitigation recommendations
 */
function generateMitigationRecommendations(threatType: ThreatReport['threatType'], indicators: ThreatIndicator[], technicalDetails: TechnicalDetails): string[] {
  const recommendations = [
    'Update detection algorithms with identified indicators',
    'Monitor for similar content patterns and signatures',
    'Enhance source verification for suspicious domains',
    'Implement additional metadata validation checks',
  ];
  
  // Type-specific recommendations
  switch (threatType) {
    case 'coordinated_campaign':
      recommendations.push(
        'Investigate coordinated distribution networks',
        'Share intelligence with partner organizations',
        'Implement network-level blocking for identified domains',
        'Monitor for temporal clustering of similar content'
      );
      break;
    
    case 'novel_technique':
      recommendations.push(
        'Update AI models with new technique signatures',
        'Conduct detailed technical analysis of manipulation methods',
        'Share findings with research community',
        'Develop specific detection rules for novel techniques'
      );
      break;
    
    case 'mass_distribution':
      recommendations.push(
        'Implement rate limiting for content uploads',
        'Monitor for bulk distribution patterns',
        'Enhance automated flagging for similar content',
        'Coordinate with platform partners for takedown'
      );
      break;
  }
  
  // Technique-specific recommendations
  if (technicalDetails.manipulationTechniques.includes('face_swap')) {
    recommendations.push('Enhance facial landmark detection algorithms');
  }
  
  if (technicalDetails.manipulationTechniques.includes('voice_clone')) {
    recommendations.push('Implement advanced audio artifact detection');
  }
  
  if (technicalDetails.evasionAttempts.length > 0) {
    recommendations.push('Strengthen metadata integrity validation');
  }
  
  return recommendations;
}

/**
 * Create public report data (sanitized for public consumption)
 */
async function createPublicReportData(
  title: string, 
  description: string, 
  indicators: ThreatIndicator[], 
  technicalDetails: TechnicalDetails, 
  mitigationRecommendations: string[]
): Promise<PublicReport> {
  
  // Sanitize description (remove specific media IDs, domains, etc.)
  const sanitizedDescription = description
    .replace(/media item\(s\) [a-zA-Z0-9-]+/g, 'media items')
    .replace(/[a-zA-Z0-9-]+\.com/g, '[REDACTED_DOMAIN]')
    .replace(/[a-fA-F0-9]{32,}/g, '[REDACTED_HASH]');
  
  // Create general indicators (without specific values)
  const generalIndicators = [
    `${indicators.filter(ind => ind.type === 'technique').length} manipulation techniques identified`,
    `${indicators.filter(ind => ind.type === 'domain').length} suspicious domains detected`,
    `${indicators.filter(ind => ind.type === 'content_hash').length} content signatures extracted`,
    `${indicators.filter(ind => ind.type === 'pattern').length} metadata anomaly patterns found`,
  ].filter(indicator => !indicator.startsWith('0'));
  
  // Create mitigation guidance (general best practices)
  const mitigationGuidance = [
    'Implement multi-layered content verification systems',
    'Enhance source authentication and provenance tracking',
    'Deploy advanced AI-based detection algorithms',
    'Establish human review workflows for suspicious content',
    'Maintain updated threat intelligence databases',
    'Coordinate with industry partners for threat sharing',
  ];
  
  // Technical summary (high-level, no specific details)
  const technicalSummary = `Analysis identified ${technicalDetails.manipulationTechniques.length} distinct manipulation techniques using ${technicalDetails.detectionMethods.length} detection methods. The content showed evidence of ${technicalDetails.evasionAttempts.length} evasion attempts, indicating sophisticated threat actors.`;
  
  // Impact assessment
  const impactAssessment = `This threat represents a ${indicators.length >= 5 ? 'significant' : 'moderate'} risk to content authenticity verification systems. The identified techniques and patterns suggest ${technicalDetails.manipulationTechniques.length >= 3 ? 'advanced' : 'standard'} threat actor capabilities with potential for widespread distribution.`;
  
  // Recommended actions for the community
  const recommendedActions = [
    'Update detection systems with provided indicators',
    'Implement enhanced monitoring for similar patterns',
    'Share relevant findings with trusted partners',
    'Review and strengthen content verification processes',
    'Consider additional human review for high-risk content',
  ];
  
  return {
    sanitizedDescription,
    generalIndicators,
    mitigationGuidance,
    technicalSummary,
    impactAssessment,
    recommendedActions,
  };
}

/**
 * Store threat report in DynamoDB and S3
 */
async function storeThreatReport(threatReport: ThreatReport, correlationId: string): Promise<void> {
  try {
    // Store in DynamoDB
    await dynamoClient.send(new PutItemCommand({
      TableName: THREAT_INTELLIGENCE_TABLE,
      Item: marshall({
        reportId: threatReport.reportId,
        recordType: 'threat_report',
        threatType: threatReport.threatType,
        severity: threatReport.severity,
        title: threatReport.title,
        createdAt: threatReport.createdAt,
        updatedAt: threatReport.updatedAt,
        mediaCount: threatReport.mediaIds.length,
        indicatorCount: threatReport.indicators.length,
        publicReportGenerated: true,
        metadata: threatReport.metadata,
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year TTL
      }),
    }));
    
    // Store detailed report in S3
    const reportKey = `threat-reports/${threatReport.createdAt.split('T')[0]}/${threatReport.reportId}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: THREAT_REPORTS_BUCKET,
      Key: reportKey,
      Body: JSON.stringify(threatReport, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: {
        reportId: threatReport.reportId,
        threatType: threatReport.threatType,
        severity: threatReport.severity,
        correlationId,
      },
    }));
    
    console.log(`Stored threat report ${threatReport.reportId} in DynamoDB and S3`);
    
  } catch (error) {
    console.error('Error storing threat report:', error);
    throw error;
  }
}

/**
 * Generate public report for GitHub
 */
async function generatePublicReport(threatReport: ThreatReport, correlationId: string): Promise<GitHubCommitData> {
  const { reportId, createdAt, severity, threatType, publicReport } = threatReport;
  const date = createdAt.split('T')[0];
  
  // Generate markdown content for public report
  const markdownContent = `# Threat Report: ${threatReport.title}

**Report ID:** ${reportId}  
**Date:** ${date}  
**Severity:** ${severity.toUpperCase()}  
**Threat Type:** ${threatType.replace('_', ' ').toUpperCase()}  

## Executive Summary

${publicReport.sanitizedDescription}

## Technical Summary

${publicReport.technicalSummary}

## Impact Assessment

${publicReport.impactAssessment}

## Indicators

${publicReport.generalIndicators.map(indicator => `- ${indicator}`).join('\n')}

## Mitigation Guidance

${publicReport.mitigationGuidance.map(guidance => `- ${guidance}`).join('\n')}

## Recommended Actions

${publicReport.recommendedActions.map(action => `- ${action}`).join('\n')}

---

*This report is generated by the Hlekkr Media Verification System. For technical details or to report similar threats, please contact the Hlekkr team.*

*Report generated on: ${new Date().toISOString()}*
`;

  const fileName = `threat-reports/${date}/${reportId}.md`;
  const commitMessage = `Add threat report: ${threatReport.title}`;
  const branch = 'main';
  
  return {
    reportId,
    fileName,
    content: markdownContent,
    commitMessage,
    branch,
  };
}

/**
 * Commit public report to GitHub
 */
async function commitToGitHub(publicReportData: GitHubCommitData, threatReport: ThreatReport, correlationId: string): Promise<{ sha: string; url: string }> {
  try {
    const { fileName, content, commitMessage, branch } = publicReportData;
    
    // Check if file already exists
    let existingSha: string | undefined;
    try {
      const existingFile = await octokit.rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: fileName,
        ref: branch,
      });
      
      if ('sha' in existingFile.data) {
        existingSha = existingFile.data.sha;
      }
    } catch (error) {
      // File doesn't exist, which is fine for new reports
      console.log(`File ${fileName} doesn't exist, creating new file`);
    }
    
    // Create or update file
    const result = await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: fileName,
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch,
      ...(existingSha && { sha: existingSha }),
    });
    
    const commitSha = result.data.commit.sha;
    const fileUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${branch}/${fileName}`;
    
    console.log(`Committed threat report to GitHub: ${fileUrl}`);
    
    // Update threat report with GitHub information
    await dynamoClient.send(new UpdateItemCommand({
      TableName: THREAT_INTELLIGENCE_TABLE,
      Key: marshall({ reportId: threatReport.reportId }),
      UpdateExpression: 'SET githubCommitSha = :sha, githubUrl = :url, publishedAt = :publishedAt',
      ExpressionAttributeValues: marshall({
        ':sha': commitSha,
        ':url': fileUrl,
        ':publishedAt': new Date().toISOString(),
      }),
    }));
    
    return {
      sha: commitSha,
      url: fileUrl,
    };
    
  } catch (error) {
    console.error('Error committing to GitHub:', error);
    throw new Error(`Failed to commit to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Send threat notification
 */
async function sendThreatNotification(threatReport: ThreatReport, commitResult: { sha: string; url: string }, correlationId: string): Promise<void> {
  try {
    const notification = {
      type: 'threat_report_published',
      reportId: threatReport.reportId,
      title: threatReport.title,
      severity: threatReport.severity,
      threatType: threatReport.threatType,
      mediaCount: threatReport.mediaIds.length,
      indicatorCount: threatReport.indicators.length,
      githubUrl: commitResult.url,
      createdAt: threatReport.createdAt,
      correlationId,
    };
    
    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `Threat Report Published: ${threatReport.title}`,
      Message: JSON.stringify(notification, null, 2),
    }));
    
    console.log(`Sent threat notification for report ${threatReport.reportId}`);
    
  } catch (error) {
    console.error('Error sending threat notification:', error);
    // Don't throw error as this is not critical
  }
}

/**
 * Handle manual report generation
 */
async function handleGenerateReport(requestData: any, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { mediaIds, threatType, severity, title, description } = requestData;
    
    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return createErrorResponse(400, 'mediaIds array is required', correlationId);
    }
    
    // Create threat data structure
    const threatData = {
      mediaIds,
      threatType: threatType || 'deepfake_confirmed',
      severity: severity || 'medium',
      title,
      description,
      manualGeneration: true,
    };
    
    // Generate report
    const threatReport = await generateThreatReport(threatData, correlationId);
    
    // Store report
    await storeThreatReport(threatReport, correlationId);
    
    // Generate and commit public report
    const publicReport = await generatePublicReport(threatReport, correlationId);
    const commitResult = await commitToGitHub(publicReport, threatReport, correlationId);
    
    // Send notification
    await sendThreatNotification(threatReport, commitResult, correlationId);
    
    return createSuccessResponse({
      reportId: threatReport.reportId,
      githubUrl: commitResult.url,
      commitSha: commitResult.sha,
    }, correlationId);
    
  } catch (error) {
    console.error('Error generating manual report:', error);
    return createErrorResponse(500, 'Failed to generate report', correlationId);
  }
}

/**
 * Handle get report request
 */
async function handleGetReport(reportId: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: THREAT_INTELLIGENCE_TABLE,
      Key: marshall({ reportId }),
    }));
    
    if (!result.Item) {
      return createErrorResponse(404, 'Report not found', correlationId);
    }
    
    const report = unmarshall(result.Item);
    
    // Get detailed report from S3 if needed
    if (report.recordType === 'threat_report') {
      try {
        const reportKey = `threat-reports/${report.createdAt.split('T')[0]}/${reportId}.json`;
        const s3Result = await s3Client.send(new GetObjectCommand({
          Bucket: THREAT_REPORTS_BUCKET,
          Key: reportKey,
        }));
        
        if (s3Result.Body) {
          const detailedReport = JSON.parse(await s3Result.Body.transformToString());
          return createSuccessResponse(detailedReport, correlationId);
        }
      } catch (s3Error) {
        console.error('Error fetching detailed report from S3:', s3Error);
      }
    }
    
    return createSuccessResponse(report, correlationId);
    
  } catch (error) {
    console.error('Error getting report:', error);
    return createErrorResponse(500, 'Failed to get report', correlationId);
  }
}

/**
 * Handle publish report request
 */
async function handlePublishReport(reportId: string, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    // Get existing report
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: THREAT_INTELLIGENCE_TABLE,
      Key: marshall({ reportId }),
    }));
    
    if (!result.Item) {
      return createErrorResponse(404, 'Report not found', correlationId);
    }
    
    // Get detailed report from S3
    const reportData = unmarshall(result.Item);
    const reportKey = `threat-reports/${reportData.createdAt.split('T')[0]}/${reportId}.json`;
    
    const s3Result = await s3Client.send(new GetObjectCommand({
      Bucket: THREAT_REPORTS_BUCKET,
      Key: reportKey,
    }));
    
    if (!s3Result.Body) {
      return createErrorResponse(404, 'Detailed report not found', correlationId);
    }
    
    const threatReport: ThreatReport = JSON.parse(await s3Result.Body.transformToString());
    
    // Generate and commit public report
    const publicReport = await generatePublicReport(threatReport, correlationId);
    const commitResult = await commitToGitHub(publicReport, threatReport, correlationId);
    
    // Send notification
    await sendThreatNotification(threatReport, commitResult, correlationId);
    
    return createSuccessResponse({
      reportId,
      githubUrl: commitResult.url,
      commitSha: commitResult.sha,
      publishedAt: new Date().toISOString(),
    }, correlationId);
    
  } catch (error) {
    console.error('Error publishing report:', error);
    return createErrorResponse(500, 'Failed to publish report', correlationId);
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