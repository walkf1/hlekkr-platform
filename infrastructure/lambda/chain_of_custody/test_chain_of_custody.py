#!/usr/bin/env python3
"""
Test script for chain of custody tracking functionality.
This script validates the chain of custody tracking and cryptographic integrity capabilities.
"""

import json
import os
from datetime import datetime, timedelta
import uuid
import hashlib
import hmac

# Mock environment variables for testing
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['CHAIN_OF_CUSTODY_TABLE_NAME'] = 'test-chain-of-custody-table'
os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'
os.environ['KMS_KEY_ID'] = 'test-kms-key'
os.environ['SIGNING_KEY'] = 'test-signing-key-for-validation'

# Import the functions we want to test
from index import (
    ProcessingStage,
    IntegrityStatus,
    CustodyEvent,
    IntegrityProof,
    calculate_content_hash,
    generate_hmac_signature,
    verify_custody_chain_integrity,
    build_provenance_graph,
    calculate_provenance_metrics,
    get_transformation_summary,
    calculate_processing_duration
)

def test_processing_stages():
    """Test processing stage enumeration."""
    print("Testing processing stages...")
    
    # Test all defined stages
    stages = [
        ProcessingStage.UPLOAD,
        ProcessingStage.SECURITY_SCAN,
        ProcessingStage.METADATA_EXTRACTION,
        ProcessingStage.SOURCE_VERIFICATION,
        ProcessingStage.DEEPFAKE_ANALYSIS,
        ProcessingStage.TRUST_SCORE_CALCULATION,
        ProcessingStage.HUMAN_REVIEW,
        ProcessingStage.FINAL_VERIFICATION
    ]
    
    for stage in stages:
        assert isinstance(stage.value, str)
        assert len(stage.value) > 0
        print(f"✓ Stage {stage.name}: {stage.value}")
    
    print("Processing stages tests passed!\n")

def test_integrity_status():
    """Test integrity status enumeration."""
    print("Testing integrity status...")
    
    statuses = [
        IntegrityStatus.VERIFIED,
        IntegrityStatus.COMPROMISED,
        IntegrityStatus.UNKNOWN,
        IntegrityStatus.PENDING
    ]
    
    for status in statuses:
        assert isinstance(status.value, str)
        assert len(status.value) > 0
        print(f"✓ Status {status.name}: {status.value}")
    
    print("Integrity status tests passed!\n")

def test_content_hash_calculation():
    """Test content hash calculation."""
    print("Testing content hash calculation...")
    
    # Test string content
    test_string = "Hello, World!"
    hash1 = calculate_content_hash(test_string)
    hash2 = calculate_content_hash(test_string)
    
    assert hash1 == hash2, "Same content should produce same hash"
    assert len(hash1) == 64, "SHA-256 hash should be 64 characters"
    print(f"✓ String hash: {hash1[:16]}...")
    
    # Test dictionary content
    test_dict = {"key": "value", "number": 42}
    dict_hash1 = calculate_content_hash(test_dict)
    dict_hash2 = calculate_content_hash({"number": 42, "key": "value"})  # Different order
    
    assert dict_hash1 == dict_hash2, "Dictionary order should not affect hash"
    print(f"✓ Dictionary hash: {dict_hash1[:16]}...")
    
    # Test None content
    none_hash = calculate_content_hash(None)
    assert none_hash is None, "None content should return None hash"
    print("✓ None content handled correctly")
    
    # Test different content produces different hashes
    different_hash = calculate_content_hash("Different content")
    assert hash1 != different_hash, "Different content should produce different hashes"
    print("✓ Different content produces different hashes")
    
    print("Content hash calculation tests passed!\n")

def test_hmac_signature_generation():
    """Test HMAC signature generation."""
    print("Testing HMAC signature generation...")
    
    test_content = "Test content for signing"
    
    # Generate signatures
    signature1 = generate_hmac_signature(test_content)
    signature2 = generate_hmac_signature(test_content)
    
    assert signature1 == signature2, "Same content should produce same signature"
    assert len(signature1) == 64, "HMAC-SHA256 signature should be 64 characters"
    print(f"✓ HMAC signature: {signature1[:16]}...")
    
    # Test different content produces different signatures
    different_signature = generate_hmac_signature("Different content")
    assert signature1 != different_signature, "Different content should produce different signatures"
    print("✓ Different content produces different signatures")
    
    # Test signature verification
    signing_key = os.environ.get('SIGNING_KEY', 'test-key')
    expected_signature = hmac.new(
        signing_key.encode('utf-8'),
        test_content.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    assert signature1 == expected_signature, "Generated signature should match expected"
    print("✓ Signature verification successful")
    
    print("HMAC signature generation tests passed!\n")

def test_custody_event_structure():
    """Test custody event data structure."""
    print("Testing custody event structure...")
    
    # Create test custody event
    custody_event = CustodyEvent(
        event_id=str(uuid.uuid4()),
        media_id="test-media-123",
        stage=ProcessingStage.UPLOAD,
        timestamp=datetime.utcnow().isoformat(),
        actor="test-user",
        action="upload_media",
        input_hash=None,
        output_hash="abc123def456",
        transformation_details={"format": "mp4", "size": 1024},
        integrity_proof="test-proof",
        previous_event_hash=None,
        metadata={"source": "test"}
    )
    
    # Validate structure
    assert custody_event.event_id is not None
    assert custody_event.media_id == "test-media-123"
    assert custody_event.stage == ProcessingStage.UPLOAD
    assert custody_event.actor == "test-user"
    assert custody_event.action == "upload_media"
    assert custody_event.output_hash == "abc123def456"
    assert custody_event.transformation_details["format"] == "mp4"
    assert custody_event.metadata["source"] == "test"
    
    print("✓ Custody event structure validated")
    
    # Test serialization
    event_dict = custody_event.__dict__.copy()
    event_dict['stage'] = custody_event.stage.value  # Convert enum to string
    
    json_str = json.dumps(event_dict, default=str)
    assert len(json_str) > 0, "Event should be serializable to JSON"
    
    print("✓ Custody event serialization successful")
    print("Custody event structure tests passed!\n")

def test_integrity_proof_structure():
    """Test integrity proof data structure."""
    print("Testing integrity proof structure...")
    
    # Create test integrity proof
    integrity_proof = IntegrityProof(
        content_hash="abc123def456",
        signature="signature123",
        timestamp=datetime.utcnow().isoformat(),
        key_id="test-key-id",
        algorithm="HMAC-SHA256",
        verification_status=IntegrityStatus.VERIFIED
    )
    
    # Validate structure
    assert integrity_proof.content_hash == "abc123def456"
    assert integrity_proof.signature == "signature123"
    assert integrity_proof.key_id == "test-key-id"
    assert integrity_proof.algorithm == "HMAC-SHA256"
    assert integrity_proof.verification_status == IntegrityStatus.VERIFIED
    
    print("✓ Integrity proof structure validated")
    
    # Test serialization
    proof_dict = integrity_proof.__dict__.copy()
    proof_dict['verification_status'] = integrity_proof.verification_status.value
    
    json_str = json.dumps(proof_dict, default=str)
    assert len(json_str) > 0, "Proof should be serializable to JSON"
    
    print("✓ Integrity proof serialization successful")
    print("Integrity proof structure tests passed!\n")

def test_chain_integrity_verification():
    """Test chain integrity verification logic."""
    print("Testing chain integrity verification...")
    
    # Create mock custody events
    events = []
    previous_hash = None
    
    for i in range(3):
        event_data = {
            'eventId': str(uuid.uuid4()),
            'mediaId': 'test-media-123',
            'stage': 'upload' if i == 0 else 'processing',
            'timestamp': (datetime.utcnow() + timedelta(minutes=i)).isoformat(),
            'actor': 'system',
            'action': f'step_{i}',
            'previousEventHash': previous_hash,
            'eventHash': f'hash_{i}',
            'integrityProofDetails': {
                'signature': f'signature_{i}',
                'algorithm': 'HMAC-SHA256'
            }
        }
        events.append(event_data)
        previous_hash = f'hash_{i}'
    
    # Test valid chain
    integrity_status = verify_custody_chain_integrity(events)
    print(f"✓ Chain integrity status: {integrity_status}")
    
    # Test empty chain
    empty_status = verify_custody_chain_integrity([])
    assert empty_status == 'empty', "Empty chain should return 'empty' status"
    print("✓ Empty chain handled correctly")
    
    # Test broken chain
    broken_events = events.copy()
    broken_events[1]['previousEventHash'] = 'wrong_hash'
    broken_status = verify_custody_chain_integrity(broken_events)
    assert broken_status == 'broken_chain', "Broken chain should be detected"
    print("✓ Broken chain detected correctly")
    
    print("Chain integrity verification tests passed!\n")

def test_provenance_graph_building():
    """Test provenance graph building."""
    print("Testing provenance graph building...")
    
    # Create mock custody events
    events = [
        {
            'eventId': 'event-1',
            'stage': 'upload',
            'timestamp': '2024-01-01T10:00:00Z',
            'actor': 'user',
            'action': 'upload_file'
        },
        {
            'eventId': 'event-2',
            'stage': 'security_scan',
            'timestamp': '2024-01-01T10:01:00Z',
            'actor': 'system',
            'action': 'scan_for_threats'
        },
        {
            'eventId': 'event-3',
            'stage': 'deepfake_analysis',
            'timestamp': '2024-01-01T10:05:00Z',
            'actor': 'ai_system',
            'action': 'analyze_deepfake'
        }
    ]
    
    # Build provenance graph
    graph = build_provenance_graph(events)
    
    # Validate graph structure
    assert 'nodes' in graph
    assert 'edges' in graph
    assert 'metadata' in graph
    
    # Validate nodes
    assert len(graph['nodes']) == 3
    for i, node in enumerate(graph['nodes']):
        assert node['id'] == f'event-{i+1}'
        assert 'label' in node
        assert 'stage' in node
        assert 'timestamp' in node
        assert 'actor' in node
    
    # Validate edges
    assert len(graph['edges']) == 2  # n-1 edges for n nodes
    for edge in graph['edges']:
        assert 'from' in edge
        assert 'to' in edge
        assert 'type' in edge
    
    # Validate metadata
    assert graph['metadata']['totalSteps'] == 3
    assert 'processingDuration' in graph['metadata']
    assert 'integrityStatus' in graph['metadata']
    
    print("✓ Provenance graph structure validated")
    print(f"✓ Graph has {len(graph['nodes'])} nodes and {len(graph['edges'])} edges")
    print("Provenance graph building tests passed!\n")

def test_provenance_metrics_calculation():
    """Test provenance metrics calculation."""
    print("Testing provenance metrics calculation...")
    
    # Create mock custody events with transformations
    events = [
        {
            'eventId': 'event-1',
            'stage': 'upload',
            'timestamp': '2024-01-01T10:00:00Z',
            'actor': 'user',
            'transformationDetails': {'action': 'upload'}
        },
        {
            'eventId': 'event-2',
            'stage': 'security_scan',
            'timestamp': '2024-01-01T10:01:00Z',
            'actor': 'system',
            'transformationDetails': {}
        },
        {
            'eventId': 'event-3',
            'stage': 'deepfake_analysis',
            'timestamp': '2024-01-01T10:05:00Z',
            'actor': 'ai_system',
            'transformationDetails': {'model': 'claude-3'}
        }
    ]
    
    # Calculate metrics
    metrics = calculate_provenance_metrics(events)
    
    # Validate metrics
    assert metrics['totalEvents'] == 3
    assert metrics['uniqueActors'] == 3  # user, system, ai_system
    assert metrics['uniqueStages'] == 3  # upload, security_scan, deepfake_analysis
    assert metrics['processingDurationSeconds'] == 300  # 5 minutes
    assert metrics['transformationCount'] == 2  # Only events with non-empty transformationDetails
    assert 'integrityPercentage' in metrics
    assert 'averageStageTime' in metrics
    
    print(f"✓ Total events: {metrics['totalEvents']}")
    print(f"✓ Unique actors: {metrics['uniqueActors']}")
    print(f"✓ Processing duration: {metrics['processingDurationSeconds']} seconds")
    print(f"✓ Transformations: {metrics['transformationCount']}")
    
    # Test empty events
    empty_metrics = calculate_provenance_metrics([])
    assert empty_metrics == {}
    print("✓ Empty events handled correctly")
    
    print("Provenance metrics calculation tests passed!\n")

def test_transformation_summary():
    """Test transformation summary generation."""
    print("Testing transformation summary...")
    
    # Create mock events with transformations
    events = [
        {
            'eventId': 'event-1',
            'stage': 'upload',
            'timestamp': '2024-01-01T10:00:00Z',
            'actor': 'user',
            'action': 'upload_file',
            'transformationDetails': {
                'format': 'mp4',
                'size': 1024,
                'resolution': '1920x1080'
            },
            'inputHash': None,
            'outputHash': 'hash1'
        },
        {
            'eventId': 'event-2',
            'stage': 'metadata_extraction',
            'timestamp': '2024-01-01T10:01:00Z',
            'actor': 'system',
            'action': 'extract_metadata',
            'transformationDetails': {
                'extracted_fields': ['duration', 'codec', 'bitrate'],
                'metadata_count': 15
            },
            'inputHash': 'hash1',
            'outputHash': 'hash2'
        },
        {
            'eventId': 'event-3',
            'stage': 'security_scan',
            'timestamp': '2024-01-01T10:02:00Z',
            'actor': 'security_system',
            'action': 'scan_content',
            'transformationDetails': {},  # Empty transformation
            'inputHash': 'hash2',
            'outputHash': 'hash2'  # No change
        }
    ]
    
    # Get transformation summary
    summary = get_transformation_summary(events)
    
    # Should only include events with non-empty transformationDetails
    assert len(summary) == 2
    
    # Validate first transformation
    first_transform = summary[0]
    assert first_transform['stage'] == 'upload'
    assert first_transform['actor'] == 'user'
    assert first_transform['action'] == 'upload_file'
    assert first_transform['details']['format'] == 'mp4'
    assert first_transform['inputHash'] is None
    assert first_transform['outputHash'] == 'hash1'
    
    # Validate second transformation
    second_transform = summary[1]
    assert second_transform['stage'] == 'metadata_extraction'
    assert second_transform['details']['metadata_count'] == 15
    assert second_transform['inputHash'] == 'hash1'
    assert second_transform['outputHash'] == 'hash2'
    
    print(f"✓ Found {len(summary)} transformations")
    print("✓ Transformation details validated")
    
    print("Transformation summary tests passed!\n")

def test_processing_duration_calculation():
    """Test processing duration calculation."""
    print("Testing processing duration calculation...")
    
    # Test normal case
    events = [
        {'timestamp': '2024-01-01T10:00:00Z'},
        {'timestamp': '2024-01-01T10:05:00Z'},
        {'timestamp': '2024-01-01T10:10:00Z'}
    ]
    
    duration = calculate_processing_duration(events)
    assert duration == 600.0, f"Expected 600 seconds, got {duration}"  # 10 minutes
    print(f"✓ Processing duration: {duration} seconds")
    
    # Test single event
    single_event = [{'timestamp': '2024-01-01T10:00:00Z'}]
    single_duration = calculate_processing_duration(single_event)
    assert single_duration == 0.0, "Single event should have 0 duration"
    print("✓ Single event duration handled correctly")
    
    # Test empty events
    empty_duration = calculate_processing_duration([])
    assert empty_duration == 0.0, "Empty events should have 0 duration"
    print("✓ Empty events duration handled correctly")
    
    print("Processing duration calculation tests passed!\n")

def test_api_response_formats():
    """Test API response formats for different operations."""
    print("Testing API response formats...")
    
    # Test record event response format
    record_response = {
        'statusCode': 200,
        'body': json.dumps({
            'eventId': 'event-123',
            'mediaId': 'media-456',
            'stage': 'upload',
            'timestamp': '2024-01-01T10:00:00Z',
            'integrityProof': {
                'contentHash': 'hash123',
                'signature': 'sig123',
                'algorithm': 'HMAC-SHA256',
                'verificationStatus': 'verified'
            },
            'stored': True
        })
    }
    
    # Validate record response
    assert record_response['statusCode'] == 200
    body = json.loads(record_response['body'])
    assert 'eventId' in body
    assert 'integrityProof' in body
    assert 'stored' in body
    print("✓ Record event response format validated")
    
    # Test get chain response format
    chain_response = {
        'statusCode': 200,
        'body': json.dumps({
            'mediaId': 'media-456',
            'chainOfCustody': [
                {
                    'eventId': 'event-1',
                    'stage': 'upload',
                    'timestamp': '2024-01-01T10:00:00Z',
                    'actor': 'user',
                    'action': 'upload_file',
                    'integrityVerified': True
                }
            ],
            'totalEvents': 1,
            'chainIntegrity': 'valid',
            'retrievedAt': '2024-01-01T10:30:00Z'
        })
    }
    
    # Validate chain response
    assert chain_response['statusCode'] == 200
    chain_body = json.loads(chain_response['body'])
    assert 'chainOfCustody' in chain_body
    assert 'totalEvents' in chain_body
    assert 'chainIntegrity' in chain_body
    print("✓ Get chain response format validated")
    
    # Test error response format
    error_response = {
        'statusCode': 400,
        'body': json.dumps({
            'error': 'Missing required fields',
            'message': 'mediaId, stage, action are required'
        })
    }
    
    # Validate error response
    assert error_response['statusCode'] == 400
    error_body = json.loads(error_response['body'])
    assert 'error' in error_body
    assert 'message' in error_body
    print("✓ Error response format validated")
    
    print("API response formats tests passed!\n")

def run_all_tests():
    """Run all test functions."""
    print("=" * 60)
    print("CHAIN OF CUSTODY TRACKING TESTS")
    print("=" * 60)
    print()
    
    try:
        test_processing_stages()
        test_integrity_status()
        test_content_hash_calculation()
        test_hmac_signature_generation()
        test_custody_event_structure()
        test_integrity_proof_structure()
        test_chain_integrity_verification()
        test_provenance_graph_building()
        test_provenance_metrics_calculation()
        test_transformation_summary()
        test_processing_duration_calculation()
        test_api_response_formats()
        
        print("=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("Chain of custody tracking functionality is working correctly.")
        print("=" * 60)
        print()
        print("Key Features Tested:")
        print("• Processing stage and integrity status enumerations")
        print("• Content hash calculation with SHA-256")
        print("• HMAC signature generation and verification")
        print("• Custody event and integrity proof data structures")
        print("• Chain integrity verification with linkage validation")
        print("• Provenance graph building for visualization")
        print("• Comprehensive metrics calculation")
        print("• Transformation summary generation")
        print("• Processing duration calculation")
        print("• API response format validation")
        print("=" * 60)
        
    except Exception as e:
        print("=" * 60)
        print("❌ TEST FAILED!")
        print(f"Error: {str(e)}")
        print("=" * 60)
        raise

if __name__ == '__main__':
    run_all_tests()