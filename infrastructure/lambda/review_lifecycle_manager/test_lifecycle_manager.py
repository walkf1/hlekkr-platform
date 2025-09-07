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
os.environ['MODERATOR_ALERTS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-moderator-alerts'

# Import after setting environment variables
from index import (
    handler, assign_review_to_moderator, check_review_timeouts,
    is_review_timed_out, handle_review_timeout, is_moderator_available,
    get_current_workload, calculate_review_timeout, ReviewStatus
)

class TestReviewLifecycleManager(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_dynamodb = Mock()
        self.mock_sns = Mock()
        self.mock_eventbridge = Mock()
        
        # Mock DynamoDB tables
        self.mock_review_table = Mock()
        self.mock_moderator_table = Mock()
        self.mock_decision_table = Mock()
        
        self.sample_review = {
            'reviewId': 'review-123',
            'mediaId': 'media-456',
            'status': 'pending',
            'priority': 'normal',
            'createdAt': '2024-01-01T10:00:00.000000',
            'timeoutAt': '2024-01-01T18:00:00.000000'
        }
        
        self.sample_moderator = {
            'moderatorId': 'mod-123',
            'status': 'active',
            'role': 'senior',
            'statistics': {
                'currentWorkload': 2,
                'totalReviews': 50,
                'accuracyScore': Decimal('0.85')
            }
        }

    @patch('index.sns_client')
    @patch('index.review_queue_table')
    @patch('index.moderator_profile_table')
    def test_assign_review_to_moderator_success(self, mock_moderator_table, mock_review_table, mock_sns):
        """Test successful review assignment."""
        # Mock review table response
        mock_review_table.get_item.return_value = {
            'Item': self.sample_review
        }
        
        # Mock moderator availability check
        mock_moderator_table.get_item.return_value = {
            'Item': self.sample_moderator
        }
        
        # Mock workload query
        mock_review_table.query.return_value = {'Count': 2}
        
        # Mock update operations
        mock_review_table.update_item.return_value = {}
        mock_moderator_table.update_item.return_value = {}
        mock_sns.publish.return_value = {'MessageId': 'test-message-id'}
        
        event = {
            'reviewId': 'review-123',
            'moderatorId': 'mod-123'
        }
        
        result = assign_review_to_moderator(event)
        
        # Parse the result
        result_body = json.loads(result['body'])
        
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result_body['reviewId'], 'review-123')
        self.assertEqual(result_body['moderatorId'], 'mod-123')
        self.assertIn('assignedAt', result_body)
        
        # Verify database operations
        mock_review_table.update_item.assert_called_once()
        mock_moderator_table.update_item.assert_called_once()
        mock_sns.publish.assert_called_once()

    def test_assign_review_missing_parameters(self):
        """Test assignment with missing parameters."""
        event = {'reviewId': 'review-123'}  # Missing moderatorId
        
        result = assign_review_to_moderator(event)
        
        self.assertEqual(result['statusCode'], 400)
        result_body = json.loads(result['body'])
        self.assertIn('reviewId and moderatorId are required', result_body['error'])

    @patch('index.review_queue_table')
    def test_assign_review_not_found(self, mock_review_table):
        """Test assignment when review doesn't exist."""
        mock_review_table.get_item.return_value = {}
        
        event = {
            'reviewId': 'nonexistent-review',
            'moderatorId': 'mod-123'
        }
        
        result = assign_review_to_moderator(event)
        
        self.assertEqual(result['statusCode'], 404)
        result_body = json.loads(result['body'])
        self.assertEqual(result_body['error'], 'Review not found')

    @patch('index.review_queue_table')
    def test_check_review_timeouts(self, mock_review_table):
        """Test timeout checking functionality."""
        # Mock query responses for different statuses
        timed_out_review = self.sample_review.copy()
        timed_out_review['timeoutAt'] = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        
        mock_review_table.query.return_value = {
            'Items': [timed_out_review]
        }
        
        # Mock update operation
        mock_review_table.update_item.return_value = {}
        
        with patch('index.handle_review_timeout') as mock_handle_timeout:
            mock_handle_timeout.return_value = {
                'reviewId': 'review-123',
                'action': 'timeout_expired'
            }
            
            result = check_review_timeouts()
            
            self.assertEqual(result['statusCode'], 200)
            self.assertIn('Processed 1 timed out reviews', result['message'])
            mock_handle_timeout.assert_called_once()

    def test_is_review_timed_out_true(self):
        """Test timeout detection for timed out review."""
        review = {
            'timeoutAt': (datetime.utcnow() - timedelta(hours=1)).isoformat()
        }
        current_time = datetime.utcnow()
        
        result = is_review_timed_out(review, current_time)
        
        self.assertTrue(result)

    def test_is_review_timed_out_false(self):
        """Test timeout detection for active review."""
        review = {
            'timeoutAt': (datetime.utcnow() + timedelta(hours=1)).isoformat()
        }
        current_time = datetime.utcnow()
        
        result = is_review_timed_out(review, current_time)
        
        self.assertFalse(result)

    def test_is_review_timed_out_no_timeout(self):
        """Test timeout detection when no timeout is set."""
        review = {}
        current_time = datetime.utcnow()
        
        result = is_review_timed_out(review, current_time)
        
        self.assertFalse(result)

    @patch('index.moderator_profile_table')
    @patch('index.review_queue_table')
    def test_is_moderator_available_true(self, mock_review_table, mock_moderator_table):
        """Test moderator availability check for available moderator."""
        # Mock moderator profile
        mock_moderator_table.get_item.return_value = {
            'Item': self.sample_moderator
        }
        
        # Mock current workload (below max)
        mock_review_table.query.return_value = {'Count': 2}
        
        result = is_moderator_available('mod-123', 'normal')
        
        self.assertTrue(result)

    @patch('index.moderator_profile_table')
    def test_is_moderator_available_inactive(self, mock_moderator_table):
        """Test moderator availability check for inactive moderator."""
        inactive_moderator = self.sample_moderator.copy()
        inactive_moderator['status'] = 'inactive'
        
        mock_moderator_table.get_item.return_value = {
            'Item': inactive_moderator
        }
        
        result = is_moderator_available('mod-123', 'normal')
        
        self.assertFalse(result)

    @patch('index.moderator_profile_table')
    @patch('index.review_queue_table')
    def test_is_moderator_available_overloaded(self, mock_review_table, mock_moderator_table):
        """Test moderator availability check for overloaded moderator."""
        mock_moderator_table.get_item.return_value = {
            'Item': self.sample_moderator
        }
        
        # Mock high workload (at max capacity)
        mock_review_table.query.return_value = {'Count': 5}  # Max for senior is 5
        
        result = is_moderator_available('mod-123', 'normal')
        
        self.assertFalse(result)

    @patch('index.review_queue_table')
    def test_get_current_workload(self, mock_review_table):
        """Test current workload calculation."""
        mock_review_table.query.return_value = {'Count': 3}
        
        result = get_current_workload('mod-123')
        
        self.assertEqual(result, 3)
        mock_review_table.query.assert_called_once()

    def test_calculate_review_timeout(self):
        """Test timeout calculation for different priorities."""
        # Test critical priority (2 hours)
        timeout_critical = calculate_review_timeout('critical')
        timeout_time = datetime.fromisoformat(timeout_critical)
        expected_time = datetime.utcnow() + timedelta(hours=2)
        
        # Allow for small time differences in test execution
        time_diff = abs((timeout_time - expected_time).total_seconds())
        self.assertLess(time_diff, 60)  # Within 1 minute
        
        # Test normal priority (8 hours)
        timeout_normal = calculate_review_timeout('normal')
        timeout_time = datetime.fromisoformat(timeout_normal)
        expected_time = datetime.utcnow() + timedelta(hours=8)
        
        time_diff = abs((timeout_time - expected_time).total_seconds())
        self.assertLess(time_diff, 60)

    @patch('index.handle_direct_action')
    def test_handler_direct_action(self, mock_direct_handler):
        """Test handler with direct action event."""
        mock_direct_handler.return_value = {'statusCode': 200}
        
        event = {'action': 'assign_review', 'reviewId': 'review-123'}
        result = handler(event, {})
        
        mock_direct_handler.assert_called_once_with(event, {})

    @patch('index.handle_scheduled_event')
    def test_handler_scheduled_event(self, mock_scheduled_handler):
        """Test handler with EventBridge scheduled event."""
        mock_scheduled_handler.return_value = {'statusCode': 200}
        
        event = {
            'source': 'aws.events',
            'detail-type': 'Review Timeout Check'
        }
        result = handler(event, {})
        
        mock_scheduled_handler.assert_called_once_with(event, {})

    @patch('index.sns_client')
    @patch('index.review_queue_table')
    @patch('index.moderator_profile_table')
    def test_handle_review_timeout_reassign(self, mock_moderator_table, mock_review_table, mock_sns):
        """Test timeout handling with reassignment for high priority."""
        high_priority_review = self.sample_review.copy()
        high_priority_review['priority'] = 'high'
        high_priority_review['assignedModerator'] = 'mod-123'
        
        # Mock update operations
        mock_review_table.update_item.return_value = {}
        mock_moderator_table.update_item.return_value = {}
        
        with patch('index.reassign_review_internal') as mock_reassign:
            mock_reassign.return_value = {
                'reviewId': 'review-123',
                'action': 'reassigned'
            }
            
            result = handle_review_timeout(high_priority_review)
            
            self.assertEqual(result['action'], 'timeout_and_reassign')
            self.assertIn('reassignment', result)
            mock_reassign.assert_called_once()

    @patch('index.sns_client')
    @patch('index.review_queue_table')
    @patch('index.moderator_profile_table')
    def test_handle_review_timeout_expire(self, mock_moderator_table, mock_review_table, mock_sns):
        """Test timeout handling with expiration for normal priority."""
        normal_priority_review = self.sample_review.copy()
        normal_priority_review['assignedModerator'] = 'mod-123'
        
        # Mock update operations
        mock_review_table.update_item.return_value = {}
        mock_moderator_table.update_item.return_value = {}
        mock_sns.publish.return_value = {'MessageId': 'test-message-id'}
        
        result = handle_review_timeout(normal_priority_review)
        
        self.assertEqual(result['action'], 'timeout_expired')
        self.assertEqual(result['reviewId'], 'review-123')
        
        # Verify timeout notification was sent
        mock_sns.publish.assert_called_once()

if __name__ == '__main__':
    unittest.main()