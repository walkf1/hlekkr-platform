import json
import boto3
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import logging
from decimal import Decimal
from enum import Enum

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
sns_client = boto3.client('sns')
bedrock_client = boto3.client('bedrock-runtime')

# Environment variables
REVIEW_QUEUE_TABLE_NAME = os.environ['REVIEW_QUEUE_TABLE_NAME']
MODERATOR_PROFILE_TABLE_NAME = os.environ['MODERATOR_PROFILE_TABLE_NAME']
REVIEW_DECISION_TABLE_NAME = os.environ['REVIEW_DECISION_TABLE_NAME']
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
TRUST_SCORE_CALCULATOR_FUNCTION_NAME = os.environ.get('TRUST_SCORE_CALCULATOR_FUNCTION_NAME')
MODERATOR_ALERTS_TOPIC_ARN = os.environ['MODERATOR_ALERTS_TOPIC_ARN']

# DynamoDB tables
review_queue_table = dynamodb.Table(REVIEW_QUEUE_TABLE_NAME)
moderator_profile_table = dynamodb.Table(MODERATOR_PROFILE_TABLE_NAME)
review_decision_table = dynamodb.Table(REVIEW_DECISION_TABLE_NAME)
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

class DecisionType(Enum):
    CONFIRM = "confirm"
    OVERRIDE = "override"
    ESCALATE = "escalate"
    INCONCLUSIVE = "inconclusive"

class ConfidenceLevel(Enum):
    VERY_LOW = "very_low"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"

def handler(event, context):
    """
    Lambda function for review completion validation and processing.
    Handles decision validation, trust score updates, and quality assurance.
    """
    try:
        logger.info(f"Processing review completion validation: {json.dumps(event)}")
        
        # Determine event type and process accordingly
        if 'action' in event:
            # Direct Lambda invocation
            return handle_direct_action(event, context)
        elif 'Records' in event:
            # SNS or SQS event
            return handle_message_event(event, context)
        else:
            # Generic completion event
            return handle_completion_event(event, context)
            
    except Exception as e:
        logger.error(f"Error in review completion validation: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Review completion validation failed',
                'message': str(e)
            })
        }

def handle_direct_action(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle direct Lambda invocations with specific actions."""
    try:
        action = event.get('action')
        
        if action == 'validate_completion':
            return validate_review_completion(event)
        elif action == 'process_decision':
            return process_review_decision(event)
        elif action == 'update_trust_score':
            return update_trust_score_from_decision(event)
        elif action == 'quality_check':
            return perform_quality_assurance_check(event)
        elif action == 'feedback_loop':
            return process_ai_feedback_loop(event)
        elif action == 'consistency_check':
            return perform_consistency_check(event)
        elif action == 'get_completion_stats':
            return get_completion_statistics(event)
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Unknown action: {action}'})
            }
            
    except Exception as e:
        logger.error(f"Error handling direct action: {str(e)}")
        raise

def validate_review_completion(event: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a review completion submission."""
    try:
        review_id = event.get('reviewId')
        moderator_id = event.get('moderatorId')
        decision_data = event.get('decisionData', {})
        
        if not all([review_id, moderator_id, decision_data]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'reviewId, moderatorId, and decisionData are required'})
            }
        
        # Get the review
        review_response = review_queue_table.get_item(Key={'reviewId': review_id})
        if 'Item' not in review_response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Review not found'})
            }
        
        review = review_response['Item']
        
        # Validate review state
        if review.get('status') not in ['assigned', 'in_progress']:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Review cannot be completed in status: {review.get("status")}'})
            }
        
        # Validate moderator assignment
        if review.get('assignedModerator') != moderator_id:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Review is not assigned to this moderator'})
            }
        
        # Validate decision data structure
        validation_result = validate_decision_data(decision_data)
        if not validation_result['valid']:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Invalid decision data: {validation_result["errors"]}'})
            }
        
        # Perform consistency checks
        consistency_result = check_decision_consistency(review, decision_data)
        if not consistency_result['consistent']:
            logger.warning(f"Consistency issues found for review {review_id}: {consistency_result['warnings']}")
        
        # Process the completion
        completion_result = process_review_completion(review_id, moderator_id, decision_data, review)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Review completion validated and processed',
                'reviewId': review_id,
                'validationResult': validation_result,
                'consistencyResult': consistency_result,
                'completionResult': completion_result
            })
        }
        
    except Exception as e:
        logger.error(f"Error validating review completion: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def validate_decision_data(decision_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the structure and content of decision data."""
    try:
        errors = []
        warnings = []
        
        # Required fields
        required_fields = ['decisionType', 'confidenceLevel', 'justification']
        for field in required_fields:
            if field not in decision_data:
                errors.append(f'Missing required field: {field}')
        
        # Validate decision type
        decision_type = decision_data.get('decisionType')
        if decision_type:
            try:
                DecisionType(decision_type)
            except ValueError:
                errors.append(f'Invalid decision type: {decision_type}')
        
        # Validate confidence level
        confidence_level = decision_data.get('confidenceLevel')
        if confidence_level:
            try:
                ConfidenceLevel(confidence_level)
            except ValueError:
                errors.append(f'Invalid confidence level: {confidence_level}')
        
        # Validate justification
        justification = decision_data.get('justification', '')
        if len(justification.strip()) < 10:
            errors.append('Justification must be at least 10 characters')
        elif len(justification) > 2000:
            errors.append('Justification cannot exceed 2000 characters')
        
        # Validate trust score adjustment if present
        trust_score_adjustment = decision_data.get('trustScoreAdjustment')
        if trust_score_adjustment is not None:
            if not isinstance(trust_score_adjustment, (int, float)):
                errors.append('Trust score adjustment must be a number')
            elif not (0 <= trust_score_adjustment <= 100):
                errors.append('Trust score adjustment must be between 0 and 100')
        
        # Validate threat level if present
        threat_level = decision_data.get('threatLevel')
        if threat_level and threat_level not in ['none', 'low', 'medium', 'high', 'critical']:
            errors.append(f'Invalid threat level: {threat_level}')
        
        # Validate tags if present
        tags = decision_data.get('tags', [])
        if tags and not isinstance(tags, list):
            errors.append('Tags must be a list')
        elif len(tags) > 10:
            warnings.append('More than 10 tags may impact performance')
        
        # Validate additional evidence if present
        evidence = decision_data.get('additionalEvidence', [])
        if evidence and not isinstance(evidence, list):
            errors.append('Additional evidence must be a list')
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }
        
    except Exception as e:
        logger.error(f"Error validating decision data: {str(e)}")
        return {
            'valid': False,
            'errors': [f'Validation error: {str(e)}'],
            'warnings': []
        }

def check_decision_consistency(review: Dict[str, Any], decision_data: Dict[str, Any]) -> Dict[str, Any]:
    """Check consistency between AI analysis and human decision."""
    try:
        warnings = []
        
        # Get original AI analysis
        original_analysis = review.get('analysisResults', {})
        ai_trust_score = original_analysis.get('trustScore', 50)
        ai_confidence = original_analysis.get('confidence', 0.5)
        
        # Get human decision
        human_trust_score = decision_data.get('trustScoreAdjustment', ai_trust_score)
        decision_type = decision_data.get('decisionType')
        human_confidence = decision_data.get('confidenceLevel')
        
        # Check for significant score differences
        score_difference = abs(float(human_trust_score) - float(ai_trust_score))
        if score_difference > 30:
            warnings.append(f'Large trust score difference: AI={ai_trust_score}, Human={human_trust_score}')
        
        # Check for confidence mismatches
        if decision_type == 'confirm' and score_difference > 10:
            warnings.append('Confirmed decision with significant score adjustment')
        
        if decision_type == 'override' and score_difference < 15:
            warnings.append('Override decision with minimal score change')
        
        # Check for low confidence overrides
        if decision_type == 'override' and human_confidence in ['very_low', 'low']:
            warnings.append('Override decision with low human confidence')
        
        # Check for high AI confidence overrides
        if decision_type == 'override' and ai_confidence > 0.8:
            warnings.append('Override of high-confidence AI decision')
        
        return {
            'consistent': len(warnings) == 0,
            'warnings': warnings,
            'scoreDifference': score_difference,
            'aiTrustScore': ai_trust_score,
            'humanTrustScore': human_trust_score
        }
        
    except Exception as e:
        logger.error(f"Error checking decision consistency: {str(e)}")
        return {
            'consistent': False,
            'warnings': [f'Consistency check error: {str(e)}'],
            'scoreDifference': 0
        }

def process_review_completion(review_id: str, moderator_id: str, decision_data: Dict[str, Any], review: Dict[str, Any]) -> Dict[str, Any]:
    """Process the complete review completion workflow."""
    try:
        completion_time = datetime.utcnow().isoformat()
        
        # 1. Update review status to completed
        review_queue_table.update_item(
            Key={'reviewId': review_id},
            UpdateExpression="""
                SET #status = :status,
                    completedAt = :completed_at,
                    completedBy = :completed_by,
                    updatedAt = :updated_at
            """,
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'completed',
                ':completed_at': completion_time,
                ':completed_by': moderator_id,
                ':updated_at': completion_time
            }
        )
        
        # 2. Store decision record
        decision_record = create_decision_record(review_id, moderator_id, decision_data, review)
        review_decision_table.put_item(Item=decision_record)
        
        # 3. Update trust score if needed
        trust_score_result = None
        if decision_data.get('trustScoreAdjustment') is not None:
            trust_score_result = trigger_trust_score_update(review, decision_data)
        
        # 4. Update moderator statistics
        update_moderator_statistics(moderator_id, decision_data, review)
        
        # 5. Process AI feedback loop
        feedback_result = process_ai_feedback(review, decision_data)
        
        # 6. Process threat intelligence
        threat_intel_result = process_threat_intelligence(review, decision_data, moderator_id)
        
        # 7. Store audit record
        store_completion_audit(review_id, moderator_id, decision_data, completion_time)
        
        # 8. Send completion notifications
        send_completion_notifications(review_id, moderator_id, decision_data, review)
        
        logger.info(f"Successfully processed completion for review {review_id}")
        
        return {
            'reviewId': review_id,
            'completedAt': completion_time,
            'decisionRecordId': decision_record['decisionId'],
            'trustScoreResult': trust_score_result,
            'feedbackResult': feedback_result,
            'threatIntelResult': threat_intel_result
        }
        
    except Exception as e:
        logger.error(f"Error processing review completion: {str(e)}")
        raise

def create_decision_record(review_id: str, moderator_id: str, decision_data: Dict[str, Any], review: Dict[str, Any]) -> Dict[str, Any]:
    """Create a comprehensive decision record."""
    try:
        decision_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()
        
        # Calculate TTL (2 years from now)
        ttl = int((datetime.utcnow() + timedelta(days=730)).timestamp())
        
        decision_record = {
            'decisionId': decision_id,
            'reviewId': review_id,
            'timestamp': timestamp,
            'moderatorId': moderator_id,
            'eventType': 'review_decision',
            'eventSource': 'review_completion_validator',
            'data': {
                'decisionData': decision_data,
                'originalAnalysis': review.get('analysisResults', {}),
                'reviewMetadata': {
                    'mediaId': review.get('mediaId'),
                    'priority': review.get('priority'),
                    'createdAt': review.get('createdAt'),
                    'assignedAt': review.get('assignedAt'),
                    'completedAt': timestamp
                },
                'processingTime': calculate_processing_time(review, timestamp)
            },
            'ttl': ttl
        }
        
        return decision_record
        
    except Exception as e:
        logger.error(f"Error creating decision record: {str(e)}")
        raise

def trigger_trust_score_update(review: Dict[str, Any], decision_data: Dict[str, Any]) -> Dict[str, Any]:
    """Trigger trust score recalculation based on human decision."""
    try:
        if not TRUST_SCORE_CALCULATOR_FUNCTION_NAME:
            logger.warning("Trust score calculator function not configured")
            return {'status': 'skipped', 'reason': 'function_not_configured'}
        
        # Prepare trust score update event
        update_event = {
            'action': 'recalculate_with_human_input',
            'mediaId': review.get('mediaId'),
            'reviewId': review.get('reviewId'),
            'humanDecision': {
                'trustScoreAdjustment': decision_data.get('trustScoreAdjustment'),
                'decisionType': decision_data.get('decisionType'),
                'confidenceLevel': decision_data.get('confidenceLevel'),
                'threatLevel': decision_data.get('threatLevel'),
                'moderatorId': decision_data.get('moderatorId')
            },
            'originalAnalysis': review.get('analysisResults', {}),
            'trigger': 'human_review_completion'
        }
        
        # Invoke trust score calculator
        response = lambda_client.invoke(
            FunctionName=TRUST_SCORE_CALCULATOR_FUNCTION_NAME,
            InvocationType='Event',  # Asynchronous
            Payload=json.dumps(update_event)
        )
        
        logger.info(f"Triggered trust score update for media {review.get('mediaId')}")
        
        return {
            'status': 'triggered',
            'functionName': TRUST_SCORE_CALCULATOR_FUNCTION_NAME,
            'invocationId': response.get('ResponseMetadata', {}).get('RequestId')
        }
        
    except Exception as e:
        logger.error(f"Error triggering trust score update: {str(e)}")
        return {
            'status': 'error',
            'error': str(e)
        }

def update_moderator_statistics(moderator_id: str, decision_data: Dict[str, Any], review: Dict[str, Any]):
    """Update moderator performance statistics."""
    try:
        # Calculate review processing time
        processing_time = calculate_processing_time(review, datetime.utcnow().isoformat())
        
        # Determine if decision was accurate (placeholder logic)
        decision_accuracy = calculate_decision_accuracy(decision_data, review)
        
        # Update moderator profile statistics
        moderator_profile_table.update_item(
            Key={'moderatorId': moderator_id},
            UpdateExpression="""
                ADD statistics.totalReviews :one,
                    statistics.totalProcessingTime :processing_time
                SET statistics.lastReviewAt = :last_review,
                    statistics.averageProcessingTime = (statistics.totalProcessingTime + :processing_time) / (statistics.totalReviews + :one),
                    lastActive = :last_active
            """,
            ExpressionAttributeValues={
                ':one': 1,
                ':processing_time': Decimal(str(processing_time)),
                ':last_review': datetime.utcnow().isoformat(),
                ':last_active': datetime.utcnow().isoformat()
            }
        )
        
        # Update accuracy if we can determine it
        if decision_accuracy is not None:
            moderator_profile_table.update_item(
                Key={'moderatorId': moderator_id},
                UpdateExpression="""
                    ADD statistics.accurateDecisions :accurate
                    SET statistics.accuracyScore = statistics.accurateDecisions / statistics.totalReviews
                """,
                ExpressionAttributeValues={
                    ':accurate': 1 if decision_accuracy else 0
                }
            )
        
        logger.info(f"Updated statistics for moderator {moderator_id}")
        
    except Exception as e:
        logger.error(f"Error updating moderator statistics: {str(e)}")

def process_ai_feedback(review: Dict[str, Any], decision_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process feedback for AI model improvement."""
    try:
        # Extract feedback data
        feedback_data = {
            'mediaId': review.get('mediaId'),
            'originalPrediction': review.get('analysisResults', {}),
            'humanDecision': decision_data,
            'feedbackType': determine_feedback_type(review, decision_data),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Store feedback for model training
        feedback_record = {
            'feedbackId': str(uuid.uuid4()),
            'mediaId': review.get('mediaId'),
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'ai_feedback',
            'eventSource': 'review_completion_validator',
            'data': feedback_data,
            'ttl': int((datetime.utcnow() + timedelta(days=365)).timestamp())  # 1 year retention
        }
        
        # Store in audit table for now (could be separate feedback table)
        audit_table.put_item(Item=feedback_record)
        
        # Check if this feedback triggers model retraining
        retraining_trigger = check_retraining_trigger(feedback_data)
        
        logger.info(f"Processed AI feedback for media {review.get('mediaId')}")
        
        return {
            'feedbackId': feedback_record['feedbackId'],
            'feedbackType': feedback_data['feedbackType'],
            'retrainingTrigger': retraining_trigger
        }
        
    except Exception as e:
        logger.error(f"Error processing AI feedback: {str(e)}")
        return {
            'status': 'error',
            'error': str(e)
        }

def process_threat_intelligence(review: Dict[str, Any], decision_data: Dict[str, Any], moderator_id: str) -> Dict[str, Any]:
    """Process human review decision for threat intelligence generation."""
    try:
        # Only process confirmed deepfakes or suspicious content
        decision_type = decision_data.get('decisionType', '')
        if decision_type not in ['confirm', 'suspicious']:
            return {
                'status': 'skipped',
                'reason': f'Decision type {decision_type} does not require threat intelligence processing'
            }
        
        # Get threat intelligence processor function name from environment
        threat_intel_function_name = os.environ.get('THREAT_INTELLIGENCE_PROCESSOR_FUNCTION_NAME')
        if not threat_intel_function_name:
            logger.warning("Threat intelligence processor function name not configured")
            return {
                'status': 'skipped',
                'reason': 'Threat intelligence processor not configured'
            }
        
        # Prepare payload for threat intelligence processor
        threat_intel_payload = {
            'operation': 'process_review_decision',
            'reviewId': review.get('reviewId'),
            'mediaId': review.get('mediaId'),
            'moderatorId': moderator_id,
            'decisionData': {
                'decision': decision_type,
                'confidence': decision_data.get('confidenceLevel', 0.5),
                'findings': {
                    'manipulationTechniques': decision_data.get('manipulationTechniques', []),
                    'suspiciousPatterns': decision_data.get('suspiciousPatterns', []),
                    'novelTechnique': decision_data.get('novelTechnique', False),
                    'techniqueDetails': decision_data.get('techniqueDetails', {})
                },
                'metadata': {
                    'contentHash': review.get('analysisResults', {}).get('contentHash'),
                    'sourceDomain': review.get('analysisResults', {}).get('sourceDomain'),
                    'fileType': review.get('analysisResults', {}).get('fileType'),
                    'fileSignature': review.get('analysisResults', {}).get('fileSignature'),
                    'aiConfidence': review.get('analysisResults', {}).get('trustScore', {}).get('compositeScore', 0.0)
                }
            },
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Invoke threat intelligence processor asynchronously
        response = lambda_client.invoke(
            FunctionName=threat_intel_function_name,
            InvocationType='Event',  # Asynchronous invocation
            Payload=json.dumps(threat_intel_payload)
        )
        
        logger.info(f"Triggered threat intelligence processing for review {review.get('reviewId')}")
        
        return {
            'status': 'triggered',
            'threatIntelPayload': threat_intel_payload,
            'lambdaResponse': {
                'statusCode': response['StatusCode'],
                'requestId': response['ResponseMetadata']['RequestId']
            }
        }
        
    except Exception as e:
        logger.error(f"Error processing threat intelligence: {str(e)}")
        return {
            'status': 'error',
            'error': str(e)
        }

# Helper functions

def calculate_processing_time(review: Dict[str, Any], completion_time: str) -> float:
    """Calculate review processing time in minutes."""
    try:
        assigned_at = review.get('assignedAt')
        if not assigned_at:
            return 0.0
        
        assigned_time = datetime.fromisoformat(assigned_at.replace('Z', '+00:00'))
        completed_time = datetime.fromisoformat(completion_time.replace('Z', '+00:00'))
        
        processing_time = (completed_time - assigned_time).total_seconds() / 60
        return max(processing_time, 0.0)
        
    except Exception as e:
        logger.error(f"Error calculating processing time: {str(e)}")
        return 0.0

def calculate_decision_accuracy(decision_data: Dict[str, Any], review: Dict[str, Any]) -> Optional[bool]:
    """Calculate decision accuracy (placeholder implementation)."""
    # This would require ground truth data or consensus mechanisms
    # For now, return None to indicate accuracy cannot be determined
    return None

def determine_feedback_type(review: Dict[str, Any], decision_data: Dict[str, Any]) -> str:
    """Determine the type of feedback for AI training."""
    decision_type = decision_data.get('decisionType')
    
    if decision_type == 'confirm':
        return 'positive_confirmation'
    elif decision_type == 'override':
        return 'correction'
    elif decision_type == 'escalate':
        return 'uncertainty'
    else:
        return 'general_feedback'

def check_retraining_trigger(feedback_data: Dict[str, Any]) -> Dict[str, Any]:
    """Check if this feedback should trigger model retraining."""
    # Placeholder logic - in practice, this would check:
    # - Number of corrections since last training
    # - Pattern of feedback types
    # - Time since last training
    # - Performance degradation metrics
    
    return {
        'triggered': False,
        'reason': 'threshold_not_met',
        'nextCheck': (datetime.utcnow() + timedelta(days=7)).isoformat()
    }

def store_completion_audit(review_id: str, moderator_id: str, decision_data: Dict[str, Any], completion_time: str):
    """Store completion audit record."""
    try:
        audit_record = {
            'mediaId': f"review_{review_id}",
            'timestamp': completion_time,
            'eventType': 'review_completed',
            'eventSource': 'review_completion_validator',
            'data': {
                'reviewId': review_id,
                'moderatorId': moderator_id,
                'decisionData': decision_data,
                'completedAt': completion_time
            }
        }
        
        audit_table.put_item(Item=audit_record)
        
    except Exception as e:
        logger.error(f"Error storing completion audit: {str(e)}")

def send_completion_notifications(review_id: str, moderator_id: str, decision_data: Dict[str, Any], review: Dict[str, Any]):
    """Send completion notifications."""
    try:
        message = {
            'notification_type': 'REVIEW_COMPLETED',
            'review_id': review_id,
            'moderator_id': moderator_id,
            'decision_type': decision_data.get('decisionType'),
            'media_id': review.get('mediaId'),
            'completed_at': datetime.utcnow().isoformat()
        }
        
        sns_client.publish(
            TopicArn=MODERATOR_ALERTS_TOPIC_ARN,
            Subject=f'Review Completed - {review_id}',
            Message=json.dumps(message),
            MessageAttributes={
                'notification_type': {'DataType': 'String', 'StringValue': 'REVIEW_COMPLETED'},
                'review_id': {'DataType': 'String', 'StringValue': review_id},
                'decision_type': {'DataType': 'String', 'StringValue': decision_data.get('decisionType', 'unknown')}
            }
        )
        
    except Exception as e:
        logger.error(f"Error sending completion notifications: {str(e)}")

# Placeholder functions for remaining actions
def handle_message_event(event, context):
    """Handle SNS/SQS message events."""
    return {'statusCode': 200, 'message': 'Message event processed'}

def handle_completion_event(event, context):
    """Handle generic completion events."""
    return {'statusCode': 200, 'message': 'Completion event processed'}

def process_review_decision(event):
    """Process review decision."""
    return {'statusCode': 200, 'message': 'Decision processed'}

def update_trust_score_from_decision(event):
    """Update trust score from decision."""
    return {'statusCode': 200, 'message': 'Trust score updated'}

def perform_quality_assurance_check(event):
    """Perform quality assurance check."""
    return {'statusCode': 200, 'message': 'Quality check completed'}

def process_ai_feedback_loop(event):
    """Process AI feedback loop."""
    return {'statusCode': 200, 'message': 'Feedback loop processed'}

def perform_consistency_check(event):
    """Perform consistency check."""
    return {'statusCode': 200, 'message': 'Consistency check completed'}

def get_completion_statistics(event):
    """Get completion statistics."""
    return {'statusCode': 200, 'message': 'Statistics retrieved'}

def decimal_to_float(obj):
    """Convert Decimal objects to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")