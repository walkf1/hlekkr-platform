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
                {'AttributeName': 'timestamp', 'AttributeType': 'S'},
                {'AttributeName': 'eventType', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'EventTypeIndex',
                    'KeySchema': [
                        {'AttributeName': 'eventType', 'KeyType': 'HASH'},
                        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
                }
            ],
            BillingMode='PROVISIONED',
            ProvisionedThroughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
        )
        
        yield table

@pytest.fixture
def s3_bucket(aws_credentials, mock_environment):
    """Create a mock S3 bucket."""
    with mock_s3():
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket='test-media-bucket')
        yield s3

@pytest.fixture
def sample_media_info():
    """Sample media information for testing."""
    return {
        'mediaId': 'test-video-123',
        'timestamp': datetime.utcnow().isoformat(),
        'eventType': 'metadata_extraction',
        'metadata': {
            'filename': 'test-video.mp4',
            'fileSize': 1024000,
            'contentType': 'video/mp4',
            'mediaType': 'video',
            's3Location': {
                'bucket': 'test-media-bucket',
                'key': 'uploads/test-video.mp4'
            }
        }
    }

class TestDeepfakeDetector:
    """Test cases for the deepfake detector Lambda function."""
    
    def test_handler_missing_media_id(self, dynamodb_table, s3_bucket):
        """Test handler with missing mediaId parameter."""
        event = {}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'Missing mediaId parameter' in body['error']
    
    def test_handler_media_not_found(self, dynamodb_table, s3_bucket):
        """Test handler with non-existent media ID."""
        event = {'mediaId': 'non-existent-media'}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert 'Media not found' in body['error']
    
    def test_handler_successful_analysis(self, dynamodb_table, s3_bucket, sample_media_info):
        """Test successful deepfake analysis."""
        # Store sample media info in DynamoDB
        dynamodb_table.put_item(Item=sample_media_info)
        
        event = {'mediaId': 'test-video-123'}
        context = MagicMock()
        
        with patch.object(index, 'perform_deepfake_detection') as mock_detection:
            mock_detection.return_value = {
                'mediaId': 'test-video-123',
                'deepfakeConfidence': 0.75,
                'detectedTechniques': ['face_swap'],
                'analysisTimestamp': datetime.utcnow().isoformat(),
                'processingTime': 2.5
            }
            
            response = index.handler(event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['mediaId'] == 'test-video-123'
        assert 'analysisResult' in body
    
    def test_get_media_info_success(self, dynamodb_table, sample_media_info):
        """Test successful media info retrieval."""
        # Store sample media info
        dynamodb_table.put_item(Item=sample_media_info)
        
        result = index.get_media_info('test-video-123')
        
        assert result is not None
        assert result['mediaId'] == 'test-video-123'
        assert result['eventType'] == 'metadata_extraction'
    
    def test_get_media_info_not_found(self, dynamodb_table):
        """Test media info retrieval for non-existent media."""
        result = index.get_media_info('non-existent-media')
        
        assert result is None
    
    def test_analyze_video_deepfake(self, s3_bucket, sample_media_info):
        """Test video deepfake analysis."""
        with patch.object(index, 'call_bedrock_for_video_analysis') as mock_bedrock, \
             patch.object(index, 'perform_traditional_video_analysis') as mock_traditional:
            
            mock_bedrock.return_value = {
                'confidence': 0.8,
                'techniques': ['face_swap'],
                'modelUsed': 'amazon.titan-image-generator-v1'
            }
            
            mock_traditional.return_value = {
                'confidence': 0.6,
                'techniques': ['temporal_inconsistency'],
                'frameCount': 1800
            }
            
            result = index.analyze_video_deepfake('test-video-123', sample_media_info)
            
            assert 'deepfakeConfidence' in result
            assert 'detectedTechniques' in result
            assert 'analysisDetails' in result
            assert result['deepfakeConfidence'] >= 0
    
    def test_analyze_image_deepfake(self, s3_bucket, sample_media_info):
        """Test image deepfake analysis."""
        # Modify sample info for image
        sample_media_info['metadata']['mediaType'] = 'image'
        sample_media_info['metadata']['contentType'] = 'image/jpeg'
        
        with patch.object(index, 'call_bedrock_for_image_analysis') as mock_bedrock, \
             patch.object(index, 'perform_traditional_image_analysis') as mock_traditional:
            
            mock_bedrock.return_value = {
                'confidence': 0.7,
                'techniques': ['gan_artifacts'],
                'modelUsed': 'amazon.titan-image-generator-v1'
            }
            
            mock_traditional.return_value = {
                'confidence': 0.5,
                'techniques': ['exif_analysis'],
                'properties': {'width': 1920, 'height': 1080}
            }
            
            result = index.analyze_image_deepfake('test-image-123', sample_media_info)
            
            assert 'deepfakeConfidence' in result
            assert 'detectedTechniques' in result
            assert result['deepfakeConfidence'] >= 0
    
    def test_analyze_audio_deepfake(self, s3_bucket, sample_media_info):
        """Test audio deepfake analysis."""
        # Modify sample info for audio
        sample_media_info['metadata']['mediaType'] = 'audio'
        sample_media_info['metadata']['contentType'] = 'audio/mp3'
        
        result = index.analyze_audio_deepfake('test-audio-123', sample_media_info)
        
        assert 'deepfakeConfidence' in result
        assert 'detectedTechniques' in result
        assert result['deepfakeConfidence'] >= 0
    
    def test_calculate_composite_confidence(self):
        """Test composite confidence calculation."""
        # Test with valid scores
        scores = [0.8, 0.6, 0.7]
        result = index.calculate_composite_confidence(scores)
        expected = sum(scores) / len(scores)
        assert abs(result - expected) < 0.001
        
        # Test with empty list
        result = index.calculate_composite_confidence([])
        assert result == 0.0
        
        # Test with invalid scores
        scores = [-1.0, 1.5, 0.5]
        result = index.calculate_composite_confidence(scores)
        assert result == 0.5  # Only valid score
    
    def test_store_analysis_results(self, dynamodb_table):
        """Test storing analysis results in audit table."""
        detection_result = {
            'mediaId': 'test-media-123',
            'deepfakeConfidence': 0.75,
            'detectedTechniques': ['face_swap'],
            'analysisTimestamp': datetime.utcnow().isoformat()
        }
        
        # Should not raise an exception
        index.store_analysis_results('test-media-123', detection_result)
        
        # Verify the record was stored
        response = dynamodb_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': 'test-media-123'}
        )
        
        assert len(response['Items']) > 0
        stored_item = response['Items'][0]
        assert stored_item['eventType'] == 'deepfake_analysis'
        assert stored_item['data']['deepfakeConfidence'] == 0.75
    
    def test_error_handling(self, dynamodb_table, s3_bucket):
        """Test error handling in various scenarios."""
        event = {'mediaId': 'test-media-123'}
        context = MagicMock()
        
        # Test with DynamoDB error
        with patch.object(index.audit_table, 'query', side_effect=Exception('DynamoDB error')):
            response = index.handler(event, context)
            assert response['statusCode'] == 500
            body = json.loads(response['body'])
            assert 'Deepfake detection failed' in body['error']
    
    @patch('index.bedrock_client')
    def test_bedrock_integration_mock(self, mock_bedrock_client):
        """Test Bedrock integration with mocked client."""
        mock_response = {
            'body': json.dumps({
                'confidence': 0.85,
                'techniques': ['face_swap', 'temporal_inconsistency']
            })
        }
        mock_bedrock_client.invoke_model.return_value = mock_response
        
        result = index.call_bedrock_for_video_analysis('test-bucket', 'test-key')
        
        # Since we're using placeholder implementation, check basic structure
        assert 'confidence' in result
        assert isinstance(result['confidence'], float)
    
    def test_performance_metrics(self, dynamodb_table, s3_bucket, sample_media_info):
        """Test that performance metrics are captured."""
        dynamodb_table.put_item(Item=sample_media_info)
        
        event = {'mediaId': 'test-video-123'}
        context = MagicMock()
        
        with patch.object(index, 'perform_deepfake_detection') as mock_detection:
            mock_detection.return_value = {
                'mediaId': 'test-video-123',
                'deepfakeConfidence': 0.75,
                'processingTime': 2.5,
                'analysisTimestamp': datetime.utcnow().isoformat()
            }
            
            response = index.handler(event, context)
            
            body = json.loads(response['body'])
            assert 'processingTime' in body['analysisResult']
            assert body['analysisResult']['processingTime'] > 0

if __name__ == '__main__':
    pytest.main([__file__])