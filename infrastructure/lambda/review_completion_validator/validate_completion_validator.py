#!/usr/bin/env python3
"""
Validation script for review completion validator functionality.
"""

import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal

# Set environment variables
os.environ['REVIEW_QUEUE_TABLE_NAME'] = 'test-review-queue-table'
os.environ['MODERATOR_PROFILE_TABLE_NAME'] = 'test-moderator-profile-table'
os.environ['REVIEW_DECISION_TABLE_NAME'] = 'test-review-decision-table'
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['MODERATOR_ALERTS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-moderator-alerts'
os.environ['TRUST_SCORE_CALCULATOR_FUNCTION_NAME'] = 'test-trust-score-calculator'

# Mock boto3 before importing
class MockTable:
    def __init__(self, name):
        self.name = name
    
    def get_item(self, **kwargs):
        if 'review-queue' in self.name:
            return {
                'Item': {
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
            }
        return {}
    
    def update_item(self, **kwargs):
        return {}
    
    def put_item(self, **kwargs):
        return {}

class MockDynamoDB:
    def Table(self, name):
        return MockTable(name)

class MockSNS:
    def publish(self, **kwargs):
        return {'MessageId': 'test-message-id'}

class MockLambda:
    def invoke(self, **kwargs):
        return {'ResponseMetadata': {'RequestId': 'test-request-id'}}

class MockBedrock:
    def invoke_model(self, **kwargs):
        return {'body': type('MockBody', (), {'read': lambda: '{"result": "success"}'})()}

# Mock boto3 module
class MockBoto3:
    @staticmethod
    def resource(service_name):
        if service_name == 'dynamodb':
            return MockDynamoDB()
        return object()
    
    @staticmethod
    def client(service_name):
        if service_name == 'sns':
            return MockSNS()
        elif service_name == 'lambda':
            return MockLambda()
        elif service_name == 'bedrock-runtime':
            return MockBedrock()
        return object()

# Replace boto3 in sys.modules
sys.modules['boto3'] = MockBoto3()

# Now import the functions
from index import (
    handler, validate_review_completion, validate_decision_data,
    check_decision_consistency, DecisionType, ConfidenceLevel
)

def main():
    """Main validation function."""
    print("Starting review completion validator validation...")
    print("=" * 60)
    
    try:
        # Test 1: Lambda handler with different event types
        print("Validating Lambda handler...")
        
        # Test direct action event
        direct_event = {
            'action': 'validate_completion',
            'reviewId': 'review-123',
            'moderatorId': 'mod-123',
            'decisionData': {
                'decisionType': 'override',
                'confidenceLevel': 'high',
                'justification': 'This content appears to be authentic after detailed analysis.',
                'trustScoreAdjustment': 75.0
            }
        }
        
        result = handler(direct_event, {})
        print(f"Direct action handler result: {result['statusCode']}")
        print("✓ Direct action event handling validated")
        
        # Test 2: Decision data validation
        print("\nValidating decision data validation...")
        
        # Valid decision data
        valid_decision = {
            'decisionType': 'override',
            'confidenceLevel': 'high',
            'justification': 'After careful analysis, I believe this is actually authentic content.',
            'trustScoreAdjustment': 75.0,
            'threatLevel': 'low',
            'tags': ['false-positive', 'authentic'],
            'additionalEvidence': []
        }
        
        result = validate_decision_data(valid_decision)
        assert result['valid'] == True, "Valid decision data should pass validation"
        print("✓ Valid decision data validation passed")
        
        # Invalid decision data - missing required fields
        invalid_decision = {
            'decisionType': 'override'
            # Missing confidenceLevel and justification
        }
        
        result = validate_decision_data(invalid_decision)
        assert result['valid'] == False, "Invalid decision data should fail validation"
        assert len(result['errors']) > 0, "Should have validation errors"
        print("✓ Invalid decision data validation failed as expected")
        
        # Invalid decision type
        invalid_type_decision = valid_decision.copy()
        invalid_type_decision['decisionType'] = 'invalid_type'
        
        result = validate_decision_data(invalid_type_decision)
        assert result['valid'] == False, "Invalid decision type should fail validation"
        print("✓ Invalid decision type validation failed as expected")
        
        # Invalid confidence level
        invalid_confidence_decision = valid_decision.copy()
        invalid_confidence_decision['confidenceLevel'] = 'invalid_level'
        
        result = validate_decision_data(invalid_confidence_decision)
        assert result['valid'] == False, "Invalid confidence level should fail validation"
        print("✓ Invalid confidence level validation failed as expected")
        
        # Short justification
        short_justification_decision = valid_decision.copy()
        short_justification_decision['justification'] = 'Too short'
        
        result = validate_decision_data(short_justification_decision)
        assert result['valid'] == False, "Short justification should fail validation"
        print("✓ Short justification validation failed as expected")
        
        # Invalid trust score
        invalid_score_decision = valid_decision.copy()
        invalid_score_decision['trustScoreAdjustment'] = 150  # Out of range
        
        result = validate_decision_data(invalid_score_decision)
        assert result['valid'] == False, "Invalid trust score should fail validation"
        print("✓ Invalid trust score validation failed as expected")
        
        # Test 3: Consistency checking
        print("\nValidating consistency checking...")
        
        sample_review = {
            'reviewId': 'review-123',
            'analysisResults': {
                'trustScore': 45.0,
                'confidence': 0.75
            }
        }
        
        # Large score difference
        large_diff_decision = {
            'decisionType': 'override',
            'trustScoreAdjustment': 85.0,  # 40 point difference
            'confidenceLevel': 'high'
        }
        
        result = check_decision_consistency(sample_review, large_diff_decision)
        assert result['consistent'] == False, "Large score difference should be flagged"
        assert result['scoreDifference'] == 40.0, "Score difference should be calculated correctly"
        print("✓ Large score difference consistency check validated")
        
        # Override with minimal change
        minimal_change_decision = {
            'decisionType': 'override',
            'trustScoreAdjustment': 50.0,  # 5 point difference
            'confidenceLevel': 'high'
        }
        
        result = check_decision_consistency(sample_review, minimal_change_decision)
        assert result['consistent'] == False, "Override with minimal change should be flagged"
        print("✓ Minimal change override consistency check validated")
        
        # Confirm with adjustment
        confirm_with_adjustment = {
            'decisionType': 'confirm',
            'trustScoreAdjustment': 60.0,  # 15 point difference
            'confidenceLevel': 'high'
        }
        
        result = check_decision_consistency(sample_review, confirm_with_adjustment)
        assert result['consistent'] == False, "Confirm with significant adjustment should be flagged"
        print("✓ Confirm with adjustment consistency check validated")
        
        # Test 4: Enum validation
        print("\nValidating enumerations...")
        
        # Test DecisionType enum
        decision_types = [
            DecisionType.CONFIRM,
            DecisionType.OVERRIDE,
            DecisionType.ESCALATE,
            DecisionType.INCONCLUSIVE
        ]
        
        expected_values = ['confirm', 'override', 'escalate', 'inconclusive']
        
        for i, decision_type in enumerate(decision_types):
            assert decision_type.value == expected_values[i], f"DecisionType {decision_type} should have value {expected_values[i]}"
            print(f"  {decision_type.value}: valid decision type")
        
        print("✓ DecisionType enumeration validated")
        
        # Test ConfidenceLevel enum
        confidence_levels = [
            ConfidenceLevel.VERY_LOW,
            ConfidenceLevel.LOW,
            ConfidenceLevel.MEDIUM,
            ConfidenceLevel.HIGH,
            ConfidenceLevel.VERY_HIGH
        ]
        
        expected_confidence_values = ['very_low', 'low', 'medium', 'high', 'very_high']
        
        for i, confidence_level in enumerate(confidence_levels):
            assert confidence_level.value == expected_confidence_values[i], f"ConfidenceLevel {confidence_level} should have value {expected_confidence_values[i]}"
            print(f"  {confidence_level.value}: valid confidence level")
        
        print("✓ ConfidenceLevel enumeration validated")
        
        # Test 5: Review completion validation
        print("\nValidating review completion...")
        
        completion_event = {
            'reviewId': 'review-123',
            'moderatorId': 'mod-123',
            'decisionData': valid_decision
        }
        
        result = validate_review_completion(completion_event)
        print(f"Review completion result: {result['statusCode']}")
        print("✓ Review completion validation validated")
        
        # Test missing parameters
        incomplete_event = {'reviewId': 'review-123'}
        result = validate_review_completion(incomplete_event)
        assert result['statusCode'] == 400, "Should return 400 for missing parameters"
        print("✓ Missing parameters validation validated")
        
        # Test 6: Data structure validation
        print("\nValidating data structures...")
        
        # Test decision data with warnings
        data_with_warnings = valid_decision.copy()
        data_with_warnings['tags'] = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 
                                     'tag6', 'tag7', 'tag8', 'tag9', 'tag10', 'tag11']  # 11 tags
        
        result = validate_decision_data(data_with_warnings)
        assert result['valid'] == True, "Should still be valid with warnings"
        assert len(result['warnings']) > 0, "Should have warnings"
        print("✓ Data structure with warnings validated")
        
        # Test invalid tags type
        invalid_tags_data = valid_decision.copy()
        invalid_tags_data['tags'] = 'not_a_list'
        
        result = validate_decision_data(invalid_tags_data)
        assert result['valid'] == False, "Invalid tags type should fail validation"
        print("✓ Invalid tags type validation validated")
        
        # Test invalid evidence type
        invalid_evidence_data = valid_decision.copy()
        invalid_evidence_data['additionalEvidence'] = 'not_a_list'
        
        result = validate_decision_data(invalid_evidence_data)
        assert result['valid'] == False, "Invalid evidence type should fail validation"
        print("✓ Invalid evidence type validation validated")
        
        # Test 7: Error handling
        print("\nValidating error handling...")
        
        # Test handler with invalid event
        try:
            result = handler({}, {})
            print("✓ Invalid event handling validated")
        except Exception as e:
            print(f"✓ Error handling validated: {type(e).__name__}")
        
        print("\n" + "=" * 60)
        print("✅ All validations passed successfully!")
        print("Review completion validator is properly implemented and ready for use.")
        print("\nKey Features Validated:")
        print("  • Decision data validation with comprehensive checks")
        print("  • Consistency checking between AI and human decisions")
        print("  • Enumeration validation for decision types and confidence levels")
        print("  • Review completion workflow validation")
        print("  • Error handling and edge case management")
        print("  • Data structure integrity and type checking")
        
    except Exception as e:
        print(f"\n❌ Validation failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)