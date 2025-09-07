import json
import boto3
import os
import uuid
from datetime import datetime
from typing import Dict, Any
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
stepfunctions_client = boto3.client('stepfunctions')
sqs_client = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']
STATE_MACHINE_ARN = os.environ['STATE_MACHINE_ARN']
PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']
DLQ_URL = os.environ['DLQ_URL']

# DynamoDB table
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

def handler(event, context):
    """
    Workflow orchestrator Lambda function.
    Triggered by S3 events and orchestrates the media processing workflow using Step Functions.
    """
    try:
        logger.info(f"Processing event: {json.dumps(event)}")
        
        # Process each record in the event
        results = []
        for record in event.get('Records', []):
            if record.get('eventSource') == 'aws:s3':
                result = process_s3_event(record)
                results.append(result)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Workflow orchestration completed',
                'processedRecords': len(results),
                'results': results
            })
        }
        
    except Exception as e:
        logger.error(f"Error in workflow orchestration: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Workflow orchestration failed',
                'message': str(e)
            })
        }

def process_s3_event(record: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single S3 event record and start the Step Functions workflow."""
    try:
        # Extract S3 event details
        bucket_name = record['s3']['bucket']['name']
        object_key = record['s3']['object']['key']
        event_name = record['eventName']
        object_size = record['s3']['object'].get('size', 0)
        etag = record['s3']['object'].get('eTag', '')
        
        logger.info(f"Processing {event_name} for {object_key} in {bucket_name}")
        
        # Generate media ID and execution name
        media_id = generate_media_id(object_key)
        execution_name = f"media-processing-{media_id}-{int(datetime.utcnow().timestamp())}"
        
        # Prepare input for Step Functions
        workflow_input = {
            'mediaId': media_id,
            's3Event': {
                'bucket': bucket_name,
                'key': object_key,
                'eventName': event_name,
                'size': object_size,
                'etag': etag
            },
            'processingMetadata': {
                'startTime': datetime.utcnow().isoformat(),
                'orchestratorRequestId': context.aws_request_id if 'context' in globals() else str(uuid.uuid4()),
                'retryCount': 0
            }
        }
        
        # Record workflow initiation in audit table
        record_workflow_start(media_id, object_key, workflow_input, execution_name)
        
        # Start Step Functions execution
        response = stepfunctions_client.start_execution(
            stateMachineArn=STATE_MACHINE_ARN,
            name=execution_name,
            input=json.dumps(workflow_input)
        )
        
        execution_arn = response['executionArn']
        logger.info(f"Started Step Functions execution: {execution_arn}")
        
        # Send message to processing queue for monitoring
        queue_message = {
            'mediaId': media_id,
            'executionArn': execution_arn,
            'executionName': execution_name,
            's3Location': {
                'bucket': bucket_name,
                'key': object_key
            },
            'startTime': datetime.utcnow().isoformat(),
            'status': 'started'
        }
        
        sqs_client.send_message(
            QueueUrl=PROCESSING_QUEUE_URL,
            MessageBody=json.dumps(queue_message),
            MessageAttributes={
                'mediaId': {
                    'StringValue': media_id,
                    'DataType': 'String'
                },
                'executionArn': {
                    'StringValue': execution_arn,
                    'DataType': 'String'
                }
            }
        )
        
        return {
            'mediaId': media_id,
            'executionArn': execution_arn,
            'executionName': execution_name,
            'status': 'workflow_started',
            'objectKey': object_key
        }
        
    except Exception as e:
        logger.error(f"Error processing S3 event: {str(e)}")
        
        # Send error to DLQ
        try:
            error_message = {
                'error': str(e),
                'record': record,
                'timestamp': datetime.utcnow().isoformat(),
                'errorType': 'workflow_orchestration_error'
            }
            
            sqs_client.send_message(
                QueueUrl=DLQ_URL,
                MessageBody=json.dumps(error_message)
            )
        except Exception as dlq_error:
            logger.error(f"Failed to send error to DLQ: {str(dlq_error)}")
        
        raise

def generate_media_id(object_key: str) -> str:
    """Generate a unique media ID from the object key."""
    # Remove path prefix and file extension, then add UUID for uniqueness
    filename = object_key.split('/')[-1]
    base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
    unique_id = str(uuid.uuid4())[:8]
    return f"{base_name}_{unique_id}"

def record_workflow_start(media_id: str, object_key: str, workflow_input: Dict[str, Any], execution_name: str):
    """Record workflow initiation in the audit table."""
    try:
        timestamp = datetime.utcnow().isoformat()
        
        audit_record = {
            'mediaId': media_id,
            'timestamp': timestamp,
            'eventType': 'workflow_started',
            'eventSource': 'hlekkr:workflow_orchestrator',
            'eventName': 'StepFunctionsExecutionStarted',
            'objectKey': object_key,
            'data': {
                'executionName': execution_name,
                'workflowInput': workflow_input,
                'processingStatus': 'started',
                'processingTimestamp': timestamp
            }
        }
        
        # Store in DynamoDB
        audit_table.put_item(Item=audit_record)
        
        logger.info(f"Recorded workflow start for {media_id}")
        
    except Exception as e:
        logger.error(f"Error recording workflow start: {str(e)}")
        # Don't raise here as this is not critical for workflow execution
        pass

def handle_workflow_completion(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle workflow completion notifications from Step Functions."""
    try:
        # This function can be called by Step Functions or CloudWatch Events
        # to handle workflow completion, success, or failure
        
        execution_arn = event.get('executionArn')
        status = event.get('status', 'unknown')
        media_id = event.get('mediaId')
        
        if not execution_arn or not media_id:
            logger.warning("Missing required fields in workflow completion event")
            return {'status': 'ignored', 'reason': 'missing_fields'}
        
        # Record completion in audit table
        timestamp = datetime.utcnow().isoformat()
        
        audit_record = {
            'mediaId': media_id,
            'timestamp': timestamp,
            'eventType': 'workflow_completed',
            'eventSource': 'hlekkr:workflow_orchestrator',
            'eventName': f'StepFunctionsExecution{status.title()}',
            'data': {
                'executionArn': execution_arn,
                'finalStatus': status,
                'completionTimestamp': timestamp,
                'processingStatus': 'completed' if status == 'succeeded' else 'failed'
            }
        }
        
        audit_table.put_item(Item=audit_record)
        
        logger.info(f"Recorded workflow completion for {media_id}: {status}")
        
        return {
            'status': 'recorded',
            'mediaId': media_id,
            'executionArn': execution_arn,
            'finalStatus': status
        }
        
    except Exception as e:
        logger.error(f"Error handling workflow completion: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def get_workflow_status(media_id: str) -> Dict[str, Any]:
    """Get the current status of a media processing workflow."""
    try:
        # Query audit table for workflow events
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False,  # Get most recent first
            Limit=10
        )
        
        events = response.get('Items', [])
        
        if not events:
            return {'status': 'not_found', 'mediaId': media_id}
        
        # Determine current status from events
        latest_event = events[0]
        event_type = latest_event.get('eventType')
        
        status_map = {
            'workflow_started': 'processing',
            'workflow_completed': latest_event.get('data', {}).get('finalStatus', 'unknown'),
            'metadata_extraction': 'processing',
            'security_scan': 'processing'
        }
        
        current_status = status_map.get(event_type, 'unknown')
        
        return {
            'status': current_status,
            'mediaId': media_id,
            'latestEvent': latest_event,
            'eventHistory': events
        }
        
    except Exception as e:
        logger.error(f"Error getting workflow status: {str(e)}")
        return {'status': 'error', 'error': str(e), 'mediaId': media_id}