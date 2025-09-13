# Hlekkr - A High-Trust Audit Platform for Deepfake Detection
# Copyright (C) 2025 Frthst

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.

# You should have received a copy of the GNU Affero General Public
# License along with this program.  If not, see <https://www.gnu.org/licenses/>.

import json
import boto3
import os
import math
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import logging
import statistics
import uuid
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
TRUST_SCORE_TABLE_NAME = os.environ.get('TRUST_SCORE_TABLE_NAME', '')
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']

# DynamoDB tables
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)
trust_score_table = dynamodb.Table(TRUST_SCORE_TABLE_NAME) if TRUST_SCORE_TABLE_NAME else None

def handler(event, context):
    """
    Lambda function to calculate and retrieve comprehensive trust scores for media content.
    Supports both calculation and retrieval operations with versioning and historical tracking.
    """
    try:
        logger.info(f"Processing trust score request: {json.dumps(event)}")
        
        # Check if this is a retrieval request (API Gateway event)
        if event.get('httpMethod') and event.get('resource'):
            return handle_trust_score_retrieval(event)
        
        # Extract media ID from event (calculation request)
        media_id = event.get('mediaId') or event.get('pathParameters', {}).get('mediaId')
        
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing mediaId parameter'
                })
            }
        
        # Check if this is a retrieval request for specific media
        if event.get('operation') == 'retrieve':
            latest_score = get_latest_trust_score(media_id)
            
            if latest_score:
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'mediaId': media_id,
                        'trustScore': latest_score,
                        'timestamp': datetime.utcnow().isoformat()
                    })
                }
            else:
                return {
                    'statusCode': 404,
                    'body': json.dumps({
                        'error': 'Trust score not found for media',
                        'mediaId': media_id
                    })
                }
        
        # Calculate trust score (default operation)
        trust_score_result = calculate_trust_score(media_id)
        
        # Store trust score in dedicated trust score table with versioning
        storage_success = store_trust_score(media_id, trust_score_result)
        
        if not storage_success:
            logger.warning(f"Failed to store trust score for {media_id}, but calculation succeeded")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'trustScore': trust_score_result,
                'stored': storage_success,
                'timestamp': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing trust score request: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Trust score operation failed',
                'message': str(e)
            })
        }

def calculate_trust_score(media_id: str) -> Dict[str, Any]:
    """Calculate comprehensive trust score for media content."""
    try:
        logger.info(f"Calculating trust score for media: {media_id}")
        
        # Get all analysis data for this media
        analysis_data = get_media_analysis_data(media_id)
        
        if not analysis_data:
            return {
                'error': 'No analysis data found for media',
                'compositeScore': 0.0,
                'confidence': 'low'
            }
        
        # Calculate individual score components
        deepfake_score = calculate_deepfake_score(analysis_data)
        source_reliability_score = calculate_source_reliability_score(analysis_data)
        metadata_consistency_score = calculate_metadata_consistency_score(analysis_data)
        historical_pattern_score = calculate_historical_pattern_score(media_id, analysis_data)
        technical_integrity_score = calculate_technical_integrity_score(analysis_data)
        
        # Calculate weighted composite score
        composite_score = calculate_composite_score({
            'deepfake': deepfake_score,
            'sourceReliability': source_reliability_score,
            'metadataConsistency': metadata_consistency_score,
            'historicalPattern': historical_pattern_score,
            'technicalIntegrity': technical_integrity_score
        })
        
        # Determine confidence level
        confidence_level = determine_confidence_level(analysis_data, composite_score)
        
        # Create detailed breakdown
        trust_score_result = {
            'mediaId': media_id,
            'compositeScore': round(composite_score, 2),
            'confidence': confidence_level,
            'calculationTimestamp': datetime.utcnow().isoformat(),
            'breakdown': {
                'deepfakeScore': round(deepfake_score, 2),
                'sourceReliabilityScore': round(source_reliability_score, 2),
                'metadataConsistencyScore': round(metadata_consistency_score, 2),
                'historicalPatternScore': round(historical_pattern_score, 2),
                'technicalIntegrityScore': round(technical_integrity_score, 2)
            },
            'factors': get_trust_factors(analysis_data),
            'recommendations': generate_recommendations(composite_score, analysis_data)
        }
        
        logger.info(f"Trust score calculated: {composite_score:.2f} for {media_id}")
        
        return trust_score_result
        
    except Exception as e:
        logger.error(f"Error in trust score calculation: {str(e)}")
        return {
            'error': str(e),
            'compositeScore': 0.0,
            'confidence': 'error'
        }

def get_media_analysis_data(media_id: str) -> Dict[str, Any]:
    """Retrieve all analysis data for a media item."""
    try:
        # Query all records for this media
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id}
        )
        
        analysis_data = {
            'metadata': None,
            'deepfakeAnalysis': None,
            'sourceVerification': None,
            'allRecords': response['Items']
        }
        
        # Extract specific analysis types
        for record in response['Items']:
            event_type = record.get('eventType')
            
            if event_type == 'metadata_extraction':
                analysis_data['metadata'] = record.get('metadata', {})
            elif event_type == 'deepfake_analysis':
                analysis_data['deepfakeAnalysis'] = record.get('data', {})
            elif event_type == 'source_verification':
                analysis_data['sourceVerification'] = record.get('data', {})
        
        return analysis_data
        
    except Exception as e:
        logger.error(f"Error retrieving analysis data: {str(e)}")
        return {}

def calculate_deepfake_score(analysis_data: Dict[str, Any]) -> float:
    """Calculate advanced score based on deepfake detection results and technique classification."""
    try:
        deepfake_analysis = analysis_data.get('deepfakeAnalysis')
        
        if not deepfake_analysis:
            logger.warning("No deepfake analysis data available")
            return 50.0  # Neutral score when no data
        
        # Get deepfake confidence (0-1, where 1 = definitely deepfake)
        deepfake_confidence = deepfake_analysis.get('deepfakeConfidence', 0.5)
        
        if deepfake_confidence < 0:
            return 50.0  # Error in analysis
        
        # Base trust score (inverse of deepfake confidence)
        base_trust_score = (1.0 - deepfake_confidence) * 100
        
        # Enhanced scoring with technique classification
        technique_classification = deepfake_analysis.get('technique_classification', {})
        
        if technique_classification:
            # Apply severity-based penalties
            overall_severity = technique_classification.get('overall_severity', 'minimal')
            severity_penalties = {
                'minimal': 0,
                'low': 5,
                'moderate': 15,
                'high': 30,
                'critical': 50
            }
            
            severity_penalty = severity_penalties.get(overall_severity, 0)
            
            # Apply technique-specific penalties
            classified_techniques = technique_classification.get('classified_techniques', [])
            technique_penalty = 0
            
            for technique in classified_techniques:
                technique_type = technique.get('type', '')
                technique_confidence = technique.get('confidence', 0)
                
                # Weight penalties by technique type and confidence
                type_penalties = {
                    'entire_face_synthesis': 25,
                    'face_swap': 20,
                    'speech_synthesis': 18,
                    'face_reenactment': 15,
                    'expression_transfer': 10,
                    'attribute_editing': 8,
                    'traditional_editing': 5,
                    'compression_artifacts': 2
                }
                
                base_penalty = type_penalties.get(technique_type, 5)
                weighted_penalty = base_penalty * technique_confidence
                technique_penalty += weighted_penalty
            
            # Apply consensus factor
            consensus_metrics = technique_classification.get('analysis_report', {}).get('consensus_metrics', {})
            agreement_level = consensus_metrics.get('agreement', 'medium')
            
            # High agreement increases penalty reliability, low agreement reduces it
            agreement_modifiers = {
                'very_high': 1.2,
                'high': 1.1,
                'medium': 1.0,
                'low': 0.8,
                'very_low': 0.6
            }
            
            agreement_modifier = agreement_modifiers.get(agreement_level, 1.0)
            
            total_penalty = (severity_penalty + technique_penalty) * agreement_modifier
            
        else:
            # Fallback to simple technique counting
            detected_techniques = deepfake_analysis.get('detectedTechniques', [])
            total_penalty = len(detected_techniques) * 8  # Increased penalty per technique
        
        # Apply confidence-based modulation
        confidence_modifier = calculate_confidence_modifier(deepfake_analysis)
        final_penalty = total_penalty * confidence_modifier
        
        # Calculate final score
        final_score = max(0, base_trust_score - final_penalty)
        
        logger.info(f"Enhanced deepfake score: {final_score:.2f} "
                   f"(base: {base_trust_score:.2f}, penalty: {final_penalty:.2f})")
        
        return final_score
        
    except Exception as e:
        logger.error(f"Error calculating deepfake score: {str(e)}")
        return 50.0

def calculate_source_reliability_score(analysis_data: Dict[str, Any]) -> float:
    """Calculate advanced score based on source reliability and provenance."""
    try:
        source_verification = analysis_data.get('sourceVerification')
        metadata = analysis_data.get('metadata', {})
        
        if not source_verification and not metadata:
            logger.warning("No source verification or metadata available")
            return 50.0  # Neutral score when no data
        
        base_score = 60.0  # Slightly positive default
        
        # Enhanced source verification scoring
        if source_verification:
            verification_status = source_verification.get('verificationStatus', 'unverified')
            verification_confidence = source_verification.get('verificationConfidence', 0.5)
            
            # Status-based scoring with confidence weighting
            status_scores = {
                'verified': 35.0,
                'likely_verified': 20.0,
                'unverified': 0.0,
                'suspicious': -30.0,
                'likely_fake': -45.0
            }
            
            status_adjustment = status_scores.get(verification_status, 0.0)
            confidence_weighted_adjustment = status_adjustment * verification_confidence
            base_score += confidence_weighted_adjustment
            
            # Source reputation with historical context
            source_reputation = source_verification.get('sourceReputation', 'unknown')
            reputation_history = source_verification.get('reputationHistory', {})
            
            reputation_scores = {
                'excellent': 25.0,
                'high': 20.0,
                'good': 15.0,
                'medium': 10.0,
                'fair': 5.0,
                'poor': -10.0,
                'low': -20.0,
                'blacklisted': -50.0
            }
            
            reputation_adjustment = reputation_scores.get(source_reputation, 0.0)
            
            # Apply historical reputation trend
            if reputation_history:
                trend = reputation_history.get('trend', 'stable')
                if trend == 'improving':
                    reputation_adjustment *= 1.1
                elif trend == 'declining':
                    reputation_adjustment *= 0.8
            
            base_score += reputation_adjustment
            
            # Chain of custody scoring
            chain_of_custody = source_verification.get('chainOfCustody', [])
            if chain_of_custody:
                custody_score = calculate_chain_of_custody_score(chain_of_custody)
                base_score += custody_score
            
            # Cross-reference verification
            cross_references = source_verification.get('crossReferences', [])
            if cross_references:
                cross_ref_score = len(cross_references) * 3  # 3 points per cross-reference
                base_score += min(cross_ref_score, 15)  # Cap at 15 points
        
        # Metadata-based source indicators
        if metadata:
            # Check for source-related metadata
            s3_location = metadata.get('s3Location', {})
            upload_path = s3_location.get('key', '')
            
            # Analyze upload path for source indicators
            if 'verified/' in upload_path:
                base_score += 10.0
            elif 'suspicious/' in upload_path or 'quarantine/' in upload_path:
                base_score -= 20.0
            
            # Check upload timing patterns
            upload_timestamp = metadata.get('uploadTimestamp')
            if upload_timestamp:
                upload_time_score = calculate_upload_timing_score(upload_timestamp)
                base_score += upload_time_score
        
        # Apply source diversity bonus
        source_diversity_score = calculate_source_diversity_score(analysis_data)
        base_score += source_diversity_score
        
        final_score = max(0, min(100, base_score))
        
        logger.info(f"Source reliability score: {final_score:.2f}")
        
        return final_score
        
    except Exception as e:
        logger.error(f"Error calculating source reliability score: {str(e)}")
        return 50.0

def calculate_metadata_consistency_score(analysis_data: Dict[str, Any]) -> float:
    """Calculate score based on metadata consistency."""
    try:
        metadata = analysis_data.get('metadata', {})
        
        if not metadata:
            return 50.0
        
        score = 100.0
        
        # Check for metadata inconsistencies
        inconsistencies = []
        
        # Check file size vs content type
        file_size = metadata.get('fileSize', 0)
        content_type = metadata.get('contentType', '')
        
        if file_size == 0:
            inconsistencies.append('zero_file_size')
            score -= 20.0
        
        # Check timestamp consistency
        upload_time = metadata.get('uploadTimestamp')
        last_modified = metadata.get('lastModified')
        
        if upload_time and last_modified:
            # Check if modification time is significantly different from upload time
            try:
                upload_dt = datetime.fromisoformat(upload_time.replace('Z', '+00:00'))
                modified_dt = datetime.fromisoformat(last_modified.replace('Z', '+00:00'))
                
                time_diff = abs((upload_dt - modified_dt).total_seconds())
                
                if time_diff > 86400:  # More than 24 hours difference
                    inconsistencies.append('timestamp_mismatch')
                    score -= 15.0
                    
            except Exception:
                inconsistencies.append('invalid_timestamps')
                score -= 10.0
        
        # Check for missing critical metadata
        critical_fields = ['filename', 'fileSize', 'contentType']
        missing_fields = [field for field in critical_fields if not metadata.get(field)]
        
        if missing_fields:
            inconsistencies.append(f'missing_fields_{len(missing_fields)}')
            score -= len(missing_fields) * 5.0
        
        logger.info(f"Metadata consistency score: {score:.2f}, inconsistencies: {inconsistencies}")
        
        return max(0, score)
        
    except Exception as e:
        logger.error(f"Error calculating metadata consistency score: {str(e)}")
        return 50.0

def calculate_historical_pattern_score(media_id: str, analysis_data: Dict[str, Any]) -> float:
    """Calculate score based on historical patterns and user behavior."""
    try:
        all_records = analysis_data.get('allRecords', [])
        
        if len(all_records) < 2:
            return 70.0  # Neutral-positive score for new content
        
        score = 70.0
        
        # Analyze upload patterns
        upload_times = []
        for record in all_records:
            if record.get('eventType') == 'media_upload':
                timestamp = record.get('timestamp')
                if timestamp:
                    try:
                        upload_times.append(datetime.fromisoformat(timestamp))
                    except Exception:
                        continue
        
        # Check for suspicious rapid uploads
        if len(upload_times) > 1:
            time_diffs = []
            for i in range(1, len(upload_times)):
                diff = (upload_times[i] - upload_times[i-1]).total_seconds()
                time_diffs.append(diff)
            
            if time_diffs:
                avg_diff = statistics.mean(time_diffs)
                if avg_diff < 60:  # Less than 1 minute between uploads
                    score -= 20.0
                elif avg_diff < 300:  # Less than 5 minutes
                    score -= 10.0
        
        # Check processing consistency
        processing_times = []
        for record in all_records:
            if 'processingTime' in record.get('data', {}):
                processing_times.append(record['data']['processingTime'])
        
        if len(processing_times) > 1:
            # Check for unusual processing time variations
            if max(processing_times) / min(processing_times) > 10:
                score -= 5.0
        
        return max(0, min(100, score))
        
    except Exception as e:
        logger.error(f"Error calculating historical pattern score: {str(e)}")
        return 70.0

def calculate_technical_integrity_score(analysis_data: Dict[str, Any]) -> float:
    """Calculate score based on technical integrity checks."""
    try:
        metadata = analysis_data.get('metadata', {})
        
        if not metadata:
            return 50.0
        
        score = 80.0
        
        # Check file integrity
        etag = metadata.get('etag')
        if not etag:
            score -= 10.0
        
        # Check encryption status
        encryption = metadata.get('serverSideEncryption')
        if not encryption:
            score -= 5.0
        
        # Check storage class
        storage_class = metadata.get('storageClass', 'STANDARD')
        if storage_class != 'STANDARD':
            # Different storage classes might indicate different handling
            score -= 2.0
        
        # Check for technical metadata extraction success
        technical_metadata = metadata.get('technicalMetadata', {})
        if technical_metadata.get('extractionFailed'):
            score -= 15.0
        
        return max(0, min(100, score))
        
    except Exception as e:
        logger.error(f"Error calculating technical integrity score: {str(e)}")
        return 50.0

def calculate_confidence_modifier(deepfake_analysis: Dict[str, Any]) -> float:
    """Calculate confidence modifier based on analysis quality and consensus."""
    try:
        base_modifier = 1.0
        
        # Check analysis depth and model consensus
        technique_classification = deepfake_analysis.get('technique_classification', {})
        
        if technique_classification:
            # Adjust based on model consensus
            consensus_metrics = technique_classification.get('analysis_report', {}).get('consensus_metrics', {})
            models_count = consensus_metrics.get('models_count', 1)
            
            # More models increase confidence in the result
            if models_count >= 3:
                base_modifier *= 1.2
            elif models_count >= 2:
                base_modifier *= 1.1
            
            # Adjust based on agreement level
            agreement = consensus_metrics.get('agreement', 'medium')
            agreement_modifiers = {
                'very_high': 1.3,
                'high': 1.2,
                'medium': 1.0,
                'low': 0.8,
                'very_low': 0.6
            }
            
            base_modifier *= agreement_modifiers.get(agreement, 1.0)
        
        # Check processing quality indicators
        processing_time = deepfake_analysis.get('processingTime', 0)
        if processing_time > 5.0:  # Longer processing might indicate more thorough analysis
            base_modifier *= 1.1
        elif processing_time < 0.5:  # Very fast processing might be less thorough
            base_modifier *= 0.9
        
        return max(0.5, min(2.0, base_modifier))  # Clamp between 0.5 and 2.0
        
    except Exception as e:
        logger.error(f"Error calculating confidence modifier: {str(e)}")
        return 1.0

def calculate_composite_score(scores: Dict[str, float]) -> float:
    """Calculate advanced weighted composite trust score with dynamic weighting."""
    try:
        # Base weights for different score components
        base_weights = {
            'deepfake': 0.35,           # Highest weight - core functionality
            'sourceReliability': 0.25,  # High weight - source matters
            'metadataConsistency': 0.20, # Medium weight - technical validation
            'technicalIntegrity': 0.15,  # Medium weight - file integrity
            'historicalPattern': 0.05    # Lower weight - behavioral patterns
        }
        
        # Calculate dynamic weights based on score reliability
        dynamic_weights = calculate_dynamic_weights(scores, base_weights)
        
        # Apply non-linear scoring for extreme values
        adjusted_scores = apply_non_linear_adjustments(scores)
        
        # Calculate weighted composite with uncertainty handling
        weighted_sum = 0.0
        total_weight = 0.0
        uncertainty_penalty = 0.0
        
        for component, score in adjusted_scores.items():
            if component in dynamic_weights and score >= 0:
                weight = dynamic_weights[component]
                weighted_sum += score * weight
                total_weight += weight
                
                # Add uncertainty penalty for missing or low-confidence components
                if score == 50.0:  # Neutral/missing data score
                    uncertainty_penalty += weight * 0.1  # 10% penalty per missing component
        
        if total_weight == 0:
            return 0.0
        
        # Calculate base composite score
        composite_score = weighted_sum / total_weight
        
        # Apply uncertainty penalty
        final_score = composite_score * (1.0 - uncertainty_penalty)
        
        # Apply score smoothing for edge cases
        smoothed_score = apply_score_smoothing(final_score, scores)
        
        return max(0.0, min(100.0, smoothed_score))
        
    except Exception as e:
        logger.error(f"Error calculating composite score: {str(e)}")
        return 0.0

def calculate_dynamic_weights(scores: Dict[str, float], base_weights: Dict[str, float]) -> Dict[str, float]:
    """Calculate dynamic weights based on score reliability and availability."""
    try:
        dynamic_weights = base_weights.copy()
        
        # Increase weight for high-confidence components
        for component, score in scores.items():
            if component in dynamic_weights:
                # Boost weight for extreme scores (very high or very low trust)
                if score > 80 or score < 20:
                    dynamic_weights[component] *= 1.2
                # Reduce weight for neutral scores (likely missing data)
                elif 45 <= score <= 55:
                    dynamic_weights[component] *= 0.8
        
        # Normalize weights to sum to 1.0
        total_weight = sum(dynamic_weights.values())
        if total_weight > 0:
            for component in dynamic_weights:
                dynamic_weights[component] /= total_weight
        
        return dynamic_weights
        
    except Exception as e:
        logger.error(f"Error calculating dynamic weights: {str(e)}")
        return base_weights

def apply_non_linear_adjustments(scores: Dict[str, float]) -> Dict[str, float]:
    """Apply non-linear adjustments to emphasize extreme scores."""
    try:
        adjusted_scores = {}
        
        for component, score in scores.items():
            if score < 0:
                adjusted_scores[component] = score
                continue
            
            # Apply sigmoid-like transformation to emphasize extremes
            normalized_score = score / 100.0  # Normalize to 0-1
            
            # Apply non-linear transformation
            if normalized_score > 0.5:
                # Emphasize high trust scores
                adjusted = 0.5 + 0.5 * math.pow((normalized_score - 0.5) * 2, 0.8)
            else:
                # Emphasize low trust scores
                adjusted = 0.5 * math.pow(normalized_score * 2, 1.2)
            
            adjusted_scores[component] = adjusted * 100.0
        
        return adjusted_scores
        
    except Exception as e:
        logger.error(f"Error applying non-linear adjustments: {str(e)}")
        return scores

def apply_score_smoothing(score: float, component_scores: Dict[str, float]) -> float:
    """Apply smoothing to prevent extreme scores without strong evidence."""
    try:
        # Calculate score variance to detect inconsistencies
        valid_scores = [s for s in component_scores.values() if s >= 0]
        
        if len(valid_scores) < 2:
            return score
        
        score_variance = statistics.variance(valid_scores)
        
        # If variance is very high, apply smoothing toward the median
        if score_variance > 1000:  # High variance threshold
            median_score = statistics.median(valid_scores)
            smoothing_factor = min(0.3, score_variance / 5000)  # Max 30% smoothing
            smoothed_score = score * (1 - smoothing_factor) + median_score * smoothing_factor
            
            logger.info(f"Applied smoothing: {score:.2f} -> {smoothed_score:.2f} "
                       f"(variance: {score_variance:.2f})")
            
            return smoothed_score
        
        return score
        
    except Exception as e:
        logger.error(f"Error applying score smoothing: {str(e)}")
        return score

def determine_confidence_level(analysis_data: Dict[str, Any], composite_score: float) -> str:
    """Determine confidence level based on available data and score."""
    data_completeness = 0
    
    if analysis_data.get('metadata'):
        data_completeness += 1
    if analysis_data.get('deepfakeAnalysis'):
        data_completeness += 1
    if analysis_data.get('sourceVerification'):
        data_completeness += 1
    
    if data_completeness >= 3:
        return 'high'
    elif data_completeness >= 2:
        return 'medium'
    else:
        return 'low'

def get_trust_factors(analysis_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Get detailed trust factors that influenced the score."""
    factors = []
    
    # Deepfake analysis factors
    deepfake_analysis = analysis_data.get('deepfakeAnalysis')
    if deepfake_analysis:
        confidence = deepfake_analysis.get('deepfakeConfidence', 0)
        factors.append({
            'category': 'deepfake_detection',
            'impact': 'negative' if confidence > 0.5 else 'positive',
            'description': f'Deepfake confidence: {confidence:.2f}',
            'weight': 'high'
        })
    
    # Source verification factors
    source_verification = analysis_data.get('sourceVerification')
    if source_verification:
        status = source_verification.get('verificationStatus', 'unknown')
        factors.append({
            'category': 'source_verification',
            'impact': 'positive' if status == 'verified' else 'negative' if status == 'suspicious' else 'neutral',
            'description': f'Source verification: {status}',
            'weight': 'high'
        })
    
    return factors

def generate_recommendations(composite_score: float, analysis_data: Dict[str, Any]) -> List[str]:
    """Generate recommendations based on trust score and analysis."""
    recommendations = []
    
    if composite_score < 30:
        recommendations.append("High risk content - recommend manual review before publication")
        recommendations.append("Consider additional verification from independent sources")
    elif composite_score < 60:
        recommendations.append("Medium risk content - verify source and context before use")
        recommendations.append("Consider cross-referencing with other media sources")
    elif composite_score < 80:
        recommendations.append("Generally trustworthy content with minor concerns")
        recommendations.append("Standard verification procedures recommended")
    else:
        recommendations.append("High trust content suitable for publication")
        recommendations.append("Minimal additional verification required")
    
    # Add specific recommendations based on analysis
    deepfake_analysis = analysis_data.get('deepfakeAnalysis')
    if deepfake_analysis and deepfake_analysis.get('deepfakeConfidence', 0) > 0.7:
        recommendations.append("Strong deepfake indicators detected - expert review recommended")
    
    return recommendations

def store_trust_score(media_id: str, trust_score_result: Dict[str, Any]):
    """Store trust score results in audit table."""
    try:
        audit_record = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'trust_score_calculation',
            'eventSource': 'hlekkr:trust_score_calculator',
            'data': trust_score_result
        }
        
        audit_table.put_item(Item=audit_record)
        logger.info(f"Stored trust score for {media_id}: {trust_score_result['compositeScore']}")
        
    except Exception as e:
        logger.error(f"Error storing trust score: {str(e)}")
        raise

def calculate_chain_of_custody_score(chain_of_custody: List[Dict[str, Any]]) -> float:
    """Calculate score based on chain of custody integrity."""
    try:
        if not chain_of_custody:
            return 0.0
        
        base_score = 5.0  # Base bonus for having chain of custody
        
        # Score based on chain length and integrity
        chain_length = len(chain_of_custody)
        if chain_length >= 3:
            base_score += 10.0
        elif chain_length >= 2:
            base_score += 5.0
        
        # Check for integrity indicators
        integrity_indicators = 0
        for step in chain_of_custody:
            if step.get('verified'):
                integrity_indicators += 1
            if step.get('cryptographicProof'):
                integrity_indicators += 1
            if step.get('timestamp'):
                integrity_indicators += 1
        
        integrity_score = min(integrity_indicators * 2, 15)  # Cap at 15 points
        
        return base_score + integrity_score
        
    except Exception as e:
        logger.error(f"Error calculating chain of custody score: {str(e)}")
        return 0.0

def calculate_upload_timing_score(upload_timestamp: str) -> float:
    """Calculate score based on upload timing patterns."""
    try:
        upload_time = datetime.fromisoformat(upload_timestamp.replace('Z', '+00:00'))
        current_time = datetime.utcnow().replace(tzinfo=upload_time.tzinfo)
        
        # Check upload recency
        time_diff = (current_time - upload_time).total_seconds()
        
        # Recent uploads (within 24 hours) get slight bonus
        if time_diff < 86400:  # 24 hours
            return 2.0
        # Very old uploads (over 1 year) get slight penalty
        elif time_diff > 31536000:  # 1 year
            return -2.0
        
        # Check for suspicious timing patterns
        upload_hour = upload_time.hour
        
        # Uploads during typical business hours get slight bonus
        if 9 <= upload_hour <= 17:
            return 1.0
        # Uploads during unusual hours (2-5 AM) get slight penalty
        elif 2 <= upload_hour <= 5:
            return -1.0
        
        return 0.0
        
    except Exception as e:
        logger.error(f"Error calculating upload timing score: {str(e)}")
        return 0.0

def calculate_source_diversity_score(analysis_data: Dict[str, Any]) -> float:
    """Calculate score based on source diversity and cross-validation."""
    try:
        all_records = analysis_data.get('allRecords', [])
        
        if len(all_records) < 2:
            return 0.0
        
        # Look for multiple verification sources
        verification_sources = set()
        for record in all_records:
            event_source = record.get('eventSource', '')
            if 'verification' in event_source or 'source' in event_source:
                verification_sources.add(event_source)
        
        # Bonus for multiple verification sources
        if len(verification_sources) >= 3:
            return 8.0
        elif len(verification_sources) >= 2:
            return 5.0
        elif len(verification_sources) >= 1:
            return 2.0
        
        return 0.0
        
    except Exception as e:
        logger.error(f"Error calculating source diversity score: {str(e)}")
        return 0.0
def store_t
rust_score(media_id: str, trust_score_result: Dict[str, Any]) -> bool:
    """Store trust score in DynamoDB with versioning and historical tracking."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return False
        
        # Generate version ID and timestamps
        version_id = str(uuid.uuid4())
        current_timestamp = datetime.utcnow()
        calculation_timestamp = current_timestamp.isoformat()
        calculation_date = current_timestamp.strftime('%Y-%m-%d')
        
        # Determine score range for GSI
        composite_score = trust_score_result.get('compositeScore', 0)
        score_range = get_score_range(composite_score)
        
        # Prepare trust score record
        trust_score_record = {
            'mediaId': media_id,
            'version': version_id,
            'calculationTimestamp': calculation_timestamp,
            'calculationDate': calculation_date,
            'compositeScore': Decimal(str(composite_score)),
            'confidence': trust_score_result.get('confidence', 'unknown'),
            'scoreRange': score_range,
            'isLatest': 'true',  # Mark as latest version
            'breakdown': convert_to_decimal_dict(trust_score_result.get('breakdown', {})),
            'factors': trust_score_result.get('factors', []),
            'recommendations': trust_score_result.get('recommendations', []),
            'ttl': int((current_timestamp + timedelta(days=2555)).timestamp())  # 7 years retention
        }
        
        # Store the new trust score record
        trust_score_table.put_item(Item=trust_score_record)
        
        # Update previous versions to not be latest
        update_previous_versions_latest_flag(media_id, version_id)
        
        # Store trust score event in audit table
        store_trust_score_audit_event(media_id, trust_score_result, version_id)
        
        logger.info(f"Trust score stored successfully for {media_id}, version: {version_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error storing trust score: {str(e)}")
        return False

def get_score_range(score: float) -> str:
    """Determine score range category for GSI indexing."""
    if score >= 80:
        return 'high'
    elif score >= 60:
        return 'medium'
    elif score >= 40:
        return 'low'
    else:
        return 'very_low'

def convert_to_decimal_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert numeric values to Decimal for DynamoDB storage."""
    converted = {}
    for key, value in data.items():
        if isinstance(value, (int, float)):
            converted[key] = Decimal(str(value))
        elif isinstance(value, dict):
            converted[key] = convert_to_decimal_dict(value)
        elif isinstance(value, list):
            converted_list = []
            for item in value:
                if isinstance(item, dict):
                    converted_list.append(convert_to_decimal_dict(item))
                elif isinstance(item, (int, float)):
                    converted_list.append(Decimal(str(item)))
                else:
                    converted_list.append(item)
            converted[key] = converted_list
        else:
            converted[key] = value
    return converted

def update_previous_versions_latest_flag(media_id: str, current_version_id: str):
    """Update previous versions to mark them as not latest."""
    try:
        # Query all versions for this media
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id}
        )
        
        # Update all previous versions
        for item in response['Items']:
            if item['version'] != current_version_id and item.get('isLatest') == 'true':
                trust_score_table.update_item(
                    Key={
                        'mediaId': media_id,
                        'version': item['version']
                    },
                    UpdateExpression='SET isLatest = :false',
                    ExpressionAttributeValues={':false': 'false'}
                )
        
    except Exception as e:
        logger.error(f"Error updating previous versions: {str(e)}")

def store_trust_score_audit_event(media_id: str, trust_score_result: Dict[str, Any], version_id: str):
    """Store trust score calculation as an audit event."""
    try:
        audit_event = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'trust_score_calculation',
            'eventSource': 'trust_score_calculator',
            'data': {
                'trustScoreVersion': version_id,
                'compositeScore': trust_score_result.get('compositeScore'),
                'confidence': trust_score_result.get('confidence'),
                'breakdown': trust_score_result.get('breakdown', {}),
                'factorCount': len(trust_score_result.get('factors', [])),
                'recommendationCount': len(trust_score_result.get('recommendations', []))
            },
            'userId': 'system',
            'userAgent': 'trust-score-calculator-lambda'
        }
        
        audit_table.put_item(Item=audit_event)
        
    except Exception as e:
        logger.error(f"Error storing trust score audit event: {str(e)}")

def get_latest_trust_score(media_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve the latest trust score for a media item."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return None
        
        # Query for the latest version
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            FilterExpression='isLatest = :true',
            ExpressionAttributeValues={
                ':media_id': media_id,
                ':true': 'true'
            },
            ScanIndexForward=False,  # Sort by version descending
            Limit=1
        )
        
        if response['Items']:
            return convert_decimal_to_float(response['Items'][0])
        
        return None
        
    except Exception as e:
        logger.error(f"Error retrieving latest trust score: {str(e)}")
        return None

def get_trust_score_history(media_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve trust score history for a media item."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return []
        
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False,  # Sort by version descending (newest first)
            Limit=limit
        )
        
        return [convert_decimal_to_float(item) for item in response['Items']]
        
    except Exception as e:
        logger.error(f"Error retrieving trust score history: {str(e)}")
        return []

def get_trust_scores_by_range(score_range: str, limit: int = 50, start_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve trust scores by score range with optional date filtering."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return []
        
        # Build query parameters
        query_params = {
            'IndexName': 'ScoreRangeIndex',
            'KeyConditionExpression': 'scoreRange = :score_range',
            'ExpressionAttributeValues': {':score_range': score_range},
            'ScanIndexForward': False,  # Sort by timestamp descending
            'Limit': limit
        }
        
        # Add date filter if provided
        if start_date:
            query_params['KeyConditionExpression'] += ' AND calculationTimestamp >= :start_date'
            query_params['ExpressionAttributeValues'][':start_date'] = start_date
        
        response = trust_score_table.query(**query_params)
        
        return [convert_decimal_to_float(item) for item in response['Items']]
        
    except Exception as e:
        logger.error(f"Error retrieving trust scores by range: {str(e)}")
        return []

def get_trust_scores_by_date_range(start_date: str, end_date: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieve trust scores within a date range."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return []
        
        response = trust_score_table.query(
            IndexName='TimestampIndex',
            KeyConditionExpression='calculationDate BETWEEN :start_date AND :end_date',
            ExpressionAttributeValues={
                ':start_date': start_date,
                ':end_date': end_date
            },
            ScanIndexForward=False,
            Limit=limit
        )
        
        return [convert_decimal_to_float(item) for item in response['Items']]
        
    except Exception as e:
        logger.error(f"Error retrieving trust scores by date range: {str(e)}")
        return []

def get_latest_trust_scores_by_score(min_score: float = 0, max_score: float = 100, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve latest trust scores within a score range."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return []
        
        response = trust_score_table.query(
            IndexName='LatestScoreIndex',
            KeyConditionExpression='isLatest = :true AND compositeScore BETWEEN :min_score AND :max_score',
            ExpressionAttributeValues={
                ':true': 'true',
                ':min_score': Decimal(str(min_score)),
                ':max_score': Decimal(str(max_score))
            },
            ScanIndexForward=False,  # Sort by score descending
            Limit=limit
        )
        
        return [convert_decimal_to_float(item) for item in response['Items']]
        
    except Exception as e:
        logger.error(f"Error retrieving trust scores by score range: {str(e)}")
        return []

def get_trust_score_statistics(date_range_days: int = 30) -> Dict[str, Any]:
    """Get trust score statistics for the specified date range."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return {}
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=date_range_days)
        
        # Query trust scores in date range
        response = trust_score_table.query(
            IndexName='TimestampIndex',
            KeyConditionExpression='calculationDate BETWEEN :start_date AND :end_date',
            FilterExpression='isLatest = :true',
            ExpressionAttributeValues={
                ':start_date': start_date.strftime('%Y-%m-%d'),
                ':end_date': end_date.strftime('%Y-%m-%d'),
                ':true': 'true'
            }
        )
        
        if not response['Items']:
            return {
                'totalScores': 0,
                'averageScore': 0,
                'scoreDistribution': {'high': 0, 'medium': 0, 'low': 0, 'very_low': 0},
                'dateRange': {'start': start_date.isoformat(), 'end': end_date.isoformat()}
            }
        
        # Calculate statistics
        scores = [float(item['compositeScore']) for item in response['Items']]
        
        # Score distribution
        distribution = {'high': 0, 'medium': 0, 'low': 0, 'very_low': 0}
        for score in scores:
            range_category = get_score_range(score)
            distribution[range_category] += 1
        
        return {
            'totalScores': len(scores),
            'averageScore': round(statistics.mean(scores), 2),
            'medianScore': round(statistics.median(scores), 2),
            'minScore': min(scores),
            'maxScore': max(scores),
            'standardDeviation': round(statistics.stdev(scores) if len(scores) > 1 else 0, 2),
            'scoreDistribution': distribution,
            'dateRange': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat(),
                'days': date_range_days
            }
        }
        
    except Exception as e:
        logger.error(f"Error calculating trust score statistics: {str(e)}")
        return {}

def convert_decimal_to_float(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Decimal values back to float for JSON serialization."""
    converted = {}
    for key, value in data.items():
        if isinstance(value, Decimal):
            converted[key] = float(value)
        elif isinstance(value, dict):
            converted[key] = convert_decimal_to_float(value)
        elif isinstance(value, list):
            converted_list = []
            for item in value:
                if isinstance(item, dict):
                    converted_list.append(convert_decimal_to_float(item))
                elif isinstance(item, Decimal):
                    converted_list.append(float(item))
                else:
                    converted_list.append(item)
            converted[key] = converted_list
        else:
            converted[key] = value
    return converted

def delete_trust_score_versions(media_id: str, keep_latest: int = 5) -> bool:
    """Delete old trust score versions, keeping only the specified number of latest versions."""
    try:
        if not trust_score_table:
            logger.error("Trust score table not configured")
            return False
        
        # Get all versions for this media
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False  # Sort by version descending
        )
        
        versions = response['Items']
        
        # Keep only the specified number of latest versions
        if len(versions) > keep_latest:
            versions_to_delete = versions[keep_latest:]
            
            # Delete old versions
            with trust_score_table.batch_writer() as batch:
                for version in versions_to_delete:
                    batch.delete_item(
                        Key={
                            'mediaId': media_id,
                            'version': version['version']
                        }
                    )
            
            logger.info(f"Deleted {len(versions_to_delete)} old trust score versions for {media_id}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error deleting trust score versions: {str(e)}")
        return False

# Add new handler for trust score retrieval API calls
def handle_trust_score_retrieval(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle trust score retrieval API calls."""
    try:
        http_method = event.get('httpMethod', 'GET')
        path_parameters = event.get('pathParameters', {})
        query_parameters = event.get('queryStringParameters', {}) or {}
        
        media_id = path_parameters.get('mediaId')
        
        if http_method == 'GET' and media_id:
            # Get specific media trust score
            if query_parameters.get('history') == 'true':
                # Get trust score history
                limit = int(query_parameters.get('limit', 10))
                history = get_trust_score_history(media_id, limit)
                
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'mediaId': media_id,
                        'history': history,
                        'count': len(history)
                    })
                }
            else:
                # Get latest trust score
                latest_score = get_latest_trust_score(media_id)
                
                if latest_score:
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'mediaId': media_id,
                            'trustScore': latest_score
                        })
                    }
                else:
                    return {
                        'statusCode': 404,
                        'body': json.dumps({
                            'error': 'Trust score not found for media'
                        })
                    }
        
        elif http_method == 'GET' and not media_id:
            # Get trust scores by filters
            score_range = query_parameters.get('scoreRange')
            start_date = query_parameters.get('startDate')
            end_date = query_parameters.get('endDate')
            min_score = float(query_parameters.get('minScore', 0))
            max_score = float(query_parameters.get('maxScore', 100))
            limit = int(query_parameters.get('limit', 50))
            
            if query_parameters.get('statistics') == 'true':
                # Get statistics
                days = int(query_parameters.get('days', 30))
                stats = get_trust_score_statistics(days)
                
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'statistics': stats
                    })
                }
            
            elif score_range:
                # Get by score range
                scores = get_trust_scores_by_range(score_range, limit, start_date)
                
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'scoreRange': score_range,
                        'trustScores': scores,
                        'count': len(scores)
                    })
                }
            
            elif start_date and end_date:
                # Get by date range
                scores = get_trust_scores_by_date_range(start_date, end_date, limit)
                
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'dateRange': {'start': start_date, 'end': end_date},
                        'trustScores': scores,
                        'count': len(scores)
                    })
                }
            
            else:
                # Get by score range
                scores = get_latest_trust_scores_by_score(min_score, max_score, limit)
                
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'scoreRange': {'min': min_score, 'max': max_score},
                        'trustScores': scores,
                        'count': len(scores)
                    })
                }
        
        else:
            return {
                'statusCode': 405,
                'body': json.dumps({
                    'error': 'Method not allowed'
                })
            }
        
    except Exception as e:
        logger.error(f"Error handling trust score retrieval: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Trust score retrieval failed',
                'message': str(e)
            })
        }