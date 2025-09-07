#!/usr/bin/env python3
"""
Simple validation script for the metadata extractor implementation.
This validates the core functionality without requiring external test frameworks.
"""

import json
import sys
import os
from unittest.mock import MagicMock, patch

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up environment variables
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'
os.environ['SECURITY_SCANNER_FUNCTION_NAME'] = 'test-security-scanner'

# Mock boto3 before importing
sys.modules['boto3'] = MagicMock()
sys.modules['boto3.client'] = MagicMock()
sys.modules['boto3.resource'] = MagicMock()

try:
    import index
    print("✓ Successfully imported metadata extractor module")
    print("⚠ Media processing libraries not available (expected in test environment)")
except ImportError as e:
    print(f"✗ Failed to import metadata extractor: {e}")
    sys.exit(1)

def test_media_type_determination():
    """Test media type determination from file extensions."""
    print("\n--- Testing Media Type Determination ---")
    
    test_cases = [
        ('mp4', 'video'),
        ('avi', 'video'),
        ('mov', 'video'),
        ('jpg', 'image'),
        ('png', 'image'),
        ('gif', 'image'),
        ('mp3', 'audio'),
        ('wav', 'audio'),
        ('flac', 'audio'),
        ('txt', 'unknown'),
        ('pdf', 'unknown')
    ]
    
    for extension, expected_type in test_cases:
        result = index.determine_media_type(extension)
        if result == expected_type:
            print(f"✓ {extension} -> {result}")
        else:
            print(f"✗ {extension} -> {result} (expected {expected_type})")
            return False
    
    return True

def test_media_id_generation():
    """Test media ID generation."""
    print("\n--- Testing Media ID Generation ---")
    
    test_cases = [
        'uploads/test-video.mp4',
        'uploads/my.complex.filename.jpg',
        'uploads/file_without_extension',
        'simple.mp3'
    ]
    
    for object_key in test_cases:
        media_id = index.generate_media_id(object_key)
        filename = object_key.split('/')[-1]
        base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
        
        if base_name in media_id and '_' in media_id:
            print(f"✓ {object_key} -> {media_id}")
        else:
            print(f"✗ {object_key} -> {media_id} (invalid format)")
            return False
    
    return True

def test_metadata_extraction_structure():
    """Test basic metadata extraction structure."""
    print("\n--- Testing Metadata Extraction Structure ---")
    
    # Mock S3 client response
    mock_response = {
        'ContentLength': 1024000,
        'ContentType': 'video/mp4',
        'LastModified': None,
        'ETag': '"abc123def456"',
        'StorageClass': 'STANDARD',
        'ServerSideEncryption': None
    }
    
    with patch.object(index.s3_client, 'head_object', return_value=mock_response):
        with patch.object(index, 'extract_video_metadata', return_value={'type': 'video', 'test': True}):
            metadata = index.extract_media_metadata('test-bucket', 'uploads/test-video.mp4')
            
            required_fields = [
                'filename', 'fileSize', 'contentType', 'etag',
                'fileExtension', 'mediaType', 's3Location', 'technicalMetadata'
            ]
            
            missing_fields = []
            for field in required_fields:
                if field not in metadata:
                    missing_fields.append(field)
            
            if not missing_fields:
                print("✓ All required metadata fields present")
                print(f"✓ Media type: {metadata['mediaType']}")
                print(f"✓ File size: {metadata['fileSize']}")
                print(f"✓ Technical metadata included: {'technicalMetadata' in metadata}")
                return True
            else:
                print(f"✗ Missing required fields: {missing_fields}")
                return False

def test_error_handling():
    """Test error handling in metadata extraction."""
    print("\n--- Testing Error Handling ---")
    
    # Test with S3 error
    with patch.object(index.s3_client, 'head_object', side_effect=Exception('S3 error')):
        metadata = index.extract_media_metadata('test-bucket', 'nonexistent.mp4')
        
        if 'error' in metadata and metadata.get('extractionFailed'):
            print("✓ S3 error handled correctly")
        else:
            print("✗ S3 error not handled correctly")
            return False
    
    # Test technical metadata error handling
    mock_response = {
        'ContentLength': 1024000,
        'ContentType': 'video/mp4',
        'LastModified': None,
        'ETag': '"abc123def456"',
        'StorageClass': 'STANDARD'
    }
    
    with patch.object(index.s3_client, 'head_object', return_value=mock_response):
        with patch.object(index, 'extract_video_metadata', side_effect=Exception('Technical error')):
            metadata = index.extract_media_metadata('test-bucket', 'uploads/test-video.mp4')
            
            if (metadata.get('technicalMetadata', {}).get('extractionMethod') == 'failed' and
                metadata.get('technicalMetadata', {}).get('extractionFailed')):
                print("✓ Technical metadata error handled correctly")
                return True
            else:
                print("✗ Technical metadata error not handled correctly")
                return False

def test_handler_structure():
    """Test handler function structure."""
    print("\n--- Testing Handler Structure ---")
    
    # Test empty event
    try:
        response = index.handler({}, MagicMock())
        if response.get('statusCode') == 200:
            print("✓ Handler handles empty event correctly")
        else:
            print(f"✗ Handler returned unexpected status: {response.get('statusCode')}")
            return False
    except Exception as e:
        print(f"✗ Handler failed with empty event: {e}")
        return False
    
    # Test event with no records
    try:
        response = index.handler({'Records': []}, MagicMock())
        if response.get('statusCode') == 200:
            print("✓ Handler handles event with no records correctly")
            return True
        else:
            print(f"✗ Handler returned unexpected status: {response.get('statusCode')}")
            return False
    except Exception as e:
        print(f"✗ Handler failed with no records: {e}")
        return False

def main():
    """Run all validation tests."""
    print("=== Metadata Extractor Implementation Validation ===")
    
    tests = [
        test_media_type_determination,
        test_media_id_generation,
        test_metadata_extraction_structure,
        test_error_handling,
        test_handler_structure
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
        print("✓ All validation tests passed! Implementation is ready.")
        return 0
    else:
        print("✗ Some validation tests failed. Please review the implementation.")
        return 1

if __name__ == '__main__':
    sys.exit(main())