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
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
lambda_client = boto3.client('lambda')
stepfunctions_client = boto3.client('stepfunctions')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']

# DynamoDB table
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

def handler(event, context):
    """
    Lambda function to trigger and orchestrate media review workflows.
    Handles media upload events and initiates the complete analysis pipeline.
    """
    try:
        logger.info(f"Processing review workflow trigger: {json.dumps(event)}")
        
        # Determine the type of trigger
        if 'Records' in event:
            # S3 event trigger
            return process_s3_trigger(event)
        elif 'mediaId' in event or ('body' in event and event.get('httpMethod') == 'POST'):
            # API Gateway trigger
            return process_api_trigger(event)
        else:
            # Direct invocation
            return process_direct_trigger(event)
            
    except Exception as e:
        logger.error(f"Error in review workflow trigger: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Review workflow trigger failed',
                'message': str(e)
            })
        }

def process_s3_trigger(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process S3 event triggers for uploaded media."""
    try:
        processed_workflows = []
        
        for record in event.get('Records', []):
            if record.get('eventSource') == 'aws:s3':
                workflow_id = trigger_media_workflow_from_s3(record)
                if workflow_id:
                    processed_workflows.append(workflow_id)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'S3 triggered workflows initiated successfully',
                'workflowIds': processed_workflows,
                'count': len(processed_workflows)
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing S3 trigger: {str(e)}")
        raise

def process_api_trigger(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process API Gateway triggers for media analysis requests."""
    try:
        # Parse request body if present
        body = {}
        if 'body' in event and event['body']:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        
        # Get media ID from path parameters or body
        media_id = None
        if 'pathParameters' in event and event['pathParameters']:
            media_id = event['pathParameters'].get('mediaId')
        elif 'mediaId' in body:
            media_id = body['mediaId']
        elif 'mediaId' in event:
            media_id = event['mediaId']
        
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing mediaId parameter'
                })
            }
        
        # Trigger workflow for specific media
        workflow_id = trigger_media_workflow_for_id(media_id, body)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Media workflow initiated successfully',
                'mediaId': media_id,
                'workflowId': workflow_id
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing API trigger: {str(e)}")
        raise

def process_direct_trigger(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process direct Lambda invocation triggers."""
    try:
        workflow_type = event.get('workflowType', 'standard')
        media_id = event.get('mediaId')
        
        if media_id:
            workflow_id = trigger_media_workflow_for_id(media_id, event)
        else:
            workflow_id = trigger_batch_workflow(event)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Direct workflow initiated successfully',
                'workflowId': workflow_id,
                'workflowType': workflow_type
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing direct trigger: {str(e)}")
        raise

def trigger_media_workflow_from_s3(record: Dict[str, Any]) -> str:
    """Trigger media analysis workflow from S3 event."""
    try:
        # Extract S3 event details
        s3_info = record['s3']
        bucket_name = s3_info['bucket']['name']
        object_key = s3_info['object']['key']
        event_name = record.get('eventName', 'unknown')
        
        logger.info(f"Triggering workflow for S3 object: {object_key}")
        
        # Generate media ID
        media_id = generate_media_id_from_key(object_key)
        
        # Create workflow execution record
        workflow_id = str(uuid.uuid4())
        
        # Store initial workflow state
        workflow_record = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'workflow_initiated',
            'eventSource': 'hlekkr:review_workflow_trigger',
            'data': {
                'workflowId': workflow_id,
                'trigger': 's3_event',
                'triggerDetails': {
                    'bucket': bucket_name,
                    'objectKey': object_key,
                    'eventName': event_name
                },
                'workflowSteps': [
                    'metadata_extraction',
                    'deepfake_detection',
                    'trust_score_calculation',
                    'workflow_completion'
                ],
                'currentStep': 'metadata_extraction',
                'status': 'initiated'
            }
        }
        
        audit_table.put_item(Item=workflow_record)
        
        # Start the workflow execution
        execute_workflow_steps(workflow_id, media_id, {
            'bucket': bucket_name,
            'objectKey': object_key,
            'trigger': 's3_event'
        })
        
        logger.info(f"Workflow {workflow_id} initiated for media {media_id}")
        
        return workflow_id
        
    except Exception as e:
        logger.error(f"Error triggering S3 workflow: {str(e)}")
        return None

def trigger_media_workflow_for_id(media_id: str, additional_data: Dict[str, Any] = None) -> str:
    """Trigger media analysis workflow for specific media ID."""
    try:
        logger.info(f"Triggering workflow for media ID: {media_id}")
        
        # Generate workflow ID
        workflow_id = str(uuid.uuid4())
        
        # Get media information
        media_info = get_media_info(media_id)
        
        if not media_info:
            raise ValueError(f"Media not found: {media_id}")
        
        # Create workflow execution record
        workflow_record = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'workflow_initiated',
            'eventSource': 'hlekkr:review_workflow_trigger',
            'data': {
                'workflowId': workflow_id,
                'trigger': 'api_request',
                'triggerDetails': additional_data or {},
                'workflowSteps': [
                    'deepfake_detection',
                    'trust_score_calculation',
                    'workflow_completion'
                ],
                'currentStep': 'deepfake_detection',
                'status': 'initiated'
            }
        }
        
        audit_table.put_item(Item=workflow_record)
        
        # Start the workflow execution
        execute_workflow_steps(workflow_id, media_id, {
            'trigger': 'api_request',
            'mediaInfo': media_info
        })
        
        logger.info(f"Workflow {workflow_id} initiated for media {media_id}")
        
        return workflow_id
        
    except Exception as e:
        logger.error(f"Error triggering media workflow: {str(e)}")
        raise

def trigger_batch_workflow(event: Dict[str, Any]) -> str:
    """Trigger batch processing workflow."""
    try:
        logger.info("Triggering batch workflow")
        
        workflow_id = str(uuid.uuid4())
        batch_size = event.get('batchSize', 10)
        
        # Create batch workflow record
        workflow_record = {
            'mediaId': 'batch_processing',
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'batch_workflow_initiated',
            'eventSource': 'hlekkr:review_workflow_trigger',
            'data': {
                'workflowId': workflow_id,
                'trigger': 'batch_request',
                'batchSize': batch_size,
                'status': 'initiated'
            }
        }
        
        audit_table.put_item(Item=workflow_record)
        
        # Execute batch processing
        execute_batch_processing(workflow_id, batch_size)
        
        return workflow_id
        
    except Exception as e:
        logger.error(f"Error triggering batch workflow: {str(e)}")
        raise

def execute_workflow_steps(workflow_id: str, media_id: str, context: Dict[str, Any]):
    """Execute the media analysis workflow steps."""
    try:
        logger.info(f"Executing workflow steps for {workflow_id}")
        
        # Step 1: Deepfake Detection (if not already done)
        invoke_lambda_async('hlekkr-deepfake-detector', {
            'mediaId': media_id,
            'workflowId': workflow_id,
            'context': context
        })
        
        # Step 2: Trust Score Calculation (will be triggered after deepfake detection)
        # This could be done via Step Functions or Lambda chaining
        
        logger.info(f"Workflow steps initiated for {workflow_id}")
        
    except Exception as e:
        logger.error(f"Error executing workflow steps: {str(e)}")
        raise

def execute_batch_processing(workflow_id: str, batch_size: int):
    """Execute batch processing workflow."""
    try:
        logger.info(f"Executing batch processing for workflow {workflow_id}")
        
        # Get pending media items for processing
        pending_media = get_pending_media_items(batch_size)
        
        for media_item in pending_media:
            media_id = media_item['mediaId']
            
            # Trigger individual workflow for each media item
            invoke_lambda_async('hlekkr-review-workflow-trigger', {
                'mediaId': media_id,
                'workflowId': workflow_id,
                'batchProcessing': True
            })
        
        # Update batch workflow status
        update_workflow_status(workflow_id, 'batch_processing', {
            'processedItems': len(pending_media),
            'status': 'processing'
        })
        
    except Exception as e:
        logger.error(f"Error executing batch processing: {str(e)}")
        raise

def get_media_info(media_id: str) -> Dict[str, Any]:
    """Get media information from audit table."""
    try:
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            FilterExpression='eventType = :event_type',
            ExpressionAttributeValues={
                ':media_id': media_id,
                ':event_type': 'metadata_extraction'
            },
            ScanIndexForward=False,
            Limit=1
        )
        
        if response['Items']:
            return response['Items'][0]
        else:
            return None
            
    except Exception as e:
        logger.error(f"Error getting media info: {str(e)}")
        return None

def get_pending_media_items(limit: int) -> List[Dict[str, Any]]:
    """Get media items pending analysis."""
    try:
        # Query for media items that need processing
        response = audit_table.scan(
            FilterExpression='eventType = :event_type',
            ExpressionAttributeValues={
                ':event_type': 'metadata_extraction'
            },
            Limit=limit
        )
        
        return response.get('Items', [])
        
    except Exception as e:
        logger.error(f"Error getting pending media items: {str(e)}")
        return []

def invoke_lambda_async(function_name: str, payload: Dict[str, Any]):
    """Invoke Lambda function asynchronously."""
    try:
        # Get full function name with account and region
        full_function_name = f"{function_name}-{os.environ.get('AWS_ACCOUNT_ID', 'unknown')}-{os.environ.get('AWS_REGION', 'us-east-1')}"
        
        response = lambda_client.invoke(
            FunctionName=full_function_name,
            InvocationType='Event',  # Async invocation
            Payload=json.dumps(payload)
        )
        
        logger.info(f"Invoked {function_name} asynchronously")
        
    except Exception as e:
        logger.error(f"Error invoking Lambda {function_name}: {str(e)}")
        # Don't raise - continue with workflow

def update_workflow_status(workflow_id: str, step: str, data: Dict[str, Any]):
    """Update workflow status in audit table."""
    try:
        # Find the workflow record and update it
        # This is a simplified implementation - in production you might use a separate workflow table
        
        workflow_record = {
            'mediaId': data.get('mediaId', 'workflow_update'),
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'workflow_status_update',
            'eventSource': 'hlekkr:review_workflow_trigger',
            'data': {
                'workflowId': workflow_id,
                'currentStep': step,
                'updateData': data
            }
        }
        
        audit_table.put_item(Item=workflow_record)
        
    except Exception as e:
        logger.error(f"Error updating workflow status: {str(e)}")

def generate_media_id_from_key(object_key: str) -> str:
    """Generate consistent media ID from S3 object key."""
    import hashlib
    
    filename = object_key.split('/')[-1]
    base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
    
    # Use hash of full path for consistency
    path_hash = hashlib.md5(object_key.encode()).hexdigest()[:8]
    return f"{base_name}_{path_hash}"