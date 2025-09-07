#!/usr/bin/env python3
"""
Comprehensive test suite for the Hlekkr Threat Intelligence Processor Lambda function.
Tests threat indicator extraction, pattern analysis, and report generation.
"""

import json
import pytest
import boto3
from moto import mock_dynamodb, mock_s3, mock_sns, mock_cloudwatch, mock_lambda
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import os
import sys

# Add the lambda directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the lambda function
import index

class TestThreatIntelligenceProcessor:
    """Test suite for threat intelligence processing functionality."""
    
    @mock_dynamodb
    @mock_s3
    @mock_sns
    @mock_cloudwatch
    @mock_lambda
    def setup_method(self):
        """Set up test environment with mocked AWS services."""
        # Set environment variables
        os.environ['REVIEW_DECISION_TABLE_NAME'] = 'test-review-decision-table'
        os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
        os.environ['THREAT_INTELLIGENCE_TABLE_NAME'] = 'test-threat-intelligence-table'
        os.environ['THREAT_REPORTS_BUCKET_NAME'] = 'test-threat-reports-bucket'
        os.environ['THREAT_ALERTS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-threat-alerts'
        
        # Create mock DynamoDB tables
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        # Review decision table
        self.review_decision_table = dynamodb.create_table(
            TableName='test-review-decision-table',
            KeySchema=[
                {'AttributeName': 'decisionId', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'decisionId', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        # Audit table
        self.audit_table = dynamodb.create_table(
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
        
        # Threat intelligence table
        self.threat_intelligence_table = dynamodb.create_table(
            TableName='test-threat-intelligence-table',
            KeySchema=[
                {'AttributeName': 'recordId', 'KeyType': 'HASH'},
                {'AttributeName': 'recordType', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'recordId', 'AttributeType': 'S'},
                {'AttributeName': 'recordType', 'AttributeType': 'S'},
                {'AttributeName': 'threatType', 'AttributeType': 'S'},
                {'AttributeName': 'createdAt', 'AttributeType': 'S'},
                {'AttributeName': 'severity', 'AttributeType': 'S'},
                {'AttributeName': 'indicatorType', 'AttributeType': 'S'},
                {'AttributeName': 'indicatorValue', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST',
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'ThreatTypeIndex',
                    'KeySchema': [
                        {'AttributeName': 'threatType', 'KeyType': 'HASH'},
                        {'AttributeName': 'createdAt', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'SeverityIndex',
                    'KeySchema': [
                        {'AttributeName': 'severity', 'KeyType': 'HASH'},
                        {'AttributeName': 'createdAt', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'IndicatorTypeIndex',
                    'KeySchema': [
                        {'AttributeName': 'indicatorType', 'KeyType': 'HASH'},
                        {'AttributeName': 'indicatorValue', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                }
            ]
        )
        
        # Create S3 bucket
        s3 = boto3.client('s3', region_name='us-east-1')
        s3.create_bucket(Bucket='test-threat-reports-bucket')
        
        # Create SNS topic
        sns = boto3.client('sns', region_name='us-east-1')
        sns.create_topic(Name='test-threat-alerts')
    
    def create_test_decision_data(self, decision_type='confirm', confidence=0.9):
        """Create test decision data."""
        return {
            'decision': decision_type,
            'confidence': confidence,
            'findings': {
                'manipulationTechniques': ['face_swap', 'voice_cloning'],
                'suspiciousPatterns': [
                    {'type': 'metadata_inconsistency', 'details': 'timestamp_mismatch'},
                    {'type': 'source_anomaly', 'details': 'suspicious_domain'}
                ],
                'novelTechnique': False,
                'techniqueDetails': {
                    'face_swap': {'confidence': 0.95, 'method': 'deepfakes'},
                    'voice_cloning': {'confidence': 0.85, 'method': 'tacotron'}
                }
            },
            'metadata': {
                'contentHash': 'sha256:abcd1234567890',
                'sourceDomain': 'suspicious-news.com',
                'fileType': 'video/mp4',
                'fileSignature': 'mp4_signature_123',
                'aiConfidence': 0.15  # Low AI confidence, high human confidence
            }
        }
    
    def test_process_review_decision_confirmed_deepfake(self):
        """Test processing a confirmed deepfake decision."""
        event = {
            'operation': 'process_review_decision',
            'mediaId': 'test-media-001',
            'reviewId': 'test-review-001',
            'moderatorId': 'moderator-123',
            'decisionData': self.create_test_decision_data('confirm', 0.95)
        }
        
        response = index.handler(event, {})
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        
        assert body['processed'] == True
        assert body['mediaId'] == 'test-media-001'
        assert body['reviewId'] == 'test-review-001'
        assert body['indicatorsExtracted'] > 0
        assert 'patternAnalysis' in body
        assert 'processedAt' in body
    
    def test_process_review_decision_override(self):
        """Test processing an override decision (should be skipped)."""
        event = {
            'operation': 'process_review_decision',
            'mediaId': 'test-media-002',
            'reviewId': 'test-review-002',
            'moderatorId': 'moderator-123',
            'decisionData': self.create_test_decision_data('override', 0.3)
        }
        
        response = index.handler(event, {})
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        
        # Override decisions should still be processed but with fewer indicators
        assert body['processed'] == True
        assert body['indicatorsExtracted'] == 0  # No indicators for override decisions
    
    def test_extract_threat_indicators_comprehensive(self):
        """Test comprehensive threat indicator extraction."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        media_id = 'test-media-003'
        
        indicators = index.extract_threat_indicators(decision_data, media_id)
        
        # Should extract multiple types of indicators
        assert len(indicators) >= 4  # content_hash, domain, techniques, patterns
        
        # Check indicator types
        indicator_types = [ind.indicator_type for ind in indicators]
        assert 'content_hash' in indicator_types
        assert 'malicious_domain' in indicator_types
        assert 'manipulation_technique' in indicator_types
        assert 'metadata_pattern' in indicator_types
        
        # Check indicator properties
        for indicator in indicators:
            assert indicator.indicator_id is not None
            assert indicator.confidence > 0
            assert indicator.first_seen is not None
            assert indicator.last_seen is not None
            assert indicator.occurrence_count == 1
            assert media_id in indicator.associated_media_ids
            assert indicator.metadata['human_confirmed'] == True
    
    def test_extract_threat_indicators_novel_technique(self):
        """Test threat indicator extraction for novel techniques."""
        decision_data = self.create_test_decision_data('confirm', 0.85)
        decision_data['findings']['novelTechnique'] = True
        decision_data['findings']['manipulationTechniques'] = ['novel_gan_method']
        
        media_id = 'test-media-004'
        
        indicators = index.extract_threat_indicators(decision_data, media_id)
        
        # Should extract indicators including novel technique
        technique_indicators = [ind for ind in indicators if ind.indicator_type == 'manipulation_technique']
        assert len(technique_indicators) >= 1
        
        novel_indicator = technique_indicators[0]
        assert novel_indicator.indicator_value == 'novel_gan_method'
        assert novel_indicator.confidence == 0.85
    
    def test_should_generate_threat_report_high_confidence(self):
        """Test threat report generation decision for high confidence."""
        decision_data = self.create_test_decision_data('confirm', 0.95)
        pattern_analysis = {'pattern_score': 0.3}
        
        should_generate = index.should_generate_threat_report(decision_data, pattern_analysis)
        assert should_generate == True
    
    def test_should_generate_threat_report_pattern_based(self):
        """Test threat report generation decision for pattern-based threats."""
        decision_data = self.create_test_decision_data('suspicious', 0.6)
        pattern_analysis = {'pattern_score': 0.8}  # High pattern score
        
        should_generate = index.should_generate_threat_report(decision_data, pattern_analysis)
        assert should_generate == True
    
    def test_should_generate_threat_report_novel_technique(self):
        """Test threat report generation decision for novel techniques."""
        decision_data = self.create_test_decision_data('confirm', 0.7)
        decision_data['findings']['novelTechnique'] = True
        pattern_analysis = {'pattern_score': 0.2}
        
        should_generate = index.should_generate_threat_report(decision_data, pattern_analysis)
        assert should_generate == True
    
    def test_should_not_generate_threat_report_low_confidence(self):
        """Test threat report generation decision for low confidence."""
        decision_data = self.create_test_decision_data('suspicious', 0.4)
        pattern_analysis = {'pattern_score': 0.2}
        
        should_generate = index.should_generate_threat_report(decision_data, pattern_analysis)
        assert should_generate == False
    
    def test_create_threat_report_comprehensive(self):
        """Test comprehensive threat report creation."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        media_id = 'test-media-005'
        
        # Create test indicators
        indicators = index.extract_threat_indicators(decision_data, media_id)
        pattern_analysis = {
            'pattern_score': 0.6,
            'patterns': {
                'temporal_clustering': {'clustering_detected': True, 'cluster_score': 0.7},
                'campaign_indicators': {'likely_campaign': False, 'campaign_score': 0.3}
            }
        }
        
        threat_report = index.create_threat_report(decision_data, media_id, indicators, pattern_analysis)
        
        # Validate threat report structure
        assert threat_report.report_id is not None
        assert threat_report.threat_type == index.ThreatType.DEEPFAKE_CONFIRMED
        assert threat_report.severity in [index.ThreatSeverity.MEDIUM, index.ThreatSeverity.HIGH]
        assert threat_report.status == index.ThreatStatus.ACTIVE
        assert threat_report.title is not None
        assert threat_report.description is not None
        assert threat_report.created_at is not None
        assert threat_report.updated_at is not None
        assert len(threat_report.indicators) == len(indicators)
        assert threat_report.affected_media_count >= 1
        assert threat_report.confirmed_by_humans == 1
        assert len(threat_report.mitigation_recommendations) > 0
        assert len(threat_report.tags) > 0
        assert 'human-confirmed' in threat_report.tags
    
    def test_classify_threat_coordinated_campaign(self):
        """Test threat classification for coordinated campaigns."""
        decision_data = self.create_test_decision_data('confirm', 0.85)
        pattern_analysis = {'pattern_score': 0.9}  # Very high pattern score
        
        threat_type, severity = index.classify_threat(decision_data, pattern_analysis)
        
        assert threat_type == index.ThreatType.COORDINATED_CAMPAIGN
        assert severity == index.ThreatSeverity.CRITICAL
    
    def test_classify_threat_high_confidence_deepfake(self):
        """Test threat classification for high confidence deepfake."""
        decision_data = self.create_test_decision_data('confirm', 0.95)
        pattern_analysis = {'pattern_score': 0.3}
        
        threat_type, severity = index.classify_threat(decision_data, pattern_analysis)
        
        assert threat_type == index.ThreatType.DEEPFAKE_CONFIRMED
        assert severity == index.ThreatSeverity.HIGH
    
    def test_classify_threat_medium_confidence_deepfake(self):
        """Test threat classification for medium confidence deepfake."""
        decision_data = self.create_test_decision_data('confirm', 0.7)
        pattern_analysis = {'pattern_score': 0.2}
        
        threat_type, severity = index.classify_threat(decision_data, pattern_analysis)
        
        assert threat_type == index.ThreatType.DEEPFAKE_CONFIRMED
        assert severity == index.ThreatSeverity.MEDIUM
    
    def test_generate_threat_title(self):
        """Test threat report title generation."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        
        title = index.generate_threat_title(index.ThreatType.DEEPFAKE_CONFIRMED, decision_data)
        assert title == "Confirmed Deepfake Content"
        
        title = index.generate_threat_title(index.ThreatType.COORDINATED_CAMPAIGN, decision_data)
        assert title == "Coordinated Deepfake Campaign"
    
    def test_generate_threat_description(self):
        """Test threat report description generation."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        indicators = index.extract_threat_indicators(decision_data, 'test-media')
        pattern_analysis = {'pattern_score': 0.6}
        
        description = index.generate_threat_description(decision_data, pattern_analysis, indicators)
        
        assert 'confirm' in description.lower()
        assert '90.0%' in description or '0.9' in description
        assert 'manipulation techniques' in description.lower()
        assert 'pattern analysis' in description.lower()
    
    def test_generate_mitigation_recommendations(self):
        """Test mitigation recommendations generation."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        pattern_analysis = {'pattern_score': 0.3}
        
        recommendations = index.generate_mitigation_recommendations(
            index.ThreatType.DEEPFAKE_CONFIRMED, decision_data, pattern_analysis
        )
        
        assert len(recommendations) >= 3
        assert any('monitor' in rec.lower() for rec in recommendations)
        assert any('update' in rec.lower() for rec in recommendations)
        assert any('scrutiny' in rec.lower() for rec in recommendations)
    
    def test_generate_mitigation_recommendations_coordinated_campaign(self):
        """Test mitigation recommendations for coordinated campaigns."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        pattern_analysis = {'pattern_score': 0.8}
        
        recommendations = index.generate_mitigation_recommendations(
            index.ThreatType.COORDINATED_CAMPAIGN, decision_data, pattern_analysis
        )
        
        assert len(recommendations) >= 6  # Should have additional campaign-specific recommendations
        assert any('coordinated' in rec.lower() for rec in recommendations)
        assert any('share intelligence' in rec.lower() for rec in recommendations)
    
    def test_extract_threat_tags(self):
        """Test threat tag extraction."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        decision_data['findings']['novelTechnique'] = True
        pattern_analysis = {'pattern_score': 0.8}
        
        tags = index.extract_threat_tags(decision_data, pattern_analysis)
        
        assert 'human-confirmed' in tags
        assert 'decision-confirm' in tags
        assert 'technique-face-swap' in tags
        assert 'technique-voice-cloning' in tags
        assert 'novel-technique' in tags
        assert 'coordinated-campaign' in tags
    
    @patch('index.s3_client')
    def test_store_threat_report(self, mock_s3):
        """Test threat report storage."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        media_id = 'test-media-006'
        indicators = index.extract_threat_indicators(decision_data, media_id)
        pattern_analysis = {'pattern_score': 0.6}
        
        threat_report = index.create_threat_report(decision_data, media_id, indicators, pattern_analysis)
        
        # Test storage (mocked)
        index.store_threat_report(threat_report)
        
        # Verify S3 put_object was called
        mock_s3.put_object.assert_called_once()
        call_args = mock_s3.put_object.call_args
        
        assert call_args[1]['Bucket'] == 'test-threat-reports-bucket'
        assert threat_report.report_id in call_args[1]['Key']
        assert call_args[1]['ContentType'] == 'application/json'
        assert call_args[1]['ServerSideEncryption'] == 'AES256'
    
    @patch('index.sns_client')
    def test_send_threat_alert(self, mock_sns):
        """Test threat alert sending."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        media_id = 'test-media-007'
        indicators = index.extract_threat_indicators(decision_data, media_id)
        pattern_analysis = {'pattern_score': 0.6}
        
        threat_report = index.create_threat_report(decision_data, media_id, indicators, pattern_analysis)
        threat_report.severity = index.ThreatSeverity.HIGH  # Ensure alert is sent
        
        index.send_threat_alert(threat_report)
        
        # Verify SNS publish was called
        mock_sns.publish.assert_called_once()
        call_args = mock_sns.publish.call_args
        
        assert call_args[1]['TopicArn'] == 'arn:aws:sns:us-east-1:123456789012:test-threat-alerts'
        assert threat_report.title in call_args[1]['Subject']
        
        # Check message content
        message = json.loads(call_args[1]['Message'])
        assert message['alertType'] == 'threat_intelligence'
        assert message['reportId'] == threat_report.report_id
        assert message['severity'] == threat_report.severity.value
    
    def test_invalid_operation(self):
        """Test handling of invalid operations."""
        event = {'operation': 'invalid_operation'}
        response = index.handler(event, {})
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'Invalid operation' in body['error']
        assert 'supported_operations' in body
    
    def test_missing_required_fields(self):
        """Test handling of missing required fields."""
        event = {
            'operation': 'process_review_decision',
            'mediaId': 'test-media-008'
            # Missing reviewId and decisionData
        }
        
        response = index.handler(event, {})
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'required' in body['error'].lower()
    
    def test_pattern_analysis_empty_decisions(self):
        """Test pattern analysis with no recent decisions."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        media_id = 'test-media-009'
        
        # Mock get_recent_decisions to return empty list
        with patch('index.get_recent_decisions', return_value=[]):
            pattern_analysis = index.analyze_decision_patterns(decision_data, media_id)
        
        assert 'patterns' in pattern_analysis
        assert pattern_analysis['pattern_score'] == 0.0
        assert pattern_analysis['decisions_analyzed'] == 0
    
    def test_calculate_pattern_score(self):
        """Test pattern score calculation."""
        patterns = {
            'temporal_clustering': {'cluster_score': 0.8},
            'source_clustering': {'cluster_score': 0.6},
            'technique_clustering': {'cluster_score': 0.4},
            'content_similarity': {'similarity_score': 0.7},
            'campaign_indicators': {'campaign_score': 0.9}
        }
        
        score = index.calculate_pattern_score(patterns)
        
        # Should be average of all scores
        expected_score = (0.8 + 0.6 + 0.4 + 0.7 + 0.9) / 5
        assert abs(score - expected_score) < 0.01
    
    def test_calculate_pattern_score_empty(self):
        """Test pattern score calculation with empty patterns."""
        patterns = {}
        score = index.calculate_pattern_score(patterns)
        assert score == 0.0
    
    @patch('index.cloudwatch')
    def test_update_threat_metrics(self, mock_cloudwatch):
        """Test CloudWatch metrics updates."""
        decision_data = self.create_test_decision_data('confirm', 0.9)
        indicators = index.extract_threat_indicators(decision_data, 'test-media')
        
        # Create a threat report
        pattern_analysis = {'pattern_score': 0.6}
        threat_report = index.create_threat_report(decision_data, 'test-media', indicators, pattern_analysis)
        
        index.update_threat_metrics(decision_data, indicators, threat_report)
        
        # Verify CloudWatch put_metric_data was called
        assert mock_cloudwatch.put_metric_data.call_count >= 2
        
        # Check metric data structure
        calls = mock_cloudwatch.put_metric_data.call_args_list
        for call in calls:
            assert call[1]['Namespace'] == 'Hlekkr/ThreatIntelligence'
            assert 'MetricData' in call[1]
    
    def test_error_handling_extraction(self):
        """Test error handling in threat indicator extraction."""
        # Test with malformed decision data
        malformed_data = {'invalid': 'structure'}
        media_id = 'test-media-010'
        
        # Should not raise exception, should return empty list
        indicators = index.extract_threat_indicators(malformed_data, media_id)
        assert indicators == []
    
    def test_placeholder_operations(self):
        """Test placeholder operations return appropriate responses."""
        operations = [
            'generate_threat_report',
            'analyze_threat_patterns',
            'update_threat_intelligence',
            'get_threat_reports',
            'share_threat_intelligence',
            'cleanup_old_threats'
        ]
        
        for operation in operations:
            event = {'operation': operation}
            response = index.handler(event, {})
            
            assert response['statusCode'] == 200
            body = json.loads(response['body'])
            assert 'not yet implemented' in body['message']

if __name__ == '__main__':
    pytest.main([__file__, '-v'])