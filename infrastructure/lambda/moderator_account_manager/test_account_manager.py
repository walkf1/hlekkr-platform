import unittest
from unittest.mock import Mock, patch, MagicMock
import json
import os
from datetime import datetime
from decimal import Decimal

# Mock environment variables
os.environ['MODERATOR_USER_POOL_ID'] = 'test-user-pool-id'
os.environ['MODERATOR_PROFILE_TABLE_NAME'] = 'test-moderator-profile-table'
os.environ['REVIEW_QUEUE_TABLE_NAME'] = 'test-review-queue-table'
os.environ['MODERATOR_ALERTS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-moderator-alerts'

# Import after setting environment variables
from index import (
    handler, create_moderator_account_direct, get_moderator_profile_direct,
    update_moderator_profile_direct, delete_moderator_account_direct,
    list_moderators_direct, get_moderator_statistics,
    generate_temporary_password, get_max_concurrent_reviews,
    decimal_to_float
)

class TestModeratorAccountManager(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_cognito = Mock()
        self.mock_dynamodb = Mock()
        self.mock_sns = Mock()
        
        # Mock DynamoDB tables
        self.mock_moderator_table = Mock()
        self.mock_review_table = Mock()
        
        self.sample_moderator_data = {
            'email': 'test@example.com',
            'firstName': 'John',
            'lastName': 'Doe',
            'role': 'senior',
            'certificationLevel': 'advanced',
            'specializations': ['deepfake', 'audio']
        }
        
        self.sample_profile = {
            'moderatorId': 'mod_123456789abc',
            'email': 'test@example.com',
            'firstName': 'John',
            'lastName': 'Doe',
            'role': 'senior',
            'certificationLevel': 'advanced',
            'specializations': ['deepfake', 'audio'],
            'status': 'active',
            'createdAt': '2024-01-01T00:00:00.000000',
            'statistics': {
                'totalReviews': 100,
                'accurateReviews': 85,
                'accuracyScore': Decimal('0.85'),
                'averageReviewTime': Decimal('30.5'),
                'currentWorkload': 2
            }
        }

    @patch('index.sns_client')
    @patch('index.moderator_profile_table')
    @patch('index.cognito_client')
    def test_create_moderator_account_success(self, mock_cognito, mock_table, mock_sns):
        """Test successful moderator account creation."""
        # Mock Cognito response
        mock_cognito.admin_create_user.return_value = {
            'User': {'Username': 'mod_123456789abc'}
        }
        
        # Mock DynamoDB put_item
        mock_table.put_item.return_value = {}
        
        # Mock SNS publish
        mock_sns.publish.return_value = {'MessageId': 'test-message-id'}
        
        result = create_moderator_account_direct(self.sample_moderator_data)
        
        self.assertTrue(result['success'])
        self.assertIn('moderatorId', result)
        self.assertEqual(result['message'], 'Moderator account created successfully')
        
        # Verify Cognito was called
        mock_cognito.admin_create_user.assert_called_once()
        
        # Verify DynamoDB was called
        mock_table.put_item.assert_called_once()

    def test_create_moderator_account_missing_fields(self):
        """Test moderator account creation with missing required fields."""
        incomplete_data = {'email': 'test@example.com'}
        
        result = create_moderator_account_direct(incomplete_data)
        
        self.assertFalse(result['success'])
        self.assertIn('Missing required field', result['error'])

    def test_create_moderator_account_invalid_role(self):
        """Test moderator account creation with invalid role."""
        invalid_data = self.sample_moderator_data.copy()
        invalid_data['role'] = 'invalid_role'
        
        result = create_moderator_account_direct(invalid_data)
        
        self.assertFalse(result['success'])
        self.assertIn('Invalid role', result['error'])

    @patch('index.review_queue_table')
    @patch('index.moderator_profile_table')
    def test_get_moderator_profile_success(self, mock_profile_table, mock_review_table):
        """Test successful moderator profile retrieval."""
        # Mock profile table response
        mock_profile_table.get_item.return_value = {
            'Item': self.sample_profile
        }
        
        # Mock review table query for workload
        mock_review_table.query.return_value = {'Count': 2}
        
        result = get_moderator_profile_direct('mod_123456789abc')
        
        self.assertTrue(result['success'])
        self.assertIn('profile', result)
        self.assertEqual(result['profile']['moderatorId'], 'mod_123456789abc')

    @patch('index.moderator_profile_table')
    def test_get_moderator_profile_not_found(self, mock_table):
        """Test moderator profile retrieval when moderator doesn't exist."""
        mock_table.get_item.return_value = {}
        
        result = get_moderator_profile_direct('nonexistent_mod')
        
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'Moderator not found')

    @patch('index.cognito_client')
    @patch('index.moderator_profile_table')
    def test_update_moderator_profile_success(self, mock_table, mock_cognito):
        """Test successful moderator profile update."""
        # Mock get_item response
        mock_table.get_item.return_value = {
            'Item': self.sample_profile
        }
        
        # Mock update_item response
        mock_table.update_item.return_value = {}
        
        # Mock Cognito update
        mock_cognito.admin_update_user_attributes.return_value = {}
        
        update_data = {
            'firstName': 'Jane',
            'role': 'lead'
        }
        
        result = update_moderator_profile_direct('mod_123456789abc', update_data)
        
        self.assertTrue(result['success'])
        self.assertEqual(result['message'], 'Moderator profile updated successfully')
        
        # Verify DynamoDB update was called
        mock_table.update_item.assert_called_once()
        
        # Verify Cognito update was called
        mock_cognito.admin_update_user_attributes.assert_called_once()

    @patch('index.get_active_reviews')
    @patch('index.cognito_client')
    @patch('index.moderator_profile_table')
    def test_delete_moderator_account_success(self, mock_table, mock_cognito, mock_get_active):
        """Test successful moderator account deletion."""
        # Mock no active reviews
        mock_get_active.return_value = []
        
        # Mock DynamoDB update
        mock_table.update_item.return_value = {}
        
        # Mock Cognito disable
        mock_cognito.admin_disable_user.return_value = {}
        
        result = delete_moderator_account_direct('mod_123456789abc')
        
        self.assertTrue(result['success'])
        self.assertEqual(result['message'], 'Moderator account deleted successfully')
        
        # Verify soft delete was performed
        mock_table.update_item.assert_called_once()
        mock_cognito.admin_disable_user.assert_called_once()

    @patch('index.get_active_reviews')
    def test_delete_moderator_account_with_active_reviews(self, mock_get_active):
        """Test moderator account deletion with active reviews."""
        # Mock active reviews
        mock_get_active.return_value = [{'reviewId': 'review1'}, {'reviewId': 'review2'}]
        
        result = delete_moderator_account_direct('mod_123456789abc')
        
        self.assertFalse(result['success'])
        self.assertIn('Cannot delete moderator with 2 active reviews', result['error'])

    @patch('index.get_current_workload')
    @patch('index.moderator_profile_table')
    def test_list_moderators_success(self, mock_table, mock_workload):
        """Test successful moderator listing."""
        # Mock scan response
        mock_table.scan.return_value = {
            'Items': [self.sample_profile]
        }
        
        # Mock workload calculation
        mock_workload.return_value = 2
        
        result = list_moderators_direct({'status': 'active'})
        
        self.assertTrue(result['success'])
        self.assertEqual(result['count'], 1)
        self.assertIn('moderators', result)

    @patch('index.count_reviews_in_period')
    @patch('index.calculate_average_response_time')
    @patch('index.calculate_recent_accuracy')
    @patch('index.get_moderator_profile_direct')
    def test_get_moderator_statistics(self, mock_profile, mock_accuracy, mock_response_time, mock_count):
        """Test moderator statistics retrieval."""
        # Mock profile response
        mock_profile.return_value = {
            'success': True,
            'profile': self.sample_profile
        }
        
        # Mock statistics calculations
        mock_accuracy.return_value = 0.88
        mock_response_time.return_value = 25.5
        mock_count.side_effect = [8, 35]  # week, month
        
        result = get_moderator_statistics('mod_123456789abc')
        
        self.assertTrue(result['success'])
        self.assertIn('statistics', result)
        self.assertIn('basic', result['statistics'])
        self.assertIn('workload', result['statistics'])
        self.assertIn('performance', result['statistics'])

    def test_generate_temporary_password(self):
        """Test temporary password generation."""
        password = generate_temporary_password()
        
        self.assertEqual(len(password), 16)
        self.assertTrue(any(c.islower() for c in password))
        self.assertTrue(any(c.isupper() for c in password))
        self.assertTrue(any(c.isdigit() for c in password))
        self.assertTrue(any(c in "!@#$%^&*" for c in password))

    def test_get_max_concurrent_reviews(self):
        """Test maximum concurrent reviews calculation."""
        self.assertEqual(get_max_concurrent_reviews('junior'), 3)
        self.assertEqual(get_max_concurrent_reviews('senior'), 5)
        self.assertEqual(get_max_concurrent_reviews('lead'), 7)
        self.assertEqual(get_max_concurrent_reviews('unknown'), 3)

    def test_decimal_to_float(self):
        """Test decimal to float conversion."""
        decimal_value = Decimal('123.45')
        result = decimal_to_float(decimal_value)
        self.assertEqual(result, 123.45)
        self.assertIsInstance(result, float)
        
        # Test with non-decimal value
        with self.assertRaises(TypeError):
            decimal_to_float("not a decimal")

    @patch('index.handle_api_request')
    def test_handler_api_gateway_request(self, mock_api_handler):
        """Test handler with API Gateway request."""
        mock_api_handler.return_value = {'statusCode': 200}
        
        event = {'httpMethod': 'GET', 'path': '/moderators'}
        result = handler(event, {})
        
        mock_api_handler.assert_called_once_with(event, {})

    @patch('index.handle_direct_request')
    def test_handler_direct_request(self, mock_direct_handler):
        """Test handler with direct request."""
        mock_direct_handler.return_value = {'success': True}
        
        event = {'action': 'create_moderator'}
        result = handler(event, {})
        
        mock_direct_handler.assert_called_once_with(event, {})

if __name__ == '__main__':
    unittest.main()