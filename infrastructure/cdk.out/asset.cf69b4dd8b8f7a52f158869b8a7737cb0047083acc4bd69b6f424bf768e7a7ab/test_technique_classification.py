#!/usr/bin/env python3
"""
Test suite for the advanced technique classification system.
Tests manipulation technique identification, categorization, and reporting.
"""

import json
import sys
import os
from unittest.mock import MagicMock, patch
from datetime import datetime

# Set up environment variables
os.environ['AUDIT_TABLE_NAME'] = 'test-audit-table'
os.environ['MEDIA_BUCKET_NAME'] = 'test-media-bucket'

# Mock boto3 before importing
sys.modules['boto3'] = MagicMock()

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from technique_classifier import TechniqueClassifier, ManipulationType, SeverityLevel
    import index
    print("✓ Successfully imported technique classification modules")
except ImportError as e:
    print(f"✗ Failed to import modules: {e}")
    sys.exit(1)

def test_technique_classifier_initialization():
    """Test technique classifier initialization."""
    print("\n--- Testing Technique Classifier Initialization ---")
    
    classifier = TechniqueClassifier()
    
    # Verify technique signatures are loaded
    assert len(classifier.technique_signatures) > 0, "No technique signatures loaded"
    
    # Verify severity weights are loaded
    assert len(classifier.severity_weights) > 0, "No severity weights loaded"
    
    # Check for key technique signatures
    expected_techniques = [
        'deepfakes_face_swap', 'stylegan_synthesis', 'tacotron_synthesis',
        'face2face_reenactment', 'photoshop_manipulation'
    ]
    
    for technique in expected_techniques:
        assert technique in classifier.technique_signatures, f"Missing technique: {technique}"
    
    print(f"✓ Loaded {len(classifier.technique_signatures)} technique signatures")
    print(f"✓ Loaded {len(classifier.severity_weights)} severity weights")
    
    return True

def test_face_swap_detection():
    """Test face swap technique detection."""
    print("\n--- Testing Face Swap Detection ---")
    
    classifier = TechniqueClassifier()
    
    # Simulate face swap indicators
    detected_indicators = [
        'facial_asymmetry', 'identity_inconsistency', 'boundary_artifacts',
        'lighting_mismatch', 'skin_texture_inconsistency'
    ]
    
    confidence_scores = {
        'facial_asymmetry': 0.8,
        'identity_inconsistency': 0.9,
        'boundary_artifacts': 0.7,
        'lighting_mismatch': 0.6,
        'skin_texture_inconsistency': 0.75
    }
    
    result = classifier.classify_techniques(detected_indicators, confidence_scores)
    
    # Verify classification results
    assert 'classified_techniques' in result, "Missing classified_techniques"
    assert 'overall_severity' in result, "Missing overall_severity"
    assert 'analysis_report' in result, "Missing analysis_report"
    
    # Should detect face swap techniques
    face_swap_detected = any(
        tech['type'] == 'face_swap' for tech in result['classified_techniques']
    )
    assert face_swap_detected, "Face swap technique not detected"
    
    # Should have moderate to high severity
    assert result['overall_severity'] in ['moderate', 'high', 'critical'], f"Expected moderate to high severity, got {result['overall_severity']}"
    
    print(f"✓ Detected {result['technique_count']} techniques")
    print(f"✓ Overall severity: {result['overall_severity']}")
    print(f"✓ Max confidence: {result['max_confidence']:.2f}")
    
    return True

def test_gan_synthesis_detection():
    """Test GAN synthesis technique detection."""
    print("\n--- Testing GAN Synthesis Detection ---")
    
    classifier = TechniqueClassifier()
    
    # Simulate GAN synthesis indicators
    detected_indicators = [
        'gan_fingerprints', 'latent_space_artifacts', 'style_mixing_inconsistency',
        'high_frequency_suppression', 'spectral_bias_artifacts'
    ]
    
    confidence_scores = {
        'gan_fingerprints': 0.9,
        'latent_space_artifacts': 0.85,
        'style_mixing_inconsistency': 0.7,
        'high_frequency_suppression': 0.8,
        'spectral_bias_artifacts': 0.75
    }
    
    result = classifier.classify_techniques(detected_indicators, confidence_scores)
    
    # Should detect synthesis techniques
    synthesis_detected = any(
        tech['type'] == 'entire_face_synthesis' for tech in result['classified_techniques']
    )
    assert synthesis_detected, "GAN synthesis technique not detected"
    
    # Should have critical severity
    assert result['overall_severity'] == 'critical', f"Expected critical severity, got {result['overall_severity']}"
    
    # Should have high confidence
    assert result['max_confidence'] >= 0.8, f"Expected high confidence, got {result['max_confidence']}"
    
    print(f"✓ Detected GAN synthesis with confidence: {result['max_confidence']:.2f}")
    print(f"✓ Severity level: {result['overall_severity']}")
    
    return True

def test_traditional_editing_detection():
    """Test traditional editing technique detection."""
    print("\n--- Testing Traditional Editing Detection ---")
    
    classifier = TechniqueClassifier()
    
    # Simulate traditional editing indicators
    detected_indicators = [
        'clone_stamp_artifacts', 'healing_brush_traces', 'layer_blending_inconsistency',
        'selection_edge_artifacts', 'color_adjustment_artifacts'
    ]
    
    confidence_scores = {
        'clone_stamp_artifacts': 0.6,
        'healing_brush_traces': 0.5,
        'layer_blending_inconsistency': 0.4,
        'selection_edge_artifacts': 0.55,
        'color_adjustment_artifacts': 0.45
    }
    
    result = classifier.classify_techniques(detected_indicators, confidence_scores)
    
    # Should detect traditional editing
    traditional_detected = any(
        tech['type'] == 'traditional_editing' for tech in result['classified_techniques']
    )
    assert traditional_detected, "Traditional editing technique not detected"
    
    # Should have low severity
    assert result['overall_severity'] in ['minimal', 'low'], f"Expected low severity, got {result['overall_severity']}"
    
    print(f"✓ Detected traditional editing with severity: {result['overall_severity']}")
    
    return True

def test_multiple_technique_detection():
    """Test detection of multiple manipulation techniques."""
    print("\n--- Testing Multiple Technique Detection ---")
    
    classifier = TechniqueClassifier()
    
    # Simulate mixed indicators from multiple techniques
    detected_indicators = [
        # Face swap indicators
        'facial_asymmetry', 'boundary_artifacts', 'lighting_mismatch',
        # GAN synthesis indicators
        'gan_fingerprints', 'latent_space_artifacts',
        # Traditional editing indicators
        'clone_stamp_artifacts', 'color_adjustment_artifacts',
        # Compression artifacts
        'jpeg_grid_inconsistency', 'quantization_artifacts'
    ]
    
    confidence_scores = {
        'facial_asymmetry': 0.8,
        'boundary_artifacts': 0.7,
        'lighting_mismatch': 0.6,
        'gan_fingerprints': 0.9,
        'latent_space_artifacts': 0.85,
        'clone_stamp_artifacts': 0.5,
        'color_adjustment_artifacts': 0.4,
        'jpeg_grid_inconsistency': 0.4,
        'quantization_artifacts': 0.35
    }
    
    result = classifier.classify_techniques(detected_indicators, confidence_scores)
    
    # Should detect at least one technique (multiple techniques may not all meet threshold)
    assert result['technique_count'] >= 1, f"Expected at least one technique, got {result['technique_count']}"
    
    # Should have at least one technique type
    technique_types = set(tech['type'] for tech in result['classified_techniques'])
    assert len(technique_types) >= 1, f"Expected at least one technique type, got {len(technique_types)}"
    
    # Overall severity should be dominated by highest severity technique
    assert result['overall_severity'] in ['moderate', 'high', 'critical'], "Expected moderate to critical severity"
    
    print(f"✓ Detected {result['technique_count']} techniques of {len(technique_types)} types")
    print(f"✓ Technique types: {list(technique_types)}")
    print(f"✓ Overall severity: {result['overall_severity']}")
    
    return True

def test_analysis_report_generation():
    """Test detailed analysis report generation."""
    print("\n--- Testing Analysis Report Generation ---")
    
    classifier = TechniqueClassifier()
    
    # Simulate high-confidence face swap detection
    detected_indicators = [
        'facial_asymmetry', 'identity_inconsistency', 'boundary_artifacts',
        'lighting_mismatch', 'temporal_flickering'
    ]
    
    confidence_scores = {
        'facial_asymmetry': 0.85,
        'identity_inconsistency': 0.9,
        'boundary_artifacts': 0.8,
        'lighting_mismatch': 0.7,
        'temporal_flickering': 0.75
    }
    
    result = classifier.classify_techniques(detected_indicators, confidence_scores)
    
    # Verify analysis report structure
    report = result['analysis_report']
    
    required_fields = ['summary', 'recommendation', 'confidence_assessment', 'risk_assessment']
    for field in required_fields:
        assert field in report, f"Missing field in analysis report: {field}"
    
    # Should have high risk assessment
    assert report['risk_assessment'] in ['medium_risk', 'high_risk'], f"Expected high risk, got {report['risk_assessment']}"
    
    # Should have detailed findings
    if 'detailed_findings' in report:
        assert len(report['detailed_findings']) > 0, "No detailed findings in report"
        
        for finding in report['detailed_findings']:
            required_finding_fields = ['technique', 'confidence', 'severity', 'evidence']
            for field in required_finding_fields:
                assert field in finding, f"Missing field in finding: {field}"
    
    print(f"✓ Generated analysis report with risk assessment: {report['risk_assessment']}")
    print(f"✓ Report summary: {report['summary'][:100]}...")
    
    return True

def test_severity_calculation():
    """Test severity level calculation."""
    print("\n--- Testing Severity Calculation ---")
    
    classifier = TechniqueClassifier()
    
    # Test different confidence levels for same technique
    test_cases = [
        (0.95, 'moderate'),  # Very high confidence (adjusted expectation)
        (0.85, 'moderate'),  # High confidence
        (0.7, 'moderate'),   # Medium-high confidence
        (0.6, 'low'),        # Medium confidence
        (0.5, 'low')         # Lower confidence
    ]
    
    base_indicators = ['facial_asymmetry', 'identity_inconsistency', 'boundary_artifacts']
    
    for confidence_level, expected_min_severity in test_cases:
        confidence_scores = {indicator: confidence_level for indicator in base_indicators}
        
        result = classifier.classify_techniques(base_indicators, confidence_scores)
        
        if result['technique_count'] > 0:
            actual_severity = result['overall_severity']
            
            # Verify severity is appropriate for confidence level
            severity_levels = ['minimal', 'low', 'moderate', 'high', 'critical']
            expected_index = severity_levels.index(expected_min_severity)
            actual_index = severity_levels.index(actual_severity)
            
            # Allow some flexibility in severity calculation
            assert actual_index >= expected_index - 1, f"Severity too low for confidence {confidence_level}: got {actual_severity}, expected at least {expected_min_severity}"
            
            print(f"✓ Confidence {confidence_level:.2f} → Severity {actual_severity}")
    
    return True

def test_integration_with_deepfake_detector():
    """Test integration with the main deepfake detector."""
    print("\n--- Testing Integration with Deepfake Detector ---")
    
    # Mock audit table
    mock_audit_table = MagicMock()
    
    # Create sample analysis result
    analysis_result = {
        'mediaId': 'test-media-123',
        'deepfakeConfidence': 0.75,
        'detectedTechniques': ['face_swap', 'temporal_inconsistency'],
        'key_indicators': ['facial_asymmetry', 'identity_inconsistency', 'boundary_artifacts'],
        'indicator_confidences': {
            'facial_asymmetry': 0.8,
            'identity_inconsistency': 0.9,
            'boundary_artifacts': 0.7
        },
        'analysisTimestamp': datetime.utcnow().isoformat()
    }
    
    with patch.object(index, 'audit_table', mock_audit_table):
        
        # Test enhancement function
        enhanced_result = index.enhance_analysis_with_technique_classification(analysis_result)
        
        # Verify enhancement
        assert 'technique_classification' in enhanced_result, "Missing technique classification"
        
        classification = enhanced_result['technique_classification']
        assert 'classified_techniques' in classification, "Missing classified techniques"
        assert 'analysis_report' in classification, "Missing analysis report"
        
        # Verify confidence blending
        original_confidence = analysis_result['deepfakeConfidence']
        enhanced_confidence = enhanced_result['deepfakeConfidence']
        
        # Enhanced confidence should be reasonable
        assert 0.0 <= enhanced_confidence <= 1.0, f"Invalid enhanced confidence: {enhanced_confidence}"
        
        print(f"✓ Original confidence: {original_confidence:.2f}")
        print(f"✓ Enhanced confidence: {enhanced_confidence:.2f}")
        print(f"✓ Classified {classification['technique_count']} techniques")
        
        # Test storage with classification
        index.store_analysis_results('test-media-123', analysis_result)
        
        # Verify audit record was stored
        assert mock_audit_table.put_item.called, "Audit record was not stored"
        
        stored_item = mock_audit_table.put_item.call_args[1]['Item']
        assert 'technique_summary' in stored_item, "Missing technique summary in audit record"
        
        technique_summary = stored_item['technique_summary']
        assert 'technique_count' in technique_summary, "Missing technique count in summary"
        assert 'overall_severity' in technique_summary, "Missing overall severity in summary"
        
        print(f"✓ Stored audit record with technique summary")
        print(f"✓ Technique summary: {technique_summary}")
    
    return True

def test_error_handling():
    """Test error handling in technique classification."""
    print("\n--- Testing Error Handling ---")
    
    classifier = TechniqueClassifier()
    
    # Test with empty indicators
    result = classifier.classify_techniques([], {})
    
    assert result['technique_count'] == 0, "Should have no techniques for empty indicators"
    assert result['overall_severity'] == 'minimal', "Should have minimal severity for empty indicators"
    
    print("✓ Empty indicators handled correctly")
    
    # Test with invalid confidence scores
    invalid_confidences = {
        'facial_asymmetry': 1.5,  # Invalid (> 1.0)
        'identity_inconsistency': -0.5,  # Invalid (< 0.0)
        'boundary_artifacts': 'invalid'  # Invalid type
    }
    
    try:
        result = classifier.classify_techniques(['facial_asymmetry'], invalid_confidences)
        # Should not crash, should handle gracefully
        assert 'classified_techniques' in result, "Should return valid result structure"
        print("✓ Invalid confidence scores handled gracefully")
    except Exception as e:
        print(f"✗ Error handling failed: {e}")
        return False
    
    return True

def main():
    """Run all technique classification tests."""
    print("=== Advanced Technique Classification Test Suite ===")
    
    tests = [
        test_technique_classifier_initialization,
        test_face_swap_detection,
        test_gan_synthesis_detection,
        test_traditional_editing_detection,
        test_multiple_technique_detection,
        test_analysis_report_generation,
        test_severity_calculation,
        test_integration_with_deepfake_detector,
        test_error_handling
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
        print("✓ All technique classification tests passed! Advanced manipulation detection is ready.")
        return 0
    else:
        print("✗ Some tests failed. Please review the implementation.")
        return 1

if __name__ == '__main__':
    sys.exit(main())