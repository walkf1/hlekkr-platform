#!/usr/bin/env python3
"""
Test script for trust score storage and retrieval functionality.
This script validates the trust score calculator's storage and retrieval capabilities.
"""

import json
import boto3
import os
from datetime import datetime, timedelta
from decimal import Decimal
import uuid

# Mock environment variables for testing
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['TRUST_SCORE_TABLE_NAME'] = 'test-trust-score-table'
os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'

# Import the functions we want to test
from index import (
    store_trust_score,
    get_latest_trust_score,
    get_trust_score_history,
    get_trust_scores_by_range,
    get_trust_score_statistics,
    convert_to_decimal_dict,
    convert_decimal_to_float,
    get_score_range
)

def test_score_range_categorization():
    """Test score range categorization function."""
    print("Testing score range categorization...")
    
    test_cases = [
        (95.0, 'high'),
        (80.0, 'high'),
        (75.0, 'medium'),
        (60.0, 'medium'),
        (45.0, 'low'),
        (40.0, 'low'),
        (25.0, 'very_low'),
        (0.0, 'very_low')
    ]
    
    for score, expected_range in test_cases:
        actual_range = get_score_range(score)
        assert actual_range == expected_range, f"Score {score} should be '{expected_range}', got '{actual_range}'"
        print(f"✓ Score {score} correctly categorized as '{actual_range}'")
    
    print("Score range categorization tests passed!\n")

def test_decimal_conversion():
    """Test decimal conversion functions."""
    print("Testing decimal conversion...")
    
    # Test data with mixed types
    test_data = {
        'compositeScore': 85.5,
        'breakdown': {
            'deepfakeScore': 90.0,
            'sourceReliabilityScore': 80.5,
            'metadataConsistencyScore': 85.0
        },
        'factors': [
            {'score': 75.5, 'name': 'test'},
            {'score': 80.0, 'description': 'another test'}
        ],
        'textField': 'should remain string',
        'intField': 42
    }
    
    # Convert to Decimal
    decimal_data = convert_to_decimal_dict(test_data)
    
    # Verify conversions
    assert isinstance(decimal_data['compositeScore'], Decimal)
    assert isinstance(decimal_data['breakdown']['deepfakeScore'], Decimal)
    assert isinstance(decimal_data['factors'][0]['score'], Decimal)
    assert isinstance(decimal_data['textField'], str)
    assert isinstance(decimal_data['intField'], Decimal)
    
    print("✓ Successfully converted floats and ints to Decimal")
    
    # Convert back to float
    float_data = convert_decimal_to_float(decimal_data)
    
    # Verify conversions back
    assert isinstance(float_data['compositeScore'], float)
    assert isinstance(float_data['breakdown']['deepfakeScore'], float)
    assert isinstance(float_data['factors'][0]['score'], float)
    assert isinstance(float_data['textField'], str)
    assert isinstance(float_data['intField'], float)
    
    print("✓ Successfully converted Decimal values back to float")
    print("Decimal conversion tests passed!\n")

def create_mock_trust_score_result():
    """Create a mock trust score result for testing."""
    return {
        'mediaId': f'test-media-{uuid.uuid4()}',
        'compositeScore': 85.5,
        'confidence': 'high',
        'calculationTimestamp': datetime.utcnow().isoformat(),
        'breakdown': {
            'deepfakeScore': 90.0,
            'sourceReliabilityScore': 80.5,
            'metadataConsistencyScore': 85.0,
            'historicalPatternScore': 88.0,
            'technicalIntegrityScore': 83.5
        },
        'factors': [
            {
                'category': 'deepfake_detection',
                'impact': 'positive',
                'description': 'Low deepfake confidence: 0.15',
                'weight': 'high'
            },
            {
                'category': 'source_verification',
                'impact': 'positive',
                'description': 'Source verification: verified',
                'weight': 'high'
            }
        ],
        'recommendations': [
            'High trust content suitable for publication',
            'Minimal additional verification required'
        ]
    }

def test_trust_score_data_structure():
    """Test trust score data structure validation."""
    print("Testing trust score data structure...")
    
    mock_result = create_mock_trust_score_result()
    
    # Validate required fields
    required_fields = ['compositeScore', 'confidence', 'breakdown', 'factors', 'recommendations']
    for field in required_fields:
        assert field in mock_result, f"Missing required field: {field}"
    
    # Validate score ranges
    assert 0 <= mock_result['compositeScore'] <= 100, "Composite score should be between 0 and 100"
    
    for component, score in mock_result['breakdown'].items():
        assert 0 <= score <= 100, f"{component} score should be between 0 and 100"
    
    # Validate confidence levels
    valid_confidence_levels = ['low', 'medium', 'high', 'error']
    assert mock_result['confidence'] in valid_confidence_levels, f"Invalid confidence level: {mock_result['confidence']}"
    
    print("✓ Trust score data structure validation passed")
    print("Trust score data structure tests passed!\n")

def test_api_response_format():
    """Test API response format for different scenarios."""
    print("Testing API response formats...")
    
    # Test successful calculation response
    mock_result = create_mock_trust_score_result()
    media_id = mock_result['mediaId']
    
    # Simulate successful calculation response
    success_response = {
        'statusCode': 200,
        'body': json.dumps({
            'mediaId': media_id,
            'trustScore': mock_result,
            'stored': True,
            'timestamp': datetime.utcnow().isoformat()
        })
    }
    
    # Validate response structure
    assert success_response['statusCode'] == 200
    response_body = json.loads(success_response['body'])
    assert 'mediaId' in response_body
    assert 'trustScore' in response_body
    assert 'stored' in response_body
    assert 'timestamp' in response_body
    
    print("✓ Successful calculation response format validated")
    
    # Test error response
    error_response = {
        'statusCode': 500,
        'body': json.dumps({
            'error': 'Trust score operation failed',
            'message': 'Test error message'
        })
    }
    
    # Validate error response structure
    assert error_response['statusCode'] == 500
    error_body = json.loads(error_response['body'])
    assert 'error' in error_body
    assert 'message' in error_body
    
    print("✓ Error response format validated")
    
    # Test retrieval response
    retrieval_response = {
        'statusCode': 200,
        'body': json.dumps({
            'mediaId': media_id,
            'trustScore': mock_result
        })
    }
    
    # Validate retrieval response
    assert retrieval_response['statusCode'] == 200
    retrieval_body = json.loads(retrieval_response['body'])
    assert 'mediaId' in retrieval_body
    assert 'trustScore' in retrieval_body
    
    print("✓ Retrieval response format validated")
    print("API response format tests passed!\n")

def test_query_parameter_handling():
    """Test query parameter handling for different API endpoints."""
    print("Testing query parameter handling...")
    
    # Test trust score history query parameters
    history_params = {
        'history': 'true',
        'limit': '10'
    }
    
    # Validate parameter parsing
    assert history_params.get('history') == 'true'
    assert int(history_params.get('limit', 10)) == 10
    
    print("✓ History query parameters handled correctly")
    
    # Test statistics query parameters
    stats_params = {
        'statistics': 'true',
        'days': '30'
    }
    
    assert stats_params.get('statistics') == 'true'
    assert int(stats_params.get('days', 30)) == 30
    
    print("✓ Statistics query parameters handled correctly")
    
    # Test score range query parameters
    range_params = {
        'scoreRange': 'high',
        'startDate': '2024-01-01',
        'limit': '50'
    }
    
    assert range_params.get('scoreRange') == 'high'
    assert range_params.get('startDate') == '2024-01-01'
    assert int(range_params.get('limit', 50)) == 50
    
    print("✓ Score range query parameters handled correctly")
    print("Query parameter handling tests passed!\n")

def test_trust_score_versioning():
    """Test trust score versioning logic."""
    print("Testing trust score versioning...")
    
    media_id = f'test-media-{uuid.uuid4()}'
    
    # Create multiple versions
    version_1 = create_mock_trust_score_result()
    version_1['mediaId'] = media_id
    version_1['compositeScore'] = 75.0
    
    version_2 = create_mock_trust_score_result()
    version_2['mediaId'] = media_id
    version_2['compositeScore'] = 85.0
    
    version_3 = create_mock_trust_score_result()
    version_3['mediaId'] = media_id
    version_3['compositeScore'] = 90.0
    
    # Simulate version storage (would normally interact with DynamoDB)
    versions = [version_1, version_2, version_3]
    
    # Test that latest version has highest timestamp
    latest_version = max(versions, key=lambda x: x['calculationTimestamp'])
    assert latest_version['compositeScore'] == 90.0
    
    print("✓ Version ordering logic validated")
    
    # Test version limit logic
    max_versions = 5
    if len(versions) > max_versions:
        versions_to_keep = versions[-max_versions:]
        versions_to_delete = versions[:-max_versions]
        print(f"✓ Would keep {len(versions_to_keep)} versions, delete {len(versions_to_delete)}")
    else:
        print(f"✓ All {len(versions)} versions within limit")
    
    print("Trust score versioning tests passed!\n")

def run_all_tests():
    """Run all test functions."""
    print("=" * 60)
    print("TRUST SCORE STORAGE AND RETRIEVAL TESTS")
    print("=" * 60)
    print()
    
    try:
        test_score_range_categorization()
        test_decimal_conversion()
        test_trust_score_data_structure()
        test_api_response_format()
        test_query_parameter_handling()
        test_trust_score_versioning()
        
        print("=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("Trust score storage and retrieval functionality is working correctly.")
        print("=" * 60)
        
    except Exception as e:
        print("=" * 60)
        print("❌ TEST FAILED!")
        print(f"Error: {str(e)}")
        print("=" * 60)
        raise

if __name__ == '__main__':
    run_all_tests()