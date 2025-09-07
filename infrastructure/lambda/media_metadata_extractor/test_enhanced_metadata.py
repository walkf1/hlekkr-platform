import pytest
import json
import boto3
from moto import mock_dynamodb, mock_s3
from unittest.mock import patch, MagicMock, mock_open
import os
import tempfile
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
        
        # Add test objects with more realistic content
        s3.put_object(
            Bucket='test-media-bucket',
            Key='uploads/test-video.mp4',
            Body=b'fake video content for testing',
            ContentType='video/mp4'
        )
        
        s3.put_object(
            Bucket='test-media-bucket',
            Key='uploads/test-image.jpg',
            Body=b'fake image content for testing',
            ContentType='image/jpeg'
        )
        
        s3.put_object(
            Bucket='test-media-bucket',
            Key='uploads/test-audio.mp3',
            Body=b'fake audio content for testing',
            ContentType='audio/mpeg'
        )
        
        yield s3

class TestEnhancedMetadataExtraction:
    """Test cases for enhanced metadata extraction functionality."""
    
    def test_video_metadata_extraction_with_libraries(self, s3_bucket):
        """Test video metadata extraction when libraries are available."""
        # Mock ffmpeg.probe to return realistic video metadata
        mock_probe_result = {
            'format': {
                'duration': '120.5',
                'bit_rate': '1500000',
                'size': '22500000'
            },
            'streams': [
                {
                    'codec_type': 'video',
                    'codec_name': 'h264',
                    'width': 1920,
                    'height': 1080,
                    'r_frame_rate': '30/1',
                    'pix_fmt': 'yuv420p',
                    'bit_rate': '1200000'
                },
                {
                    'codec_type': 'audio',
                    'codec_name': 'aac',
                    'sample_rate': '44100',
                    'channels': 2,
                    'bit_rate': '128000'
                }
            ]
        }
        
        with patch('index.MEDIA_LIBRARIES_AVAILABLE', True), \
             patch('index.ffmpeg.probe', return_value=mock_probe_result), \
             patch('tempfile.NamedTemporaryFile'), \
             patch('index.s3_client.download_fileobj'), \
             patch('os.unlink'):
            
            metadata = index.extract_video_metadata('test-media-bucket', 'uploads/test-video.mp4')
            
            assert metadata['type'] == 'video'
            assert metadata['extractionMethod'] == 'ffmpeg'
            assert metadata['duration'] == 120.5
            assert metadata['bitrate'] == 1500000
            assert metadata['videoStreams'] == 1
            assert metadata['audioStreams'] == 1
            
            # Check video stream details
            assert metadata['video']['codec'] == 'h264'
            assert metadata['video']['width'] == 1920
            assert metadata['video']['height'] == 1080
            assert metadata['video']['frameRate'] == 30.0
            
            # Check audio stream details
            assert metadata['audio']['codec'] == 'aac'
            assert metadata['audio']['sampleRate'] == 44100
            assert metadata['audio']['channels'] == 2
    
    def test_image_metadata_extraction_with_libraries(self, s3_bucket):
        """Test image metadata extraction when libraries are available."""
        # Mock PIL Image to return realistic image metadata
        mock_image = MagicMock()
        mock_image.width = 1920
        mock_image.height = 1080
        mock_image.format = 'JPEG'
        mock_image.mode = 'RGB'
        mock_image.info = {}
        mock_image._getexif.return_value = {
            271: 'Canon',  # Make
            272: 'EOS 5D Mark IV',  # Model
            306: '2024:01:15 10:30:00'  # DateTime
        }
        
        with patch('index.MEDIA_LIBRARIES_AVAILABLE', True), \
             patch('index.Image.open', return_value=mock_image), \
             patch('tempfile.NamedTemporaryFile'), \
             patch('index.s3_client.download_fileobj'), \
             patch('os.unlink'), \
             patch('index.exifread.process_file', return_value={}):
            
            metadata = index.extract_image_metadata('test-media-bucket', 'uploads/test-image.jpg')
            
            assert metadata['type'] == 'image'
            assert metadata['extractionMethod'] == 'pillow'
            assert metadata['dimensions']['width'] == 1920
            assert metadata['dimensions']['height'] == 1080
            assert metadata['format'] == 'JPEG'
            assert metadata['mode'] == 'RGB'
            assert metadata['hasTransparency'] is False
            
            # Check EXIF data
            assert 'exif' in metadata
            assert 'Make' in metadata['exif']
            assert metadata['exif']['Make'] == 'Canon'
    
    def test_audio_metadata_extraction_with_libraries(self, s3_bucket):
        """Test audio metadata extraction when libraries are available."""
        # Mock mutagen File to return realistic audio metadata
        mock_audio_file = MagicMock()
        mock_audio_file.info.length = 180.5
        mock_audio_file.info.bitrate = 320000
        mock_audio_file.info.sample_rate = 44100
        mock_audio_file.info.channels = 2
        mock_audio_file.mime = ['audio/mpeg']
        mock_audio_file.tags = {
            'TIT2': ['Test Song'],
            'TPE1': ['Test Artist'],
            'TALB': ['Test Album'],
            'TDRC': ['2024']
        }
        
        with patch('index.MEDIA_LIBRARIES_AVAILABLE', True), \
             patch('index.MutagenFile', return_value=mock_audio_file), \
             patch('tempfile.NamedTemporaryFile'), \
             patch('index.s3_client.download_fileobj'), \
             patch('os.unlink'):
            
            metadata = index.extract_audio_metadata('test-media-bucket', 'uploads/test-audio.mp3')
            
            assert metadata['type'] == 'audio'
            assert metadata['extractionMethod'] == 'mutagen'
            assert metadata['duration'] == 180.5
            assert metadata['bitrate'] == 320000
            assert metadata['sampleRate'] == 44100
            assert metadata['channels'] == 2
            assert metadata['fileType'] == 'audio/mpeg'
            
            # Check tags
            assert 'tags' in metadata
            assert 'commonTags' in metadata
            assert metadata['commonTags']['title'] == 'Test Song'
            assert metadata['commonTags']['artist'] == 'Test Artist'
    
    def test_metadata_extraction_without_libraries(self, s3_bucket):
        """Test metadata extraction when libraries are not available."""
        with patch('index.MEDIA_LIBRARIES_AVAILABLE', False):
            # Test video
            video_metadata = index.extract_video_metadata('test-media-bucket', 'uploads/test-video.mp4')
            assert video_metadata['extractionMethod'] == 'placeholder'
            assert 'libraries not available' in video_metadata['note']
            
            # Test image
            image_metadata = index.extract_image_metadata('test-media-bucket', 'uploads/test-image.jpg')
            assert image_metadata['extractionMethod'] == 'placeholder'
            assert 'libraries not available' in image_metadata['note']
            
            # Test audio
            audio_metadata = index.extract_audio_metadata('test-media-bucket', 'uploads/test-audio.mp3')
            assert audio_metadata['extractionMethod'] == 'placeholder'
            assert 'libraries not available' in audio_metadata['note']
    
    def test_metadata_extraction_error_handling(self, s3_bucket):
        """Test error handling in metadata extraction."""
        with patch('index.MEDIA_LIBRARIES_AVAILABLE', True), \
             patch('index.ffmpeg.probe', side_effect=Exception('FFmpeg error')), \
             patch('tempfile.NamedTemporaryFile'), \
             patch('index.s3_client.download_fileobj'), \
             patch('os.unlink'):
            
            metadata = index.extract_video_metadata('test-media-bucket', 'uploads/test-video.mp4')
            
            assert metadata['type'] == 'video'
            assert metadata['extractionMethod'] == 'ffmpeg'
            assert 'error' in metadata
            assert metadata['extractionFailed'] is True
            assert 'FFmpeg error' in metadata['error']
    
    def test_technical_metadata_integration(self, s3_bucket):
        """Test integration of technical metadata into main metadata extraction."""
        mock_technical_metadata = {
            'type': 'video',
            'extractionMethod': 'ffmpeg',
            'duration': 120.5,
            'bitrate': 1500000
        }
        
        with patch.object(index, 'extract_video_metadata', return_value=mock_technical_metadata):
            metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-video.mp4')
            
            assert 'technicalMetadata' in metadata
            assert metadata['technicalMetadata'] == mock_technical_metadata
            assert metadata['mediaType'] == 'video'
    
    def test_technical_metadata_error_handling(self, s3_bucket):
        """Test error handling in technical metadata extraction."""
        with patch.object(index, 'extract_video_metadata', side_effect=Exception('Technical extraction error')):
            metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-video.mp4')
            
            assert 'technicalMetadata' in metadata
            assert metadata['technicalMetadata']['extractionMethod'] == 'failed'
            assert metadata['technicalMetadata']['extractionFailed'] is True
            assert 'Technical extraction error' in metadata['technicalMetadata']['error']
    
    def test_unknown_file_type_handling(self, s3_bucket):
        """Test handling of unknown file types."""
        # Add unknown file type to S3
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.put_object(
            Bucket='test-media-bucket',
            Key='uploads/test-document.pdf',
            Body=b'fake pdf content',
            ContentType='application/pdf'
        )
        
        metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-document.pdf')
        
        assert metadata['mediaType'] == 'unknown'
        assert 'technicalMetadata' in metadata
        assert metadata['technicalMetadata']['type'] == 'unknown'
        assert metadata['technicalMetadata']['extractionMethod'] == 'none'
    
    def test_comprehensive_metadata_structure(self, s3_bucket):
        """Test that comprehensive metadata structure is maintained."""
        with patch.object(index, 'extract_video_metadata', return_value={'type': 'video', 'test': True}):
            metadata = index.extract_media_metadata('test-media-bucket', 'uploads/test-video.mp4')
            
            # Check all required fields are present
            required_fields = [
                'filename', 'fileSize', 'contentType', 'etag',
                'fileExtension', 'mediaType', 's3Location', 'technicalMetadata'
            ]
            
            for field in required_fields:
                assert field in metadata, f"Missing required field: {field}"
            
            # Check s3Location structure
            assert metadata['s3Location']['bucket'] == 'test-media-bucket'
            assert metadata['s3Location']['key'] == 'uploads/test-video.mp4'
    
    def test_end_to_end_processing_with_enhanced_metadata(self, dynamodb_table, s3_bucket):
        """Test end-to-end processing with enhanced metadata extraction."""
        sample_event = {
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
                    }
                }
            ]
        }
        
        mock_technical_metadata = {
            'type': 'video',
            'extractionMethod': 'ffmpeg',
            'duration': 120.5,
            'bitrate': 1500000,
            'video': {'codec': 'h264', 'width': 1920, 'height': 1080}
        }
        
        with patch.object(index, 'extract_video_metadata', return_value=mock_technical_metadata), \
             patch.object(index, 'invoke_security_scanner', return_value={'actionTaken': 'allowed'}):
            
            context = MagicMock()
            response = index.handler(sample_event, context)
            
            assert response['statusCode'] == 200
            
            # Verify comprehensive metadata was stored
            db_response = dynamodb_table.scan()
            assert len(db_response['Items']) > 0
            
            stored_item = db_response['Items'][0]
            assert stored_item['eventType'] == 'metadata_extraction'
            
            stored_metadata = stored_item['data']['metadata']
            assert 'technicalMetadata' in stored_metadata
            assert stored_metadata['technicalMetadata']['duration'] == 120.5
            assert stored_metadata['technicalMetadata']['video']['codec'] == 'h264'

if __name__ == '__main__':
    pytest.main([__file__])