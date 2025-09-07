#!/usr/bin/env python3
"""
Comprehensive test suite for the Hlekkr Discrepancy Detection Lambda function.
Tests all discrepancy analysis types and alerting functionality.
"""

import json
import pytest
import boto3
from moto import mock_dynamodb, mock_sns, mock_cloudwatch
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
import os
import sys

# Add the lambda directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the lambda function
import index

class TestDiscrepancyDetector:
    """Test suite for discrepancy detection functionality."""
    
    @mock_dynamodb
    @mock_sns
    @mock_cloudwatch
    def setup_method(self):
        """Set up test environment with mocked AWS services."""
        # Set environment variables
        os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
        os.environ['SOURCE_VERIFICATION_TABLE_NAME'] = 'test-source-verification-table'
        os.environ['CHAIN_OF_CUSTODY_TABLE_NAME'] = 'test-chain-of-custody-table'
        os.environ['TRUST_SCORE_TABLE_NAME'] = 'test-trust-score-table'
        os.environ['DISCREPANCY_ALERTS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-topic'
        
        # Create mock DynamoDB tables
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        # Audit table
        self.audit_table = dynamodb.create_table(
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
            BillingMode='PAY_PER_REQUEST',
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'EventTypeIndex',
                    'KeySchema': [
                        {'AttributeName': 'eventType', 'KeyType': 'HASH'},
                        {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                }
            ]
        )
        
        # Source verification table
        self.source_table = dynamodb.create_table(
            TableName='test-source-verification-table',
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
        
        # Chain of custody table
        self.chain_table = dynamodb.create_table(
            TableName='test-chain-of-custody-table',
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
        
        # Trust score table
        self.trust_score_table = dynamodb.create_table(
            TableName='test-trust-score-table',
            KeySchema=[
                {'AttributeName': 'mediaId', 'KeyType': 'HASH'},
                {'AttributeName': 'version', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'mediaId', 'AttributeType': 'S'},
                {'AttributeName': 'version', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        # Create SNS topic
        sns = boto3.client('sns', region_name='us-east-1')
        sns.create_topic(Name='test-topic')
    
    def create_test_audit_data(self, media_id: str, events: list):
        """Create test audit data for a media item."""
        for event in events:
            self.audit_table.put_item(Item={
                'mediaId': media_id,
                'timestamp': event['timestamp'],
                'eventType': event['eventType'],
                'metadata': event.get('metadata', {}),
                'status': event.get('status', 'completed')
            })
    
    def create_test_source_data(self, media_id: str, source_data: dict):
        """Create test source verification data."""
        self.source_table.put_item(Item={
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'sourceInfo': source_data.get('sourceInfo', {}),
            'verificationResult': source_data.get('verificationResult', {})
        })
    
    def create_test_chain_data(self, media_id: str, chain_events: list):
        """Create test chain of custody data."""
        for event in chain_events:
            self.chain_table.put_item(Item={
                'mediaId': media_id,
                'timestamp': event['timestamp'],
                'stage': event['stage'],
                'inputHash': event.get('inputHash'),
                'outputHash': event.get('outputHash'),
                'actor': event.get('actor', 'system')
            })
    
    def create_test_trust_score_data(self, media_id: str, trust_data: dict):
        """Create test trust score data."""
        self.trust_score_table.put_item(Item={
            'mediaId': media_id,
            'version': 'latest',
            'compositeScore': trust_data.get('compositeScore', 50),
            'breakdown': trust_data.get('breakdown', {}),
            'confidence': trust_data.get('confidence', 'medium'),
            'calculationTimestamp': datetime.utcnow().isoformat()
        })
    
    def test_detect_discrepancies_operation(self):
        """Test the main detect_discrepancies operation."""
        # Create test data
        media_id = 'test-media-001'
        
        # Create audit events
        base_time = datetime.utcnow()
        audit_events = [
            {
                'timestamp': (base_time - timedelta(hours=1)).isoformat(),
                'eventType': 'upload',
                'metadata': {'contentType': 'video/mp4'}
            },
            {
                'timestamp': base_time.isoformat(),
                'eventType': 'metadata_extraction',
                'metadata': {'contentType': 'video/avi'}  # Mismatch
            }
        ]
        self.create_test_audit_data(media_id, audit_events)
        
        # Create source data with suspicious verification
        source_data = {
            'sourceInfo': {'url': 'https://suspicious-domain.com/video.mp4', 'domain': 'suspicious-domain.com'},
            'verificationResult': {'status': 'suspicious', 'reputationScore': 15}
        }
        self.create_test_source_data(media_id, source_data)
        
        # Test the handler
        event = {
            'operation': 'detect_discrepancies',
            'timeRangeHours': 2,
            'severityThreshold': 'low'
        }
        
        response = index.handler(event, {})
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'totalDiscrepancies' in body
        assert 'discrepancies' in body
        assert body['totalDiscrepancies'] > 0
    
    def test_analyze_media_operation(self):
        """Test analyzing discrepancies for a specific media item."""
        media_id = 'test-media-002'
        
        # Create test data with multiple discrepancy types
        base_time = datetime.utcnow()
        
        # Audit events with processing delays
        audit_events = [
            {
                'timestamp': (base_time - timedelta(hours=2)).isoformat(),
                'eventType': 'upload'
            },
            {
                'timestamp': base_time.isoformat(),  # 2 hour delay
                'eventType': 'metadata_extraction'
            }
        ]
        self.create_test_audit_data(media_id, audit_events)
        
        # Chain of custody with hash mismatch
        chain_events = [
            {
                'timestamp': (base_time - timedelta(hours=2)).isoformat(),
                'stage': 'upload',
                'outputHash': 'hash123'
            },
            {
                'timestamp': (base_time - timedelta(hours=1)).isoformat(),
                'stage': 'security_scan',
                'inputHash': 'hash456',  # Mismatch
                'outputHash': 'hash456'
            }
        ]
        self.create_test_chain_data(media_id, chain_events)
        
        # Trust score with low score
        trust_data = {
            'compositeScore': 15,  # Very low score
            'breakdown': {'deepfakeScore': 10, 'sourceReliabilityScore': 20},
            'confidence': 'high'
        }
        self.create_test_trust_score_data(media_id, trust_data)
        
        # Test the handler
        event = {
            'operation': 'analyze_media',
            'mediaId': media_id
        }
        
        response = index.handler(event, {})
        
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['mediaId'] == media_id
        assert 'discrepancies' in body
        assert 'summary' in body
        assert len(body['discrepancies']) > 0
        
        # Check for expected discrepancy types
        discrepancy_types = [d['discrepancy_type'] for d in body['discrepancies']]
        assert 'trust_score_anomaly' in discrepancy_types
        assert 'content_hash_mismatch' in discrepancy_types
    
    def test_source_consistency_analysis(self):
        """Test source consistency discrepancy detection."""
        media_id = 'test-media-003'
        
        # Create source data with multiple issues
        source_data = {
            'sourceInfo': {'domain': 'malicious-site.com'},  # Missing URL
            'verificationResult': {
                'status': 'suspicious',
                'reputationScore': 5,  # Very low reputation
                'discrepancies': ['domain_blacklisted', 'ssl_invalid']
            }
        }
        self.create_test_source_data(media_id, source_data)
        
        # Create minimal audit data
        audit_events = [
            {
                'timestamp': datetime.utcnow().isoformat(),
                'eventType': 'upload'
            }
        ]
        self.create_test_audit_data(media_id, audit_events)
        
        # Test analysis
        discrepancies = index.analyze_single_media(media_id)
        
        # Should detect multiple source-related discrepancies
        source_discrepancies = [d for d in discrepancies if d.discrepancy_type == index.DiscrepancyType.SOURCE_INCONSISTENCY]
        assert len(source_discrepancies) >= 2  # Suspicious status + low reputation + missing fields
        
        # Check severity levels
        severities = [d.severity for d in source_discrepancies]
        assert index.DiscrepancySeverity.HIGH in severities
    
    def test_metadata_consistency_analysis(self):
        """Test metadata consistency discrepancy detection."""
        media_id = 'test-media-004'
        
        # Create source data with publication date
        source_data = {
            'sourceInfo': {
                'publicationDate': '2024-01-01T10:00:00Z',
                'contentType': 'video/mp4'
            }
        }
        self.create_test_source_data(media_id, source_data)
        
        # Create audit data with different creation date and content type
        audit_events = [
            {
                'timestamp': datetime.utcnow().isoformat(),
                'eventType': 'metadata_extraction',
                'metadata': {
                    'creationDate': '2024-01-03T10:00:00Z',  # 2 days later
                    'contentType': 'video/avi'  # Different type
                }
            }
        ]
        self.create_test_audit_data(media_id, audit_events)
        
        # Test analysis
        discrepancies = index.analyze_single_media(media_id)
        
        # Should detect metadata mismatches
        metadata_discrepancies = [d for d in discrepancies if d.discrepancy_type == index.DiscrepancyType.METADATA_MISMATCH]
        assert len(metadata_discrepancies) >= 1
        
        # Check evidence contains the mismatched data
        for discrepancy in metadata_discrepancies:
            if 'timeDifferenceHours' in discrepancy.evidence:
                assert discrepancy.evidence['timeDifferenceHours'] > 24
    
    def test_chain_integrity_analysis(self):
        """Test chain of custody integrity analysis."""
        media_id = 'test-media-005'
        
        # Create chain with missing stages and hash mismatches
        base_time = datetime.utcnow()
        chain_events = [
            {
                'timestamp': (base_time - timedelta(hours=2)).isoformat(),
                'stage': 'upload',
                'outputHash': 'hash123'
            },
            # Missing security_scan stage
            {
                'timestamp': (base_time - timedelta(hours=1)).isoformat(),
                'stage': 'deepfake_analysis',  # Skip metadata_extraction
                'inputHash': 'hash456',  # Hash mismatch
                'outputHash': 'hash789'
            },
            {
                'timestamp': (base_time - timedelta(minutes=30)).isoformat(),
                'stage': 'trust_score_calculation',
                'inputHash': 'hash999',  # Another hash mismatch
                'outputHash': 'hash000'
            }
        ]
        self.create_test_chain_data(media_id, chain_events)
        
        # Test analysis
        discrepancies = index.analyze_single_media(media_id)
        
        # Should detect missing stages and hash mismatches
        chain_discrepancies = [d for d in discrepancies 
                             if d.discrepancy_type in [index.DiscrepancyType.CHAIN_INTEGRITY_VIOLATION, 
                                                     index.DiscrepancyType.CONTENT_HASH_MISMATCH]]
        assert len(chain_discrepancies) >= 2  # Missing stages + hash mismatches
        
        # Check for critical severity on hash mismatches
        hash_discrepancies = [d for d in chain_discrepancies if d.discrepancy_type == index.DiscrepancyType.CONTENT_HASH_MISMATCH]
        for discrepancy in hash_discrepancies:
            assert discrepancy.severity == index.DiscrepancySeverity.CRITICAL
    
    def test_trust_score_anomaly_analysis(self):
        """Test trust score anomaly detection."""
        media_id = 'test-media-006'
        
        # Create trust score with extreme values
        trust_data = {
            'compositeScore': 5,  # Extremely low
            'breakdown': {
                'deepfakeScore': 95,  # High variance
                'sourceReliabilityScore': 5,
                'metadataConsistencyScore': 50
            },
            'confidence': 'high'
        }
        self.create_test_trust_score_data(media_id, trust_data)
        
        # Create source data with different reputation
        source_data = {
            'verificationResult': {'reputationScore': 80}  # High reputation vs low trust score
        }
        self.create_test_source_data(media_id, source_data)
        
        # Test analysis
        discrepancies = index.analyze_single_media(media_id)
        
        # Should detect trust score anomalies
        trust_discrepancies = [d for d in discrepancies if d.discrepancy_type == index.DiscrepancyType.TRUST_SCORE_ANOMALY]
        assert len(trust_discrepancies) >= 2  # Low score + high variance + reputation mismatch
        
        # Check for critical severity on extremely low scores
        low_score_discrepancies = [d for d in trust_discrepancies if 'Extremely low trust score' in d.description]
        assert len(low_score_discrepancies) > 0
        assert low_score_discrepancies[0].severity == index.DiscrepancySeverity.CRITICAL
    
    def test_processing_timeline_analysis(self):
        """Test processing timeline anomaly detection."""
        media_id = 'test-media-007'
        
        # Create audit events with unusual timing
        base_time = datetime.utcnow()
        audit_events = [
            {
                'timestamp': (base_time - timedelta(hours=3)).isoformat(),
                'eventType': 'upload'
            },
            {
                'timestamp': base_time.isoformat(),  # 3 hour processing time
                'eventType': 'metadata_extraction'
            }
        ]
        self.create_test_audit_data(media_id, audit_events)
        
        # Test analysis
        discrepancies = index.analyze_single_media(media_id)
        
        # Should detect processing anomalies
        processing_discrepancies = [d for d in discrepancies if d.discrepancy_type == index.DiscrepancyType.PROCESSING_ANOMALY]
        assert len(processing_discrepancies) > 0
        
        # Check evidence contains duration information
        for discrepancy in processing_discrepancies:
            assert 'totalDurationSeconds' in discrepancy.evidence
            assert discrepancy.evidence['totalDurationSeconds'] > 3600  # More than 1 hour
    
    @patch('index.sns_client')
    def test_alert_generation(self, mock_sns):
        """Test alert generation for critical discrepancies."""
        # Create a critical discrepancy
        discrepancy = index.Discrepancy(
            discrepancy_id='test-discrepancy-001',
            media_id='test-media-008',
            discrepancy_type=index.DiscrepancyType.CONTENT_HASH_MISMATCH,
            severity=index.DiscrepancySeverity.CRITICAL,
            description='Critical hash mismatch detected',
            detected_at=datetime.utcnow().isoformat(),
            evidence={'currentHash': 'hash123', 'expectedHash': 'hash456'},
            affected_components=['chain_of_custody'],
            recommended_actions=['Quarantine media', 'Investigate tampering'],
            confidence=0.95,
            metadata={'stage': 'security_scan'}
        )
        
        # Test alert sending
        index.send_alert(discrepancy)
        
        # Verify SNS publish was called
        mock_sns.publish.assert_called_once()
        call_args = mock_sns.publish.call_args
        
        # Check message content
        message = json.loads(call_args[1]['Message'])
        assert message['discrepancyId'] == 'test-discrepancy-001'
        assert message['severity'] == 'critical'
        assert message['mediaId'] == 'test-media-008'
    
    def test_suspicious_pattern_analysis(self):
        """Test suspicious pattern detection across multiple media items."""
        # This would require more complex setup with multiple media items
        # For now, test the basic pattern analysis structure
        
        event = {
            'operation': 'analyze_patterns',
            'timeRangeHours': 24,
            'minSeverity': 'medium'
        }
        
        response = index.handler(event, {})
        
        # Should return successfully even with no data
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'patterns' in body
    
    def test_error_handling(self):
        """Test error handling for invalid operations and missing data."""
        # Test invalid operation
        event = {'operation': 'invalid_operation'}
        response = index.handler(event, {})
        assert response['statusCode'] == 400
        
        # Test missing mediaId for analyze_media
        event = {'operation': 'analyze_media'}
        response = index.handler(event, {})
        assert response['statusCode'] == 400
        
        # Test with non-existent media ID
        event = {'operation': 'analyze_media', 'mediaId': 'non-existent'}
        response = index.handler(event, {})
        assert response['statusCode'] == 200  # Should handle gracefully
    
    def test_severity_filtering(self):
        """Test discrepancy filtering by severity threshold."""
        discrepancies = [
            index.Discrepancy(
                discrepancy_id='low-001',
                media_id='test',
                discrepancy_type=index.DiscrepancyType.METADATA_MISMATCH,
                severity=index.DiscrepancySeverity.LOW,
                description='Low severity issue',
                detected_at=datetime.utcnow().isoformat(),
                evidence={},
                affected_components=[],
                recommended_actions=[],
                confidence=0.5,
                metadata={}
            ),
            index.Discrepancy(
                discrepancy_id='high-001',
                media_id='test',
                discrepancy_type=index.DiscrepancyType.TRUST_SCORE_ANOMALY,
                severity=index.DiscrepancySeverity.HIGH,
                description='High severity issue',
                detected_at=datetime.utcnow().isoformat(),
                evidence={},
                affected_components=[],
                recommended_actions=[],
                confidence=0.8,
                metadata={}
            )
        ]
        
        # Test filtering
        filtered_medium = index.filter_by_severity(discrepancies, 'medium')
        assert len(filtered_medium) == 1  # Only high severity should pass
        
        filtered_low = index.filter_by_severity(discrepancies, 'low')
        assert len(filtered_low) == 2  # Both should pass

if __name__ == '__main__':
    pytest.main([__file__, '-v'])