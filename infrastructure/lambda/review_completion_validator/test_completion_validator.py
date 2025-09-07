import unittest
from unittest.mock import Mock, patch, MagicMock
import json
import os
from datetime import datetime, timedelta
from decimal import Decimal

# Mock environment variables
os.environ['REVIEW_QUEUE_TABLE_NAME'] = 'test-review-queue-table'
os.environ['MODERATOR_PROFILE_TABLE_NAME'] = 'test-moderator-profile-table'
os.environ['REVIEW_DECISION_TABLE_NAME'] = 'test-review-decision-table'
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['MODERATOR_ALERTS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-moderator-alerts'
os.environ['TRUST_SCORE_CALCULATOR_FUNCTION_NAME'] = 'test-trust-score-calculator'

# Import after setting environment variables
from index import (
    handler, validate_review_completion, validate_decision_data,
    check_decision_consistency, process_review_completion,
    DecisionType, ConfidenceLevel
)

class TestReviewCompletionValidator(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures."""
        self.sample_review = {
            'reviewId': 'review-123',
            'mediaId': 'media-456',
            'status': 'in_progress',
            'assignedModerator': 'mod-123',
            'priority': 'normal',
            'createdAt': '2024-01-01T10:00:00.000000',
            'assignedAt': '2024-01-01T10:30:00.000000',
            'analysisResults': {
                'trustScore': 45.0,
                'confidence': 0.75,
                'deepfakeDetected': True
            }
        }
        
        self.sample_decision_data = {
            'decisionType': 'override',
            'confidenceLevel': 'high',
            'justification': 'After careful analysis, I believe this is actually authentic content.',
            'trustScoreAdjustment': 75.0,
            'threatLevel': 'low',
            'tags': ['false-positive', 'authentic'],
            'additionalEvidence': []
        }

    def test_validate_decision_data_valid(self):
        """Test validation of valid decision data."""
        result = validate_decision_data(self.sample_decision_data)
        
        self.assertTrue(result['valid'])
        self.assertEqual(len(result['errors']), 0)

    def test_validate_decision_data_missing_required_fields(self):
        """Test validation with missing required fields."""
        incomplete_data = {
            'decisionType': 'confirm'
            # Missing confidenceLevel and justification
        }
        
        result = validate_decision_data(incomplete_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Missing required field: confidenceLevel', result['errors'])
        self.assertIn('Missing required field: justification', result['errors'])

    def test_validate_decision_data_invalid_decision_type(self):
        """Test validation with invalid decision type."""
        invalid_data = self.sample_decision_data.copy()
        invalid_data['decisionType'] = 'invalid_type'
        
        result = validate_decision_data(invalid_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Invalid decision type: invalid_type', result['errors'])

    def test_validate_decision_data_invalid_confidence_level(self):
        """Test validation with invalid confidence level."""
        invalid_data = self.sample_decision_data.copy()
        invalid_data['confidenceLevel'] = 'invalid_level'
        
        result = validate_decision_data(invalid_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Invalid confidence level: invalid_level', result['errors'])

    def test_validate_decision_data_short_justification(self):
        """Test validation with too short justification."""
        invalid_data = self.sample_decision_data.copy()
        invalid_data['justification'] = 'Too short'
        
        result = validate_decision_data(invalid_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Justification must be at least 10 characters', result['errors'])

    def test_validate_decision_data_invalid_trust_score(self):
        """Test validation with invalid trust score adjustment."""
        invalid_data = self.sample_decision_data.copy()
        invalid_data['trustScoreAdjustment'] = 150  # Out of range
        
        result = validate_decision_data(invalid_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Trust score adjustment must be between 0 and 100', result['errors'])

    def test_check_decision_consistency_large_difference(self):
        """Test consistency check with large score difference."""
        result = check_decision_consistency(self.sample_review, self.sample_decision_data)
        
        self.assertFalse(result['consistent'])
        self.assertIn('Large trust score difference', result['warnings'][0])
        self.assertEqual(result['scoreDifference'], 30.0)

    def test_check_decision_consistency_override_with_minimal_change(self):
        """Test consistency check for override with minimal score change."""
        small_change_decision = self.sample_decision_data.copy()
        small_change_decision['trustScoreAdjustment'] = 50.0  # Only 5 point difference
        
        result = check_decision_consistency(self.sample_review, small_change_decision)
        
        self.assertFalse(result['consistent'])
        self.assertIn('Override decision with minimal score change', result['warnings'][0])

    def test_check_decision_consistency_confirm_with_adjustment(self):
        """Test consistency check for confirm decision with score adjustment."""
        confirm_decision = self.sample_decision_data.copy()
        confirm_decision['decisionType'] = 'confirm'
        confirm_decision['trustScoreAdjustment'] = 60.0  # 15 point difference
        
        result = check_decision_consistency(self.sample_review, confirm_decision)
        
        self.assertFalse(result['consistent'])
        self.assertIn('Confirmed decision with significant score adjustment', result['warnings'][0])

    @patch('index.sns_client')
    @patch('index.audit_table')
    @patch('index.review_decision_table')
    @patch('index.moderator_profile_table')
    @patch('index.review_queue_table')
    @patch('index.lambda_client')
    def test_validate_review_completion_success(self, mock_lambda, mock_review_table, 
                                               mock_moderator_table, mock_decision_table, 
                                               mock_audit_table, mock_sns):
        """Test successful review completion validation."""
        # Mock review table response
        mock_review_table.get_item.return_value = {
            'Item': self.sample_review
        }
        
        # Mock update operations
        mock_review_table.update_item.return_value = {}
        mock_moderator_table.update_item.return_value = {}
        mock_decision_table.put_item.return_value = {}
        mock_audit_table.put_item.return_value = {}
        mock_sns.publish.return_value = {'MessageId': 'test-message-id'}
        mock_lambda.invoke.return_value = {'ResponseMetadata': {'RequestId': 'test-request-id'}}
        
        event = {
            'reviewId': 'review-123',
            'moderatorId': 'mod-123',
            'decisionData': self.sample_decision_data
        }
        
        result = validate_review_completion(event)
        
        # Parse the result
        result_body = json.loads(result['body'])
        
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result_body['reviewId'], 'review-123')
        self.assertIn('validationResult', result_body)
        self.assertIn('consistencyResult', result_body)
        self.assertIn('completionResult', result_body)

    def test_validate_review_completion_missing_parameters(self):
        """Test completion validation with missing parameters."""
        event = {'reviewId': 'review-123'}  # Missing moderatorId and decisionData
        
        result = validate_review_completion(event)
        
        self.assertEqual(result['statusCode'], 400)
        result_body = json.loads(result['body'])
        self.assertIn('reviewId, moderatorId, and decisionData are required', result_body['error'])

    @patch('index.review_queue_table')
    def test_validate_review_completion_review_not_found(self, mock_review_table):
        """Test completion validation when review doesn't exist."""
        mock_review_table.get_item.return_value = {}
        
        event = {
            'reviewId': 'nonexistent-review',
            'moderatorId': 'mod-123',
            'decisionData': self.sample_decision_data
        }
        
        result = validate_review_completion(event)
        
        self.assertEqual(result['statusCode'], 404)
        result_body = json.loads(result['body'])
        self.assertEqual(result_body['error'], 'Review not found')

    @patch('index.review_queue_table')
    def test_validate_review_completion_invalid_status(self, mock_review_table):
        """Test completion validation with invalid review status."""
        completed_review = self.sample_review.copy()
        completed_review['status'] = 'completed'
        
        mock_review_table.get_item.return_value = {
            'Item': completed_review
        }
        
        event = {
            'reviewId': 'review-123',
            'moderatorId': 'mod-123',
            'decisionData': self.sample_decision_data
        }
        
        result = validate_review_completion(event)
        
        self.assertEqual(result['statusCode'], 400)
        result_body = json.loads(result['body'])
        self.assertIn('Review cannot be completed in status: completed', result_body['error'])

    @patch('index.review_queue_table')
    def test_validate_review_completion_wrong_moderator(self, mock_review_table):
        """Test completion validation with wrong moderator."""
        mock_review_table.get_item.return_value = {
            'Item': self.sample_review
        }
        
        event = {
            'reviewId': 'review-123',
            'moderatorId': 'wrong-moderator',
            'decisionData': self.sample_decision_data
        }
        
        result = validate_review_completion(event)
        
        self.assertEqual(result['statusCode'], 403)
        result_body = json.loads(result['body'])
        self.assertEqual(result_body['error'], 'Review is not assigned to this moderator')

    def test_decision_type_enum_values(self):
        """Test DecisionType enum values."""
        self.assertEqual(DecisionType.CONFIRM.value, 'confirm')
        self.assertEqual(DecisionType.OVERRIDE.value, 'override')
        self.assertEqual(DecisionType.ESCALATE.value, 'escalate')
        self.assertEqual(DecisionType.INCONCLUSIVE.value, 'inconclusive')

    def test_confidence_level_enum_values(self):
        """Test ConfidenceLevel enum values."""
        self.assertEqual(ConfidenceLevel.VERY_LOW.value, 'very_low')
        self.assertEqual(ConfidenceLevel.LOW.value, 'low')
        self.assertEqual(ConfidenceLevel.MEDIUM.value, 'medium')
        self.assertEqual(ConfidenceLevel.HIGH.value, 'high')
        self.assertEqual(ConfidenceLevel.VERY_HIGH.value, 'very_high')

    @patch('index.handle_direct_action')
    def test_handler_direct_action(self, mock_direct_handler):
        """Test handler with direct action event."""
        mock_direct_handler.return_value = {'statusCode': 200}
        
        event = {'action': 'validate_completion', 'reviewId': 'review-123'}
        result = handler(event, {})
        
        mock_direct_handler.assert_called_once_with(event, {})

    def test_validate_decision_data_with_warnings(self):
        """Test validation that generates warnings."""
        data_with_warnings = self.sample_decision_data.copy()
        data_with_warnings['tags'] = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 
                                     'tag6', 'tag7', 'tag8', 'tag9', 'tag10', 'tag11']  # 11 tags
        
        result = validate_decision_data(data_with_warnings)
        
        self.assertTrue(result['valid'])  # Still valid, just has warnings
        self.assertIn('More than 10 tags may impact performance', result['warnings'])

    def test_validate_decision_data_invalid_tags_type(self):
        """Test validation with invalid tags type."""
        invalid_data = self.sample_decision_data.copy()
        invalid_data['tags'] = 'not_a_list'
        
        result = validate_decision_data(invalid_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Tags must be a list', result['errors'])

    def test_validate_decision_data_invalid_evidence_type(self):
        """Test validation with invalid additional evidence type."""
        invalid_data = self.sample_decision_data.copy()
        invalid_data['additionalEvidence'] = 'not_a_list'
        
        result = validate_decision_data(invalid_data)
        
        self.assertFalse(result['valid'])
        self.assertIn('Additional evidence must be a list', result['errors'])

if __name__ == '__main__':
    unittest.main()