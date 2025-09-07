import pytest
import json
import boto3
from moto import mock_dynamodb
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
def sample_analysis_data():
    """Sample analysis data for testing."""
    return {
        'metadata': {
            'filename': 'test-video.mp4',
            'fileSize': 1024000,
            'contentType': 'video/mp4',
            'mediaType': 'video',
            'uploadTimestamp': datetime.utcnow().isoformat(),
            'lastModified': datetime.utcnow().isoformat(),
            'etag': 'abc123def456',
            'serverSideEncryption': 'AES256'
        },
        'deepfakeAnalysis': {
            'deepfakeConfidence': 0.25,  # Low confidence = likely authentic
            'detectedTechniques': [],
            'analysisTimestamp': datetime.utcnow().isoformat(),
            'processingTime': 2.5
        },
        'sourceVerification': {
            'verificationStatus': 'verified',
            'sourceReputation': 'high',
            'originalSource': 'trusted-news-outlet'
        },
        'allRecords': [
            {
                'mediaId': 'test-media-123',
                'timestamp': datetime.utcnow().isoformat(),
                'eventType': 'media_upload'
            }
        ]
    }

class TestTrustScoreCalculator:
    """Test cases for the trust score calculator Lambda function."""
    
    def test_handler_missing_media_id(self, dynamodb_table):
        """Test handler with missing mediaId parameter."""
        event = {}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'Missing mediaId parameter' in body['error']
    
    def test_handler_successful_calculation(self, dynamodb_table, sample_analysis_data):
        """Test successful trust score calculation."""
        event = {'mediaId': 'test-media-123'}
        context = MagicMock()
        
        with patch.object(index, 'get_media_analysis_data') as mock_get_data, \
             patch.object(index, 'store_trust_score') as mock_store:
            
            mock_get_data.return_value = sample_analysis_data
            
            response = index.handler(event, context)
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['mediaId'] == 'test-media-123'
        assert 'trustScore' in body
        assert 'compositeScore' in body['trustScore']
    
    def test_calculate_deepfake_score_authentic(self, sample_analysis_data):
        """Test deepfake score calculation for authentic content."""
        # Low deepfake confidence should result in high trust score
        sample_analysis_data['deepfakeAnalysis']['deepfakeConfidence'] = 0.1
        sample_analysis_data['deepfakeAnalysis']['detectedTechniques'] = []
        
        score = index.calculate_deepfake_score(sample_analysis_data)
        
        assert score >= 80  # Should be high trust score
        assert score <= 100
    
    def test_calculate_deepfake_score_suspicious(self, sample_analysis_data):
        """Test deepfake score calculation for suspicious content."""
        # High deepfake confidence should result in low trust score
        sample_analysis_data['deepfakeAnalysis']['deepfakeConfidence'] = 0.9
        sample_analysis_data['deepfakeAnalysis']['detectedTechniques'] = ['face_swap', 'temporal_inconsistency']
        
        score = index.calculate_deepfake_score(sample_analysis_data)
        
        assert score <= 20  # Should be low trust score
        assert score >= 0
    
    def test_calculate_deepfake_score_no_data(self):
        """Test deepfake score calculation with no analysis data."""
        analysis_data = {}
        
        score = index.calculate_deepfake_score(analysis_data)
        
        assert score == 50.0  # Neutral score when no data
    
    def test_calculate_source_reliability_score_verified(self, sample_analysis_data):
        """Test source reliability score for verified source."""
        sample_analysis_data['sourceVerification']['verificationStatus'] = 'verified'
        sample_analysis_data['sourceVerification']['sourceReputation'] = 'high'
        
        score = index.calculate_source_reliability_score(sample_analysis_data)
        
        assert score >= 90  # Should be very high
        assert score <= 100
    
    def test_calculate_source_reliability_score_suspicious(self, sample_analysis_data):
        """Test source reliability score for suspicious source."""
        sample_analysis_data['sourceVerification']['verificationStatus'] = 'suspicious'
        sample_analysis_data['sourceVerification']['sourceReputation'] = 'low'
        
        score = index.calculate_source_reliability_score(sample_analysis_data)
        
        assert score <= 30  # Should be low
        assert score >= 0
    
    def test_calculate_metadata_consistency_score_consistent(self, sample_analysis_data):
        """Test metadata consistency score for consistent metadata."""
        # Good metadata should result in high score
        score = index.calculate_metadata_consistency_score(sample_analysis_data)
        
        assert score >= 80  # Should be high
        assert score <= 100
    
    def test_calculate_metadata_consistency_score_inconsistent(self, sample_analysis_data):
        """Test metadata consistency score for inconsistent metadata."""
        # Add inconsistencies
        sample_analysis_data['metadata']['fileSize'] = 0  # Zero file size
        sample_analysis_data['metadata']['filename'] = None  # Missing filename
        
        score = index.calculate_metadata_consistency_score(sample_analysis_data)
        
        assert score <= 80  # Should be reduced due to inconsistencies
    
    def test_calculate_historical_pattern_score_new_content(self, sample_analysis_data):
        """Test historical pattern score for new content."""
        # Single record should get neutral-positive score
        sample_analysis_data['allRecords'] = [
            {
                'mediaId': 'test-media-123',
                'timestamp': datetime.utcnow().isoformat(),
                'eventType': 'media_upload'
            }
        ]
        
        score = index.calculate_historical_pattern_score('test-media-123', sample_analysis_data)
        
        assert score == 70.0  # Neutral-positive for new content
    
    def test_calculate_technical_integrity_score_good(self, sample_analysis_data):
        """Test technical integrity score for good technical properties."""
        score = index.calculate_technical_integrity_score(sample_analysis_data)
        
        assert score >= 70  # Should be good
        assert score <= 100
    
    def test_calculate_technical_integrity_score_poor(self, sample_analysis_data):
        """Test technical integrity score for poor technical properties."""
        # Remove good properties
        sample_analysis_data['metadata']['etag'] = None
        sample_analysis_data['metadata']['serverSideEncryption'] = None
        sample_analysis_data['metadata']['technicalMetadata'] = {'extractionFailed': True}
        
        score = index.calculate_technical_integrity_score(sample_analysis_data)
        
        assert score <= 70  # Should be reduced
    
    def test_calculate_composite_score(self):
        """Test composite score calculation with weighted components."""
        scores = {
            'deepfake': 80.0,
            'sourceReliability': 90.0,
            'metadataConsistency': 85.0,
            'technicalIntegrity': 75.0,
            'historicalPattern': 70.0
        }
        
        composite = index.calculate_composite_score(scores)
        
        # Should be weighted average, with deepfake having highest weight
        assert composite > 75.0
        assert composite < 90.0
    
    def test_determine_confidence_level(self, sample_analysis_data):
        """Test confidence level determination."""
        # High data completeness should give high confidence
        confidence = index.determine_confidence_level(sample_analysis_data, 85.0)
        assert confidence == 'high'
        
        # Low data completeness should give low confidence
        limited_data = {'metadata': sample_analysis_data['metadata']}
        confidence = index.determine_confidence_level(limited_data, 85.0)
        assert confidence == 'low'
    
    def test_get_trust_factors(self, sample_analysis_data):
        """Test trust factors extraction."""
        factors = index.get_trust_factors(sample_analysis_data)
        
        assert len(factors) >= 2  # Should have deepfake and source factors
        
        # Check factor structure
        for factor in factors:
            assert 'category' in factor
            assert 'impact' in factor
            assert 'description' in factor
            assert 'weight' in factor
    
    def test_generate_recommendations_high_trust(self):
        """Test recommendations for high trust content."""
        recommendations = index.generate_recommendations(85.0, {})
        
        assert len(recommendations) > 0
        assert any('High trust' in rec for rec in recommendations)
    
    def test_generate_recommendations_low_trust(self, sample_analysis_data):
        """Test recommendations for low trust content."""
        # Add high deepfake confidence
        sample_analysis_data['deepfakeAnalysis']['deepfakeConfidence'] = 0.8
        
        recommendations = index.generate_recommendations(25.0, sample_analysis_data)
        
        assert len(recommendations) > 0
        assert any('High risk' in rec for rec in recommendations)
        assert any('deepfake indicators' in rec for rec in recommendations)
    
    def test_store_trust_score(self, dynamodb_table):
        """Test storing trust score in audit table."""
        trust_score_result = {
            'mediaId': 'test-media-123',
            'compositeScore': 85.5,
            'confidence': 'high',
            'calculationTimestamp': datetime.utcnow().isoformat()
        }
        
        # Should not raise an exception
        index.store_trust_score('test-media-123', trust_score_result)
        
        # Verify the record was stored
        response = dynamodb_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': 'test-media-123'}
        )
        
        assert len(response['Items']) > 0
        stored_item = response['Items'][0]
        assert stored_item['eventType'] == 'trust_score_calculation'
        assert stored_item['data']['compositeScore'] == 85.5
    
    def test_get_media_analysis_data(self, dynamodb_table):
        """Test retrieving media analysis data."""
        # Store sample records
        test_records = [
            {
                'mediaId': 'test-media-123',
                'timestamp': '2024-01-01T10:00:00Z',
                'eventType': 'metadata_extraction',
                'metadata': {'filename': 'test.mp4'}
            },
            {
                'mediaId': 'test-media-123',
                'timestamp': '2024-01-01T10:01:00Z',
                'eventType': 'deepfake_analysis',
                'data': {'deepfakeConfidence': 0.3}
            }
        ]
        
        for record in test_records:
            dynamodb_table.put_item(Item=record)
        
        analysis_data = index.get_media_analysis_data('test-media-123')
        
        assert analysis_data is not None
        assert 'metadata' in analysis_data
        assert 'deepfakeAnalysis' in analysis_data
        assert len(analysis_data['allRecords']) == 2
    
    def test_error_handling(self, dynamodb_table):
        """Test error handling in various scenarios."""
        event = {'mediaId': 'test-media-123'}
        context = MagicMock()
        
        # Test with DynamoDB error
        with patch.object(index, 'get_media_analysis_data', side_effect=Exception('DynamoDB error')):
            response = index.handler(event, context)
            assert response['statusCode'] == 500
            body = json.loads(response['body'])
            assert 'Trust score calculation failed' in body['error']
    
    def test_edge_cases(self):
        """Test edge cases and boundary conditions."""
        # Test with empty analysis data
        result = index.calculate_trust_score('test-media-123')
        assert 'error' in result
        assert result['compositeScore'] == 0.0
        
        # Test composite score with no valid scores
        composite = index.calculate_composite_score({})
        assert composite == 0.0
        
        # Test with negative scores (should be handled gracefully)
        scores = {'deepfake': -10.0, 'sourceReliability': 150.0}
        composite = index.calculate_composite_score(scores)
        assert composite >= 0.0

if __name__ == '__main__':
    pytest.main([__file__])