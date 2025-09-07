#!/usr/bin/env python3
"""
Test suite for the enhanced trust score calculator.
Tests advanced composite scoring algorithms and technique integration.
"""

import json
import sys
import os
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta

# Set up environment variables
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'

# Mock boto3 before importing
sys.modules['boto3'] = MagicMock()

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import index
    print("✓ Successfully imported enhanced trust score calculator")
except ImportError as e:
    print(f"✗ Failed to import trust score calculator: {e}")
    sys.exit(1)

def test_enhanced_deepfake_score_calculation():
    """Test enhanced deepfake score calculation with technique classification."""
    print("\n--- Testing Enhanced Deepfake Score Calculation ---")
    
    # Test with technique classification data
    analysis_data = {
        'deepfakeAnalysis': {
            'deepfakeConfidence': 0.75,
            'detectedTechniques': ['face_swap', 'temporal_inconsistency'],
            'technique_classification': {
                'overall_severity': 'high',
                'max_confidence': 0.8,
                'classified_techniques': [
                    {
                        'type': 'face_swap',
                        'confidence': 0.8,
                        'severity': 'high'
                    },
                    {
                        'type': 'temporal_inconsistency',
                        'confidence': 0.7,
                        'severity': 'moderate'
                    }
                ],
                'analysis_report': {
                    'consensus_metrics': {
                        'agreement': 'high',
                        'models_count': 3
                    }
                }
            },
            'processingTime': 3.5
        }
    }
    
    score = index.calculate_deepfake_score(analysis_data)
    
    # Should be low trust score due to high deepfake confidence and severe techniques
    assert 0 <= score <= 100, f"Score out of range: {score}"
    assert score < 50, f"Expected low trust score for high deepfake confidence, got {score}"
    
    print(f"✓ Enhanced deepfake score: {score:.2f}")
    
    # Test without technique classification (fallback)
    analysis_data_simple = {
        'deepfakeAnalysis': {
            'deepfakeConfidence': 0.3,
            'detectedTechniques': ['compression_artifacts']
        }
    }
    
    score_simple = index.calculate_deepfake_score(analysis_data_simple)
    
    # Should be higher trust score for lower deepfake confidence
    assert score_simple > score, f"Simple analysis should have higher trust score"
    
    print(f"✓ Simple deepfake score: {score_simple:.2f}")
    
    return True

def test_confidence_modifier_calculation():
    """Test confidence modifier calculation."""
    print("\n--- Testing Confidence Modifier Calculation ---")
    
    # High confidence scenario
    high_confidence_analysis = {
        'technique_classification': {
            'analysis_report': {
                'consensus_metrics': {
                    'agreement': 'very_high',
                    'models_count': 3
                }
            }
        },
        'processingTime': 6.0
    }
    
    modifier = index.calculate_confidence_modifier(high_confidence_analysis)
    
    assert modifier > 1.0, f"High confidence should increase modifier, got {modifier}"
    assert modifier <= 2.0, f"Modifier should be capped at 2.0, got {modifier}"
    
    print(f"✓ High confidence modifier: {modifier:.2f}")
    
    # Low confidence scenario
    low_confidence_analysis = {
        'technique_classification': {
            'analysis_report': {
                'consensus_metrics': {
                    'agreement': 'very_low',
                    'models_count': 1
                }
            }
        },
        'processingTime': 0.3
    }
    
    modifier_low = index.calculate_confidence_modifier(low_confidence_analysis)
    
    assert modifier_low < 1.0, f"Low confidence should decrease modifier, got {modifier_low}"
    assert modifier_low >= 0.5, f"Modifier should be clamped at 0.5, got {modifier_low}"
    
    print(f"✓ Low confidence modifier: {modifier_low:.2f}")
    
    return True

def test_advanced_composite_scoring():
    """Test advanced composite scoring with dynamic weighting."""
    print("\n--- Testing Advanced Composite Scoring ---")
    
    # Test with varied component scores
    test_scores = {
        'deepfake': 20.0,           # Low trust (high deepfake probability)
        'sourceReliability': 85.0,  # High trust
        'metadataConsistency': 75.0, # Good trust
        'technicalIntegrity': 90.0,  # High trust
        'historicalPattern': 70.0    # Good trust
    }
    
    composite_score = index.calculate_composite_score(test_scores)
    
    assert 0 <= composite_score <= 100, f"Composite score out of range: {composite_score}"
    
    # Should be weighted toward deepfake score (highest weight)
    # But not as low as deepfake score alone due to other positive factors
    assert composite_score > test_scores['deepfake'], "Composite should be higher than lowest component"
    assert composite_score < max(test_scores.values()), "Composite should be lower than highest component"
    
    print(f"✓ Composite score with mixed components: {composite_score:.2f}")
    
    # Test with extreme scores
    extreme_scores = {
        'deepfake': 5.0,            # Very low trust
        'sourceReliability': 95.0,  # Very high trust
        'metadataConsistency': 50.0, # Neutral (missing data)
        'technicalIntegrity': 50.0,  # Neutral (missing data)
        'historicalPattern': 50.0    # Neutral (missing data)
    }
    
    extreme_composite = index.calculate_composite_score(extreme_scores)
    
    # Should handle extreme values appropriately
    assert 0 <= extreme_composite <= 100, f"Extreme composite score out of range: {extreme_composite}"
    
    print(f"✓ Composite score with extreme values: {extreme_composite:.2f}")
    
    return True

def test_dynamic_weight_calculation():
    """Test dynamic weight calculation."""
    print("\n--- Testing Dynamic Weight Calculation ---")
    
    base_weights = {
        'deepfake': 0.35,
        'sourceReliability': 0.25,
        'metadataConsistency': 0.20,
        'technicalIntegrity': 0.15,
        'historicalPattern': 0.05
    }
    
    # Test with extreme scores (should boost weights)
    extreme_scores = {
        'deepfake': 10.0,           # Very low trust - should boost weight
        'sourceReliability': 90.0,  # Very high trust - should boost weight
        'metadataConsistency': 50.0, # Neutral - should reduce weight
        'technicalIntegrity': 85.0,  # High trust - should boost weight
        'historicalPattern': 45.0    # Near neutral - should reduce weight
    }
    
    dynamic_weights = index.calculate_dynamic_weights(extreme_scores, base_weights)
    
    # Verify weights sum to 1.0
    weight_sum = sum(dynamic_weights.values())
    assert abs(weight_sum - 1.0) < 0.001, f"Weights should sum to 1.0, got {weight_sum}"
    
    # Verify extreme scores get boosted weights
    assert dynamic_weights['deepfake'] > base_weights['deepfake'], "Extreme deepfake score should boost weight"
    assert dynamic_weights['sourceReliability'] > base_weights['sourceReliability'], "Extreme source score should boost weight"
    
    print(f"✓ Dynamic weights calculated: deepfake={dynamic_weights['deepfake']:.3f}")
    
    return True

def test_enhanced_source_reliability_scoring():
    """Test enhanced source reliability scoring."""
    print("\n--- Testing Enhanced Source Reliability Scoring ---")
    
    # Test with comprehensive source verification data
    analysis_data = {
        'sourceVerification': {
            'verificationStatus': 'verified',
            'verificationConfidence': 0.9,
            'sourceReputation': 'high',
            'reputationHistory': {
                'trend': 'improving'
            },
            'chainOfCustody': [
                {'verified': True, 'cryptographicProof': True, 'timestamp': '2024-01-15T10:00:00Z'},
                {'verified': True, 'cryptographicProof': False, 'timestamp': '2024-01-15T10:05:00Z'},
                {'verified': False, 'cryptographicProof': True, 'timestamp': '2024-01-15T10:10:00Z'}
            ],
            'crossReferences': ['source1', 'source2', 'source3']
        },
        'metadata': {
            's3Location': {
                'key': 'verified/uploads/test-media.jpg'
            },
            'uploadTimestamp': datetime.utcnow().isoformat()
        }
    }
    
    score = index.calculate_source_reliability_score(analysis_data)
    
    assert 0 <= score <= 100, f"Source reliability score out of range: {score}"
    assert score > 70, f"Expected high source reliability score, got {score}"
    
    print(f"✓ Enhanced source reliability score: {score:.2f}")
    
    # Test with suspicious source
    suspicious_data = {
        'sourceVerification': {
            'verificationStatus': 'suspicious',
            'verificationConfidence': 0.8,
            'sourceReputation': 'low',
            'reputationHistory': {
                'trend': 'declining'
            }
        },
        'metadata': {
            's3Location': {
                'key': 'quarantine/uploads/suspicious-media.jpg'
            }
        }
    }
    
    suspicious_score = index.calculate_source_reliability_score(suspicious_data)
    
    assert suspicious_score < 50, f"Expected low score for suspicious source, got {suspicious_score}"
    
    print(f"✓ Suspicious source score: {suspicious_score:.2f}")
    
    return True

def test_chain_of_custody_scoring():
    """Test chain of custody scoring."""
    print("\n--- Testing Chain of Custody Scoring ---")
    
    # Test with strong chain of custody
    strong_chain = [
        {'verified': True, 'cryptographicProof': True, 'timestamp': '2024-01-15T10:00:00Z'},
        {'verified': True, 'cryptographicProof': True, 'timestamp': '2024-01-15T10:05:00Z'},
        {'verified': True, 'cryptographicProof': True, 'timestamp': '2024-01-15T10:10:00Z'},
        {'verified': True, 'cryptographicProof': False, 'timestamp': '2024-01-15T10:15:00Z'}
    ]
    
    strong_score = index.calculate_chain_of_custody_score(strong_chain)
    
    assert strong_score > 15, f"Expected high chain of custody score, got {strong_score}"
    
    print(f"✓ Strong chain of custody score: {strong_score:.2f}")
    
    # Test with weak chain of custody
    weak_chain = [
        {'verified': False, 'cryptographicProof': False, 'timestamp': None}
    ]
    
    weak_score = index.calculate_chain_of_custody_score(weak_chain)
    
    assert weak_score < strong_score, f"Weak chain should score lower than strong chain"
    
    print(f"✓ Weak chain of custody score: {weak_score:.2f}")
    
    return True

def test_non_linear_score_adjustments():
    """Test non-linear score adjustments."""
    print("\n--- Testing Non-Linear Score Adjustments ---")
    
    test_scores = {
        'deepfake': 10.0,           # Very low trust
        'sourceReliability': 90.0,  # Very high trust
        'metadataConsistency': 50.0, # Neutral
        'technicalIntegrity': 75.0,  # Good trust
        'historicalPattern': 25.0    # Low trust
    }
    
    adjusted_scores = index.apply_non_linear_adjustments(test_scores)
    
    # Verify all scores are still in valid range
    for component, score in adjusted_scores.items():
        assert 0 <= score <= 100, f"Adjusted score out of range: {component}={score}"
    
    # Extreme scores should be emphasized
    assert adjusted_scores['deepfake'] < test_scores['deepfake'], "Very low scores should be emphasized downward"
    assert adjusted_scores['sourceReliability'] > test_scores['sourceReliability'], "Very high scores should be emphasized upward"
    
    print(f"✓ Non-linear adjustments applied successfully")
    print(f"  Original deepfake: {test_scores['deepfake']:.2f} → Adjusted: {adjusted_scores['deepfake']:.2f}")
    print(f"  Original source: {test_scores['sourceReliability']:.2f} → Adjusted: {adjusted_scores['sourceReliability']:.2f}")
    
    return True

def test_score_smoothing():
    """Test score smoothing for high variance scenarios."""
    print("\n--- Testing Score Smoothing ---")
    
    # Test with high variance scores
    high_variance_scores = {
        'deepfake': 5.0,
        'sourceReliability': 95.0,
        'metadataConsistency': 10.0,
        'technicalIntegrity': 90.0,
        'historicalPattern': 15.0
    }
    
    original_score = 60.0  # Hypothetical composite score
    smoothed_score = index.apply_score_smoothing(original_score, high_variance_scores)
    
    # Should apply some smoothing due to high variance
    assert smoothed_score != original_score, "Smoothing should be applied for high variance"
    
    print(f"✓ Score smoothing: {original_score:.2f} → {smoothed_score:.2f}")
    
    # Test with low variance scores
    low_variance_scores = {
        'deepfake': 70.0,
        'sourceReliability': 75.0,
        'metadataConsistency': 72.0,
        'technicalIntegrity': 68.0,
        'historicalPattern': 71.0
    }
    
    low_variance_smoothed = index.apply_score_smoothing(original_score, low_variance_scores)
    
    # Should apply minimal or no smoothing
    assert abs(low_variance_smoothed - original_score) < 5, "Low variance should result in minimal smoothing"
    
    print(f"✓ Low variance smoothing: {original_score:.2f} → {low_variance_smoothed:.2f}")
    
    return True

def test_end_to_end_trust_score_calculation():
    """Test complete end-to-end trust score calculation."""
    print("\n--- Testing End-to-End Trust Score Calculation ---")
    
    # Mock audit table data
    mock_audit_table = MagicMock()
    mock_audit_table.query.return_value = {
        'Items': [
            {
                'eventType': 'metadata_extraction',
                'metadata': {
                    'filename': 'test-video.mp4',
                    'fileSize': 1024000,
                    'contentType': 'video/mp4',
                    'uploadTimestamp': datetime.utcnow().isoformat(),
                    's3Location': {
                        'key': 'verified/uploads/test-video.mp4'
                    }
                }
            },
            {
                'eventType': 'deepfake_analysis',
                'data': {
                    'deepfakeConfidence': 0.3,
                    'detectedTechniques': ['compression_artifacts'],
                    'technique_classification': {
                        'overall_severity': 'low',
                        'max_confidence': 0.4,
                        'classified_techniques': [
                            {
                                'type': 'compression_artifacts',
                                'confidence': 0.4,
                                'severity': 'minimal'
                            }
                        ]
                    },
                    'processingTime': 2.1
                }
            },
            {
                'eventType': 'source_verification',
                'data': {
                    'verificationStatus': 'verified',
                    'verificationConfidence': 0.85,
                    'sourceReputation': 'high'
                }
            }
        ]
    }
    
    with patch.object(index, 'audit_table', mock_audit_table):
        
        # Test complete trust score calculation
        result = index.calculate_trust_score('test-media-123')
        
        # Verify result structure
        required_fields = [
            'mediaId', 'compositeScore', 'confidence', 'calculationTimestamp',
            'breakdown', 'factors', 'recommendations'
        ]
        
        for field in required_fields:
            assert field in result, f"Missing field in trust score result: {field}"
        
        # Verify score is in valid range
        assert 0 <= result['compositeScore'] <= 100, f"Composite score out of range: {result['compositeScore']}"
        
        # Should have high trust score due to good analysis results
        assert result['compositeScore'] > 60, f"Expected high trust score, got {result['compositeScore']}"
        
        # Verify breakdown has all components
        breakdown = result['breakdown']
        expected_components = [
            'deepfakeScore', 'sourceReliabilityScore', 'metadataConsistencyScore',
            'historicalPatternScore', 'technicalIntegrityScore'
        ]
        
        for component in expected_components:
            assert component in breakdown, f"Missing component in breakdown: {component}"
            assert 0 <= breakdown[component] <= 100, f"Component score out of range: {component}={breakdown[component]}"
        
        print(f"✓ End-to-end trust score: {result['compositeScore']:.2f}")
        print(f"✓ Confidence level: {result['confidence']}")
        print(f"✓ Breakdown: deepfake={breakdown['deepfakeScore']:.1f}, source={breakdown['sourceReliabilityScore']:.1f}")
        
        # Test storage
        index.store_trust_score('test-media-123', result)
        
        # Verify audit record was stored
        assert mock_audit_table.put_item.called, "Trust score audit record was not stored"
        
        stored_item = mock_audit_table.put_item.call_args[1]['Item']
        assert stored_item['eventType'] == 'trust_score_calculation', "Wrong event type in audit record"
        
        print("✓ Trust score stored in audit trail")
    
    return True

def main():
    """Run all enhanced trust score calculator tests."""
    print("=== Enhanced Trust Score Calculator Test Suite ===")
    
    tests = [
        test_enhanced_deepfake_score_calculation,
        test_confidence_modifier_calculation,
        test_advanced_composite_scoring,
        test_dynamic_weight_calculation,
        test_enhanced_source_reliability_scoring,
        test_chain_of_custody_scoring,
        test_non_linear_score_adjustments,
        test_score_smoothing,
        test_end_to_end_trust_score_calculation
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                print(f"✗ Test {test.__name__} failed")
        except Exception as e:
            print(f"✗ Test {test.__name__} failed with exception: {e}")
    
    print(f"\n=== Results: {passed}/{total} tests passed ===")
    
    if passed == total:
        print("✓ All enhanced trust score calculator tests passed! Advanced composite scoring is ready.")
        return 0
    else:
        print("✗ Some tests failed. Please review the implementation.")
        return 1

if __name__ == '__main__':
    sys.exit(main())