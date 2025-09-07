import pytest
import json
import boto3
from moto import mock_dynamodb, mock_s3, mock_lambda
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
def integration_setup(aws_credentials, mock_environment):
    """Set up complete integration test environment."""
    with mock_dynamodb(), mock_s3(), mock_lambda():
        # Create DynamoDB table
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
        
        # Create S3 bucket with test media
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket='test-media-bucket')
        
        # Add test media files
        test_files = [
            ('uploads/high_quality_image.jpg', b'high quality image content', 'image/jpeg'),
            ('uploads/low_quality_image.jpg', b'low quality image', 'image/jpeg'),
            ('uploads/large_video.mp4', b'large video content' * 1000, 'video/mp4'),
            ('uploads/small_video.mp4', b'small video', 'video/mp4'),
            ('uploads/audio_file.mp3', b'audio content', 'audio/mp3')
        ]
        
        for key, content, content_type in test_files:
            s3.put_object(
                Bucket='test-media-bucket',
                Key=key,
                Body=content,
                ContentType=content_type
            )
        
        yield {
            'dynamodb_table': table,
            's3_client': s3,
            'test_files': test_files
        }

class TestSmartModelSelection:
    """Integration tests for smart model selection."""
    
    def test_model_selection_large_file(self, integration_setup):
        """Test model selection for large files."""
        file_size = 5 * 1024 * 1024  # 5MB
        metadata = {'complexity_score': 0.8}
        
        models = index.select_optimal_models(file_size, 'image', metadata)
        
        # Should select multiple models for large, complex files
        assert len(models) >= 2
        
        # Should include Sonnet for detailed analysis
        model_names = [m['name'] for m in models]
        assert 'Claude 3 Sonnet' in model_names
        assert 'Claude 3 Haiku' in model_names
        assert 'Amazon Titan' in model_names  # Due to high complexity
    
    def test_model_selection_small_file(self, integration_setup):
        """Test model selection for small files."""
        file_size = 100 * 1024  # 100KB
        metadata = {'complexity_score': 0.3}
        
        models = index.select_optimal_models(file_size, 'image', metadata)
        
        # Should select fewer models for small, simple files
        model_names = [m['name'] for m in models]
        assert 'Claude 3 Haiku' in model_names
        assert 'Claude 3 Sonnet' not in model_names  # Too small for Sonnet
        assert 'Amazon Titan' not in model_names  # Not complex enough
    
    def test_model_selection_fallback(self, integration_setup):
        """Test model selection fallback on error."""
        with patch.object(index, 'logger') as mock_logger:
            # Simulate error in model selection
            with patch('builtins.len', side_effect=Exception('Selection error')):
                models = index.select_optimal_models(1024, 'image', {})
        
        # Should fallback to Haiku only
        assert len(models) == 1
        assert models[0]['name'] == 'Claude 3 Haiku'
        assert models[0]['priority'] == 'fallback'

class TestEnsembleAnalysis:
    """Integration tests for ensemble analysis."""
    
    def test_ensemble_analysis_success(self, integration_setup):
        """Test successful ensemble analysis with multiple models."""
        models = [
            {
                'model_id': 'anthropic.claude-3-sonnet-20240229-v1:0',
                'name': 'Claude 3 Sonnet',
                'priority': 'high'
            },
            {
                'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
                'name': 'Claude 3 Haiku',
                'priority': 'standard'
            }
        ]
        
        results = index.perform_ensemble_analysis('test-bucket', 'test-key', models, 'image')
        
        assert len(results) == 2
        for result in results:
            assert 'confidence' in result
            assert 'model_info' in result
            assert 'techniques' in result
    
    def test_ensemble_analysis_with_errors(self, integration_setup):
        """Test ensemble analysis handling model errors."""
        models = [
            {
                'model_id': 'invalid-model-id',
                'name': 'Invalid Model',
                'priority': 'high'
            },
            {
                'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
                'name': 'Claude 3 Haiku',
                'priority': 'standard'
            }
        ]
        
        results = index.perform_ensemble_analysis('test-bucket', 'test-key', models, 'image')
        
        assert len(results) == 2
        # First result should have error
        assert 'error' in results[0]
        # Second result should be successful
        assert 'error' not in results[1]
        assert results[1]['confidence'] > 0

class TestEnsembleScoring:
    """Integration tests for ensemble scoring algorithms."""
    
    def test_ensemble_confidence_high_agreement(self, integration_setup):
        """Test ensemble confidence with high model agreement."""
        ensemble_results = [
            {
                'confidence': 0.75,
                'model_info': {'priority': 'high', 'name': 'Claude 3 Sonnet'},
                'analysis_depth': 'detailed',
                'certainty': 'high',
                'processing_time': 3.5
            },
            {
                'confidence': 0.73,
                'model_info': {'priority': 'standard', 'name': 'Claude 3 Haiku'},
                'analysis_depth': 'standard',
                'certainty': 'medium',
                'processing_time': 1.2
            },
            {
                'confidence': 0.76,
                'model_info': {'priority': 'supplementary', 'name': 'Amazon Titan'},
                'analysis_depth': 'supplementary',
                'certainty': 'medium',
                'processing_time': 2.1
            }
        ]
        
        confidence = index.calculate_ensemble_confidence(ensemble_results)
        
        # Should be close to the weighted average with consensus bonus
        assert 0.70 <= confidence <= 0.80
        assert confidence > 0.74  # Should get consensus bonus for high agreement
    
    def test_ensemble_confidence_low_agreement(self, integration_setup):
        """Test ensemble confidence with low model agreement."""
        ensemble_results = [
            {
                'confidence': 0.9,
                'model_info': {'priority': 'high', 'name': 'Claude 3 Sonnet'},
                'analysis_depth': 'detailed',
                'certainty': 'high'
            },
            {
                'confidence': 0.3,
                'model_info': {'priority': 'standard', 'name': 'Claude 3 Haiku'},
                'analysis_depth': 'standard',
                'certainty': 'low'
            },
            {
                'confidence': 0.6,
                'model_info': {'priority': 'supplementary', 'name': 'Amazon Titan'},
                'analysis_depth': 'supplementary',
                'certainty': 'medium'
            }
        ]
        
        confidence = index.calculate_ensemble_confidence(ensemble_results)
        
        # Should be penalized for low agreement
        assert confidence < 0.65  # Should get consensus penalty
    
    def test_consensus_metrics_calculation(self, integration_setup):
        """Test detailed consensus metrics calculation."""
        ensemble_results = [
            {
                'confidence': 0.75,
                'techniques': ['face_swap', 'lighting_inconsistency'],
                'model_info': {'name': 'Claude 3 Sonnet'}
            },
            {
                'confidence': 0.73,
                'techniques': ['face_swap', 'compression_artifacts'],
                'model_info': {'name': 'Claude 3 Haiku'}
            },
            {
                'confidence': 0.76,
                'techniques': ['face_swap', 'texture_analysis'],
                'model_info': {'name': 'Amazon Titan'}
            }
        ]
        
        metrics = index.calculate_consensus_metrics(ensemble_results)
        
        assert 'agreement' in metrics
        assert 'confidence_variance' in metrics
        assert 'technique_agreement' in metrics
        assert 'models_count' in metrics
        assert metrics['models_count'] == 3
        assert metrics['technique_agreement'] > 0  # Should have some common techniques

class TestEndToEndIntegration:
    """End-to-end integration tests."""
    
    def test_complete_image_analysis_pipeline(self, integration_setup):
        """Test complete image analysis from handler to results."""
        media_info = {
            'mediaId': 'test-image-123',
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'metadata_extraction',
            'metadata': {
                'filename': 'test-image.jpg',
                'fileSize': 2 * 1024 * 1024,  # 2MB
                'contentType': 'image/jpeg',
                'mediaType': 'image',
                's3Location': {
                    'bucket': 'test-media-bucket',
                    'key': 'uploads/high_quality_image.jpg'
                }
            }
        }
        
        # Store media info in DynamoDB
        integration_setup['dynamodb_table'].put_item(Item=media_info)
        
        # Test the complete analysis
        event = {'mediaId': 'test-image-123'}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'analysisResult' in body
        assert 'deepfakeConfidence' in body['analysisResult']
        assert 'analysisDetails' in body['analysisResult']
        assert 'ensembleResults' in body['analysisResult']['analysisDetails']
    
    def test_video_analysis_pipeline(self, integration_setup):
        """Test video analysis pipeline."""
        media_info = {
            'mediaId': 'test-video-456',
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'metadata_extraction',
            'metadata': {
                'filename': 'test-video.mp4',
                'fileSize': 10 * 1024 * 1024,  # 10MB
                'contentType': 'video/mp4',
                'mediaType': 'video',
                's3Location': {
                    'bucket': 'test-media-bucket',
                    'key': 'uploads/large_video.mp4'
                }
            }
        }
        
        integration_setup['dynamodb_table'].put_item(Item=media_info)
        
        event = {'mediaId': 'test-video-456'}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['analysisResult']['mediaType'] == 'video'
    
    def test_error_handling_integration(self, integration_setup):
        """Test error handling in integration scenarios."""
        # Test with non-existent media
        event = {'mediaId': 'non-existent-media'}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 404
        body = json.loads(response['body'])
        assert 'Media not found' in body['error']
    
    def test_performance_under_load(self, integration_setup):
        """Test performance with multiple concurrent analyses."""
        # Create multiple media items
        media_items = []
        for i in range(5):
            media_info = {
                'mediaId': f'test-media-{i}',
                'timestamp': datetime.utcnow().isoformat(),
                'eventType': 'metadata_extraction',
                'metadata': {
                    'filename': f'test-image-{i}.jpg',
                    'fileSize': 1024 * 1024,  # 1MB
                    'contentType': 'image/jpeg',
                    'mediaType': 'image',
                    's3Location': {
                        'bucket': 'test-media-bucket',
                        'key': f'uploads/test-image-{i}.jpg'
                    }
                }
            }
            integration_setup['dynamodb_table'].put_item(Item=media_info)
            media_items.append(media_info)
        
        # Test concurrent processing
        results = []
        for i in range(5):
            event = {'mediaId': f'test-media-{i}'}
            context = MagicMock()
            
            start_time = datetime.utcnow()
            response = index.handler(event, context)
            end_time = datetime.utcnow()
            
            processing_time = (end_time - start_time).total_seconds()
            results.append({
                'response': response,
                'processing_time': processing_time
            })
        
        # Verify all succeeded
        for result in results:
            assert result['response']['statusCode'] == 200
            assert result['processing_time'] < 10  # Should complete within 10 seconds

class TestModelSpecificBehavior:
    """Test model-specific behavior and integration."""
    
    def test_claude_sonnet_detailed_analysis(self, integration_setup):
        """Test Claude Sonnet's detailed analysis capabilities."""
        model = {
            'model_id': 'anthropic.claude-3-sonnet-20240229-v1:0',
            'name': 'Claude 3 Sonnet',
            'priority': 'high'
        }
        
        result = index.call_claude_sonnet_analysis('test-bucket', 'test-key', model)
        
        assert 'confidence' in result
        assert 'techniques' in result
        assert 'details' in result
        assert 'certainty' in result
        assert result['analysis_depth'] == 'detailed'
        assert result['processing_time'] > 2.0  # Should take more time for detailed analysis
    
    def test_claude_haiku_fast_analysis(self, integration_setup):
        """Test Claude Haiku's fast analysis capabilities."""
        model = {
            'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
            'name': 'Claude 3 Haiku',
            'priority': 'standard'
        }
        
        result = index.call_claude_haiku_analysis('test-bucket', 'test-key', model)
        
        assert 'confidence' in result
        assert 'techniques' in result
        assert 'speed' in result
        assert result['speed'] == 'fast'
        assert result['analysis_depth'] == 'standard'
        assert result['processing_time'] < 2.0  # Should be fast
    
    def test_model_weight_calculation(self, integration_setup):
        """Test model weight calculation for ensemble scoring."""
        # High priority, detailed analysis
        model_info = {'priority': 'high', 'name': 'Claude 3 Sonnet'}
        result = {
            'analysis_depth': 'detailed',
            'certainty': 'high',
            'processing_time': 3.5
        }
        
        weight = index.calculate_model_weight(model_info, result)
        assert weight > 1.5  # Should get multiple bonuses
        
        # Low priority, basic analysis
        model_info = {'priority': 'fallback', 'name': 'Generic Model'}
        result = {
            'analysis_depth': 'basic',
            'certainty': 'low',
            'processing_time': 0.5
        }
        
        weight = index.calculate_model_weight(model_info, result)
        assert weight < 1.0  # Should get penalties

if __name__ == '__main__':
    pytest.main([__file__, '-v'])