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
eventbridge_client = boto3.client('events')

# Environment variables
REVIEW_QUEUE_TABLE_NAME = os.environ['REVIEW_QUEUE_TABLE_NAME']
MODERATOR_PROFILE_TABLE_NAME = os.environ['MODERATOR_PROFILE_TABLE_NAME']
REVIEW_DECISION_TABLE_NAME = os.environ['REVIEW_DECISION_TABLE_NAME']
MODERATOR_ALERTS_TOPIC_ARN = os.environ['MODERATOR_ALERTS_TOPIC_ARN']
NOTIFICATION_HANDLER_FUNCTION_NAME = os.environ.get('NOTIFICATION_HANDLER_FUNCTION_NAME')

# DynamoDB tables
review_queue_table = dynamodb.Table(REVIEW_QUEUE_TABLE_NAME)
moderator_profile_table = dynamodb.Table(MODERATOR_PROFILE_TABLE_NAME)
review_decision_table = dynamodb.Table(REVIEW_DECISION_TABLE_NAME)

class ReviewStatus(Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ESCALATED = "escalated"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

class ReviewPriority(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"

class ModeratorRole(Enum):
    JUNIOR = "junior"
    SENIOR = "senior"
    LEAD = "lead"

def handler(event, context):
    """
    Lambda function for review assignment and lifecycle management.
    Handles automated state transitions, timeouts, and escalations.
    """
    try:
        logger.info(f"Processing review lifecycle management event: {json.dumps(event)}")
        
        # Determine event type and process accordingly
        if 'source' in event and event['source'] == 'aws.events':
            # EventBridge scheduled event
            return handle_scheduled_event(event, context)
        elif 'Records' in event:
            # DynamoDB stream or SQS event
            return handle_stream_event(event, context)
        elif 'action' in event:
            # Direct Lambda invocation
            return handle_direct_action(event, context)
        else:
            # Generic lifecycle event
            return handle_lifecycle_event(event, context)
            
    except Exception as e:
        logger.error(f"Error in review lifecycle management: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Review lifecycle management failed',
                'message': str(e)
            })
        }

def handle_scheduled_event(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle EventBridge scheduled events for periodic tasks."""
    try:
        detail_type = event.get('detail-type', '')
        
        if 'timeout-check' in detail_type.lower():
            return check_review_timeouts()
        elif 'reassignment-check' in detail_type.lower():
            return check_reassignment_needs()
        elif 'escalation-check' in detail_type.lower():
            return check_escalation_triggers()
        elif 'cleanup' in detail_type.lower():
            return cleanup_expired_reviews()
        else:
            logger.warning(f"Unknown scheduled event type: {detail_type}")
            return {'statusCode': 200, 'message': 'Unknown event type'}
            
    except Exception as e:
        logger.error(f"Error handling scheduled event: {str(e)}")
        raise

def handle_direct_action(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle direct Lambda invocations with specific actions."""
    try:
        action = event.get('action')
        
        if action == 'assign_review':
            return assign_review_to_moderator(event)
        elif action == 'update_review_status':
            return update_review_status(event)
        elif action == 'escalate_review':
            return escalate_review(event)
        elif action == 'reassign_review':
            return reassign_review(event)
        elif action == 'complete_review':
            return complete_review(event)
        elif action == 'cancel_review':
            return cancel_review(event)
        elif action == 'get_review_status':
            return get_review_status(event)
        elif action == 'get_moderator_workload':
            return get_moderator_workload(event)
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Unknown action: {action}'})
            }
            
    except Exception as e:
        logger.error(f"Error handling direct action: {str(e)}")
        raise

def check_review_timeouts() -> Dict[str, Any]:
    """Check for reviews that have exceeded their timeout limits."""
    try:
        logger.info("Checking for review timeouts")
        
        current_time = datetime.utcnow()
        timeout_reviews = []
        
        # Query for assigned and in-progress reviews
        for status in [ReviewStatus.ASSIGNED.value, ReviewStatus.IN_PROGRESS.value]:
            response = review_queue_table.query(
                IndexName='StatusIndex',
                KeyConditionExpression='#status = :status',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={':status': status}
            )
            
            for review in response.get('Items', []):
                if is_review_timed_out(review, current_time):
                    timeout_reviews.append(review)
        
        # Process timed out reviews
        processed_timeouts = []
        for review in timeout_reviews:
            result = handle_review_timeout(review)
            processed_timeouts.append(result)
        
        logger.info(f"Processed {len(processed_timeouts)} timed out reviews")
        
        return {
            'statusCode': 200,
            'message': f'Processed {len(processed_timeouts)} timed out reviews',
            'timeouts': processed_timeouts
        }
        
    except Exception as e:
        logger.error(f"Error checking review timeouts: {str(e)}")
        raise

def assign_review_to_moderator(event: Dict[str, Any]) -> Dict[str, Any]:
    """Assign a review to a specific moderator."""
    try:
        review_id = event.get('reviewId')
        moderator_id = event.get('moderatorId')
        
        if not review_id or not moderator_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'reviewId and moderatorId are required'})
            }
        
        # Get the review
        review_response = review_queue_table.get_item(Key={'reviewId': review_id})
        if 'Item' not in review_response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Review not found'})
            }
        
        review = review_response['Item']
        
        # Check if moderator is available
        if not is_moderator_available(moderator_id, review.get('priority', 'normal')):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Moderator is not available for assignment'})
            }
        
        # Update review with assignment
        assignment_time = datetime.utcnow().isoformat()
        timeout_time = calculate_review_timeout(review.get('priority', 'normal'))
        
        review_queue_table.update_item(
            Key={'reviewId': review_id},
            UpdateExpression="""
                SET assignedModerator = :moderator_id,
                    #status = :status,
                    assignedAt = :assigned_at,
                    timeoutAt = :timeout_at,
                    updatedAt = :updated_at
            """,
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':moderator_id': moderator_id,
                ':status': ReviewStatus.ASSIGNED.value,
                ':assigned_at': assignment_time,
                ':timeout_at': timeout_time,
                ':updated_at': assignment_time
            }
        )
        
        # Update moderator workload
        update_moderator_workload(moderator_id, 1)
        
        # Send notification
        send_assignment_notification(moderator_id, review_id, review)
        
        logger.info(f"Assigned review {review_id} to moderator {moderator_id}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Review assigned successfully',
                'reviewId': review_id,
                'moderatorId': moderator_id,
                'assignedAt': assignment_time,
                'timeoutAt': timeout_time
            })
        }
        
    except Exception as e:
        logger.error(f"Error assigning review: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

# Helper functions

def is_review_timed_out(review: Dict[str, Any], current_time: datetime) -> bool:
    """Check if a review has timed out."""
    try:
        timeout_at = review.get('timeoutAt')
        if not timeout_at:
            return False
        
        timeout_time = datetime.fromisoformat(timeout_at.replace('Z', '+00:00'))
        return current_time > timeout_time
        
    except Exception as e:
        logger.error(f"Error checking timeout: {str(e)}")
        return False

def handle_review_timeout(review: Dict[str, Any]) -> Dict[str, Any]:
    """Handle a timed out review."""
    try:
        review_id = review['reviewId']
        moderator_id = review.get('assignedModerator')
        
        logger.info(f"Handling timeout for review {review_id}")
        
        # Update review status to expired
        review_queue_table.update_item(
            Key={'reviewId': review_id},
            UpdateExpression="SET #status = :status, expiredAt = :expired_at, updatedAt = :updated_at",
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': ReviewStatus.EXPIRED.value,
                ':expired_at': datetime.utcnow().isoformat(),
                ':updated_at': datetime.utcnow().isoformat()
            }
        )
        
        # Update moderator workload
        if moderator_id:
            update_moderator_workload(moderator_id, -1)
        
        # Try to reassign if priority is high enough
        priority = review.get('priority', 'normal')
        if priority in ['critical', 'high']:
            reassign_result = reassign_review_internal(review)
            return {
                'reviewId': review_id,
                'action': 'timeout_and_reassign',
                'reassignment': reassign_result
            }
        else:
            # Send timeout notification
            send_timeout_notification(review_id, moderator_id, review)
            return {
                'reviewId': review_id,
                'action': 'timeout_expired'
            }
            
    except Exception as e:
        logger.error(f"Error handling review timeout: {str(e)}")
        return {
            'reviewId': review.get('reviewId'),
            'action': 'timeout_error',
            'error': str(e)
        }

def is_moderator_available(moderator_id: str, priority: str) -> bool:
    """Check if a moderator is available for assignment."""
    try:
        # Get moderator profile
        response = moderator_profile_table.get_item(Key={'moderatorId': moderator_id})
        if 'Item' not in response:
            return False
        
        moderator = response['Item']
        
        # Check if moderator is active
        if moderator.get('status') != 'active':
            return False
        
        # Check current workload
        current_workload = get_current_workload(moderator_id)
        max_workload = get_max_workload_for_role(moderator.get('role', 'junior'))
        
        if current_workload >= max_workload:
            return False
        
        # Check if moderator can handle this priority
        moderator_role = moderator.get('role', 'junior')
        if priority == 'critical' and moderator_role not in ['senior', 'lead']:
            return False
        
        return True
        
    except Exception as e:
        logger.error(f"Error checking moderator availability: {str(e)}")
        return False

def get_current_workload(moderator_id: str) -> int:
    """Get current workload for a moderator."""
    try:
        response = review_queue_table.query(
            IndexName='ModeratorIndex',
            KeyConditionExpression='assignedModerator = :moderator_id',
            FilterExpression='#status IN (:assigned, :in_progress)',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':moderator_id': moderator_id,
                ':assigned': ReviewStatus.ASSIGNED.value,
                ':in_progress': ReviewStatus.IN_PROGRESS.value
            }
        )
        return response['Count']
        
    except Exception as e:
        logger.error(f"Error getting current workload: {str(e)}")
        return 0

def get_max_workload_for_role(role: str) -> int:
    """Get maximum workload for a moderator role."""
    return {'junior': 3, 'senior': 5, 'lead': 7}.get(role, 3)

def calculate_review_timeout(priority: str) -> str:
    """Calculate timeout deadline for a review based on priority."""
    timeout_hours = {'critical': 2, 'high': 4, 'normal': 8, 'low': 24}.get(priority, 8)
    timeout_time = datetime.utcnow() + timedelta(hours=timeout_hours)
    return timeout_time.isoformat()

def update_moderator_workload(moderator_id: str, change: int):
    """Update moderator workload count."""
    try:
        moderator_profile_table.update_item(
            Key={'moderatorId': moderator_id},
            UpdateExpression="ADD statistics.currentWorkload :change SET lastActive = :last_active",
            ExpressionAttributeValues={
                ':change': change,
                ':last_active': datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Error updating moderator workload: {str(e)}")

def send_assignment_notification(moderator_id: str, review_id: str, review: Dict[str, Any]):
    """Send assignment notification to moderator."""
    try:
        message = {
            'notification_type': 'REVIEW_ASSIGNED',
            'moderator_id': moderator_id,
            'review_id': review_id,
            'priority': review.get('priority', 'normal'),
            'media_id': review.get('mediaId'),
            'assigned_at': datetime.utcnow().isoformat()
        }
        
        sns_client.publish(
            TopicArn=MODERATOR_ALERTS_TOPIC_ARN,
            Subject=f'New Review Assignment - {review_id}',
            Message=json.dumps(message),
            MessageAttributes={
                'notification_type': {'DataType': 'String', 'StringValue': 'REVIEW_ASSIGNED'},
                'moderator_id': {'DataType': 'String', 'StringValue': moderator_id},
                'priority': {'DataType': 'String', 'StringValue': review.get('priority', 'normal')}
            }
        )
        
    except Exception as e:
        logger.error(f"Error sending assignment notification: {str(e)}")

def send_timeout_notification(review_id: str, moderator_id: str, review: Dict[str, Any]):
    """Send timeout notification."""
    try:
        message = {
            'notification_type': 'REVIEW_TIMEOUT',
            'moderator_id': moderator_id,
            'review_id': review_id,
            'media_id': review.get('mediaId'),
            'timed_out_at': datetime.utcnow().isoformat()
        }
        
        sns_client.publish(
            TopicArn=MODERATOR_ALERTS_TOPIC_ARN,
            Subject=f'Review Timeout - {review_id}',
            Message=json.dumps(message),
            MessageAttributes={
                'notification_type': {'DataType': 'String', 'StringValue': 'REVIEW_TIMEOUT'},
                'moderator_id': {'DataType': 'String', 'StringValue': moderator_id or 'system'},
                'priority': {'DataType': 'String', 'StringValue': review.get('priority', 'normal')}
            }
        )
        
    except Exception as e:
        logger.error(f"Error sending timeout notification: {str(e)}")

# Placeholder functions for remaining functionality
def handle_stream_event(event, context):
    """Handle DynamoDB stream events."""
    return {'statusCode': 200, 'message': 'Stream event processed'}

def handle_lifecycle_event(event, context):
    """Handle generic lifecycle events."""
    return {'statusCode': 200, 'message': 'Lifecycle event processed'}

def check_reassignment_needs():
    """Check for reassignment needs."""
    return {'statusCode': 200, 'message': 'Reassignment check completed'}

def check_escalation_triggers():
    """Check for escalation triggers."""
    return {'statusCode': 200, 'message': 'Escalation check completed'}

def cleanup_expired_reviews():
    """Clean up expired reviews."""
    return {'statusCode': 200, 'message': 'Cleanup completed'}

def reassign_review_internal(review):
    """Internal reassignment logic."""
    return {'action': 'reassigned', 'reviewId': review.get('reviewId')}

def update_review_status(event):
    """Update review status."""
    return {'statusCode': 200, 'message': 'Status updated'}

def escalate_review(event):
    """Escalate review."""
    return {'statusCode': 200, 'message': 'Review escalated'}

def reassign_review(event):
    """Reassign review."""
    return {'statusCode': 200, 'message': 'Review reassigned'}

def complete_review(event):
    """Complete review."""
    return {'statusCode': 200, 'message': 'Review completed'}

def cancel_review(event):
    """Cancel review."""
    return {'statusCode': 200, 'message': 'Review cancelled'}

def get_review_status(event):
    """Get review status."""
    return {'statusCode': 200, 'message': 'Status retrieved'}

def get_moderator_workload(event):
    """Get moderator workload."""
    return {'statusCode': 200, 'message': 'Workload retrieved'}

def decimal_to_float(obj):
    """Convert Decimal objects to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")