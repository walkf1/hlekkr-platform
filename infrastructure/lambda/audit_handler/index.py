import json
import boto3
import os
import hashlib
from datetime import datetime
from typing import Dict, Any, List
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']

# DynamoDB table
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

def handler(event, context):
    """
    Lambda function to handle media analysis audit events.
    Maintains immutable audit trail for all media processing activities.
    """
    try:
        logger.info(f"Processing audit event: {json.dumps(event)}")
        
        # Determine event type and process accordingly
        if 'Records' in event:
            # S3 event
            return process_s3_audit_event(event)
        elif 'mediaId' in event:
            # Direct API call
            return process_direct_audit_event(event)
        else:
            # Generic audit event
            return process_generic_audit_event(event)
            
    except Exception as e:
        logger.error(f"Error processing audit event: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Audit processing failed',
                'message': str(e)
            })
        }

def process_s3_audit_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process S3-triggered audit events."""
    processed_records = []
    
    for record in event.get('Records', []):
        try:
            if record.get('eventSource') == 'aws:s3':
                audit_record = create_s3_audit_record(record)
                store_audit_record(audit_record)
                processed_records.append(audit_record['auditId'])
                
        except Exception as e:
            logger.error(f"Error processing S3 audit record: {str(e)}")
            continue
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'S3 audit events processed successfully',
            'processedRecords': len(processed_records),
            'auditIds': processed_records
        })
    }

def process_direct_audit_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process direct API audit events."""
    try:
        audit_record = create_direct_audit_record(event)
        store_audit_record(audit_record)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Direct audit event processed successfully',
                'auditId': audit_record['auditId']
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing direct audit event: {str(e)}")
        raise

def process_generic_audit_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Process generic audit events."""
    try:
        audit_record = create_generic_audit_record(event)
        store_audit_record(audit_record)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Generic audit event processed successfully',
                'auditId': audit_record['auditId']
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing generic audit event: {str(e)}")
        raise

def create_s3_audit_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Create audit record from S3 event."""
    s3_info = record['s3']
    bucket_name = s3_info['bucket']['name']
    object_key = s3_info['object']['key']
    
    # Generate media ID from object key
    media_id = generate_media_id_from_key(object_key)
    
    audit_record = {
        'mediaId': media_id,
        'timestamp': datetime.utcnow().isoformat(),
        'auditId': generate_audit_id(),
        'eventType': 'media_upload',
        'eventSource': 'aws:s3',
        'eventName': record.get('eventName', 'unknown'),
        'data': {
            'bucket': bucket_name,
            'objectKey': object_key,
            'objectSize': s3_info['object'].get('size', 0),
            'objectETag': s3_info['object'].get('eTag', ''),
            'sourceIPAddress': record.get('requestParameters', {}).get('sourceIPAddress'),
            'userAgent': record.get('requestParameters', {}).get('userAgent')
        },
        'integrity': {
            'previousHash': get_previous_hash(media_id),
            'currentHash': None  # Will be calculated after record creation
        }
    }
    
    # Calculate current hash
    audit_record['integrity']['currentHash'] = calculate_record_hash(audit_record)
    
    return audit_record

def create_direct_audit_record(event: Dict[str, Any]) -> Dict[str, Any]:
    """Create audit record from direct API call."""
    media_id = event['mediaId']
    
    audit_record = {
        'mediaId': media_id,
        'timestamp': datetime.utcnow().isoformat(),
        'auditId': generate_audit_id(),
        'eventType': event.get('eventType', 'api_call'),
        'eventSource': 'hlekkr:api',
        'eventName': event.get('eventName', 'unknown'),
        'userId': event.get('userId'),
        'data': event.get('data', {}),
        'integrity': {
            'previousHash': get_previous_hash(media_id),
            'currentHash': None
        }
    }
    
    # Calculate current hash
    audit_record['integrity']['currentHash'] = calculate_record_hash(audit_record)
    
    return audit_record

def create_generic_audit_record(event: Dict[str, Any]) -> Dict[str, Any]:
    """Create audit record from generic event."""
    audit_record = {
        'mediaId': event.get('mediaId', 'system'),
        'timestamp': datetime.utcnow().isoformat(),
        'auditId': generate_audit_id(),
        'eventType': event.get('eventType', 'system_event'),
        'eventSource': 'hlekkr:system',
        'eventName': event.get('eventName', 'unknown'),
        'data': event.get('data', {}),
        'integrity': {
            'previousHash': get_previous_hash(event.get('mediaId', 'system')),
            'currentHash': None
        }
    }
    
    # Calculate current hash
    audit_record['integrity']['currentHash'] = calculate_record_hash(audit_record)
    
    return audit_record

def generate_media_id_from_key(object_key: str) -> str:
    """Generate media ID from S3 object key."""
    # Extract filename and create consistent ID
    filename = object_key.split('/')[-1]
    base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
    
    # Use hash of full path for consistency
    path_hash = hashlib.md5(object_key.encode()).hexdigest()[:8]
    return f"{base_name}_{path_hash}"

def generate_audit_id() -> str:
    """Generate unique audit ID."""
    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    random_hash = hashlib.md5(str(datetime.utcnow().microsecond).encode()).hexdigest()[:8]
    return f"audit_{timestamp}_{random_hash}"

def get_previous_hash(media_id: str) -> str:
    """Get the hash of the previous audit record for this media."""
    try:
        # Query for the most recent audit record for this media
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False,  # Sort in descending order
            Limit=1
        )
        
        if response['Items']:
            return response['Items'][0]['integrity']['currentHash']
        else:
            # First record for this media
            return 'genesis'
            
    except Exception as e:
        logger.warning(f"Could not retrieve previous hash: {str(e)}")
        return 'unknown'

def calculate_record_hash(record: Dict[str, Any]) -> str:
    """Calculate SHA-256 hash of the audit record."""
    # Create a copy without the currentHash field
    record_copy = record.copy()
    if 'integrity' in record_copy and 'currentHash' in record_copy['integrity']:
        record_copy['integrity'] = record_copy['integrity'].copy()
        del record_copy['integrity']['currentHash']
    
    # Convert to JSON string with sorted keys for consistency
    record_json = json.dumps(record_copy, sort_keys=True, separators=(',', ':'))
    
    # Calculate SHA-256 hash
    return hashlib.sha256(record_json.encode()).hexdigest()

def store_audit_record(audit_record: Dict[str, Any]):
    """Store audit record in DynamoDB."""
    try:
        audit_table.put_item(Item=audit_record)
        logger.info(f"Stored audit record: {audit_record['auditId']}")
        
    except Exception as e:
        logger.error(f"Error storing audit record: {str(e)}")
        raise

def verify_audit_chain(media_id: str) -> Dict[str, Any]:
    """Verify the integrity of the audit chain for a media item."""
    try:
        # Get all audit records for this media
        response = audit_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=True  # Sort in ascending order
        )
        
        records = response['Items']
        verification_results = []
        
        for i, record in enumerate(records):
            # Verify hash integrity
            expected_hash = calculate_record_hash(record)
            actual_hash = record['integrity']['currentHash']
            
            hash_valid = expected_hash == actual_hash
            
            # Verify chain integrity
            if i == 0:
                # First record should have 'genesis' as previous hash
                chain_valid = record['integrity']['previousHash'] == 'genesis'
            else:
                # Subsequent records should reference previous record's hash
                previous_hash = records[i-1]['integrity']['currentHash']
                chain_valid = record['integrity']['previousHash'] == previous_hash
            
            verification_results.append({
                'auditId': record['auditId'],
                'timestamp': record['timestamp'],
                'hashValid': hash_valid,
                'chainValid': chain_valid,
                'overallValid': hash_valid and chain_valid
            })
        
        overall_valid = all(result['overallValid'] for result in verification_results)
        
        return {
            'mediaId': media_id,
            'overallValid': overall_valid,
            'totalRecords': len(records),
            'verificationResults': verification_results
        }
        
    except Exception as e:
        logger.error(f"Error verifying audit chain: {str(e)}")
        raise