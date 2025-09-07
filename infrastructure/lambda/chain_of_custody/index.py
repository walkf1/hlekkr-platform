import json
import boto3
import os
import hashlib
import hmac
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import logging
from dataclasses import dataclass, asdict
from enum import Enum
import uuid

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
kms_client = boto3.client('kms')
ssm_client = boto3.client('ssm')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
CHAIN_OF_CUSTODY_TABLE_NAME = os.environ.get('CHAIN_OF_CUSTODY_TABLE_NAME', '')
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']
KMS_KEY_ID = os.environ.get('KMS_KEY_ID', '')

# DynamoDB tables
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)
chain_of_custody_table = dynamodb.Table(CHAIN_OF_CUSTODY_TABLE_NAME) if CHAIN_OF_CUSTODY_TABLE_NAME else None

class ProcessingStage(Enum):
    """Enumeration of processing stages in the media pipeline."""
    UPLOAD = "upload"
    SECURITY_SCAN = "security_scan"
    METADATA_EXTRACTION = "metadata_extraction"
    SOURCE_VERIFICATION = "source_verification"
    DEEPFAKE_ANALYSIS = "deepfake_analysis"
    TRUST_SCORE_CALCULATION = "trust_score_calculation"
    HUMAN_REVIEW = "human_review"
    FINAL_VERIFICATION = "final_verification"

class IntegrityStatus(Enum):
    """Enumeration of integrity verification statuses."""
    VERIFIED = "verified"
    COMPROMISED = "compromised"
    UNKNOWN = "unknown"
    PENDING = "pending"

@dataclass
class CustodyEvent:
    """Data class representing a chain of custody event."""
    event_id: str
    media_id: str
    stage: ProcessingStage
    timestamp: str
    actor: str  # system component or user
    action: str
    input_hash: Optional[str]
    output_hash: Optional[str]
    transformation_details: Dict[str, Any]
    integrity_proof: str
    previous_event_hash: Optional[str]
    metadata: Dict[str, Any]

@dataclass
class IntegrityProof:
    """Data class for cryptographic integrity proof."""
    content_hash: str
    signature: str
    timestamp: str
    key_id: str
    algorithm: str
    verification_status: IntegrityStatus

def handler(event, context):
    """
    Lambda function to manage chain of custody tracking for media processing.
    Records all processing steps with cryptographic integrity proofs.
    """
    try:
        logger.info(f"Processing chain of custody event: {json.dumps(event)}")
        
        # Determine operation type
        operation = event.get('operation', 'record_event')
        
        if operation == 'record_event':
            return record_custody_event(event)
        elif operation == 'get_chain':
            return get_custody_chain(event)
        elif operation == 'verify_integrity':
            return verify_chain_integrity(event)
        elif operation == 'get_provenance':
            return get_media_provenance(event)
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Invalid operation',
                    'supported_operations': ['record_event', 'get_chain', 'verify_integrity', 'get_provenance']
                })
            }
        
    except Exception as e:
        logger.error(f"Error in chain of custody processing: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Chain of custody processing failed',
                'message': str(e)
            })
        }

def record_custody_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Record a new chain of custody event with cryptographic integrity proof."""
    try:
        # Extract event data
        media_id = event.get('mediaId')
        stage = event.get('stage')
        actor = event.get('actor', 'system')
        action = event.get('action')
        transformation_details = event.get('transformationDetails', {})
        metadata = event.get('metadata', {})
        
        if not all([media_id, stage, action]):
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing required fields: mediaId, stage, action'
                })
            }
        
        # Get previous event hash for chain linking
        previous_event_hash = get_latest_event_hash(media_id)
        
        # Calculate content hashes
        input_hash = calculate_content_hash(event.get('inputContent'))
        output_hash = calculate_content_hash(event.get('outputContent'))
        
        # Create custody event
        custody_event = CustodyEvent(
            event_id=str(uuid.uuid4()),
            media_id=media_id,
            stage=ProcessingStage(stage),
            timestamp=datetime.utcnow().isoformat(),
            actor=actor,
            action=action,
            input_hash=input_hash,
            output_hash=output_hash,
            transformation_details=transformation_details,
            integrity_proof="",  # Will be calculated below
            previous_event_hash=previous_event_hash,
            metadata=metadata
        )
        
        # Generate cryptographic integrity proof
        integrity_proof = generate_integrity_proof(custody_event)
        custody_event.integrity_proof = integrity_proof.signature
        
        # Store custody event
        storage_success = store_custody_event(custody_event, integrity_proof)
        
        # Create audit trail entry
        create_custody_audit_entry(custody_event)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'eventId': custody_event.event_id,
                'mediaId': media_id,
                'stage': stage,
                'timestamp': custody_event.timestamp,
                'integrityProof': {
                    'contentHash': integrity_proof.content_hash,
                    'signature': integrity_proof.signature,
                    'algorithm': integrity_proof.algorithm,
                    'verificationStatus': integrity_proof.verification_status.value
                },
                'stored': storage_success
            })
        }
        
    except Exception as e:
        logger.error(f"Error recording custody event: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to record custody event',
                'message': str(e)
            })
        }

def get_custody_chain(event: Dict[str, Any]) -> Dict[str, Any]:
    """Retrieve the complete chain of custody for a media item."""
    try:
        media_id = event.get('mediaId')
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing mediaId parameter'})
            }
        
        # Retrieve all custody events for the media
        custody_events = retrieve_custody_events(media_id)
        
        # Verify chain integrity
        integrity_status = verify_custody_chain_integrity(custody_events)
        
        # Format response
        chain_data = []
        for event_data in custody_events:
            chain_data.append({
                'eventId': event_data['eventId'],
                'stage': event_data['stage'],
                'timestamp': event_data['timestamp'],
                'actor': event_data['actor'],
                'action': event_data['action'],
                'inputHash': event_data.get('inputHash'),
                'outputHash': event_data.get('outputHash'),
                'transformationDetails': event_data.get('transformationDetails', {}),
                'integrityVerified': event_data.get('integrityVerified', False)
            })
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'chainOfCustody': chain_data,
                'totalEvents': len(chain_data),
                'chainIntegrity': integrity_status,
                'retrievedAt': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error retrieving custody chain: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to retrieve custody chain',
                'message': str(e)
            })
        }

def verify_chain_integrity(event: Dict[str, Any]) -> Dict[str, Any]:
    """Verify the cryptographic integrity of the entire custody chain."""
    try:
        media_id = event.get('mediaId')
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing mediaId parameter'})
            }
        
        # Retrieve custody events
        custody_events = retrieve_custody_events(media_id)
        
        # Perform comprehensive integrity verification
        verification_results = []
        chain_valid = True
        
        for i, event_data in enumerate(custody_events):
            # Verify individual event integrity
            event_integrity = verify_event_integrity(event_data)
            
            # Verify chain linkage
            chain_linkage_valid = True
            if i > 0:
                expected_previous_hash = custody_events[i-1]['eventHash']
                actual_previous_hash = event_data.get('previousEventHash')
                chain_linkage_valid = expected_previous_hash == actual_previous_hash
            
            verification_result = {
                'eventId': event_data['eventId'],
                'stage': event_data['stage'],
                'timestamp': event_data['timestamp'],
                'integrityValid': event_integrity,
                'chainLinkageValid': chain_linkage_valid,
                'overallValid': event_integrity and chain_linkage_valid
            }
            
            verification_results.append(verification_result)
            
            if not verification_result['overallValid']:
                chain_valid = False
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'chainValid': chain_valid,
                'totalEvents': len(custody_events),
                'verificationResults': verification_results,
                'verifiedAt': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error verifying chain integrity: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to verify chain integrity',
                'message': str(e)
            })
        }

def get_media_provenance(event: Dict[str, Any]) -> Dict[str, Any]:
    """Get comprehensive provenance information for media visualization."""
    try:
        media_id = event.get('mediaId')
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing mediaId parameter'})
            }
        
        # Retrieve custody chain
        custody_events = retrieve_custody_events(media_id)
        
        # Build provenance graph
        provenance_graph = build_provenance_graph(custody_events)
        
        # Calculate provenance metrics
        provenance_metrics = calculate_provenance_metrics(custody_events)
        
        # Get transformation summary
        transformation_summary = get_transformation_summary(custody_events)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'provenanceGraph': provenance_graph,
                'metrics': provenance_metrics,
                'transformationSummary': transformation_summary,
                'generatedAt': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error generating provenance data: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to generate provenance data',
                'message': str(e)
            })
        }

def calculate_content_hash(content: Optional[Any]) -> Optional[str]:
    """Calculate SHA-256 hash of content for integrity verification."""
    if not content:
        return None
    
    try:
        if isinstance(content, dict):
            # Sort keys for consistent hashing
            content_str = json.dumps(content, sort_keys=True)
        elif isinstance(content, str):
            content_str = content
        else:
            content_str = str(content)
        
        return hashlib.sha256(content_str.encode('utf-8')).hexdigest()
        
    except Exception as e:
        logger.error(f"Error calculating content hash: {str(e)}")
        return None

def generate_integrity_proof(custody_event: CustodyEvent) -> IntegrityProof:
    """Generate cryptographic integrity proof for a custody event."""
    try:
        # Create content to be signed
        event_data = asdict(custody_event)
        event_data.pop('integrity_proof', None)  # Remove the proof field itself
        
        # Calculate content hash
        content_str = json.dumps(event_data, sort_keys=True)
        content_hash = hashlib.sha256(content_str.encode('utf-8')).hexdigest()
        
        # Generate HMAC signature using KMS-derived key
        signature = generate_hmac_signature(content_str)
        
        return IntegrityProof(
            content_hash=content_hash,
            signature=signature,
            timestamp=datetime.utcnow().isoformat(),
            key_id=KMS_KEY_ID or 'default',
            algorithm='HMAC-SHA256',
            verification_status=IntegrityStatus.VERIFIED
        )
        
    except Exception as e:
        logger.error(f"Error generating integrity proof: {str(e)}")
        return IntegrityProof(
            content_hash="",
            signature="",
            timestamp=datetime.utcnow().isoformat(),
            key_id="",
            algorithm="",
            verification_status=IntegrityStatus.UNKNOWN
        )

def generate_hmac_signature(content: str) -> str:
    """Generate HMAC signature for content using KMS-derived key."""
    try:
        # Get signing key from KMS or use default
        signing_key = get_signing_key()
        
        # Generate HMAC signature
        signature = hmac.new(
            signing_key.encode('utf-8'),
            content.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return signature
        
    except Exception as e:
        logger.error(f"Error generating HMAC signature: {str(e)}")
        return ""

def get_signing_key() -> str:
    """Get or generate signing key for integrity proofs."""
    try:
        if KMS_KEY_ID:
            # Use KMS to derive signing key
            response = kms_client.generate_data_key(
                KeyId=KMS_KEY_ID,
                KeySpec='AES_256'
            )
            return base64.b64encode(response['Plaintext']).decode('utf-8')
        else:
            # Use default key from environment or generate
            return os.environ.get('SIGNING_KEY', 'default-signing-key-change-in-production')
            
    except Exception as e:
        logger.error(f"Error getting signing key: {str(e)}")
        return 'fallback-key'

def get_latest_event_hash(media_id: str) -> Optional[str]:
    """Get the hash of the latest custody event for chain linking."""
    try:
        if not chain_of_custody_table:
            return None
        
        # Query for the latest event
        response = chain_of_custody_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False,  # Sort by timestamp descending
            Limit=1
        )
        
        if response['Items']:
            latest_event = response['Items'][0]
            return latest_event.get('eventHash')
        
        return None
        
    except Exception as e:
        logger.error(f"Error getting latest event hash: {str(e)}")
        return None

def store_custody_event(custody_event: CustodyEvent, integrity_proof: IntegrityProof) -> bool:
    """Store custody event in DynamoDB with integrity proof."""
    try:
        if not chain_of_custody_table:
            logger.error("Chain of custody table not configured")
            return False
        
        # Calculate event hash for chain linking
        event_data = asdict(custody_event)
        event_hash = hashlib.sha256(
            json.dumps(event_data, sort_keys=True).encode('utf-8')
        ).hexdigest()
        
        # Prepare custody record
        custody_record = {
            'mediaId': custody_event.media_id,
            'timestamp': custody_event.timestamp,
            'eventId': custody_event.event_id,
            'stage': custody_event.stage.value,
            'actor': custody_event.actor,
            'action': custody_event.action,
            'inputHash': custody_event.input_hash,
            'outputHash': custody_event.output_hash,
            'transformationDetails': custody_event.transformation_details,
            'integrityProof': custody_event.integrity_proof,
            'previousEventHash': custody_event.previous_event_hash,
            'eventHash': event_hash,
            'metadata': custody_event.metadata,
            'integrityProofDetails': {
                'contentHash': integrity_proof.content_hash,
                'signature': integrity_proof.signature,
                'timestamp': integrity_proof.timestamp,
                'keyId': integrity_proof.key_id,
                'algorithm': integrity_proof.algorithm,
                'verificationStatus': integrity_proof.verification_status.value
            },
            'ttl': int((datetime.utcnow() + timedelta(days=2555)).timestamp())  # 7 years retention
        }
        
        # Store in DynamoDB
        chain_of_custody_table.put_item(Item=custody_record)
        
        logger.info(f"Custody event stored successfully: {custody_event.event_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error storing custody event: {str(e)}")
        return False

def retrieve_custody_events(media_id: str) -> List[Dict[str, Any]]:
    """Retrieve all custody events for a media item in chronological order."""
    try:
        if not chain_of_custody_table:
            return []
        
        response = chain_of_custody_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=True  # Sort by timestamp ascending
        )
        
        return response['Items']
        
    except Exception as e:
        logger.error(f"Error retrieving custody events: {str(e)}")
        return []

def verify_event_integrity(event_data: Dict[str, Any]) -> bool:
    """Verify the cryptographic integrity of a single custody event."""
    try:
        # Extract integrity proof details
        integrity_details = event_data.get('integrityProofDetails', {})
        stored_signature = integrity_details.get('signature')
        
        if not stored_signature:
            return False
        
        # Reconstruct event data without integrity proof
        event_copy = event_data.copy()
        event_copy.pop('integrityProof', None)
        event_copy.pop('integrityProofDetails', None)
        event_copy.pop('eventHash', None)
        
        # Recalculate signature
        content_str = json.dumps(event_copy, sort_keys=True)
        calculated_signature = generate_hmac_signature(content_str)
        
        # Compare signatures
        return hmac.compare_digest(stored_signature, calculated_signature)
        
    except Exception as e:
        logger.error(f"Error verifying event integrity: {str(e)}")
        return False

def verify_custody_chain_integrity(custody_events: List[Dict[str, Any]]) -> str:
    """Verify the integrity of the entire custody chain."""
    try:
        if not custody_events:
            return 'empty'
        
        valid_events = 0
        total_events = len(custody_events)
        
        for i, event_data in enumerate(custody_events):
            # Verify individual event integrity
            if verify_event_integrity(event_data):
                valid_events += 1
            
            # Verify chain linkage (except for first event)
            if i > 0:
                expected_previous_hash = custody_events[i-1].get('eventHash')
                actual_previous_hash = event_data.get('previousEventHash')
                
                if expected_previous_hash != actual_previous_hash:
                    return 'broken_chain'
        
        if valid_events == total_events:
            return 'valid'
        elif valid_events > total_events * 0.8:
            return 'mostly_valid'
        else:
            return 'compromised'
            
    except Exception as e:
        logger.error(f"Error verifying custody chain integrity: {str(e)}")
        return 'error'

def build_provenance_graph(custody_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a provenance graph for visualization."""
    try:
        nodes = []
        edges = []
        
        for i, event in enumerate(custody_events):
            # Create node for this event
            node = {
                'id': event['eventId'],
                'label': f"{event['stage']} - {event['action']}",
                'stage': event['stage'],
                'timestamp': event['timestamp'],
                'actor': event['actor'],
                'type': 'processing_step'
            }
            nodes.append(node)
            
            # Create edge to previous event
            if i > 0:
                edge = {
                    'from': custody_events[i-1]['eventId'],
                    'to': event['eventId'],
                    'label': 'leads_to',
                    'type': 'sequence'
                }
                edges.append(edge)
        
        return {
            'nodes': nodes,
            'edges': edges,
            'metadata': {
                'totalSteps': len(nodes),
                'processingDuration': calculate_processing_duration(custody_events),
                'integrityStatus': verify_custody_chain_integrity(custody_events)
            }
        }
        
    except Exception as e:
        logger.error(f"Error building provenance graph: {str(e)}")
        return {'nodes': [], 'edges': [], 'metadata': {}}

def calculate_provenance_metrics(custody_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate metrics for provenance analysis."""
    try:
        if not custody_events:
            return {}
        
        # Basic metrics
        total_events = len(custody_events)
        unique_actors = len(set(event['actor'] for event in custody_events))
        unique_stages = len(set(event['stage'] for event in custody_events))
        
        # Processing duration
        start_time = datetime.fromisoformat(custody_events[0]['timestamp'])
        end_time = datetime.fromisoformat(custody_events[-1]['timestamp'])
        processing_duration = (end_time - start_time).total_seconds()
        
        # Transformation count
        transformation_count = sum(
            1 for event in custody_events 
            if event.get('transformationDetails')
        )
        
        # Integrity metrics
        integrity_verified_count = sum(
            1 for event in custody_events 
            if verify_event_integrity(event)
        )
        
        return {
            'totalEvents': total_events,
            'uniqueActors': unique_actors,
            'uniqueStages': unique_stages,
            'processingDurationSeconds': processing_duration,
            'transformationCount': transformation_count,
            'integrityVerifiedCount': integrity_verified_count,
            'integrityPercentage': (integrity_verified_count / total_events) * 100 if total_events > 0 else 0,
            'averageStageTime': processing_duration / unique_stages if unique_stages > 0 else 0
        }
        
    except Exception as e:
        logger.error(f"Error calculating provenance metrics: {str(e)}")
        return {}

def get_transformation_summary(custody_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Get summary of all transformations applied to the media."""
    try:
        transformations = []
        
        for event in custody_events:
            transformation_details = event.get('transformationDetails', {})
            if transformation_details:
                transformation = {
                    'stage': event['stage'],
                    'timestamp': event['timestamp'],
                    'actor': event['actor'],
                    'action': event['action'],
                    'details': transformation_details,
                    'inputHash': event.get('inputHash'),
                    'outputHash': event.get('outputHash'),
                    'integrityVerified': verify_event_integrity(event)
                }
                transformations.append(transformation)
        
        return transformations
        
    except Exception as e:
        logger.error(f"Error getting transformation summary: {str(e)}")
        return []

def calculate_processing_duration(custody_events: List[Dict[str, Any]]) -> float:
    """Calculate total processing duration in seconds."""
    try:
        if len(custody_events) < 2:
            return 0.0
        
        start_time = datetime.fromisoformat(custody_events[0]['timestamp'])
        end_time = datetime.fromisoformat(custody_events[-1]['timestamp'])
        
        return (end_time - start_time).total_seconds()
        
    except Exception as e:
        logger.error(f"Error calculating processing duration: {str(e)}")
        return 0.0

def create_custody_audit_entry(custody_event: CustodyEvent):
    """Create audit trail entry for custody event."""
    try:
        audit_event = {
            'mediaId': custody_event.media_id,
            'timestamp': custody_event.timestamp,
            'eventType': 'chain_of_custody',
            'eventSource': 'chain-of-custody-tracker',
            'data': {
                'custodyEventId': custody_event.event_id,
                'stage': custody_event.stage.value,
                'actor': custody_event.actor,
                'action': custody_event.action,
                'hasInputHash': custody_event.input_hash is not None,
                'hasOutputHash': custody_event.output_hash is not None,
                'hasTransformations': bool(custody_event.transformation_details),
                'integrityProofGenerated': bool(custody_event.integrity_proof)
            },
            'userId': custody_event.actor,
            'userAgent': 'chain-of-custody-lambda'
        }
        
        audit_table.put_item(Item=audit_event)
        
    except Exception as e:
        logger.error(f"Error creating custody audit entry: {str(e)}")

# Utility functions for external integration

def record_processing_step(media_id: str, stage: str, actor: str, action: str, 
                         input_content: Any = None, output_content: Any = None,
                         transformation_details: Dict[str, Any] = None,
                         metadata: Dict[str, Any] = None) -> str:
    """Convenience function to record a processing step in the custody chain."""
    try:
        event_data = {
            'operation': 'record_event',
            'mediaId': media_id,
            'stage': stage,
            'actor': actor,
            'action': action,
            'inputContent': input_content,
            'outputContent': output_content,
            'transformationDetails': transformation_details or {},
            'metadata': metadata or {}
        }
        
        # Call the main handler
        result = handler(event_data, None)
        
        if result['statusCode'] == 200:
            response_body = json.loads(result['body'])
            return response_body['eventId']
        else:
            logger.error(f"Failed to record processing step: {result}")
            return ""
            
    except Exception as e:
        logger.error(f"Error recording processing step: {str(e)}")
        return ""

def get_custody_summary(media_id: str) -> Dict[str, Any]:
    """Get a summary of the custody chain for a media item."""
    try:
        event_data = {
            'operation': 'get_chain',
            'mediaId': media_id
        }
        
        result = handler(event_data, None)
        
        if result['statusCode'] == 200:
            return json.loads(result['body'])
        else:
            return {'error': 'Failed to retrieve custody summary'}
            
    except Exception as e:
        logger.error(f"Error getting custody summary: {str(e)}")
        return {'error': str(e)}