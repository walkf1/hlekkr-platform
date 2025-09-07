#!/usr/bin/env python3
"""
Test suite for the workflow orchestrator Lambda function.
Tests the Step Functions workflow orchestration and error handling.
"""

import json
import sys
import os
from unittest.mock import MagicMock, patch
from datetime import datetime

# Set up environment variables
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'
os.environ['STATE_MACHINE_ARN'] = 'arn:aws:states:us-east-1:123456789012:stateMachine:test-workflow'
os.environ['PROCESSING_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue'
os.environ['DLQ_URL'] = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-dlq'

# Mock boto3 before importing
sys.modules['boto3'] = MagicMock()
sys.modules['boto3.client'] = MagicMock()
sys.modules['boto3.resource'] = MagicMock()

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import index
    print("✓ Successfully imported workflow orchestrator module")
except ImportError as e:
    print(f"✗ Failed to import workflow orchestrator: {e}")
    sys.exit(1)

def test_media_id_generation():
    """Test media ID generation from object keys."""
    print("\n--- Testing Media ID Generation ---")
    
    test_cases = [
        ('uploads/test-video.mp4', 'test-video'),
        ('uploads/complex.file.name.jpg', 'complex.file.name'),
        ('uploads/file_without_extension', 'file_without_extension'),
        ('simple.mp3', 'simple')
    ]
    
    for object_key, expected_base in test_cases:
        media_id = index.generate_media_id(object_key)
        if expected_base in media_id and '_' in media_id:
            print(f"✓ {object_key} -> {media_id}")
        else:
            print(f"✗ {object_key} -> {media_id} (expected to contain '{expected_base}')")
            return False
    
    return True

def test_s3_event_processing():
    """Test processing of S3 events."""
    print("\n--- Testing S3 Event Processing ---")
    
    # Mock AWS clients
    mock_stepfunctions = MagicMock()
    mock_sqs = MagicMock()
    mock_audit_table = MagicMock()
    
    # Mock successful Step Functions execution
    mock_stepfunctions.start_execution.return_value = {
        'executionArn': 'arn:aws:states:us-east-1:123456789012:execution:test-workflow:test-execution'
    }
    
    with patch.object(index, 'stepfunctions_client', mock_stepfunctions), \
         patch.object(index, 'sqs_client', mock_sqs), \
         patch.object(index, 'audit_table', mock_audit_table):
        
        # Sample S3 event record
        record = {
            'eventSource': 'aws:s3',
            'eventName': 'ObjectCreated:Put',
            's3': {
                'bucket': {'name': 'test-media-bucket'},
                'object': {
                    'key': 'uploads/test-video.mp4',
                    'size': 1024000,
                    'eTag': 'abc123def456'
                }
            }
        }
        
        result = index.process_s3_event(record)
        
        # Verify result structure
        required_fields = ['mediaId', 'executionArn', 'executionName', 'status', 'objectKey']
        for field in required_fields:
            if field not in result:
                print(f"✗ Missing field in result: {field}")
                return False
        
        # Verify Step Functions was called
        if not mock_stepfunctions.start_execution.called:
            print("✗ Step Functions start_execution was not called")
            return False
        
        # Verify SQS message was sent
        if not mock_sqs.send_message.called:
            print("✗ SQS send_message was not called")
            return False
        
        # Verify audit record was created
        if not mock_audit_table.put_item.called:
            print("✗ Audit table put_item was not called")
            return False
        
        print(f"✓ S3 event processed successfully: {result['mediaId']}")
        print(f"✓ Step Functions execution started: {result['executionArn']}")
        print(f"✓ Status: {result['status']}")
        
        return True

def test_error_handling():
    """Test error handling in workflow orchestration."""
    print("\n--- Testing Error Handling ---")
    
    # Mock AWS clients
    mock_stepfunctions = MagicMock()
    mock_sqs = MagicMock()
    mock_audit_table = MagicMock()
    
    # Mock Step Functions failure
    mock_stepfunctions.start_execution.side_effect = Exception("Step Functions error")
    
    with patch.object(index, 'stepfunctions_client', mock_stepfunctions), \
         patch.object(index, 'sqs_client', mock_sqs), \
         patch.object(index, 'audit_table', mock_audit_table):
        
        record = {
            'eventSource': 'aws:s3',
            'eventName': 'ObjectCreated:Put',
            's3': {
                'bucket': {'name': 'test-media-bucket'},
                'object': {
                    'key': 'uploads/test-video.mp4',
                    'size': 1024000,
                    'eTag': 'abc123def456'
                }
            }
        }
        
        try:
            index.process_s3_event(record)
            print("✗ Expected exception was not raised")
            return False
        except Exception as e:
            if "Step Functions error" in str(e):
                print("✓ Exception properly propagated")
            else:
                print(f"✗ Unexpected exception: {e}")
                return False
        
        # Verify error was sent to DLQ
        if mock_sqs.send_message.called:
            call_args = mock_sqs.send_message.call_args
            if call_args[1]['QueueUrl'] == os.environ['DLQ_URL']:
                print("✓ Error message sent to DLQ")
            else:
                print("✗ Error message not sent to correct DLQ")
                return False
        else:
            print("✗ Error message not sent to DLQ")
            return False
        
        return True

def test_handler_function():
    """Test the main handler function."""
    print("\n--- Testing Handler Function ---")
    
    # Mock successful processing
    with patch.object(index, 'process_s3_event', return_value={'status': 'success', 'mediaId': 'test-123'}):
        
        # Test with S3 event
        event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/test-video.mp4'}
                    }
                }
            ]
        }
        
        context = MagicMock()
        response = index.handler(event, context)
        
        if response['statusCode'] != 200:
            print(f"✗ Expected status 200, got {response['statusCode']}")
            return False
        
        body = json.loads(response['body'])
        if body['processedRecords'] != 1:
            print(f"✗ Expected 1 processed record, got {body['processedRecords']}")
            return False
        
        print("✓ Handler processed S3 event successfully")
        
        # Test with empty event
        empty_event = {}
        response = index.handler(empty_event, context)
        
        if response['statusCode'] != 200:
            print(f"✗ Expected status 200 for empty event, got {response['statusCode']}")
            return False
        
        body = json.loads(response['body'])
        if body['processedRecords'] != 0:
            print(f"✗ Expected 0 processed records for empty event, got {body['processedRecords']}")
            return False
        
        print("✓ Handler handled empty event correctly")
        
        return True

def test_workflow_completion_handling():
    """Test workflow completion event handling."""
    print("\n--- Testing Workflow Completion Handling ---")
    
    mock_audit_table = MagicMock()
    
    with patch.object(index, 'audit_table', mock_audit_table):
        
        # Test successful completion
        completion_event = {
            'executionArn': 'arn:aws:states:us-east-1:123456789012:execution:test-workflow:test-execution',
            'status': 'succeeded',
            'mediaId': 'test-media-123'
        }
        
        result = index.handle_workflow_completion(completion_event)
        
        if result['status'] != 'recorded':
            print(f"✗ Expected status 'recorded', got {result['status']}")
            return False
        
        if not mock_audit_table.put_item.called:
            print("✗ Audit record was not created for completion")
            return False
        
        print("✓ Workflow completion handled successfully")
        
        # Test with missing fields
        incomplete_event = {'status': 'succeeded'}
        result = index.handle_workflow_completion(incomplete_event)
        
        if result['status'] != 'ignored':
            print(f"✗ Expected status 'ignored' for incomplete event, got {result['status']}")
            return False
        
        print("✓ Incomplete completion event handled correctly")
        
        return True

def test_workflow_status_query():
    """Test workflow status querying."""
    print("\n--- Testing Workflow Status Query ---")
    
    mock_audit_table = MagicMock()
    
    # Mock audit table response
    mock_audit_table.query.return_value = {
        'Items': [
            {
                'mediaId': 'test-media-123',
                'timestamp': '2024-01-15T10:30:00Z',
                'eventType': 'workflow_started',
                'data': {'executionName': 'test-execution'}
            }
        ]
    }
    
    with patch.object(index, 'audit_table', mock_audit_table):
        
        result = index.get_workflow_status('test-media-123')
        
        if result['status'] != 'processing':
            print(f"✗ Expected status 'processing', got {result['status']}")
            return False
        
        if result['mediaId'] != 'test-media-123':
            print(f"✗ Expected mediaId 'test-media-123', got {result['mediaId']}")
            return False
        
        if 'latestEvent' not in result:
            print("✗ Missing latestEvent in result")
            return False
        
        print("✓ Workflow status query successful")
        
        # Test with no events found
        mock_audit_table.query.return_value = {'Items': []}
        result = index.get_workflow_status('nonexistent-media')
        
        if result['status'] != 'not_found':
            print(f"✗ Expected status 'not_found', got {result['status']}")
            return False
        
        print("✓ Non-existent media handled correctly")
        
        return True

def main():
    """Run all workflow orchestrator tests."""
    print("=== Workflow Orchestrator Test Suite ===")
    
    tests = [
        test_media_id_generation,
        test_s3_event_processing,
        test_error_handling,
        test_handler_function,
        test_workflow_completion_handling,
        test_workflow_status_query
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                print(f"✗ Test {test.__name__} failed")
        except Exception as e:
            print(f"✗ Test {test.__name__} failed with exception: {e}")
    
    print(f"\n=== Results: {passed}/{total} tests passed ===")
    
    if passed == total:
        print("✓ All workflow orchestrator tests passed! Implementation is ready.")
        return 0
    else:
        print("✗ Some tests failed. Please review the implementation.")
        return 1

if __name__ == '__main__':
    sys.exit(main())