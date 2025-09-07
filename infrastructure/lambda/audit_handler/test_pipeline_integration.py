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
def pipeline_setup(aws_credentials, mock_environment):
    """Set up complete pipeline integration test environment."""
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
        
        # Create S3 bucket
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket='test-media-bucket')
        
        # Create Lambda client
        lambda_client = boto3.client('lambda', region_name='us-east-1')
        
        yield {
            'dynamodb_table': table,
            's3_client': s3,
            'lambda_client': lambda_client
        }

class TestPipelineIntegration:
    """Integration tests for the complete media analysis pipeline."""
    
    def test_s3_to_deepfake_pipeline(self, pipeline_setup):
        """Test complete S3 upload to deepfake analysis pipeline."""
        # Simulate S3 upload event
        s3_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {
                            'key': 'uploads/suspicious-image.jpg',
                            'size': 2048000,
                            'eTag': 'abc123def456'
                        }
                    },
                    'requestParameters': {
                        'sourceIPAddress': '192.168.1.100'
                    }
                }
            ]
        }
        
        # Mock the deepfake detector response
        mock_deepfake_response = {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': 'suspicious-image_12345678',
                'analysisResult': {
                    'deepfakeConfidence': 0.85,
                    'detectedTechniques': ['face_swap', 'lighting_inconsistency'],
                    'analysisDetails': {
                        'ensembleResults': [
                            {
                                'confidence': 0.87,
                                'model_info': {'name': 'Claude 3 Sonnet'},
                                'techniques': ['face_swap']
                            },
                            {
                                'confidence': 0.83,
                                'model_info': {'name': 'Claude 3 Haiku'},
                                'techniques': ['lighting_inconsistency']
                            }
                        ],
                        'consensusMetrics': {
                            'agreement': 'high',
                            'models_count': 2
                        }
                    }
                }
            })
        }
        
        with patch.object(index, 'invoke_lambda_function', return_value=mock_deepfake_response):
            context = MagicMock()
            response = index.handler(s3_event, context)
        
        assert response['statusCode'] == 200
        
        # Verify audit records were created
        audit_records = pipeline_setup['dynamodb_table'].scan()['Items']
        assert len(audit_records) > 0
        
        # Find the deepfake analysis record
        deepfake_record = None
        for record in audit_records:
            if record.get('eventType') == 'deepfake_analysis_complete':
                deepfake_record = record
                break
        
        assert deepfake_record is not None
        assert deepfake_record['data']['deepfakeConfidence'] == 0.85
        assert 'face_swap' in deepfake_record['data']['detectedTechniques']
    
    def test_batch_processing_pipeline(self, pipeline_setup):
        """Test batch processing of multiple media files."""
        # Create multiple S3 objects
        s3_objects = [
            'uploads/image1.jpg',
            'uploads/image2.png',
            'uploads/video1.mp4',
            'uploads/audio1.mp3'
        ]
        
        for obj_key in s3_objects:
            pipeline_setup['s3_client'].put_object(
                Bucket='test-media-bucket',
                Key=obj_key,
                Body=b'test content',
                ContentType='image/jpeg' if obj_key.endswith('.jpg') else 'application/octet-stream'
            )
        
        # Create batch S3 event
        batch_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': obj_key, 'size': 1024}
                    }
                } for obj_key in s3_objects
            ]
        }
        
        # Mock deepfake responses for each file
        def mock_deepfake_invoke(function_name, payload):
            media_id = json.loads(payload)['mediaId']
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'mediaId': media_id,
                    'analysisResult': {
                        'deepfakeConfidence': 0.3,  # Low confidence (likely authentic)
                        'detectedTechniques': [],
                        'analysisDetails': {
                            'ensembleResults': [
                                {
                                    'confidence': 0.3,
                                    'model_info': {'name': 'Claude 3 Haiku'},
                                    'techniques': []
                                }
                            ]
                        }
                    }
                })
            }
        
        with patch.object(index, 'invoke_lambda_function', side_effect=mock_deepfake_invoke):
            context = MagicMock()
            response = index.handler(batch_event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['processedRecords'] == 4
        
        # Verify all files were processed
        audit_records = pipeline_setup['dynamodb_table'].scan()['Items']
        processed_files = set()
        for record in audit_records:
            if 'objectKey' in record:
                processed_files.add(record['objectKey'])
        
        assert len(processed_files) == 4
    
    def test_error_recovery_pipeline(self, pipeline_setup):
        """Test pipeline error recovery and partial processing."""
        # Create S3 event with mix of valid and problematic files
        mixed_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/valid-image.jpg', 'size': 1024}
                    }
                },
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/corrupted-file.jpg', 'size': 0}  # Zero size
                    }
                },
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'non-existent-bucket'},  # Wrong bucket
                        'object': {'key': 'uploads/missing-file.jpg', 'size': 1024}
                    }
                }
            ]
        }
        
        # Mock deepfake responses - some succeed, some fail
        def mock_deepfake_invoke_with_errors(function_name, payload):
            media_id = json.loads(payload)['mediaId']
            if 'corrupted' in media_id:
                return {
                    'statusCode': 500,
                    'body': json.dumps({'error': 'Analysis failed for corrupted file'})
                }
            elif 'missing' in media_id:
                return {
                    'statusCode': 404,
                    'body': json.dumps({'error': 'File not found'})
                }
            else:
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'mediaId': media_id,
                        'analysisResult': {'deepfakeConfidence': 0.2}
                    })
                }
        
        with patch.object(index, 'invoke_lambda_function', side_effect=mock_deepfake_invoke_with_errors):
            context = MagicMock()
            response = index.handler(mixed_event, context)
        
        # Should still return success for partial processing
        assert response['statusCode'] == 200
        
        # Verify error records were created
        audit_records = pipeline_setup['dynamodb_table'].scan()['Items']
        error_records = [r for r in audit_records if r.get('eventType') == 'processing_error']
        success_records = [r for r in audit_records if r.get('eventType') == 'deepfake_analysis_complete']
        
        assert len(error_records) >= 1  # At least one error
        assert len(success_records) >= 1  # At least one success
    
    def test_audit_trail_integrity(self, pipeline_setup):
        """Test audit trail integrity throughout the pipeline."""
        s3_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/integrity-test.jpg', 'size': 1024}
                    }
                }
            ]
        }
        
        mock_deepfake_response = {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': 'integrity-test_12345678',
                'analysisResult': {
                    'deepfakeConfidence': 0.65,
                    'detectedTechniques': ['compression_artifacts']
                }
            })
        }
        
        with patch.object(index, 'invoke_lambda_function', return_value=mock_deepfake_response):
            context = MagicMock()
            response = index.handler(s3_event, context)
        
        # Verify audit trail integrity
        audit_records = pipeline_setup['dynamodb_table'].scan()['Items']
        
        # Sort records by timestamp
        audit_records.sort(key=lambda x: x['timestamp'])
        
        # Verify hash chain integrity
        previous_hash = 'genesis'
        for record in audit_records:
            if record['mediaId'] == 'integrity-test_12345678':
                integrity_data = record.get('integrity', {})
                assert integrity_data.get('previousHash') == previous_hash
                assert 'currentHash' in integrity_data
                previous_hash = integrity_data['currentHash']
        
        # Verify all expected record types exist
        event_types = {record['eventType'] for record in audit_records}
        expected_types = {
            'media_upload',
            'metadata_extraction_complete',
            'deepfake_analysis_complete'
        }
        assert expected_types.issubset(event_types)
    
    def test_performance_metrics_collection(self, pipeline_setup):
        """Test collection of performance metrics throughout pipeline."""
        s3_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/performance-test.jpg', 'size': 2048000}
                    }
                }
            ]
        }
        
        mock_deepfake_response = {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': 'performance-test_12345678',
                'analysisResult': {
                    'deepfakeConfidence': 0.45,
                    'processingTime': 3.2,
                    'analysisDetails': {
                        'ensembleResults': [
                            {
                                'confidence': 0.45,
                                'processing_time': 3.2,
                                'model_info': {'name': 'Claude 3 Sonnet'}
                            }
                        ]
                    }
                }
            })
        }
        
        with patch.object(index, 'invoke_lambda_function', return_value=mock_deepfake_response):
            context = MagicMock()
            start_time = datetime.utcnow()
            response = index.handler(s3_event, context)
            end_time = datetime.utcnow()
        
        total_processing_time = (end_time - start_time).total_seconds()
        
        # Verify performance metrics are collected
        audit_records = pipeline_setup['dynamodb_table'].scan()['Items']
        
        performance_record = None
        for record in audit_records:
            if record.get('eventType') == 'deepfake_analysis_complete':
                performance_record = record
                break
        
        assert performance_record is not None
        assert 'processingMetrics' in performance_record
        
        metrics = performance_record['processingMetrics']
        assert 'totalProcessingTime' in metrics
        assert 'deepfakeAnalysisTime' in metrics
        assert metrics['totalProcessingTime'] > 0
        assert metrics['deepfakeAnalysisTime'] == 3.2

class TestAdvancedPipelineScenarios:
    """Advanced pipeline integration scenarios."""
    
    def test_high_volume_processing(self, pipeline_setup):
        """Test pipeline under high volume load."""
        # Create 20 simultaneous uploads
        high_volume_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': f'uploads/volume-test-{i}.jpg', 'size': 1024}
                    }
                } for i in range(20)
            ]
        }
        
        def mock_deepfake_invoke_fast(function_name, payload):
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'mediaId': json.loads(payload)['mediaId'],
                    'analysisResult': {'deepfakeConfidence': 0.1}
                })
            }
        
        with patch.object(index, 'invoke_lambda_function', side_effect=mock_deepfake_invoke_fast):
            context = MagicMock()
            start_time = datetime.utcnow()
            response = index.handler(high_volume_event, context)
            end_time = datetime.utcnow()
        
        processing_time = (end_time - start_time).total_seconds()
        
        assert response['statusCode'] == 200
        assert processing_time < 30  # Should complete within 30 seconds
        
        # Verify all files were processed
        body = json.loads(response['body'])
        assert body['processedRecords'] == 20
    
    def test_mixed_media_types_pipeline(self, pipeline_setup):
        """Test pipeline with mixed media types."""
        mixed_media_event = {
            'Records': [
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/image.jpg', 'size': 1024}
                    }
                },
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/video.mp4', 'size': 5120000}
                    }
                },
                {
                    'eventSource': 'aws:s3',
                    'eventName': 'ObjectCreated:Put',
                    's3': {
                        'bucket': {'name': 'test-media-bucket'},
                        'object': {'key': 'uploads/audio.mp3', 'size': 2048000}
                    }
                }
            ]
        }
        
        def mock_deepfake_invoke_by_type(function_name, payload):
            media_id = json.loads(payload)['mediaId']
            if 'image' in media_id:
                confidence = 0.7
                techniques = ['face_swap']
            elif 'video' in media_id:
                confidence = 0.8
                techniques = ['temporal_inconsistency']
            else:  # audio
                confidence = 0.4
                techniques = ['voice_synthesis']
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'mediaId': media_id,
                    'analysisResult': {
                        'deepfakeConfidence': confidence,
                        'detectedTechniques': techniques
                    }
                })
            }
        
        with patch.object(index, 'invoke_lambda_function', side_effect=mock_deepfake_invoke_by_type):
            context = MagicMock()
            response = index.handler(mixed_media_event, context)
        
        assert response['statusCode'] == 200
        
        # Verify different analysis results for different media types
        audit_records = pipeline_setup['dynamodb_table'].scan()['Items']
        analysis_records = [r for r in audit_records if r.get('eventType') == 'deepfake_analysis_complete']
        
        assert len(analysis_records) == 3
        
        # Check that different media types got different analysis results
        confidences = [r['data']['deepfakeConfidence'] for r in analysis_records]
        assert len(set(confidences)) == 3  # All different confidence scores

if __name__ == '__main__':
    pytest.main([__file__, '-v'])