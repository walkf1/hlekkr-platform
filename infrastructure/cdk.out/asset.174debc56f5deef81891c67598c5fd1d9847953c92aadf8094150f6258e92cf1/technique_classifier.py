"""
Advanced manipulation technique identification and classification system.
Provides detailed analysis of deepfake and manipulation techniques.
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Tuple
from enum import Enum
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class ManipulationType(Enum):
    """Types of media manipulation."""
    FACE_SWAP = "face_swap"
    FACE_REENACTMENT = "face_reenactment"
    SPEECH_SYNTHESIS = "speech_synthesis"
    ENTIRE_FACE_SYNTHESIS = "entire_face_synthesis"
    EXPRESSION_TRANSFER = "expression_transfer"
    ATTRIBUTE_EDITING = "attribute_editing"
    BACKGROUND_REPLACEMENT = "background_replacement"
    OBJECT_INSERTION = "object_insertion"
    OBJECT_REMOVAL = "object_removal"
    STYLE_TRANSFER = "style_transfer"
    SUPER_RESOLUTION = "super_resolution"
    COMPRESSION_ARTIFACTS = "compression_artifacts"
    TRADITIONAL_EDITING = "traditional_editing"

class SeverityLevel(Enum):
    """Severity levels for manipulation detection."""
    MINIMAL = "minimal"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class TechniqueSignature:
    """Signature pattern for a specific manipulation technique."""
    name: str
    type: ManipulationType
    indicators: List[str]
    confidence_threshold: float
    severity_base: SeverityLevel
    description: str

class TechniqueClassifier:
    """Advanced classifier for manipulation techniques."""
    
    def __init__(self):
        self.technique_signatures = self._initialize_technique_signatures()
        self.severity_weights = self._initialize_severity_weights()
    
    def _initialize_technique_signatures(self) -> Dict[str, TechniqueSignature]:
        """Initialize known technique signatures."""
        signatures = {}
        
        # Face Swap Techniques
        signatures['deepfakes_face_swap'] = TechniqueSignature(
            name="DeepFakes Face Swap",
            type=ManipulationType.FACE_SWAP,
            indicators=[
                "facial_asymmetry", "identity_inconsistency", "temporal_flickering",
                "boundary_artifacts", "lighting_mismatch", "skin_texture_inconsistency"
            ],
            confidence_threshold=0.6,
            severity_base=SeverityLevel.HIGH,
            description="Classic DeepFakes-style face replacement using autoencoder architecture"
        )
        
        signatures['faceswap_technique'] = TechniqueSignature(
            name="FaceSwap Technique",
            type=ManipulationType.FACE_SWAP,
            indicators=[
                "face_boundary_blur", "color_transfer_artifacts", "geometric_inconsistency",
                "expression_mismatch", "head_pose_inconsistency"
            ],
            confidence_threshold=0.65,
            severity_base=SeverityLevel.HIGH,
            description="FaceSwap algorithm with landmark-based face replacement"
        )
        
        # Face Reenactment Techniques
        signatures['first_order_motion'] = TechniqueSignature(
            name="First Order Motion Model",
            type=ManipulationType.FACE_REENACTMENT,
            indicators=[
                "motion_transfer_artifacts", "keypoint_inconsistency", "temporal_warping",
                "expression_exaggeration", "background_distortion"
            ],
            confidence_threshold=0.6,
            severity_base=SeverityLevel.MODERATE,
            description="First-order motion model for face reenactment"
        )
        
        signatures['face2face_reenactment'] = TechniqueSignature(
            name="Face2Face Reenactment",
            type=ManipulationType.FACE_REENACTMENT,
            indicators=[
                "facial_expression_transfer", "mouth_movement_sync", "eye_gaze_inconsistency",
                "micro_expression_artifacts", "temporal_smoothing_artifacts"
            ],
            confidence_threshold=0.65,
            severity_base=SeverityLevel.MODERATE,
            description="Real-time facial surface capture and reenactment"
        )
        
        # Speech Synthesis
        signatures['tacotron_synthesis'] = TechniqueSignature(
            name="Tacotron Speech Synthesis",
            type=ManipulationType.SPEECH_SYNTHESIS,
            indicators=[
                "mel_spectrogram_artifacts", "attention_alignment_issues", "prosody_inconsistency",
                "phoneme_boundary_artifacts", "voice_quality_degradation"
            ],
            confidence_threshold=0.7,
            severity_base=SeverityLevel.HIGH,
            description="Tacotron-based text-to-speech synthesis"
        )
        
        signatures['wavenet_synthesis'] = TechniqueSignature(
            name="WaveNet Speech Synthesis",
            type=ManipulationType.SPEECH_SYNTHESIS,
            indicators=[
                "autoregressive_artifacts", "temporal_dependency_issues", "frequency_domain_anomalies",
                "voice_conversion_artifacts", "speaker_identity_leakage"
            ],
            confidence_threshold=0.75,
            severity_base=SeverityLevel.HIGH,
            description="WaveNet-based neural vocoder synthesis"
        )
        
        # GAN-based Synthesis
        signatures['stylegan_synthesis'] = TechniqueSignature(
            name="StyleGAN Face Synthesis",
            type=ManipulationType.ENTIRE_FACE_SYNTHESIS,
            indicators=[
                "gan_fingerprints", "latent_space_artifacts", "style_mixing_inconsistency",
                "high_frequency_suppression", "spectral_bias_artifacts"
            ],
            confidence_threshold=0.8,
            severity_base=SeverityLevel.CRITICAL,
            description="StyleGAN-generated synthetic faces"
        )
        
        signatures['progressive_gan'] = TechniqueSignature(
            name="Progressive GAN Synthesis",
            type=ManipulationType.ENTIRE_FACE_SYNTHESIS,
            indicators=[
                "progressive_artifacts", "resolution_inconsistency", "feature_map_bleeding",
                "training_instability_artifacts", "mode_collapse_indicators"
            ],
            confidence_threshold=0.75,
            severity_base=SeverityLevel.CRITICAL,
            description="Progressive GAN-based face generation"
        )
        
        # Traditional Editing
        signatures['photoshop_manipulation'] = TechniqueSignature(
            name="Traditional Photo Editing",
            type=ManipulationType.TRADITIONAL_EDITING,
            indicators=[
                "clone_stamp_artifacts", "healing_brush_traces", "layer_blending_inconsistency",
                "selection_edge_artifacts", "color_adjustment_artifacts"
            ],
            confidence_threshold=0.5,
            severity_base=SeverityLevel.LOW,
            description="Traditional photo editing software manipulation"
        )
        
        # Compression and Quality Issues
        signatures['compression_manipulation'] = TechniqueSignature(
            name="Compression-based Hiding",
            type=ManipulationType.COMPRESSION_ARTIFACTS,
            indicators=[
                "jpeg_grid_inconsistency", "quantization_artifacts", "dct_coefficient_anomalies",
                "compression_history_mismatch", "quality_factor_inconsistency"
            ],
            confidence_threshold=0.4,
            severity_base=SeverityLevel.MINIMAL,
            description="Manipulation hidden through compression artifacts"
        )
        
        return signatures
    
    def _initialize_severity_weights(self) -> Dict[ManipulationType, float]:
        """Initialize severity weights for different manipulation types."""
        return {
            ManipulationType.ENTIRE_FACE_SYNTHESIS: 1.0,
            ManipulationType.FACE_SWAP: 0.9,
            ManipulationType.SPEECH_SYNTHESIS: 0.85,
            ManipulationType.FACE_REENACTMENT: 0.7,
            ManipulationType.EXPRESSION_TRANSFER: 0.6,
            ManipulationType.ATTRIBUTE_EDITING: 0.5,
            ManipulationType.STYLE_TRANSFER: 0.4,
            ManipulationType.BACKGROUND_REPLACEMENT: 0.3,
            ManipulationType.OBJECT_INSERTION: 0.3,
            ManipulationType.OBJECT_REMOVAL: 0.3,
            ManipulationType.SUPER_RESOLUTION: 0.2,
            ManipulationType.TRADITIONAL_EDITING: 0.2,
            ManipulationType.COMPRESSION_ARTIFACTS: 0.1
        }
    
    def classify_techniques(self, detected_indicators: List[str], confidence_scores: Dict[str, float]) -> Dict[str, Any]:
        """Classify manipulation techniques based on detected indicators."""
        try:
            classified_techniques = []
            overall_severity = SeverityLevel.MINIMAL
            max_confidence = 0.0
            
            # Analyze each technique signature
            for technique_id, signature in self.technique_signatures.items():
                technique_confidence = self._calculate_technique_confidence(
                    signature, detected_indicators, confidence_scores
                )
                
                if technique_confidence >= signature.confidence_threshold:
                    # Calculate severity for this technique
                    technique_severity = self._calculate_technique_severity(
                        signature, technique_confidence, confidence_scores
                    )
                    
                    classified_technique = {
                        'id': technique_id,
                        'name': signature.name,
                        'type': signature.type.value,
                        'confidence': technique_confidence,
                        'severity': technique_severity.value,
                        'description': signature.description,
                        'matched_indicators': [
                            indicator for indicator in signature.indicators 
                            if indicator in detected_indicators
                        ],
                        'evidence_strength': self._calculate_evidence_strength(
                            signature, detected_indicators, confidence_scores
                        )
                    }
                    
                    classified_techniques.append(classified_technique)
                    
                    # Update overall metrics
                    if technique_confidence > max_confidence:
                        max_confidence = technique_confidence
                    
                    if self._severity_level_value(technique_severity) > self._severity_level_value(overall_severity):
                        overall_severity = technique_severity
            
            # Generate detailed analysis report
            analysis_report = self._generate_analysis_report(
                classified_techniques, detected_indicators, confidence_scores
            )
            
            return {
                'classified_techniques': classified_techniques,
                'overall_severity': overall_severity.value,
                'max_confidence': max_confidence,
                'technique_count': len(classified_techniques),
                'analysis_report': analysis_report,
                'classification_metadata': {
                    'total_indicators': len(detected_indicators),
                    'classification_timestamp': datetime.utcnow().isoformat(),
                    'classifier_version': '1.0'
                }
            }
            
        except Exception as e:
            logger.error(f"Error in technique classification: {str(e)}")
            return {
                'classified_techniques': [],
                'overall_severity': SeverityLevel.MINIMAL.value,
                'max_confidence': 0.0,
                'technique_count': 0,
                'error': str(e)
            }
    
    def _calculate_technique_confidence(self, signature: TechniqueSignature, 
                                      detected_indicators: List[str], 
                                      confidence_scores: Dict[str, float]) -> float:
        """Calculate confidence for a specific technique."""
        try:
            matched_indicators = [
                indicator for indicator in signature.indicators 
                if indicator in detected_indicators
            ]
            
            if not matched_indicators:
                return 0.0
            
            # Base confidence from indicator matching
            match_ratio = len(matched_indicators) / len(signature.indicators)
            base_confidence = match_ratio * 0.6  # Max 0.6 from matching
            
            # Boost from individual indicator confidences
            indicator_confidence_boost = 0.0
            for indicator in matched_indicators:
                if indicator in confidence_scores:
                    indicator_confidence_boost += confidence_scores[indicator] * 0.4 / len(matched_indicators)
            
            total_confidence = base_confidence + indicator_confidence_boost
            
            # Apply technique-specific modifiers
            if signature.type in [ManipulationType.ENTIRE_FACE_SYNTHESIS, ManipulationType.FACE_SWAP]:
                # These are more definitive, so boost confidence
                total_confidence *= 1.1
            elif signature.type == ManipulationType.COMPRESSION_ARTIFACTS:
                # These are less definitive, so reduce confidence
                total_confidence *= 0.8
            
            return min(1.0, total_confidence)
            
        except Exception as e:
            logger.error(f"Error calculating technique confidence: {str(e)}")
            return 0.0
    
    def _calculate_technique_severity(self, signature: TechniqueSignature, 
                                    confidence: float, 
                                    confidence_scores: Dict[str, float]) -> SeverityLevel:
        """Calculate severity level for a detected technique."""
        try:
            base_severity_value = self._severity_level_value(signature.severity_base)
            
            # Adjust based on confidence
            if confidence >= 0.9:
                severity_modifier = 1.2
            elif confidence >= 0.8:
                severity_modifier = 1.1
            elif confidence >= 0.7:
                severity_modifier = 1.0
            elif confidence >= 0.6:
                severity_modifier = 0.9
            else:
                severity_modifier = 0.8
            
            # Adjust based on manipulation type impact
            type_weight = self.severity_weights.get(signature.type, 0.5)
            
            final_severity_value = base_severity_value * severity_modifier * type_weight
            
            # Convert back to severity level
            if final_severity_value >= 4.0:
                return SeverityLevel.CRITICAL
            elif final_severity_value >= 3.0:
                return SeverityLevel.HIGH
            elif final_severity_value >= 2.0:
                return SeverityLevel.MODERATE
            elif final_severity_value >= 1.0:
                return SeverityLevel.LOW
            else:
                return SeverityLevel.MINIMAL
                
        except Exception as e:
            logger.error(f"Error calculating technique severity: {str(e)}")
            return SeverityLevel.MINIMAL
    
    def _severity_level_value(self, severity: SeverityLevel) -> float:
        """Convert severity level to numeric value."""
        severity_values = {
            SeverityLevel.MINIMAL: 0.5,
            SeverityLevel.LOW: 1.0,
            SeverityLevel.MODERATE: 2.0,
            SeverityLevel.HIGH: 3.0,
            SeverityLevel.CRITICAL: 4.0
        }
        return severity_values.get(severity, 0.5)
    
    def _calculate_evidence_strength(self, signature: TechniqueSignature, 
                                   detected_indicators: List[str], 
                                   confidence_scores: Dict[str, float]) -> str:
        """Calculate the strength of evidence for a technique."""
        try:
            matched_indicators = [
                indicator for indicator in signature.indicators 
                if indicator in detected_indicators
            ]
            
            if not matched_indicators:
                return "none"
            
            match_ratio = len(matched_indicators) / len(signature.indicators)
            avg_confidence = sum(
                confidence_scores.get(indicator, 0.5) 
                for indicator in matched_indicators
            ) / len(matched_indicators)
            
            evidence_score = (match_ratio * 0.6) + (avg_confidence * 0.4)
            
            if evidence_score >= 0.8:
                return "very_strong"
            elif evidence_score >= 0.6:
                return "strong"
            elif evidence_score >= 0.4:
                return "moderate"
            elif evidence_score >= 0.2:
                return "weak"
            else:
                return "very_weak"
                
        except Exception as e:
            logger.error(f"Error calculating evidence strength: {str(e)}")
            return "unknown"
    
    def _generate_analysis_report(self, classified_techniques: List[Dict[str, Any]], 
                                detected_indicators: List[str], 
                                confidence_scores: Dict[str, float]) -> Dict[str, Any]:
        """Generate a detailed analysis report."""
        try:
            if not classified_techniques:
                return {
                    'summary': 'No manipulation techniques detected with sufficient confidence.',
                    'recommendation': 'Content appears to be authentic based on current analysis.',
                    'confidence_assessment': 'low_risk'
                }
            
            # Categorize techniques by type
            technique_categories = {}
            for technique in classified_techniques:
                category = technique['type']
                if category not in technique_categories:
                    technique_categories[category] = []
                technique_categories[category].append(technique)
            
            # Generate summary
            primary_technique = max(classified_techniques, key=lambda x: x['confidence'])
            
            summary_parts = []
            summary_parts.append(f"Primary manipulation: {primary_technique['name']} "
                               f"(confidence: {primary_technique['confidence']:.2f})")
            
            if len(classified_techniques) > 1:
                summary_parts.append(f"Additional techniques detected: {len(classified_techniques) - 1}")
            
            # Risk assessment
            max_severity = max(technique['severity'] for technique in classified_techniques)
            max_confidence = max(technique['confidence'] for technique in classified_techniques)
            
            if max_severity in ['critical', 'high'] and max_confidence >= 0.8:
                risk_level = 'high_risk'
                recommendation = 'Content shows strong evidence of sophisticated manipulation. Recommend human expert review.'
            elif max_severity in ['moderate', 'high'] and max_confidence >= 0.6:
                risk_level = 'medium_risk'
                recommendation = 'Content shows evidence of manipulation. Additional verification recommended.'
            elif max_confidence >= 0.4:
                risk_level = 'low_risk'
                recommendation = 'Weak evidence of manipulation detected. Content may be authentic with minor artifacts.'
            else:
                risk_level = 'minimal_risk'
                recommendation = 'No significant manipulation detected. Content appears authentic.'
            
            return {
                'summary': ' '.join(summary_parts),
                'technique_categories': technique_categories,
                'primary_technique': primary_technique,
                'risk_assessment': risk_level,
                'recommendation': recommendation,
                'confidence_assessment': risk_level,
                'detailed_findings': self._generate_detailed_findings(classified_techniques)
            }
            
        except Exception as e:
            logger.error(f"Error generating analysis report: {str(e)}")
            return {
                'summary': 'Error generating analysis report',
                'error': str(e),
                'confidence_assessment': 'unknown'
            }
    
    def _generate_detailed_findings(self, classified_techniques: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generate detailed findings for each technique."""
        try:
            findings = []
            
            for technique in classified_techniques:
                finding = {
                    'technique': technique['name'],
                    'confidence': technique['confidence'],
                    'severity': technique['severity'],
                    'evidence': technique['matched_indicators'],
                    'evidence_strength': technique['evidence_strength'],
                    'description': technique['description'],
                    'implications': self._get_technique_implications(technique['type'])
                }
                findings.append(finding)
            
            return findings
            
        except Exception as e:
            logger.error(f"Error generating detailed findings: {str(e)}")
            return []
    
    def _get_technique_implications(self, technique_type: str) -> str:
        """Get implications for a specific technique type."""
        implications = {
            'face_swap': 'Identity deception, potential for impersonation and fraud',
            'face_reenactment': 'Expression manipulation, potential for false statements',
            'speech_synthesis': 'Voice cloning, potential for audio fraud and impersonation',
            'entire_face_synthesis': 'Complete synthetic identity, high potential for deception',
            'expression_transfer': 'Emotional manipulation, context distortion',
            'attribute_editing': 'Appearance modification, potential bias introduction',
            'traditional_editing': 'Content modification, context manipulation',
            'compression_artifacts': 'Quality degradation, potential evidence hiding'
        }
        return implications.get(technique_type, 'Unknown manipulation implications')

# Global classifier instance
technique_classifier = TechniqueClassifier()