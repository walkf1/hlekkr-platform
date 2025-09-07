import pytest
import json
import boto3
from moto import mock_dynamodb, mock_s3
from unittest.mock import patch, MagicMock
import os
from datetime import datetime

# Import the Lambda function
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import index

@pytest.fixture
def aws_credentials():
    """Mocked AWS Credentials for moto."""
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'

@pytest.fixture
def mock_environment():
    """Set up environment variables for testing."""
    os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
    os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'

@pytest.fixture
def dynamodb_table(aws_credentials, mock_environment):
    """Create a mock DynamoDB table."""
    with mock_dynamodb():
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        table = dynamodb.create_table(
            TableName='test-audit-table',
            KeySchema=[
                {'AttributeName': 'mediaId', 'KeyType': 'HASH'},
                {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'mediaId', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        yield table

@pytest.fixture
def s3_bucket(aws_credentials, mock_environment):
    """Create a mock S3 bucket with test objects."""
    with mock_s3():
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket='test-media-bucket')
        
        # Add test objects
        s3.put_object(
            Bucket='test-media-bucket',
            Key='uploads/test-video.mp4',
            Body=b'fake video content',
            ContentType='video/mp4'
        )
        
        s3.put_object(
            Bucket='test-media-bucket',
            Key='uploads/test-image.jpg',
            Body=b'fake image content',
            ContentType='image/jpeg'
        )
        
        yield s3

@pytest.fixture
def sample_s3_event():
    """Sample S3 event for testing."""
    return {
        'Records': [
            {
                'eventSource': 'aws:s3',
                'eventName': 'ObjectCreated:Put',
                's3': {
                    'bucket': {'name': 'test-media-bucket'},
                    'object': {
                        'key': 'uploads/test-video.mp4',
                        'size': 1024000,
                        'eTag': 'abc123def456'
                    }
                },
                'requestParameters': {
                    'sourceIPAddress': '192.168.1.1',
                    'userAgent': 'test-user-agent'
                }
            }
        ]
    }

class TestMediaMetadataExtractor:
    """Test cases for the media metadata extractor Lambda function."""
    
    def test_handler_successful_processing(self, dynamodb_table, s3_bucket, sample_s3_event):
        """Test successful processing of S3 events."""
        context = MagicMock()
        
        response = index.handler(sample_s3_event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'Metadata extraction completed successfully' in body['message']
        assert body['processedRecords'] == 1
    
    def test_handler_empty_event(self, dynamodb_table, s3_bucket):
        """Test handler with empty event."""
        event = {}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['processedRecords'] == 0
    
    def test_handler_non_s3_event(self, dynamodb_table, s3_bucket):
        """Test handler with non-S3 event."""
        event = {
            'Records': [
                {
                    'eventSource': 'aws:sns',
                    'eventName': 'Notification'
                }
            ]
        }
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['processedRecords'] == 0
    
    def test_process_s3_event_success(self, dynamodb_table, s3_bucket):
        """Test successful S3 event processing."""
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
        
        # Should not raise an exception
        index.process_s3_event(record)
        
        # Verify record was stored in DynamoDB
        response = dynamodb_table.scan()
        assert len(response['Items']) > 0
        
        stored_item = response['Items'][0]
        assert stored_item['eventType'] == 'metadata_extraction'
        assert 'test-video' in stored_item['mediaId']
    
    def test_generate_media_id_consistency(self):
        """Test that media ID generation is consistent."""
        object_key = 'uploads/test-video.mp4'
        
        id1 = index.generate_media_id(object_key)
        id2 = index.generate_media_id(object_key)
        
        assert id1 == id2  # Should be consistent
        assert 'test-video' in id1
        assert len(id1.split('_')) == 2  # Should have format: name_uuid
    
    def test_extract_media_metadata_video(self, s3_bucket):
        """Test metadata extraction for video files."""
        metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-video.mp4')
        
        assert metadata['filename'] == 'test-video.mp4'
        assert metadata['contentType'] == 'video/mp4'
        assert metadata['fileExtension'] == 'mp4'
        assert metadata['mediaType'] == 'video'
        assert metadata['fileSize'] > 0
        assert 's3Location' in metadata
        assert metadata['s3Location']['bucket'] == 'test-media-bucket'
        assert metadata['s3Location']['key'] == 'uploads/test-video.mp4'
    
    def test_extract_media_metadata_image(self, s3_bucket):
        """Test metadata extraction for image files."""
        metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-image.jpg')
        
        assert metadata['filename'] == 'test-image.jpg'
        assert metadata['contentType'] == 'image/jpeg'
        assert metadata['fileExtension'] == 'jpg'
        assert metadata['mediaType'] == 'image'
        assert metadata['fileSize'] > 0
    
    def test_extract_media_metadata_nonexistent_file(self, s3_bucket):
        """Test metadata extraction for non-existent file."""
        metadata = index.extract_media_metadata('test-media-bucket', 'uploads/nonexistent.mp4')
        
        assert 'error' in metadata
        assert metadata['extractionFailed'] is True
        assert metadata['filename'] == 'nonexistent.mp4'
    
    def test_determine_media_type(self):
        """Test media type determination from file extensions."""
        # Video extensions
        assert index.determine_media_type('mp4') == 'video'
        assert index.determine_media_type('avi') == 'video'
        assert index.determine_media_type('mov') == 'video'
        
        # Image extensions
        assert index.determine_media_type('jpg') == 'image'
        assert index.determine_media_type('png') == 'image'
        assert index.determine_media_type('gif') == 'image'
        
        # Audio extensions
        assert index.determine_media_type('mp3') == 'audio'
        assert index.determine_media_type('wav') == 'audio'
        assert index.determine_media_type('flac') == 'audio'
        
        # Unknown extensions
        assert index.determine_media_type('txt') == 'unknown'
        assert index.determine_media_type('xyz') == 'unknown'
    
    def test_extract_video_metadata_placeholder(self):
        """Test video metadata extraction (placeholder implementation)."""
        metadata = index.extract_video_metadata('test-bucket', 'test-key')
        
        assert metadata['type'] == 'video'
        assert metadata['extractionMethod'] == 'placeholder'
        assert 'note' in metadata
    
    def test_extract_image_metadata_placeholder(self):
        """Test image metadata extraction (placeholder implementation)."""
        metadata = index.extract_image_metadata('test-bucket', 'test-key')
        
        assert metadata['type'] == 'image'
        assert metadata['extractionMethod'] == 'placeholder'
        assert 'note' in metadata
    
    def test_extract_audio_metadata_placeholder(self):
        """Test audio metadata extraction (placeholder implementation)."""
        metadata = index.extract_audio_metadata('test-bucket', 'test-key')
        
        assert metadata['type'] == 'audio'
        assert metadata['extractionMethod'] == 'placeholder'
        assert 'note' in metadata
    
    def test_store_metadata_audit(self, dynamodb_table):
        """Test storing metadata audit record."""
        media_id = 'test-media-123'
        object_key = 'uploads/test-video.mp4'
        metadata = {
            'filename': 'test-video.mp4',
            'fileSize': 1024000,
            'contentType': 'video/mp4'
        }
        event_name = 'ObjectCreated:Put'
        
        # Should not raise an exception
        index.store_metadata_audit(media_id, object_key, metadata, event_name)
        
        # Verify record was stored
        response = dynamodb_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id}
        )
        
        assert len(response['Items']) > 0
        stored_item = response['Items'][0]
        assert stored_item['eventType'] == 'metadata_extraction'
        assert stored_item['eventName'] == event_name
        assert stored_item['objectKey'] == object_key
        assert stored_item['metadata'] == metadata
        assert stored_item['processingStatus'] == 'completed'
    
    def test_store_metadata_audit_failed_extraction(self, dynamodb_table):
        """Test storing audit record for failed metadata extraction."""
        media_id = 'test-media-123'
        object_key = 'uploads/test-video.mp4'
        metadata = {
            'filename': 'test-video.mp4',
            'extractionFailed': True,
            'error': 'File not found'
        }
        event_name = 'ObjectCreated:Put'
        
        index.store_metadata_audit(media_id, object_key, metadata, event_name)
        
        # Verify record was stored with failed status
        response = dynamodb_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id}
        )
        
        stored_item = response['Items'][0]
        assert stored_item['processingStatus'] == 'failed'
    
    def test_error_handling_s3_access_denied(self, dynamodb_table):
        """Test error handling when S3 access is denied."""
        with mock_s3():
            # Create bucket but don't add the object
            s3 = boto3.client('s3', region_name='us-east-1')
            s3.create_bucket(Bucket='test-media-bucket')
            
            record = {
                'eventSource': 'aws:s3',
                'eventName': 'ObjectCreated:Put',
                's3': {
                    'bucket': {'name': 'test-media-bucket'},
                    'object': {
                        'key': 'uploads/nonexistent.mp4',
                        'size': 1024000
                    }
                }
            }
            
            # Should handle the error gracefully
            index.process_s3_event(record)
            
            # Should still create an audit record with error information
            response = dynamodb_table.scan()
            assert len(response['Items']) > 0
    
    def test_error_handling_dynamodb_failure(self, s3_bucket):
        """Test error handling when DynamoDB write fails."""
        record = {
            'eventSource': 'aws:s3',
            'eventName': 'ObjectCreated:Put',
            's3': {
                'bucket': {'name': 'test-media-bucket'},
                'object': {
                    'key': 'uploads/test-video.mp4',
                    'size': 1024000
                }
            }
        }
        
        with patch.object(index.audit_table, 'put_item', side_effect=Exception('DynamoDB error')):
            # Should raise the exception since audit storage is critical
            with pytest.raises(Exception, match='DynamoDB error'):
                index.process_s3_event(record)
    
    def test_handler_error_handling(self, dynamodb_table, s3_bucket):
        """Test handler-level error handling."""
        event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/test-video.mp4'}
                    }
                }
            ]
        }
        context = MagicMock()
        
        with patch.object(index, 'process_s3_event', side_effect=Exception('Processing error')):
            response = index.handler(event, context)
            
            assert response['statusCode'] == 500
            body = json.loads(response['body'])
            assert 'Metadata extraction failed' in body['error']
    
    def test_file_extension_edge_cases(self):
        """Test file extension handling edge cases."""
        # File without extension
        assert index.determine_media_type('') == 'unknown'
        
        # Multiple dots in filename
        metadata = index.extract_media_metadata.__defaults__  # This won't work, let's test the logic
        
        # Test with complex filenames
        media_id = index.generate_media_id('uploads/my.video.file.mp4')
        assert 'my.video.file' in media_id
        
        media_id = index.generate_media_id('uploads/file_without_extension')
        assert 'file_without_extension' in media_id
    
    def test_metadata_completeness(self, s3_bucket):
        """Test that all expected metadata fields are present."""
        metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-video.mp4')
        
        required_fields = [
            'filename', 'fileSize', 'contentType', 'etag',
            'fileExtension', 'mediaType', 's3Location'
        ]
        
        for field in required_fields:
            assert field in metadata, f"Missing required field: {field}"
        
        # Check s3Location structure
        assert 'bucket' in metadata['s3Location']
        assert 'key' in metadata['s3Location']
        assert metadata['s3Location']['bucket'] == 'test-media-bucket'
        assert metadata['s3Location']['key'] == 'uploads/test-video.mp4'

if __name__ == '__main__':
    pytest.main([__file__])