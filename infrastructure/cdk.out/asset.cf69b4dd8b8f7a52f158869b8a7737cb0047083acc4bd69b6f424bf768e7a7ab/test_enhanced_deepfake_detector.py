#!/usr/bin/env python3
"""
Enhanced test suite for the deepfake detector with Bedrock integration.
Tests the AI-powered deepfake detection capabilities.
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
    import index
    print("✓ Successfully imported enhanced deepfake detector module")
except ImportError as e:
    print(f"✗ Failed to import deepfake detector: {e}")
    sys.exit(1)

def test_bedrock_image_analysis():
    """Test Bedrock integration for image analysis."""
    print("\n--- Testing Bedrock Image Analysis ---")
    
    # Mock AWS clients
    mock_s3 = MagicMock()
    mock_bedrock = MagicMock()
    
    # Mock S3 response for image data
    mock_s3.get_object.return_value = {
        'Body': MagicMock(read=lambda: b'fake_image_data'),
        'ContentType': 'image/jpeg'
    }
    
    # Mock Bedrock response
    mock_bedrock_response = {
        'body': MagicMock(read=lambda: json.dumps({
            'content': [{
                'text': json.dumps({
                    'confidence': 0.75,
                    'techniques': ['facial_asymmetry', 'lighting_inconsistency'],
                    'details': 'Detected subtle facial asymmetries and lighting inconsistencies',
                    'certainty': 'high',
                    'key_indicators': ['unnatural_shadows', 'pixel_inconsistencies']
                })
            }]
        }).encode())
    }
    
    mock_bedrock.invoke_model.return_value = mock_bedrock_response
    
    with patch.object(index, 's3_client', mock_s3), \
         patch.object(index, 'bedrock_client', mock_bedrock):
        
        # Test Claude Sonnet analysis
        model_config = {
            'model_id': 'anthropic.claude-3-sonnet-20240229-v1:0',
            'name': 'Claude 3 Sonnet',
            'max_tokens': 4096
        }
        
        result = index.call_claude_sonnet_analysis('test-bucket', 'test-image.jpg', model_config)
        
        # Verify result structure
        assert 'confidence' in result, "Missing confidence in result"
        assert 'techniques' in result, "Missing techniques in result"
        assert 'processing_time' in result, "Missing processing_time in result"
        assert 'analysis_depth' in result, "Missing analysis_depth in result"
        
        # Verify confidence is in valid range
        assert 0.0 <= result['confidence'] <= 1.0, f"Invalid confidence: {result['confidence']}"
        
        # Verify Bedrock was called correctly
        assert mock_bedrock.invoke_model.called, "Bedrock invoke_model was not called"
        
        call_args = mock_bedrock.invoke_model.call_args
        assert call_args[1]['modelId'] == model_config['model_id'], "Wrong model ID used"
        
        print(f"✓ Claude Sonnet analysis completed with confidence: {result['confidence']}")
        print(f"✓ Detected techniques: {result['techniques']}")
        print(f"✓ Processing time: {result['processing_time']:.2f}s")
        
        return True

def test_ensemble_analysis():
    """Test ensemble analysis with multiple models."""
    print("\n--- Testing Ensemble Analysis ---")
    
    # Mock individual model results
    mock_sonnet_result = {
        'confidence': 0.75,
        'techniques': ['facial_asymmetry', 'lighting_inconsistency'],
        'certainty': 'high',
        'processing_time': 3.2,
        'analysis_depth': 'detailed'
    }
    
    mock_haiku_result = {
        'confidence': 0.68,
        'techniques': ['edge_artifacts', 'color_inconsistency'],
        'certainty': 'medium',
        'processing_time': 0.8,
        'analysis_depth': 'standard'
    }
    
    mock_titan_result = {
        'confidence': 0.62,
        'techniques': ['gan_signatures', 'texture_analysis'],
        'processing_time': 1.5,
        'analysis_depth': 'supplementary'
    }
    
    with patch.object(index, 'call_claude_sonnet_analysis', return_value=mock_sonnet_result), \
         patch.object(index, 'call_claude_haiku_analysis', return_value=mock_haiku_result), \
         patch.object(index, 'call_titan_analysis', return_value=mock_titan_result):
        
        # Test model selection
        models = index.select_optimal_models(2 * 1024 * 1024, 'image', {})  # 2MB image
        
        assert len(models) >= 2, f"Expected at least 2 models, got {len(models)}"
        
        # Verify Sonnet is selected for large files
        sonnet_selected = any('sonnet' in model['model_id'] for model in models)
        assert sonnet_selected, "Claude Sonnet should be selected for large files"
        
        print(f"✓ Selected {len(models)} models for analysis")
        
        # Test ensemble analysis
        ensemble_results = index.perform_ensemble_analysis('test-bucket', 'test-image.jpg', models, 'image')
        
        assert len(ensemble_results) == len(models), f"Expected {len(models)} results, got {len(ensemble_results)}"
        
        # Test ensemble confidence calculation
        ensemble_confidence = index.calculate_ensemble_confidence(ensemble_results)
        
        assert 0.0 <= ensemble_confidence <= 1.0, f"Invalid ensemble confidence: {ensemble_confidence}"
        
        print(f"✓ Ensemble analysis completed with confidence: {ensemble_confidence}")
        
        # Test consensus metrics
        consensus_metrics = index.calculate_consensus_metrics(ensemble_results)
        
        assert 'agreement' in consensus_metrics, "Missing agreement in consensus metrics"
        assert 'variance' in consensus_metrics, "Missing variance in consensus metrics"
        assert 'models_count' in consensus_metrics, "Missing models_count in consensus metrics"
        
        print(f"✓ Consensus metrics: {consensus_metrics['agreement']} agreement")
        
        return True

def test_video_analysis():
    """Test video deepfake analysis."""
    print("\n--- Testing Video Analysis ---")
    
    # Mock frame extraction
    mock_frames = [
        {'frame_number': 0, 'timestamp': 0.0, 'base64_data': 'frame0', 'content_type': 'image/jpeg'},
        {'frame_number': 1, 'timestamp': 10.0, 'base64_data': 'frame1', 'content_type': 'image/jpeg'},
        {'frame_number': 2, 'timestamp': 20.0, 'base64_data': 'frame2', 'content_type': 'image/jpeg'}
    ]
    
    # Mock frame analysis results
    mock_frame_analyses = [
        {'frame_number': 0, 'confidence': 0.7, 'techniques': ['face_swap_detected']},
        {'frame_number': 1, 'confidence': 0.8, 'techniques': ['face_swap_detected', 'temporal_inconsistency']},
        {'frame_number': 2, 'confidence': 0.75, 'techniques': ['blending_artifacts']}
    ]
    
    with patch.object(index, 'extract_video_frames_for_analysis', return_value=mock_frames), \
         patch.object(index, 'analyze_video_frame_with_bedrock', side_effect=mock_frame_analyses):
        
        # Test video analysis
        result = index.call_bedrock_for_video_analysis('test-bucket', 'test-video.mp4')
        
        # Verify result structure
        assert 'confidence' in result, "Missing confidence in video result"
        assert 'techniques' in result, "Missing techniques in video result"
        assert 'framesAnalyzed' in result, "Missing framesAnalyzed in video result"
        assert 'processingTime' in result, "Missing processingTime in video result"
        
        # Verify confidence is reasonable
        assert 0.0 <= result['confidence'] <= 1.0, f"Invalid video confidence: {result['confidence']}"
        
        print(f"✓ Video analysis completed with confidence: {result['confidence']}")
        print(f"✓ Analyzed {result['framesAnalyzed']} frames")
        print(f"✓ Detected techniques: {result['techniques']}")
        
        # Test frame aggregation
        aggregated = index.aggregate_frame_analyses(mock_frame_analyses)
        
        assert 'confidence' in aggregated, "Missing confidence in aggregated result"
        assert 'techniques' in aggregated, "Missing techniques in aggregated result"
        
        # Should detect temporal inconsistency due to variance in frame confidences
        expected_avg = sum(a['confidence'] for a in mock_frame_analyses) / len(mock_frame_analyses)
        assert abs(aggregated['confidence'] - expected_avg) < 0.01, "Incorrect confidence aggregation"
        
        print(f"✓ Frame aggregation completed with confidence: {aggregated['confidence']}")
        
        return True

def test_error_handling():
    """Test error handling in Bedrock integration."""
    print("\n--- Testing Error Handling ---")
    
    # Mock AWS clients with errors
    mock_s3 = MagicMock()
    mock_bedrock = MagicMock()
    
    # Test S3 error
    mock_s3.get_object.side_effect = Exception("S3 access denied")
    
    with patch.object(index, 's3_client', mock_s3):
        try:
            index.get_image_data_for_bedrock('test-bucket', 'test-image.jpg')
            print("✗ Expected S3 exception was not raised")
            return False
        except Exception as e:
            if "S3 access denied" in str(e):
                print("✓ S3 error handled correctly")
            else:
                print(f"✗ Unexpected S3 error: {e}")
                return False
    
    # Test Bedrock error
    mock_s3.get_object.side_effect = None
    mock_s3.get_object.return_value = {
        'Body': MagicMock(read=lambda: b'fake_image_data'),
        'ContentType': 'image/jpeg'
    }
    
    mock_bedrock.invoke_model.side_effect = Exception("Bedrock service unavailable")
    
    with patch.object(index, 's3_client', mock_s3), \
         patch.object(index, 'bedrock_client', mock_bedrock):
        
        model_config = {
            'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
            'name': 'Claude 3 Haiku',
            'max_tokens': 2048
        }
        
        result = index.call_claude_haiku_analysis('test-bucket', 'test-image.jpg', model_config)
        
        # Should return error result
        assert 'error' in result, "Missing error in result"
        assert result['confidence'] == 0.5, "Should return neutral confidence on error"
        assert result['analysis_depth'] == 'failed', "Should mark analysis as failed"
        
        print("✓ Bedrock error handled correctly")
    
    # Test JSON parsing error
    mock_bedrock.invoke_model.side_effect = None
    mock_bedrock_response = {
        'body': MagicMock(read=lambda: json.dumps({
            'content': [{
                'text': 'Invalid JSON response: confidence is high but malformed'
            }]
        }).encode())
    }
    mock_bedrock.invoke_model.return_value = mock_bedrock_response
    
    with patch.object(index, 's3_client', mock_s3), \
         patch.object(index, 'bedrock_client', mock_bedrock):
        
        result = index.call_claude_haiku_analysis('test-bucket', 'test-image.jpg', model_config)
        
        # Should use fallback parsing
        assert 'confidence' in result, "Missing confidence in fallback result"
        # Check if fallback parsing was used
        has_fallback_indicator = (
            'parsing_method' in result or 
            'fallback' in str(result) or
            result.get('details', '').find('fallback') != -1 or
            result.get('details', '').find('malformed') != -1
        )
        assert has_fallback_indicator, f"Should indicate fallback parsing"
        
        print("✓ JSON parsing error handled with fallback")
    
    return True

def test_confidence_calculations():
    """Test confidence calculation algorithms."""
    print("\n--- Testing Confidence Calculations ---")
    
    # Test model weight calculation
    model_info = {
        'priority': 'high',
        'model_id': 'anthropic.claude-3-sonnet-20240229-v1:0'
    }
    
    result_info = {
        'analysis_depth': 'detailed',
        'processing_time': 3.5,
        'certainty': 'high'
    }
    
    weight = index.calculate_model_weight(model_info, result_info)
    
    # High priority, detailed analysis should get high weight
    assert weight > 1.0, f"Expected weight > 1.0 for high priority model, got {weight}"
    
    print(f"✓ Model weight calculation: {weight}")
    
    # Test consensus factor calculation
    # High agreement scenario
    high_agreement_results = [
        {'confidence': 0.75, 'techniques': ['face_swap']},
        {'confidence': 0.73, 'techniques': ['face_swap']},
        {'confidence': 0.77, 'techniques': ['face_swap', 'lighting']}
    ]
    
    consensus_factor = index.calculate_consensus_factor(high_agreement_results)
    assert consensus_factor >= 1.0, f"High agreement should increase confidence, got {consensus_factor}"
    
    print(f"✓ High agreement consensus factor: {consensus_factor}")
    
    # Low agreement scenario
    low_agreement_results = [
        {'confidence': 0.2, 'techniques': ['authentic']},
        {'confidence': 0.8, 'techniques': ['face_swap']},
        {'confidence': 0.5, 'techniques': ['uncertain']}
    ]
    
    consensus_factor = index.calculate_consensus_factor(low_agreement_results)
    assert consensus_factor < 1.0, f"Low agreement should decrease confidence, got {consensus_factor}"
    
    print(f"✓ Low agreement consensus factor: {consensus_factor}")
    
    return True

def test_end_to_end_analysis():
    """Test complete end-to-end deepfake analysis."""
    print("\n--- Testing End-to-End Analysis ---")
    
    # Mock audit table data
    mock_audit_table = MagicMock()
    mock_audit_table.query.return_value = {
        'Items': [{
            'mediaId': 'test-media-123',
            'metadata': {
                'mediaType': 'image',
                'fileSize': 2048000,
                's3Location': {
                    'bucket': 'test-bucket',
                    'key': 'uploads/test-image.jpg'
                }
            }
        }]
    }
    
    # Mock ensemble analysis result
    mock_ensemble_result = {
        'confidence': 0.72,
        'techniques': ['facial_asymmetry', 'lighting_inconsistency'],
        'analysis_depth': 'detailed',
        'processing_time': 2.5
    }
    
    with patch.object(index, 'audit_table', mock_audit_table), \
         patch.object(index, 'analyze_image_deepfake', return_value=mock_ensemble_result):
        
        # Test handler function
        event = {'mediaId': 'test-media-123'}
        context = MagicMock()
        
        response = index.handler(event, context)
        
        # Verify response structure
        assert response['statusCode'] == 200, f"Expected status 200, got {response['statusCode']}"
        
        body = json.loads(response['body'])
        assert 'mediaId' in body, "Missing mediaId in response"
        assert 'analysisResult' in body, "Missing analysisResult in response"
        assert 'timestamp' in body, "Missing timestamp in response"
        
        analysis_result = body['analysisResult']
        assert 'deepfakeConfidence' in analysis_result, "Missing deepfakeConfidence"
        assert 'detectedTechniques' in analysis_result, "Missing detectedTechniques"
        assert 'processingTime' in analysis_result, "Missing processingTime"
        
        print(f"✓ End-to-end analysis completed for media: {body['mediaId']}")
        print(f"✓ Deepfake confidence: {analysis_result['deepfakeConfidence']}")
        print(f"✓ Processing time: {analysis_result['processingTime']}s")
        
        # Verify audit record was stored
        assert mock_audit_table.put_item.called, "Audit record was not stored"
        
        audit_call = mock_audit_table.put_item.call_args
        audit_item = audit_call[1]['Item']
        assert audit_item['eventType'] == 'deepfake_analysis', "Wrong event type in audit"
        
        print("✓ Analysis results stored in audit trail")
        
        return True

def main():
    """Run all enhanced deepfake detector tests."""
    print("=== Enhanced Deepfake Detector Test Suite ===")
    
    tests = [
        test_bedrock_image_analysis,
        test_ensemble_analysis,
        test_video_analysis,
        test_error_handling,
        test_confidence_calculations,
        test_end_to_end_analysis
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
        print("✓ All enhanced deepfake detector tests passed! Bedrock integration is ready.")
        return 0
    else:
        print("✗ Some tests failed. Please review the implementation.")
        return 1

if __name__ == '__main__':
    sys.exit(main())