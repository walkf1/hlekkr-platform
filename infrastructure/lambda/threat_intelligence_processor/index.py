#!/usr/bin/env python3
"""
Hlekkr Threat Intelligence Processor Lambda Function

This function processes human review decisions to generate threat intelligence reports,
identify patterns, and create actionable threat intelligence for the media verification system.
"""

import json
import boto3
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import logging
from decimal import Decimal
from enum import Enum
from dataclasses import dataclass, asdict
import statistics
import hashlib
import re

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
sns_client = boto3.client('sns')
cloudwatch = boto3.client('cloudwatch')
lambda_client = boto3.client('lambda')

# Environment variables
REVIEW_DECISION_TABLE_NAME = os.environ['REVIEW_DECISION_TABLE_NAME']
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
THREAT_INTELLIGENCE_TABLE_NAME = os.environ['THREAT_INTELLIGENCE_TABLE_NAME']
THREAT_REPORTS_BUCKET_NAME = os.environ['THREAT_REPORTS_BUCKET_NAME']
THREAT_ALERTS_TOPIC_ARN = os.environ['THREAT_ALERTS_TOPIC_ARN']
EXTERNAL_SHARING_TOPIC_ARN = os.environ.get('EXTERNAL_SHARING_TOPIC_ARN', '')

# DynamoDB tables
review_decision_table = dynamodb.Table(REVIEW_DECISION_TABLE_NAME)
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)
threat_intelligence_table = dynamodb.Table(THREAT_INTELLIGENCE_TABLE_NAME)

class ThreatSeverity(Enum):
    """Threat severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ThreatType(Enum):
    """Types of threats identified."""
    DEEPFAKE_CONFIRMED = "deepfake_confirmed"
    COORDINATED_CAMPAIGN = "coordinated_campaign"
    SOURCE_MANIPULATION = "source_manipulation"
    METADATA_SPOOFING = "metadata_spoofing"
    EVASION_TECHNIQUE = "evasion_technique"
    NOVEL_MANIPULATION = "novel_manipulation"
    MASS_DISTRIBUTION = "mass_distribution"
    TARGETED_ATTACK = "targeted_attack"

class ThreatStatus(Enum):
    """Status of threat intelligence."""
    ACTIVE = "active"
    MONITORING = "monitoring"
    RESOLVED = "resolved"
    ARCHIVED = "archived"

@dataclass
class ThreatIndicator:
    """Data class for threat indicators."""
    indicator_id: str
    indicator_type: str  # hash, domain, pattern, technique
    indicator_value: str
    confidence: float
    first_seen: str
    last_seen: str
    occurrence_count: int
    associated_media_ids: List[str]
    metadata: Dict[str, Any]

@dataclass
class ThreatReport:
    """Data class for threat intelligence reports."""
    report_id: str
    threat_type: ThreatType
    severity: ThreatSeverity
    status: ThreatStatus
    title: str
    description: str
    created_at: str
    updated_at: str
    indicators: List[ThreatIndicator]
    affected_media_count: int
    confirmed_by_humans: int
    ai_confidence: float
    mitigation_recommendations: List[str]
    external_references: List[str]
    tags: List[str]
    metadata: Dict[str, Any]

def handler(event, context):
    """
    Lambda function to process human review decisions and generate threat intelligence.
    """
    try:
        logger.info(f"Processing threat intelligence: {json.dumps(event)}")
        
        # Determine operation type
        operation = event.get('operation', 'process_review_decision')
        
        if operation == 'process_review_decision':
            return process_review_decision(event)
        elif operation == 'generate_threat_report':
            return generate_threat_report(event)
        elif operation == 'analyze_threat_patterns':
            return analyze_threat_patterns(event)
        elif operation == 'update_threat_intelligence':
            return update_threat_intelligence(event)
        elif operation == 'get_threat_reports':
            return get_threat_reports(event)
        elif operation == 'share_threat_intelligence':
            return share_threat_intelligence(event)
        elif operation == 'cleanup_old_threats':
            return cleanup_old_threats(event)
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Invalid operation',
                    'supported_operations': [
                        'process_review_decision', 'generate_threat_report',
                        'analyze_threat_patterns', 'update_threat_intelligence',
                        'get_threat_reports', 'share_threat_intelligence',
                        'cleanup_old_threats'
                    ]
                })
            }
        
    except Exception as e:
        logger.error(f"Error in threat intelligence processing: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Threat intelligence processing failed',
                'message': str(e)
            })
        }

def process_review_decision(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process a human review decision and extract threat intelligence."""
    try:
        decision_data = event.get('decisionData', {})
        media_id = event.get('mediaId')
        review_id = event.get('reviewId')
        moderator_id = event.get('moderatorId')
        
        if not all([decision_data, media_id, review_id]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'decisionData, mediaId, and reviewId are required'})
            }
        
        # Extract threat intelligence from the decision
        threat_indicators = extract_threat_indicators(decision_data, media_id)
        
        # Store threat indicators
        stored_indicators = []
        for indicator in threat_indicators:
            stored_indicator = store_threat_indicator(indicator)
            stored_indicators.append(stored_indicator)
        
        # Check for pattern matches and potential campaigns
        pattern_analysis = analyze_decision_patterns(decision_data, media_id)
        
        # Generate threat report if significant threat detected
        threat_report = None
        if should_generate_threat_report(decision_data, pattern_analysis):
            threat_report = create_threat_report(decision_data, media_id, stored_indicators, pattern_analysis)
            
            # Store the threat report
            store_threat_report(threat_report)
            
            # Send alerts for high/critical threats
            if threat_report.severity in [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL]:
                send_threat_alert(threat_report)
        
        # Update CloudWatch metrics
        update_threat_metrics(decision_data, threat_indicators, threat_report)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'processed': True,
                'mediaId': media_id,
                'reviewId': review_id,
                'indicatorsExtracted': len(stored_indicators),
                'threatReportGenerated': threat_report is not None,
                'threatReportId': threat_report.report_id if threat_report else None,
                'patternAnalysis': pattern_analysis,
                'processedAt': datetime.utcnow().isoformat()
            }, default=str)
        }
        
    except Exception as e:
        logger.error(f"Error processing review decision: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process review decision',
                'message': str(e)
            })
        }

def extract_threat_indicators(decision_data: Dict[str, Any], media_id: str) -> List[ThreatIndicator]:
    """Extract threat indicators from human review decision."""
    indicators = []
    
    try:
        decision_type = decision_data.get('decision', '')
        confidence = decision_data.get('confidence', 0.5)
        findings = decision_data.get('findings', {})
        metadata = decision_data.get('metadata', {})
        
        # Only process confirmed deepfakes or suspicious content
        if decision_type not in ['confirm', 'suspicious']:
            return indicators
        
        current_time = datetime.utcnow().isoformat()
        
        # Extract content hash indicators
        content_hash = metadata.get('contentHash')
        if content_hash:
            indicators.append(ThreatIndicator(
                indicator_id=str(uuid.uuid4()),
                indicator_type='content_hash',
                indicator_value=content_hash,
                confidence=confidence,
                first_seen=current_time,
                last_seen=current_time,
                occurrence_count=1,
                associated_media_ids=[media_id],
                metadata={
                    'decision_type': decision_type,
                    'human_confirmed': True,
                    'extraction_method': 'human_review'
                }
            ))
        
        # Extract source domain indicators
        source_domain = metadata.get('sourceDomain')
        if source_domain and decision_type == 'confirm':
            indicators.append(ThreatIndicator(
                indicator_id=str(uuid.uuid4()),
                indicator_type='malicious_domain',
                indicator_value=source_domain,
                confidence=confidence,
                first_seen=current_time,
                last_seen=current_time,
                occurrence_count=1,
                associated_media_ids=[media_id],
                metadata={
                    'decision_type': decision_type,
                    'threat_type': 'deepfake_distribution',
                    'human_confirmed': True
                }
            ))
        
        # Extract manipulation technique indicators
        manipulation_techniques = findings.get('manipulationTechniques', [])
        for technique in manipulation_techniques:
            indicators.append(ThreatIndicator(
                indicator_id=str(uuid.uuid4()),
                indicator_type='manipulation_technique',
                indicator_value=technique,
                confidence=confidence,
                first_seen=current_time,
                last_seen=current_time,
                occurrence_count=1,
                associated_media_ids=[media_id],
                metadata={
                    'decision_type': decision_type,
                    'technique_details': findings.get('techniqueDetails', {}),
                    'human_confirmed': True
                }
            ))
        
        # Extract metadata patterns
        suspicious_patterns = findings.get('suspiciousPatterns', [])
        for pattern in suspicious_patterns:
            pattern_hash = hashlib.sha256(json.dumps(pattern, sort_keys=True).encode()).hexdigest()[:16]
            indicators.append(ThreatIndicator(
                indicator_id=str(uuid.uuid4()),
                indicator_type='metadata_pattern',
                indicator_value=pattern_hash,
                confidence=confidence * 0.8,  # Slightly lower confidence for patterns
                first_seen=current_time,
                last_seen=current_time,
                occurrence_count=1,
                associated_media_ids=[media_id],
                metadata={
                    'pattern_details': pattern,
                    'decision_type': decision_type,
                    'human_confirmed': True
                }
            ))
        
        # Extract file signature indicators for novel techniques
        file_signature = metadata.get('fileSignature')
        if file_signature and decision_type == 'confirm':
            indicators.append(ThreatIndicator(
                indicator_id=str(uuid.uuid4()),
                indicator_type='file_signature',
                indicator_value=file_signature,
                confidence=confidence,
                first_seen=current_time,
                last_seen=current_time,
                occurrence_count=1,
                associated_media_ids=[media_id],
                metadata={
                    'decision_type': decision_type,
                    'file_type': metadata.get('fileType'),
                    'human_confirmed': True
                }
            ))
        
        logger.info(f"Extracted {len(indicators)} threat indicators from decision for media {media_id}")
        return indicators
        
    except Exception as e:
        logger.error(f"Error extracting threat indicators: {str(e)}")
        return []

def analyze_decision_patterns(decision_data: Dict[str, Any], media_id: str) -> Dict[str, Any]:
    """Analyze patterns in human decisions to identify coordinated campaigns."""
    try:
        # Get recent decisions for pattern analysis
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=24)  # Look at last 24 hours
        
        # Query recent decisions
        recent_decisions = get_recent_decisions(start_time, end_time)
        
        # Analyze patterns
        patterns = {
            'temporal_clustering': analyze_temporal_clustering(recent_decisions),
            'source_clustering': analyze_source_clustering(recent_decisions),
            'technique_clustering': analyze_technique_clustering(recent_decisions),
            'content_similarity': analyze_content_similarity(recent_decisions, media_id),
            'campaign_indicators': identify_campaign_indicators(recent_decisions)
        }
        
        # Calculate overall pattern score
        pattern_score = calculate_pattern_score(patterns)
        
        return {
            'patterns': patterns,
            'pattern_score': pattern_score,
            'analysis_timestamp': datetime.utcnow().isoformat(),
            'decisions_analyzed': len(recent_decisions)
        }
        
    except Exception as e:
        logger.error(f"Error analyzing decision patterns: {str(e)}")
        return {'error': str(e)}

def should_generate_threat_report(decision_data: Dict[str, Any], pattern_analysis: Dict[str, Any]) -> bool:
    """Determine if a threat report should be generated."""
    try:
        decision_type = decision_data.get('decision', '')
        confidence = decision_data.get('confidence', 0.0)
        pattern_score = pattern_analysis.get('pattern_score', 0.0)
        
        # Generate report for confirmed deepfakes with high confidence
        if decision_type == 'confirm' and confidence >= 0.8:
            return True
        
        # Generate report for pattern-based threats
        if pattern_score >= 0.7:
            return True
        
        # Generate report for novel techniques
        findings = decision_data.get('findings', {})
        if findings.get('novelTechnique', False):
            return True
        
        # Generate report for coordinated campaigns
        campaign_indicators = pattern_analysis.get('patterns', {}).get('campaign_indicators', {})
        if campaign_indicators.get('likely_campaign', False):
            return True
        
        return False
        
    except Exception as e:
        logger.error(f"Error determining threat report generation: {str(e)}")
        return False

def create_threat_report(decision_data: Dict[str, Any], media_id: str, 
                        indicators: List[ThreatIndicator], pattern_analysis: Dict[str, Any]) -> ThreatReport:
    """Create a comprehensive threat report."""
    try:
        report_id = str(uuid.uuid4())
        current_time = datetime.utcnow().isoformat()
        
        # Determine threat type and severity
        threat_type, severity = classify_threat(decision_data, pattern_analysis)
        
        # Generate title and description
        title = generate_threat_title(threat_type, decision_data)
        description = generate_threat_description(decision_data, pattern_analysis, indicators)
        
        # Generate mitigation recommendations
        recommendations = generate_mitigation_recommendations(threat_type, decision_data, pattern_analysis)
        
        # Extract tags
        tags = extract_threat_tags(decision_data, pattern_analysis)
        
        # Count affected media
        affected_media_count = len(set(ind.associated_media_ids[0] for ind in indicators if ind.associated_media_ids))
        
        threat_report = ThreatReport(
            report_id=report_id,
            threat_type=threat_type,
            severity=severity,
            status=ThreatStatus.ACTIVE,
            title=title,
            description=description,
            created_at=current_time,
            updated_at=current_time,
            indicators=indicators,
            affected_media_count=max(affected_media_count, 1),
            confirmed_by_humans=1,
            ai_confidence=decision_data.get('aiConfidence', 0.0),
            mitigation_recommendations=recommendations,
            external_references=[],
            tags=tags,
            metadata={
                'source_media_id': media_id,
                'pattern_analysis': pattern_analysis,
                'decision_data': decision_data,
                'generation_method': 'human_review_triggered'
            }
        )
        
        return threat_report
        
    except Exception as e:
        logger.error(f"Error creating threat report: {str(e)}")
        raise

def store_threat_indicator(indicator: ThreatIndicator) -> Dict[str, Any]:
    """Store or update a threat indicator in the database."""
    try:
        # Check if indicator already exists
        existing_indicator = get_existing_indicator(indicator.indicator_type, indicator.indicator_value)
        
        if existing_indicator:
            # Update existing indicator
            updated_indicator = update_existing_indicator(existing_indicator, indicator)
            return updated_indicator
        else:
            # Store new indicator
            threat_intelligence_table.put_item(Item={
                'indicatorId': indicator.indicator_id,
                'indicatorType': indicator.indicator_type,
                'indicatorValue': indicator.indicator_value,
                'confidence': Decimal(str(indicator.confidence)),
                'firstSeen': indicator.first_seen,
                'lastSeen': indicator.last_seen,
                'occurrenceCount': indicator.occurrence_count,
                'associatedMediaIds': indicator.associated_media_ids,
                'metadata': indicator.metadata,
                'ttl': int((datetime.utcnow() + timedelta(days=365)).timestamp())  # 1 year TTL
            })
            
            return asdict(indicator)
        
    except Exception as e:
        logger.error(f"Error storing threat indicator: {str(e)}")
        raise

def store_threat_report(threat_report: ThreatReport) -> None:
    """Store threat report in database and S3."""
    try:
        # Store in DynamoDB
        threat_intelligence_table.put_item(Item={
            'reportId': threat_report.report_id,
            'recordType': 'threat_report',
            'threatType': threat_report.threat_type.value,
            'severity': threat_report.severity.value,
            'status': threat_report.status.value,
            'title': threat_report.title,
            'description': threat_report.description,
            'createdAt': threat_report.created_at,
            'updatedAt': threat_report.updated_at,
            'indicatorCount': len(threat_report.indicators),
            'affectedMediaCount': threat_report.affected_media_count,
            'confirmedByHumans': threat_report.confirmed_by_humans,
            'aiConfidence': Decimal(str(threat_report.ai_confidence)),
            'mitigationRecommendations': threat_report.mitigation_recommendations,
            'externalReferences': threat_report.external_references,
            'tags': threat_report.tags,
            'metadata': threat_report.metadata,
            'ttl': int((datetime.utcnow() + timedelta(days=730)).timestamp())  # 2 year TTL
        })
        
        # Store detailed report in S3
        report_key = f"threat-reports/{threat_report.created_at[:10]}/{threat_report.report_id}.json"
        detailed_report = {
            **asdict(threat_report),
            'indicators': [asdict(ind) for ind in threat_report.indicators]
        }
        
        s3_client.put_object(
            Bucket=THREAT_REPORTS_BUCKET_NAME,
            Key=report_key,
            Body=json.dumps(detailed_report, indent=2, default=str),
            ContentType='application/json',
            ServerSideEncryption='AES256'
        )
        
        logger.info(f"Stored threat report {threat_report.report_id} in DynamoDB and S3")
        
    except Exception as e:
        logger.error(f"Error storing threat report: {str(e)}")
        raise

def send_threat_alert(threat_report: ThreatReport) -> None:
    """Send threat alert via SNS."""
    try:
        alert_message = {
            'alertType': 'threat_intelligence',
            'reportId': threat_report.report_id,
            'threatType': threat_report.threat_type.value,
            'severity': threat_report.severity.value,
            'title': threat_report.title,
            'description': threat_report.description[:500],  # Truncate for SNS
            'affectedMediaCount': threat_report.affected_media_count,
            'indicatorCount': len(threat_report.indicators),
            'mitigationRecommendations': threat_report.mitigation_recommendations[:3],  # Top 3
            'createdAt': threat_report.created_at,
            'tags': threat_report.tags
        }
        
        sns_client.publish(
            TopicArn=THREAT_ALERTS_TOPIC_ARN,
            Subject=f"Threat Alert: {threat_report.title}",
            Message=json.dumps(alert_message, indent=2, default=str)
        )
        
        logger.info(f"Sent threat alert for report {threat_report.report_id}")
        
    except Exception as e:
        logger.error(f"Error sending threat alert: {str(e)}")

# Helper functions for pattern analysis
def get_recent_decisions(start_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
    """Get recent human review decisions for pattern analysis."""
    try:
        # This would query the review decision table
        # For now, return empty list as placeholder
        return []
    except Exception as e:
        logger.error(f"Error getting recent decisions: {str(e)}")
        return []

def analyze_temporal_clustering(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze temporal clustering of decisions."""
    if not decisions:
        return {'clustering_detected': False, 'cluster_score': 0.0}
    
    # Placeholder implementation
    return {'clustering_detected': False, 'cluster_score': 0.0}

def analyze_source_clustering(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze source domain clustering."""
    if not decisions:
        return {'clustering_detected': False, 'cluster_score': 0.0}
    
    # Placeholder implementation
    return {'clustering_detected': False, 'cluster_score': 0.0}

def analyze_technique_clustering(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze manipulation technique clustering."""
    if not decisions:
        return {'clustering_detected': False, 'cluster_score': 0.0}
    
    # Placeholder implementation
    return {'clustering_detected': False, 'cluster_score': 0.0}

def analyze_content_similarity(decisions: List[Dict[str, Any]], media_id: str) -> Dict[str, Any]:
    """Analyze content similarity patterns."""
    if not decisions:
        return {'similarity_detected': False, 'similarity_score': 0.0}
    
    # Placeholder implementation
    return {'similarity_detected': False, 'similarity_score': 0.0}

def identify_campaign_indicators(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Identify coordinated campaign indicators."""
    if not decisions:
        return {'likely_campaign': False, 'campaign_score': 0.0}
    
    # Placeholder implementation
    return {'likely_campaign': False, 'campaign_score': 0.0}

def calculate_pattern_score(patterns: Dict[str, Any]) -> float:
    """Calculate overall pattern score."""
    try:
        scores = []
        for pattern_type, pattern_data in patterns.items():
            if isinstance(pattern_data, dict):
                score = pattern_data.get('cluster_score', 0.0) or pattern_data.get('similarity_score', 0.0) or pattern_data.get('campaign_score', 0.0)
                scores.append(score)
        
        return statistics.mean(scores) if scores else 0.0
    except Exception:
        return 0.0

def classify_threat(decision_data: Dict[str, Any], pattern_analysis: Dict[str, Any]) -> Tuple[ThreatType, ThreatSeverity]:
    """Classify threat type and severity."""
    decision_type = decision_data.get('decision', '')
    confidence = decision_data.get('confidence', 0.0)
    pattern_score = pattern_analysis.get('pattern_score', 0.0)
    
    # Default classification
    threat_type = ThreatType.DEEPFAKE_CONFIRMED
    severity = ThreatSeverity.MEDIUM
    
    # Classify based on decision and patterns
    if decision_type == 'confirm':
        if pattern_score >= 0.8:
            threat_type = ThreatType.COORDINATED_CAMPAIGN
            severity = ThreatSeverity.CRITICAL
        elif confidence >= 0.9:
            severity = ThreatSeverity.HIGH
        else:
            severity = ThreatSeverity.MEDIUM
    
    return threat_type, severity

def generate_threat_title(threat_type: ThreatType, decision_data: Dict[str, Any]) -> str:
    """Generate threat report title."""
    base_titles = {
        ThreatType.DEEPFAKE_CONFIRMED: "Confirmed Deepfake Content",
        ThreatType.COORDINATED_CAMPAIGN: "Coordinated Deepfake Campaign",
        ThreatType.SOURCE_MANIPULATION: "Source Manipulation Attack",
        ThreatType.METADATA_SPOOFING: "Metadata Spoofing Detected",
        ThreatType.EVASION_TECHNIQUE: "AI Evasion Technique",
        ThreatType.NOVEL_MANIPULATION: "Novel Manipulation Technique",
        ThreatType.MASS_DISTRIBUTION: "Mass Distribution Campaign",
        ThreatType.TARGETED_ATTACK: "Targeted Deepfake Attack"
    }
    
    return base_titles.get(threat_type, "Threat Detected")

def generate_threat_description(decision_data: Dict[str, Any], pattern_analysis: Dict[str, Any], 
                               indicators: List[ThreatIndicator]) -> str:
    """Generate threat report description."""
    decision_type = decision_data.get('decision', '')
    confidence = decision_data.get('confidence', 0.0)
    findings = decision_data.get('findings', {})
    
    description = f"Human moderator {decision_type}ed suspicious content with {confidence:.1%} confidence. "
    
    if findings.get('manipulationTechniques'):
        techniques = ', '.join(findings['manipulationTechniques'])
        description += f"Manipulation techniques identified: {techniques}. "
    
    if len(indicators) > 1:
        description += f"Analysis extracted {len(indicators)} threat indicators. "
    
    pattern_score = pattern_analysis.get('pattern_score', 0.0)
    if pattern_score > 0.5:
        description += f"Pattern analysis indicates potential coordinated activity (score: {pattern_score:.2f}). "
    
    return description

def generate_mitigation_recommendations(threat_type: ThreatType, decision_data: Dict[str, Any], 
                                      pattern_analysis: Dict[str, Any]) -> List[str]:
    """Generate mitigation recommendations."""
    recommendations = [
        "Monitor for similar content patterns",
        "Update detection algorithms with new indicators",
        "Increase scrutiny of related sources"
    ]
    
    if threat_type == ThreatType.COORDINATED_CAMPAIGN:
        recommendations.extend([
            "Investigate coordinated distribution networks",
            "Share intelligence with partner organizations",
            "Implement enhanced monitoring for campaign indicators"
        ])
    
    if decision_data.get('findings', {}).get('novelTechnique'):
        recommendations.extend([
            "Update AI models with novel technique signatures",
            "Conduct technical analysis of new manipulation methods",
            "Share findings with research community"
        ])
    
    return recommendations

def extract_threat_tags(decision_data: Dict[str, Any], pattern_analysis: Dict[str, Any]) -> List[str]:
    """Extract relevant tags for threat categorization."""
    tags = ['human-confirmed']
    
    decision_type = decision_data.get('decision', '')
    if decision_type:
        tags.append(f'decision-{decision_type}')
    
    findings = decision_data.get('findings', {})
    if findings.get('manipulationTechniques'):
        for technique in findings['manipulationTechniques']:
            tags.append(f'technique-{technique.lower().replace(" ", "-")}')
    
    if findings.get('novelTechnique'):
        tags.append('novel-technique')
    
    pattern_score = pattern_analysis.get('pattern_score', 0.0)
    if pattern_score > 0.7:
        tags.append('coordinated-campaign')
    
    return tags

def get_existing_indicator(indicator_type: str, indicator_value: str) -> Optional[Dict[str, Any]]:
    """Check if threat indicator already exists."""
    try:
        # Query by indicator type and value
        # This is a placeholder - would need proper GSI implementation
        return None
    except Exception as e:
        logger.error(f"Error checking existing indicator: {str(e)}")
        return None

def update_existing_indicator(existing: Dict[str, Any], new_indicator: ThreatIndicator) -> Dict[str, Any]:
    """Update existing threat indicator with new occurrence."""
    try:
        # Update occurrence count and last seen
        updated_count = existing.get('occurrenceCount', 0) + 1
        
        # Merge associated media IDs
        existing_media_ids = existing.get('associatedMediaIds', [])
        new_media_ids = list(set(existing_media_ids + new_indicator.associated_media_ids))
        
        # Update the indicator
        threat_intelligence_table.update_item(
            Key={'indicatorId': existing['indicatorId']},
            UpdateExpression='SET occurrenceCount = :count, lastSeen = :last_seen, associatedMediaIds = :media_ids',
            ExpressionAttributeValues={
                ':count': updated_count,
                ':last_seen': new_indicator.last_seen,
                ':media_ids': new_media_ids
            }
        )
        
        return {
            **existing,
            'occurrenceCount': updated_count,
            'lastSeen': new_indicator.last_seen,
            'associatedMediaIds': new_media_ids
        }
        
    except Exception as e:
        logger.error(f"Error updating existing indicator: {str(e)}")
        raise

def update_threat_metrics(decision_data: Dict[str, Any], indicators: List[ThreatIndicator], 
                         threat_report: Optional[ThreatReport]) -> None:
    """Update CloudWatch metrics for threat intelligence."""
    try:
        # Basic metrics
        cloudwatch.put_metric_data(
            Namespace='Hlekkr/ThreatIntelligence',
            MetricData=[
                {
                    'MetricName': 'DecisionProcessed',
                    'Value': 1,
                    'Unit': 'Count',
                    'Dimensions': [
                        {
                            'Name': 'DecisionType',
                            'Value': decision_data.get('decision', 'unknown')
                        }
                    ]
                },
                {
                    'MetricName': 'ThreatIndicatorsExtracted',
                    'Value': len(indicators),
                    'Unit': 'Count'
                }
            ]
        )
        
        # Threat report metrics
        if threat_report:
            cloudwatch.put_metric_data(
                Namespace='Hlekkr/ThreatIntelligence',
                MetricData=[
                    {
                        'MetricName': 'ThreatReportGenerated',
                        'Value': 1,
                        'Unit': 'Count',
                        'Dimensions': [
                            {
                                'Name': 'ThreatType',
                                'Value': threat_report.threat_type.value
                            },
                            {
                                'Name': 'Severity',
                                'Value': threat_report.severity.value
                            }
                        ]
                    }
                ]
            )
        
    except Exception as e:
        logger.error(f"Error updating threat metrics: {str(e)}")

# Additional operation handlers
def generate_threat_report(event: Dict[str, Any]) -> Dict[str, Any]:
    """Generate threat report from existing indicators."""
    # Placeholder implementation
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Threat report generation not yet implemented'})
    }

def analyze_threat_patterns(event: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze threat patterns across time periods."""
    # Placeholder implementation
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Threat pattern analysis not yet implemented'})
    }

def update_threat_intelligence(event: Dict[str, Any]) -> Dict[str, Any]:
    """Update existing threat intelligence."""
    # Placeholder implementation
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Threat intelligence update not yet implemented'})
    }

def get_threat_reports(event: Dict[str, Any]) -> Dict[str, Any]:
    """Get threat reports with filtering."""
    # Placeholder implementation
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Threat report retrieval not yet implemented'})
    }

def share_threat_intelligence(event: Dict[str, Any]) -> Dict[str, Any]:
    """Share threat intelligence with external systems."""
    # Placeholder implementation
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Threat intelligence sharing not yet implemented'})
    }

def cleanup_old_threats(event: Dict[str, Any]) -> Dict[str, Any]:
    """Clean up old threat intelligence data."""
    # Placeholder implementation
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Threat cleanup not yet implemented'})
    }