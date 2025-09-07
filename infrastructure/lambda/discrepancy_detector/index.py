import json
import boto3
import os
import statistics
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import logging
from dataclasses import dataclass, asdict
from enum import Enum
import uuid
import re

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')
cloudwatch = boto3.client('cloudwatch')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
SOURCE_VERIFICATION_TABLE_NAME = os.environ.get('SOURCE_VERIFICATION_TABLE_NAME', '')
CHAIN_OF_CUSTODY_TABLE_NAME = os.environ.get('CHAIN_OF_CUSTODY_TABLE_NAME', '')
TRUST_SCORE_TABLE_NAME = os.environ.get('TRUST_SCORE_TABLE_NAME', '')
DISCREPANCY_ALERTS_TOPIC_ARN = os.environ.get('DISCREPANCY_ALERTS_TOPIC_ARN', '')

# DynamoDB tables
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)
source_verification_table = dynamodb.Table(SOURCE_VERIFICATION_TABLE_NAME) if SOURCE_VERIFICATION_TABLE_NAME else None
chain_of_custody_table = dynamodb.Table(CHAIN_OF_CUSTODY_TABLE_NAME) if CHAIN_OF_CUSTODY_TABLE_NAME else None
trust_score_table = dynamodb.Table(TRUST_SCORE_TABLE_NAME) if TRUST_SCORE_TABLE_NAME else None

class DiscrepancySeverity(Enum):
    """Enumeration of discrepancy severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class DiscrepancyType(Enum):
    """Enumeration of discrepancy types."""
    SOURCE_INCONSISTENCY = "source_inconsistency"
    METADATA_MISMATCH = "metadata_mismatch"
    CHAIN_INTEGRITY_VIOLATION = "chain_integrity_violation"
    TRUST_SCORE_ANOMALY = "trust_score_anomaly"
    PROCESSING_ANOMALY = "processing_anomaly"
    TEMPORAL_INCONSISTENCY = "temporal_inconsistency"
    CONTENT_HASH_MISMATCH = "content_hash_mismatch"
    SUSPICIOUS_PATTERN = "suspicious_pattern"

@dataclass
class Discrepancy:
    """Data class representing a detected discrepancy."""
    discrepancy_id: str
    media_id: str
    discrepancy_type: DiscrepancyType
    severity: DiscrepancySeverity
    description: str
    detected_at: str
    evidence: Dict[str, Any]
    affected_components: List[str]
    recommended_actions: List[str]
    confidence: float
    metadata: Dict[str, Any]

def handler(event, context):
    """
    Lambda function to detect discrepancies and generate alerts.
    Analyzes source verification, chain of custody, and trust score data.
    """
    try:
        logger.info(f"Processing discrepancy detection: {json.dumps(event)}")
        
        # Determine operation type
        operation = event.get('operation', 'detect_discrepancies')
        
        if operation == 'detect_discrepancies':
            return detect_discrepancies(event)
        elif operation == 'analyze_media':
            return analyze_media_discrepancies(event)
        elif operation == 'get_discrepancies':
            return get_media_discrepancies(event)
        elif operation == 'analyze_patterns':
            return analyze_suspicious_patterns(event)
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Invalid operation',
                    'supported_operations': ['detect_discrepancies', 'analyze_media', 'get_discrepancies', 'analyze_patterns']
                })
            }
        
    except Exception as e:
        logger.error(f"Error in discrepancy detection: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Discrepancy detection failed',
                'message': str(e)
            })
        }

def detect_discrepancies(event: Dict[str, Any]) -> Dict[str, Any]:
    """Detect discrepancies across all media items or specific criteria."""
    try:
        # Extract parameters
        media_id = event.get('mediaId')
        time_range_hours = event.get('timeRangeHours', 24)
        severity_threshold = event.get('severityThreshold', 'medium')
        
        discrepancies = []
        
        if media_id:
            # Analyze specific media item
            media_discrepancies = analyze_single_media(media_id)
            discrepancies.extend(media_discrepancies)
        else:
            # Analyze recent media items
            recent_media = get_recent_media_items(time_range_hours)
            for media_item in recent_media:
                media_discrepancies = analyze_single_media(media_item['mediaId'])
                discrepancies.extend(media_discrepancies)
        
        # Filter by severity threshold
        filtered_discrepancies = filter_by_severity(discrepancies, severity_threshold)
        
        # Generate alerts for critical discrepancies
        critical_discrepancies = [d for d in filtered_discrepancies if d.severity == DiscrepancySeverity.CRITICAL]
        for discrepancy in critical_discrepancies:
            send_alert(discrepancy)
        
        # Store discrepancies for tracking
        for discrepancy in filtered_discrepancies:
            store_discrepancy(discrepancy)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'totalDiscrepancies': len(filtered_discrepancies),
                'criticalDiscrepancies': len(critical_discrepancies),
                'discrepancies': [asdict(d) for d in filtered_discrepancies[:10]],  # Limit response size
                'alertsSent': len(critical_discrepancies),
                'analyzedAt': datetime.utcnow().isoformat()
            }, default=str)
        }
        
    except Exception as e:
        logger.error(f"Error detecting discrepancies: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to detect discrepancies',
                'message': str(e)
            })
        }

def analyze_media_discrepancies(event: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze discrepancies for a specific media item."""
    try:
        media_id = event.get('mediaId')
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing mediaId parameter'})
            }
        
        # Perform comprehensive analysis
        discrepancies = analyze_single_media(media_id)
        
        # Generate summary
        summary = generate_discrepancy_summary(discrepancies)
        
        # Send alerts if necessary
        alerts_sent = 0
        for discrepancy in discrepancies:
            if discrepancy.severity in [DiscrepancySeverity.HIGH, DiscrepancySeverity.CRITICAL]:
                send_alert(discrepancy)
                alerts_sent += 1
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'discrepancies': [asdict(d) for d in discrepancies],
                'summary': summary,
                'alertsSent': alerts_sent,
                'analyzedAt': datetime.utcnow().isoformat()
            }, default=str)
        }
        
    except Exception as e:
        logger.error(f"Error analyzing media discrepancies: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to analyze media discrepancies',
                'message': str(e)
            })
        }

def analyze_single_media(media_id: str) -> List[Discrepancy]:
    """Perform comprehensive discrepancy analysis for a single media item."""
    try:
        discrepancies = []
        
        # Get all relevant data
        source_verification_data = get_source_verification_data(media_id)
        chain_of_custody_data = get_chain_of_custody_data(media_id)
        trust_score_data = get_trust_score_data(media_id)
        audit_data = get_audit_data(media_id)
        
        # 1. Source consistency analysis
        source_discrepancies = analyze_source_consistency(
            media_id, source_verification_data, audit_data
        )
        discrepancies.extend(source_discrepancies)
        
        # 2. Metadata consistency analysis
        metadata_discrepancies = analyze_metadata_consistency(
            media_id, source_verification_data, audit_data
        )
        discrepancies.extend(metadata_discrepancies)
        
        # 3. Chain of custody integrity analysis
        chain_discrepancies = analyze_chain_integrity(
            media_id, chain_of_custody_data
        )
        discrepancies.extend(chain_discrepancies)
        
        # 4. Trust score anomaly analysis
        trust_score_discrepancies = analyze_trust_score_anomalies(
            media_id, trust_score_data, source_verification_data
        )
        discrepancies.extend(trust_score_discrepancies)
        
        # 5. Processing timeline analysis
        timeline_discrepancies = analyze_processing_timeline(
            media_id, audit_data, chain_of_custody_data
        )
        discrepancies.extend(timeline_discrepancies)
        
        # 6. Content hash consistency analysis
        hash_discrepancies = analyze_content_hash_consistency(
            media_id, chain_of_custody_data, audit_data
        )
        discrepancies.extend(hash_discrepancies)
        
        # 7. Suspicious pattern analysis
        pattern_discrepancies = analyze_suspicious_patterns_single(
            media_id, source_verification_data, trust_score_data, audit_data
        )
        discrepancies.extend(pattern_discrepancies)
        
        return discrepancies
        
    except Exception as e:
        logger.error(f"Error analyzing single media: {str(e)}")
        return []

def analyze_source_consistency(media_id: str, source_data: Dict[str, Any], 
                             audit_data: List[Dict[str, Any]]) -> List[Discrepancy]:
    """Analyze source information for consistency issues."""
    discrepancies = []
    
    try:
        if not source_data:
            return discrepancies
        
        source_info = source_data.get('sourceInfo', {})
        verification_result = source_data.get('verificationResult', {})
        
        # Check for source URL accessibility issues
        if verification_result.get('status') == 'suspicious':
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.SOURCE_INCONSISTENCY,
                severity=DiscrepancySeverity.HIGH,
                description="Source verification marked as suspicious",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'verificationStatus': verification_result.get('status'),
                    'reputationScore': verification_result.get('reputationScore'),
                    'discrepancies': verification_result.get('discrepancies', [])
                },
                affected_components=['source_verification'],
                recommended_actions=[
                    'Manual review of source authenticity',
                    'Cross-reference with additional sources',
                    'Verify domain reputation independently'
                ],
                confidence=0.8,
                metadata={'source_url': source_info.get('url')}
            ))
        
        # Check for domain reputation issues
        reputation_score = verification_result.get('reputationScore', 50)
        if reputation_score < 30:
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.SOURCE_INCONSISTENCY,
                severity=DiscrepancySeverity.MEDIUM,
                description=f"Low domain reputation score: {reputation_score}",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'reputationScore': reputation_score,
                    'domain': source_info.get('domain')
                },
                affected_components=['source_verification'],
                recommended_actions=[
                    'Investigate domain history',
                    'Check for recent security incidents',
                    'Verify content through alternative sources'
                ],
                confidence=0.7,
                metadata={'domain': source_info.get('domain')}
            ))
        
        # Check for missing critical source information
        required_fields = ['url', 'domain']
        missing_fields = [field for field in required_fields if not source_info.get(field)]
        
        if missing_fields:
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.SOURCE_INCONSISTENCY,
                severity=DiscrepancySeverity.MEDIUM,
                description=f"Missing critical source information: {', '.join(missing_fields)}",
                detected_at=datetime.utcnow().isoformat(),
                evidence={'missingFields': missing_fields},
                affected_components=['source_verification'],
                recommended_actions=[
                    'Request additional source information',
                    'Verify source through alternative means',
                    'Flag for manual review'
                ],
                confidence=0.9,
                metadata={'missingFields': missing_fields}
            ))
        
    except Exception as e:
        logger.error(f"Error analyzing source consistency: {str(e)}")
    
    return discrepancies

def analyze_metadata_consistency(media_id: str, source_data: Dict[str, Any], 
                               audit_data: List[Dict[str, Any]]) -> List[Discrepancy]:
    """Analyze metadata for consistency issues."""
    discrepancies = []
    
    try:
        # Get metadata from different sources
        source_metadata = source_data.get('sourceInfo', {}) if source_data else {}
        
        # Find metadata extraction events
        metadata_events = [
            event for event in audit_data 
            if event.get('eventType') == 'metadata_extraction'
        ]
        
        if not metadata_events:
            return discrepancies
        
        extracted_metadata = metadata_events[0].get('metadata', {})
        
        # Check for timestamp inconsistencies
        source_pub_date = source_metadata.get('publicationDate')
        extracted_date = extracted_metadata.get('creationDate')
        
        if source_pub_date and extracted_date:
            try:
                source_dt = datetime.fromisoformat(source_pub_date.replace('Z', '+00:00'))
                extracted_dt = datetime.fromisoformat(extracted_date.replace('Z', '+00:00'))
                
                time_diff = abs((source_dt - extracted_dt).total_seconds())
                
                # Flag if difference is more than 24 hours
                if time_diff > 86400:
                    discrepancies.append(Discrepancy(
                        discrepancy_id=str(uuid.uuid4()),
                        media_id=media_id,
                        discrepancy_type=DiscrepancyType.METADATA_MISMATCH,
                        severity=DiscrepancySeverity.MEDIUM,
                        description=f"Publication date mismatch: {time_diff/3600:.1f} hours difference",
                        detected_at=datetime.utcnow().isoformat(),
                        evidence={
                            'sourcePublicationDate': source_pub_date,
                            'extractedCreationDate': extracted_date,
                            'timeDifferenceHours': time_diff/3600
                        },
                        affected_components=['source_verification', 'metadata_extraction'],
                        recommended_actions=[
                            'Verify actual content creation date',
                            'Check for timezone discrepancies',
                            'Investigate potential content manipulation'
                        ],
                        confidence=0.6,
                        metadata={'timeDifference': time_diff}
                    ))
            except Exception:
                pass  # Skip if date parsing fails
        
        # Check for content type inconsistencies
        source_content_type = source_metadata.get('contentType')
        extracted_content_type = extracted_metadata.get('contentType')
        
        if (source_content_type and extracted_content_type and 
            source_content_type != extracted_content_type):
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.METADATA_MISMATCH,
                severity=DiscrepancySeverity.LOW,
                description=f"Content type mismatch: {source_content_type} vs {extracted_content_type}",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'sourceContentType': source_content_type,
                    'extractedContentType': extracted_content_type
                },
                affected_components=['source_verification', 'metadata_extraction'],
                recommended_actions=[
                    'Verify actual file format',
                    'Check for file conversion during upload',
                    'Validate content type detection accuracy'
                ],
                confidence=0.5,
                metadata={'contentTypes': [source_content_type, extracted_content_type]}
            ))
        
    except Exception as e:
        logger.error(f"Error analyzing metadata consistency: {str(e)}")
    
    return discrepancies

def analyze_chain_integrity(media_id: str, chain_data: List[Dict[str, Any]]) -> List[Discrepancy]:
    """Analyze chain of custody for integrity violations."""
    discrepancies = []
    
    try:
        if not chain_data:
            return discrepancies
        
        # Check for missing events in expected sequence
        expected_stages = [
            'upload', 'security_scan', 'metadata_extraction', 
            'source_verification', 'deepfake_analysis', 'trust_score_calculation'
        ]
        
        actual_stages = [event.get('stage') for event in chain_data]
        missing_stages = [stage for stage in expected_stages if stage not in actual_stages]
        
        if missing_stages:
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.CHAIN_INTEGRITY_VIOLATION,
                severity=DiscrepancySeverity.HIGH,
                description=f"Missing processing stages: {', '.join(missing_stages)}",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'missingStages': missing_stages,
                    'actualStages': actual_stages,
                    'expectedStages': expected_stages
                },
                affected_components=['chain_of_custody'],
                recommended_actions=[
                    'Investigate processing pipeline failures',
                    'Verify all required processing steps completed',
                    'Check for system errors during processing'
                ],
                confidence=0.9,
                metadata={'missingStages': missing_stages}
            ))
        
        # Check for hash consistency violations
        for i in range(len(chain_data) - 1):
            current_event = chain_data[i]
            next_event = chain_data[i + 1]
            
            current_output_hash = current_event.get('outputHash')
            next_input_hash = next_event.get('inputHash')
            
            if (current_output_hash and next_input_hash and 
                current_output_hash != next_input_hash):
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.CONTENT_HASH_MISMATCH,
                    severity=DiscrepancySeverity.CRITICAL,
                    description=f"Hash mismatch between {current_event.get('stage')} and {next_event.get('stage')}",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'currentStage': current_event.get('stage'),
                        'nextStage': next_event.get('stage'),
                        'currentOutputHash': current_output_hash,
                        'nextInputHash': next_input_hash
                    },
                    affected_components=['chain_of_custody'],
                    recommended_actions=[
                        'Investigate potential content tampering',
                        'Verify processing pipeline integrity',
                        'Quarantine media for security review'
                    ],
                    confidence=0.95,
                    metadata={
                        'affectedStages': [current_event.get('stage'), next_event.get('stage')]
                    }
                ))
        
        # Check for temporal inconsistencies
        timestamps = []
        for event in chain_data:
            try:
                timestamp = datetime.fromisoformat(event.get('timestamp', '').replace('Z', '+00:00'))
                timestamps.append((event.get('stage'), timestamp))
            except Exception:
                continue
        
        # Verify chronological order
        for i in range(len(timestamps) - 1):
            if timestamps[i][1] > timestamps[i + 1][1]:
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.TEMPORAL_INCONSISTENCY,
                    severity=DiscrepancySeverity.MEDIUM,
                    description=f"Temporal inconsistency: {timestamps[i][0]} after {timestamps[i+1][0]}",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'earlierStage': timestamps[i][0],
                        'laterStage': timestamps[i + 1][0],
                        'earlierTimestamp': timestamps[i][1].isoformat(),
                        'laterTimestamp': timestamps[i + 1][1].isoformat()
                    },
                    affected_components=['chain_of_custody'],
                    recommended_actions=[
                        'Verify system clock synchronization',
                        'Check for processing delays or retries',
                        'Investigate potential timestamp manipulation'
                    ],
                    confidence=0.7,
                    metadata={'affectedStages': [timestamps[i][0], timestamps[i + 1][0]]}
                ))
        
    except Exception as e:
        logger.error(f"Error analyzing chain integrity: {str(e)}")
    
    return discrepancies

def analyze_trust_score_anomalies(media_id: str, trust_score_data: Dict[str, Any], 
                                 source_data: Dict[str, Any]) -> List[Discrepancy]:
    """Analyze trust scores for anomalies and inconsistencies."""
    discrepancies = []
    
    try:
        if not trust_score_data:
            return discrepancies
        
        composite_score = trust_score_data.get('compositeScore', 0)
        breakdown = trust_score_data.get('breakdown', {})
        confidence = trust_score_data.get('confidence', 'unknown')
        
        # Check for extremely low trust scores
        if composite_score < 20:
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.TRUST_SCORE_ANOMALY,
                severity=DiscrepancySeverity.CRITICAL,
                description=f"Extremely low trust score: {composite_score}",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'compositeScore': composite_score,
                    'breakdown': breakdown,
                    'confidence': confidence
                },
                affected_components=['trust_score_calculation'],
                recommended_actions=[
                    'Immediate manual review required',
                    'Quarantine content pending investigation',
                    'Verify all analysis components'
                ],
                confidence=0.9,
                metadata={'trustScore': composite_score}
            ))
        
        # Check for inconsistencies between components
        if breakdown:
            component_scores = list(breakdown.values())
            if len(component_scores) > 1:
                score_variance = statistics.variance(component_scores)
                
                # High variance indicates inconsistent analysis
                if score_variance > 1000:  # Threshold for high variance
                    discrepancies.append(Discrepancy(
                        discrepancy_id=str(uuid.uuid4()),
                        media_id=media_id,
                        discrepancy_type=DiscrepancyType.TRUST_SCORE_ANOMALY,
                        severity=DiscrepancySeverity.MEDIUM,
                        description=f"High variance in trust score components: {score_variance:.1f}",
                        detected_at=datetime.utcnow().isoformat(),
                        evidence={
                            'scoreVariance': score_variance,
                            'componentScores': breakdown,
                            'compositeScore': composite_score
                        },
                        affected_components=['trust_score_calculation'],
                        recommended_actions=[
                            'Review individual component analysis',
                            'Verify scoring algorithm consistency',
                            'Check for conflicting analysis results'
                        ],
                        confidence=0.6,
                        metadata={'variance': score_variance}
                    ))
        
        # Check for mismatch with source verification
        if source_data:
            source_reputation = source_data.get('verificationResult', {}).get('reputationScore', 50)
            source_reliability_score = breakdown.get('sourceReliabilityScore', 50)
            
            # Significant mismatch between source verification and trust score component
            if abs(source_reputation - source_reliability_score) > 30:
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.TRUST_SCORE_ANOMALY,
                    severity=DiscrepancySeverity.MEDIUM,
                    description=f"Source reputation mismatch: {source_reputation} vs {source_reliability_score}",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'sourceReputation': source_reputation,
                        'sourceReliabilityScore': source_reliability_score,
                        'difference': abs(source_reputation - source_reliability_score)
                    },
                    affected_components=['source_verification', 'trust_score_calculation'],
                    recommended_actions=[
                        'Verify source verification accuracy',
                        'Check trust score calculation logic',
                        'Review component weighting algorithms'
                    ],
                    confidence=0.7,
                    metadata={'scoreDifference': abs(source_reputation - source_reliability_score)}
                ))
        
    except Exception as e:
        logger.error(f"Error analyzing trust score anomalies: {str(e)}")
    
    return discrepancies

def analyze_processing_timeline(media_id: str, audit_data: List[Dict[str, Any]], 
                              chain_data: List[Dict[str, Any]]) -> List[Discrepancy]:
    """Analyze processing timeline for anomalies."""
    discrepancies = []
    
    try:
        if not audit_data:
            return discrepancies
        
        # Calculate processing durations
        timestamps = []
        for event in audit_data:
            try:
                timestamp = datetime.fromisoformat(event.get('timestamp', '').replace('Z', '+00:00'))
                event_type = event.get('eventType', '')
                timestamps.append((event_type, timestamp))
            except Exception:
                continue
        
        if len(timestamps) < 2:
            return discrepancies
        
        # Sort by timestamp
        timestamps.sort(key=lambda x: x[1])
        
        # Calculate total processing time
        total_duration = (timestamps[-1][1] - timestamps[0][1]).total_seconds()
        
        # Flag unusually long processing times (> 1 hour)
        if total_duration > 3600:
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.PROCESSING_ANOMALY,
                severity=DiscrepancySeverity.LOW,
                description=f"Unusually long processing time: {total_duration/60:.1f} minutes",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'totalDurationSeconds': total_duration,
                    'startTime': timestamps[0][1].isoformat(),
                    'endTime': timestamps[-1][1].isoformat()
                },
                affected_components=['processing_pipeline'],
                recommended_actions=[
                    'Investigate processing bottlenecks',
                    'Check for system performance issues',
                    'Verify processing queue health'
                ],
                confidence=0.5,
                metadata={'processingDuration': total_duration}
            ))
        
        # Check for gaps in processing
        for i in range(len(timestamps) - 1):
            gap_duration = (timestamps[i + 1][1] - timestamps[i][1]).total_seconds()
            
            # Flag gaps longer than 30 minutes
            if gap_duration > 1800:
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.PROCESSING_ANOMALY,
                    severity=DiscrepancySeverity.MEDIUM,
                    description=f"Processing gap: {gap_duration/60:.1f} minutes between {timestamps[i][0]} and {timestamps[i+1][0]}",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'gapDurationSeconds': gap_duration,
                        'beforeEvent': timestamps[i][0],
                        'afterEvent': timestamps[i + 1][0],
                        'beforeTime': timestamps[i][1].isoformat(),
                        'afterTime': timestamps[i + 1][1].isoformat()
                    },
                    affected_components=['processing_pipeline'],
                    recommended_actions=[
                        'Investigate processing delays',
                        'Check for system failures or retries',
                        'Verify queue processing health'
                    ],
                    confidence=0.6,
                    metadata={'gapDuration': gap_duration}
                ))
        
    except Exception as e:
        logger.error(f"Error analyzing processing timeline: {str(e)}")
    
    return discrepancies

def analyze_content_hash_consistency(media_id: str, chain_data: List[Dict[str, Any]], 
                                   audit_data: List[Dict[str, Any]]) -> List[Discrepancy]:
    """Analyze content hash consistency across processing steps."""
    discrepancies = []
    
    try:
        if not chain_data:
            return discrepancies
        
        # Track hash changes through processing pipeline
        hash_changes = []
        
        for event in chain_data:
            input_hash = event.get('inputHash')
            output_hash = event.get('outputHash')
            stage = event.get('stage')
            
            if input_hash != output_hash:
                hash_changes.append({
                    'stage': stage,
                    'inputHash': input_hash,
                    'outputHash': output_hash,
                    'timestamp': event.get('timestamp')
                })
        
        # Analyze unexpected hash changes
        stages_that_should_not_modify = ['security_scan', 'source_verification']
        
        for change in hash_changes:
            if change['stage'] in stages_that_should_not_modify:
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.CONTENT_HASH_MISMATCH,
                    severity=DiscrepancySeverity.HIGH,
                    description=f"Unexpected content modification in {change['stage']} stage",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'stage': change['stage'],
                        'inputHash': change['inputHash'],
                        'outputHash': change['outputHash'],
                        'timestamp': change['timestamp']
                    },
                    affected_components=['chain_of_custody', change['stage']],
                    recommended_actions=[
                        'Investigate unauthorized content modification',
                        'Verify processing stage implementation',
                        'Check for potential security breach'
                    ],
                    confidence=0.8,
                    metadata={'modifiedStage': change['stage']}
                ))
        
        # Check for missing hashes where expected
        for event in chain_data:
            stage = event.get('stage')
            output_hash = event.get('outputHash')
            
            # Stages that should always produce output hashes
            if stage in ['upload', 'metadata_extraction', 'deepfake_analysis'] and not output_hash:
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.CONTENT_HASH_MISMATCH,
                    severity=DiscrepancySeverity.MEDIUM,
                    description=f"Missing output hash in {stage} stage",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'stage': stage,
                        'timestamp': event.get('timestamp')
                    },
                    affected_components=['chain_of_custody', stage],
                    recommended_actions=[
                        'Verify hash generation implementation',
                        'Check for processing errors',
                        'Ensure content integrity tracking'
                    ],
                    confidence=0.7,
                    metadata={'affectedStage': stage}
                ))
        
    except Exception as e:
        logger.error(f"Error analyzing content hash consistency: {str(e)}")
    
    return discrepancies

def analyze_suspicious_patterns_single(media_id: str, source_data: Dict[str, Any], 
                                     trust_score_data: Dict[str, Any], 
                                     audit_data: List[Dict[str, Any]]) -> List[Discrepancy]:
    """Analyze for suspicious patterns in a single media item."""
    discrepancies = []
    
    try:
        # Pattern 1: Rapid successive uploads from same source
        if source_data:
            source_domain = source_data.get('sourceInfo', {}).get('domain')
            if source_domain:
                recent_uploads = count_recent_uploads_from_domain(source_domain, hours=1)
                if recent_uploads > 10:  # Threshold for suspicious activity
                    discrepancies.append(Discrepancy(
                        discrepancy_id=str(uuid.uuid4()),
                        media_id=media_id,
                        discrepancy_type=DiscrepancyType.SUSPICIOUS_PATTERN,
                        severity=DiscrepancySeverity.MEDIUM,
                        description=f"Rapid uploads from domain: {recent_uploads} uploads in 1 hour",
                        detected_at=datetime.utcnow().isoformat(),
                        evidence={
                            'domain': source_domain,
                            'recentUploads': recent_uploads,
                            'timeWindow': '1 hour'
                        },
                        affected_components=['source_verification'],
                        recommended_actions=[
                            'Investigate potential spam or bot activity',
                            'Review domain reputation',
                            'Consider rate limiting for this domain'
                        ],
                        confidence=0.6,
                        metadata={'suspiciousDomain': source_domain}
                    ))
        
        # Pattern 2: Inconsistent trust score patterns
        if trust_score_data:
            composite_score = trust_score_data.get('compositeScore', 0)
            breakdown = trust_score_data.get('breakdown', {})
            
            # Check for artificially high scores with suspicious source
            if (composite_score > 80 and source_data and 
                source_data.get('verificationResult', {}).get('reputationScore', 50) < 30):
                discrepancies.append(Discrepancy(
                    discrepancy_id=str(uuid.uuid4()),
                    media_id=media_id,
                    discrepancy_type=DiscrepancyType.SUSPICIOUS_PATTERN,
                    severity=DiscrepancySeverity.HIGH,
                    description="High trust score despite low source reputation",
                    detected_at=datetime.utcnow().isoformat(),
                    evidence={
                        'trustScore': composite_score,
                        'sourceReputation': source_data.get('verificationResult', {}).get('reputationScore'),
                        'breakdown': breakdown
                    },
                    affected_components=['trust_score_calculation', 'source_verification'],
                    recommended_actions=[
                        'Manual review of trust score calculation',
                        'Verify source verification accuracy',
                        'Investigate potential scoring manipulation'
                    ],
                    confidence=0.7,
                    metadata={'scoreSourceMismatch': True}
                ))
        
        # Pattern 3: Processing anomalies that might indicate evasion attempts
        processing_events = [event for event in audit_data if event.get('eventType') in [
            'security_scan', 'deepfake_analysis', 'metadata_extraction'
        ]]
        
        failed_events = [event for event in processing_events if 
                        event.get('data', {}).get('status') == 'failed']
        
        if len(failed_events) > 1:
            discrepancies.append(Discrepancy(
                discrepancy_id=str(uuid.uuid4()),
                media_id=media_id,
                discrepancy_type=DiscrepancyType.SUSPICIOUS_PATTERN,
                severity=DiscrepancySeverity.MEDIUM,
                description=f"Multiple processing failures: {len(failed_events)} failed events",
                detected_at=datetime.utcnow().isoformat(),
                evidence={
                    'failedEvents': len(failed_events),
                    'failedEventTypes': [event.get('eventType') for event in failed_events]
                },
                affected_components=['processing_pipeline'],
                recommended_actions=[
                    'Investigate potential evasion attempts',
                    'Review processing error patterns',
                    'Check for malformed or adversarial content'
                ],
                confidence=0.5,
                metadata={'failedProcessingSteps': len(failed_events)}
            ))
        
    except Exception as e:
        logger.error(f"Error analyzing suspicious patterns: {str(e)}")
    
    return discrepancies

# Data retrieval functions

def get_source_verification_data(media_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve source verification data for a media item."""
    try:
        if not source_verification_table:
            return None
        
        response = source_verification_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False,  # Get latest
            Limit=1
        )
        
        return response['Items'][0] if response['Items'] else None
        
    except Exception as e:
        logger.error(f"Error retrieving source verification data: {str(e)}")
        return None

def get_chain_of_custody_data(media_id: str) -> List[Dict[str, Any]]:
    """Retrieve chain of custody data for a media item."""
    try:
        if not chain_of_custody_table:
            return []
        
        response = chain_of_custody_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=True  # Chronological order
        )
        
        return response['Items']
        
    except Exception as e:
        logger.error(f"Error retrieving chain of custody data: {str(e)}")
        return []

def get_trust_score_data(media_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve latest trust score data for a media item."""
    try:
        if not trust_score_table:
            return None
        
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            FilterExpression='isLatest = :true',
            ExpressionAttributeValues={
                ':media_id': media_id,
                ':true': 'true'
            },
            Limit=1
        )
        
        return response['Items'][0] if response['Items'] else None
        
    except Exception as e:
        logger.error(f"Error retrieving trust score data: {str(e)}")
        return None

def get_audit_data(media_id: str) -> List[Dict[str, Any]]:
    """Retrieve audit data for a media item."""
    try:
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=True  # Chronological order
        )
        
        return response['Items']
        
    except Exception as e:
        logger.error(f"Error retrieving audit data: {str(e)}")
        return []

def get_recent_media_items(hours: int = 24) -> List[Dict[str, Any]]:
    """Get recent media items for batch analysis."""
    try:
        cutoff_time = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        
        response = audit_table.query(
            IndexName='EventTypeIndex',
            KeyConditionExpression='eventType = :event_type AND #timestamp >= :cutoff',
            ExpressionAttributeNames={'#timestamp': 'timestamp'},
            ExpressionAttributeValues={
                ':event_type': 'media_upload',
                ':cutoff': cutoff_time
            }
        )
        
        return response['Items']
        
    except Exception as e:
        logger.error(f"Error retrieving recent media items: {str(e)}")
        return []

def count_recent_uploads_from_domain(domain: str, hours: int = 1) -> int:
    """Count recent uploads from a specific domain."""
    try:
        if not source_verification_table:
            return 0
        
        cutoff_time = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        
        response = source_verification_table.query(
            IndexName='DomainIndex',
            KeyConditionExpression='sourceDomain = :domain AND #timestamp >= :cutoff',
            ExpressionAttributeNames={'#timestamp': 'timestamp'},
            ExpressionAttributeValues={
                ':domain': domain,
                ':cutoff': cutoff_time
            }
        )
        
        return len(response['Items'])
        
    except Exception as e:
        logger.error(f"Error counting recent uploads from domain: {str(e)}")
        return 0

# Alert and notification functions

def send_alert(discrepancy: Discrepancy):
    """Send alert notification for a discrepancy."""
    try:
        if not DISCREPANCY_ALERTS_TOPIC_ARN:
            logger.warning("No alert topic configured")
            return
        
        # Create alert message
        alert_message = {
            'discrepancyId': discrepancy.discrepancy_id,
            'mediaId': discrepancy.media_id,
            'type': discrepancy.discrepancy_type.value,
            'severity': discrepancy.severity.value,
            'description': discrepancy.description,
            'detectedAt': discrepancy.detected_at,
            'confidence': discrepancy.confidence,
            'affectedComponents': discrepancy.affected_components,
            'recommendedActions': discrepancy.recommended_actions,
            'evidence': discrepancy.evidence
        }
        
        # Send SNS notification
        sns_client.publish(
            TopicArn=DISCREPANCY_ALERTS_TOPIC_ARN,
            Subject=f"Hlekkr Discrepancy Alert - {discrepancy.severity.value.upper()}",
            Message=json.dumps(alert_message, indent=2, default=str),
            MessageAttributes={
                'severity': {
                    'DataType': 'String',
                    'StringValue': discrepancy.severity.value
                },
                'mediaId': {
                    'DataType': 'String',
                    'StringValue': discrepancy.media_id
                },
                'discrepancyType': {
                    'DataType': 'String',
                    'StringValue': discrepancy.discrepancy_type.value
                }
            }
        )
        
        # Send CloudWatch metric
        cloudwatch.put_metric_data(
            Namespace='Hlekkr/Discrepancies',
            MetricData=[
                {
                    'MetricName': 'DiscrepancyDetected',
                    'Dimensions': [
                        {
                            'Name': 'Severity',
                            'Value': discrepancy.severity.value
                        },
                        {
                            'Name': 'Type',
                            'Value': discrepancy.discrepancy_type.value
                        }
                    ],
                    'Value': 1,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                }
            ]
        )
        
        logger.info(f"Alert sent for discrepancy: {discrepancy.discrepancy_id}")
        
    except Exception as e:
        logger.error(f"Error sending alert: {str(e)}")

def store_discrepancy(discrepancy: Discrepancy):
    """Store discrepancy in audit table for tracking."""
    try:
        audit_event = {
            'mediaId': discrepancy.media_id,
            'timestamp': discrepancy.detected_at,
            'eventType': 'discrepancy_detected',
            'eventSource': 'discrepancy-detector',
            'data': {
                'discrepancyId': discrepancy.discrepancy_id,
                'discrepancyType': discrepancy.discrepancy_type.value,
                'severity': discrepancy.severity.value,
                'description': discrepancy.description,
                'confidence': discrepancy.confidence,
                'affectedComponents': discrepancy.affected_components,
                'recommendedActions': discrepancy.recommended_actions,
                'evidence': discrepancy.evidence,
                'metadata': discrepancy.metadata
            },
            'userId': 'system',
            'userAgent': 'discrepancy-detector-lambda'
        }
        
        audit_table.put_item(Item=audit_event)
        
    except Exception as e:
        logger.error(f"Error storing discrepancy: {str(e)}")

def filter_by_severity(discrepancies: List[Discrepancy], threshold: str) -> List[Discrepancy]:
    """Filter discrepancies by severity threshold."""
    severity_order = {
        'low': 1,
        'medium': 2,
        'high': 3,
        'critical': 4
    }
    
    threshold_level = severity_order.get(threshold.lower(), 2)
    
    return [
        d for d in discrepancies 
        if severity_order.get(d.severity.value, 1) >= threshold_level
    ]

def generate_discrepancy_summary(discrepancies: List[Discrepancy]) -> Dict[str, Any]:
    """Generate summary statistics for discrepancies."""
    try:
        if not discrepancies:
            return {
                'totalDiscrepancies': 0,
                'severityDistribution': {},
                'typeDistribution': {},
                'averageConfidence': 0.0
            }
        
        # Count by severity
        severity_counts = {}
        for severity in DiscrepancySeverity:
            severity_counts[severity.value] = sum(
                1 for d in discrepancies if d.severity == severity
            )
        
        # Count by type
        type_counts = {}
        for disc_type in DiscrepancyType:
            type_counts[disc_type.value] = sum(
                1 for d in discrepancies if d.discrepancy_type == disc_type
            )
        
        # Calculate average confidence
        confidences = [d.confidence for d in discrepancies]
        avg_confidence = statistics.mean(confidences) if confidences else 0.0
        
        return {
            'totalDiscrepancies': len(discrepancies),
            'severityDistribution': severity_counts,
            'typeDistribution': type_counts,
            'averageConfidence': round(avg_confidence, 3),
            'highSeverityCount': severity_counts.get('high', 0) + severity_counts.get('critical', 0)
        }
        
    except Exception as e:
        logger.error(f"Error generating discrepancy summary: {str(e)}")
        return {}

def get_media_discrepancies(event: Dict[str, Any]) -> Dict[str, Any]:
    """Get stored discrepancies for a media item."""
    try:
        media_id = event.get('mediaId')
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing mediaId parameter'})
            }
        
        # Query audit table for discrepancy events
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            FilterExpression='eventType = :event_type',
            ExpressionAttributeValues={
                ':media_id': media_id,
                ':event_type': 'discrepancy_detected'
            }
        )
        
        discrepancies = []
        for item in response['Items']:
            discrepancy_data = item.get('data', {})
            discrepancies.append({
                'discrepancyId': discrepancy_data.get('discrepancyId'),
                'type': discrepancy_data.get('discrepancyType'),
                'severity': discrepancy_data.get('severity'),
                'description': discrepancy_data.get('description'),
                'detectedAt': item.get('timestamp'),
                'confidence': discrepancy_data.get('confidence'),
                'affectedComponents': discrepancy_data.get('affectedComponents', []),
                'recommendedActions': discrepancy_data.get('recommendedActions', []),
                'evidence': discrepancy_data.get('evidence', {}),
                'metadata': discrepancy_data.get('metadata', {})
            })
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'discrepancies': discrepancies,
                'totalCount': len(discrepancies),
                'retrievedAt': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error retrieving media discrepancies: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to retrieve discrepancies',
                'message': str(e)
            })
        }

def analyze_suspicious_patterns(event: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze suspicious patterns across multiple media items."""
    try:
        time_range_hours = event.get('timeRangeHours', 24)
        pattern_types = event.get('patternTypes', ['all'])
        
        patterns_detected = []
        
        # Pattern analysis across recent media
        recent_media = get_recent_media_items(time_range_hours)
        
        if 'domain_flooding' in pattern_types or 'all' in pattern_types:
            domain_patterns = detect_domain_flooding_patterns(recent_media)
            patterns_detected.extend(domain_patterns)
        
        if 'score_manipulation' in pattern_types or 'all' in pattern_types:
            score_patterns = detect_score_manipulation_patterns(recent_media)
            patterns_detected.extend(score_patterns)
        
        if 'processing_evasion' in pattern_types or 'all' in pattern_types:
            evasion_patterns = detect_processing_evasion_patterns(recent_media)
            patterns_detected.extend(evasion_patterns)
        
        # Send alerts for critical patterns
        critical_patterns = [p for p in patterns_detected if p.get('severity') == 'critical']
        for pattern in critical_patterns:
            send_pattern_alert(pattern)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'patternsDetected': len(patterns_detected),
                'criticalPatterns': len(critical_patterns),
                'patterns': patterns_detected,
                'timeRangeHours': time_range_hours,
                'analyzedAt': datetime.utcnow().isoformat()
            }, default=str)
        }
        
    except Exception as e:
        logger.error(f"Error analyzing suspicious patterns: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to analyze patterns',
                'message': str(e)
            })
        }

def detect_domain_flooding_patterns(recent_media: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect domain flooding patterns (many uploads from same domain)."""
    patterns = []
    
    try:
        # Count uploads by domain
        domain_counts = {}
        for media in recent_media:
            # Get source verification data for each media
            source_data = get_source_verification_data(media['mediaId'])
            if source_data:
                domain = source_data.get('sourceInfo', {}).get('domain')
                if domain:
                    domain_counts[domain] = domain_counts.get(domain, 0) + 1
        
        # Identify suspicious domains
        for domain, count in domain_counts.items():
            if count > 20:  # Threshold for suspicious activity
                patterns.append({
                    'patternType': 'domain_flooding',
                    'severity': 'critical' if count > 50 else 'high',
                    'description': f"Domain flooding detected: {count} uploads from {domain}",
                    'evidence': {
                        'domain': domain,
                        'uploadCount': count,
                        'timeWindow': '24 hours'
                    },
                    'confidence': 0.8,
                    'recommendedActions': [
                        'Investigate domain for bot activity',
                        'Consider rate limiting for this domain',
                        'Review content quality from this source'
                    ]
                })
        
    except Exception as e:
        logger.error(f"Error detecting domain flooding patterns: {str(e)}")
    
    return patterns

def detect_score_manipulation_patterns(recent_media: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect potential trust score manipulation patterns."""
    patterns = []
    
    try:
        suspicious_scores = []
        
        for media in recent_media:
            trust_data = get_trust_score_data(media['mediaId'])
            source_data = get_source_verification_data(media['mediaId'])
            
            if trust_data and source_data:
                trust_score = trust_data.get('compositeScore', 0)
                source_reputation = source_data.get('verificationResult', {}).get('reputationScore', 50)
                
                # Look for high trust scores with low source reputation
                if trust_score > 80 and source_reputation < 30:
                    suspicious_scores.append({
                        'mediaId': media['mediaId'],
                        'trustScore': trust_score,
                        'sourceReputation': source_reputation,
                        'difference': trust_score - source_reputation
                    })
        
        if len(suspicious_scores) > 5:  # Threshold for pattern detection
            patterns.append({
                'patternType': 'score_manipulation',
                'severity': 'high',
                'description': f"Potential score manipulation: {len(suspicious_scores)} cases of high trust with low source reputation",
                'evidence': {
                    'suspiciousCases': len(suspicious_scores),
                    'examples': suspicious_scores[:3]  # Include first 3 examples
                },
                'confidence': 0.7,
                'recommendedActions': [
                    'Review trust score calculation algorithm',
                    'Investigate potential scoring bypass attempts',
                    'Audit affected media items manually'
                ]
            })
        
    except Exception as e:
        logger.error(f"Error detecting score manipulation patterns: {str(e)}")
    
    return patterns

def detect_processing_evasion_patterns(recent_media: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect patterns that might indicate processing evasion attempts."""
    patterns = []
    
    try:
        evasion_indicators = []
        
        for media in recent_media:
            audit_data = get_audit_data(media['mediaId'])
            
            # Count failed processing events
            failed_events = [
                event for event in audit_data 
                if event.get('data', {}).get('status') == 'failed'
            ]
            
            # Count security scan bypasses
            security_events = [
                event for event in audit_data 
                if event.get('eventType') == 'security_scan'
            ]
            
            if len(failed_events) > 2 or len(security_events) == 0:
                evasion_indicators.append({
                    'mediaId': media['mediaId'],
                    'failedEvents': len(failed_events),
                    'securityScans': len(security_events),
                    'suspicionScore': len(failed_events) * 2 + (1 if len(security_events) == 0 else 0)
                })
        
        # High number of evasion indicators suggests coordinated attack
        if len(evasion_indicators) > 10:
            patterns.append({
                'patternType': 'processing_evasion',
                'severity': 'critical',
                'description': f"Processing evasion pattern detected: {len(evasion_indicators)} suspicious media items",
                'evidence': {
                    'suspiciousMediaCount': len(evasion_indicators),
                    'examples': evasion_indicators[:3]
                },
                'confidence': 0.8,
                'recommendedActions': [
                    'Investigate coordinated attack attempt',
                    'Review processing pipeline security',
                    'Consider temporary upload restrictions'
                ]
            })
        
    except Exception as e:
        logger.error(f"Error detecting processing evasion patterns: {str(e)}")
    
    return patterns

def send_pattern_alert(pattern: Dict[str, Any]):
    """Send alert for detected suspicious pattern."""
    try:
        if not DISCREPANCY_ALERTS_TOPIC_ARN:
            logger.warning("No alert topic configured")
            return
        
        # Send SNS notification
        sns_client.publish(
            TopicArn=DISCREPANCY_ALERTS_TOPIC_ARN,
            Subject=f"Hlekkr Pattern Alert - {pattern.get('severity', 'unknown').upper()}",
            Message=json.dumps(pattern, indent=2, default=str),
            MessageAttributes={
                'alertType': {
                    'DataType': 'String',
                    'StringValue': 'pattern_detection'
                },
                'severity': {
                    'DataType': 'String',
                    'StringValue': pattern.get('severity', 'unknown')
                },
                'patternType': {
                    'DataType': 'String',
                    'StringValue': pattern.get('patternType', 'unknown')
                }
            }
        )
        
        logger.info(f"Pattern alert sent: {pattern.get('patternType')}")
        
    except Exception as e:
        logger.error(f"Error sending pattern alert: {str(e)}")

# Utility functions for manual review workflow integration

def trigger_manual_review(media_id: str, discrepancies: List[Discrepancy]):
    """Trigger manual review workflow for media with discrepancies."""
    try:
        # This would integrate with the human review workflow
        # For now, log the trigger
        logger.info(f"Manual review triggered for {media_id} with {len(discrepancies)} discrepancies")
        
        # In production, this would:
        # 1. Create review queue entry
        # 2. Assign to appropriate moderator
        # 3. Set priority based on discrepancy severity
        # 4. Send notification to review team
        
    except Exception as e:
        logger.error(f"Error triggering manual review: {str(e)}")

def create_monitoring_metrics(discrepancies: List[Discrepancy]):
    """Create CloudWatch metrics for monitoring integration."""
    try:
        # Send metrics to CloudWatch
        metric_data = []
        
        # Count by severity
        for severity in DiscrepancySeverity:
            count = sum(1 for d in discrepancies if d.severity == severity)
            if count > 0:
                metric_data.append({
                    'MetricName': 'DiscrepanciesBySeverity',
                    'Dimensions': [
                        {
                            'Name': 'Severity',
                            'Value': severity.value
                        }
                    ],
                    'Value': count,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                })
        
        # Count by type
        for disc_type in DiscrepancyType:
            count = sum(1 for d in discrepancies if d.discrepancy_type == disc_type)
            if count > 0:
                metric_data.append({
                    'MetricName': 'DiscrepanciesByType',
                    'Dimensions': [
                        {
                            'Name': 'Type',
                            'Value': disc_type.value
                        }
                    ],
                    'Value': count,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                })
        
        if metric_data:
            cloudwatch.put_metric_data(
                Namespace='Hlekkr/Discrepancies',
                MetricData=metric_data
            )
        
    except Exception as e:
        logger.error(f"Error creating monitoring metrics: {str(e)}")