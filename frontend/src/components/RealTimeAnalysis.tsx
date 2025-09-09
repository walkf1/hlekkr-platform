import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Play, Shield, Brain, Users, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useMedia } from '../context/MediaContext';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: #f8fafc;
  min-height: 100vh;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 40px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 800;
  color: #1f2937;
  margin-bottom: 8px;
`;

const FileInfo = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
`;

const FileIcon = styled.div`
  width: 64px;
  height: 64px;
  background: #3b82f6;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const FileDetails = styled.div`
  flex: 1;
`;

const FileName = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 8px;
`;

const FileMetadata = styled.div`
  color: #6b7280;
  font-size: 14px;
`;

const ProcessingSteps = styled.div`
  display: grid;
  gap: 24px;
`;

const StepCard = styled.div<{ status: 'pending' | 'processing' | 'completed' | 'failed' }>`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${props => 
    props.status === 'completed' ? '#10b981' :
    props.status === 'processing' ? '#3b82f6' :
    props.status === 'failed' ? '#ef4444' : '#d1d5db'
  };
`;

const StepHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const StepIcon = styled.div<{ status: 'pending' | 'processing' | 'completed' | 'failed' }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => 
    props.status === 'completed' ? '#10b981' :
    props.status === 'processing' ? '#3b82f6' :
    props.status === 'failed' ? '#ef4444' : '#d1d5db'
  };
  color: white;
`;

const StepTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
`;

const StepStatus = styled.span<{ status: 'pending' | 'processing' | 'completed' | 'failed' }>`
  font-size: 14px;
  font-weight: 500;
  color: ${props => 
    props.status === 'completed' ? '#10b981' :
    props.status === 'processing' ? '#3b82f6' :
    props.status === 'failed' ? '#ef4444' : '#6b7280'
  };
  margin-left: auto;
`;

const StepContent = styled.div`
  color: #6b7280;
  line-height: 1.6;
`;

const BedrockResults = styled.div`
  background: #f3f4f6;
  border-radius: 8px;
  padding: 16px;
  margin-top: 12px;
`;

const ModelResult = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #e5e7eb;
  
  &:last-child {
    border-bottom: none;
  }
`;

const TrustScore = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-top: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  text-align: center;
`;

const ScoreValue = styled.div<{ score: number }>`
  font-size: 48px;
  font-weight: 800;
  color: ${props => 
    props.score >= 70 ? '#10b981' :
    props.score >= 40 ? '#f59e0b' : '#ef4444'
  };
  margin-bottom: 8px;
`;

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  icon: React.ReactNode;
  details?: any;
}

export const RealTimeAnalysis: React.FC = () => {
  const { uploadedMedia, currentMedia, setCurrentMedia } = useMedia();
  
  // Debug log
  console.log('RealTimeAnalysis - uploadedMedia:', uploadedMedia);
  console.log('RealTimeAnalysis - currentMedia:', currentMedia);
  
  // Use the most recent uploaded media or set a default
  const activeMedia = currentMedia || uploadedMedia[0];
  
  useEffect(() => {
    if (uploadedMedia.length > 0 && !currentMedia) {
      setCurrentMedia(uploadedMedia[0].mediaId);
    }
  }, [uploadedMedia, currentMedia, setCurrentMedia]);
  
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: 'security',
      title: 'Security Scanning',
      description: 'ClamAV + VirusTotal + Custom threat analysis',
      status: 'completed',
      icon: <Shield size={20} />,
      details: {
        clamav: 'Clean',
        virustotal: 'No threats detected',
        customAnalysis: 'Safe for processing'
      }
    },
    {
      id: 'metadata',
      title: 'Metadata Extraction',
      description: 'EXIF data, image properties, technical analysis',
      status: 'completed',
      icon: <Shield size={20} />,
      details: {
        resolution: '1920x1080',
        format: 'JPEG',
        colorSpace: 'sRGB',
        compression: 'Standard',
        camera: 'Unknown'
      }
    },
    {
      id: 'bedrock',
      title: 'Bedrock AI Analysis',
      description: 'Multi-model ensemble image deepfake detection',
      status: 'processing',
      icon: <Brain size={20} />,
      details: {
        claudeSonnet: { confidence: 0.23, techniques: ['facial_asymmetry', 'lighting_consistency'] },
        claudeHaiku: { confidence: 0.18, techniques: ['edge_artifacts'] },
        titan: { confidence: 0.21, techniques: ['texture_analysis'] }
      }
    },
    {
      id: 'hitl',
      title: 'Human Review',
      description: 'Skipped - High trust score indicates authentic content',
      status: 'completed',
      icon: <Users size={20} />,
      details: {
        decision: 'No review needed',
        reason: 'Trust score > 70',
        autoApproved: true
      }
    }
  ]);

  const [trustScore, setTrustScore] = useState(85);
  
  // Update trust score when activeMedia changes
  useEffect(() => {
    if (activeMedia?.trustScore) {
      setTrustScore(activeMedia.trustScore);
    }
  }, [activeMedia]);

  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      setSteps(prev => prev.map(step => {
        if (step.id === 'bedrock' && step.status === 'processing') {
          // Simulate Bedrock analysis completion
          return {
            ...step,
            status: 'completed',
            details: {
              claudeSonnet: { confidence: 0.15, techniques: ['authentic_indicators', 'consistent_lighting'] },
              claudeHaiku: { confidence: 0.12, techniques: ['natural_compression'] },
              titan: { confidence: 0.18, techniques: ['authentic_texture_patterns'] }
            }
          };
        }
        return step;
      }));
      
      // Update trust score based on analysis
      const newScore = activeMedia?.trustScore || 88;
      setTrustScore(newScore);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={20} />;
      case 'processing': return <Clock size={20} />;
      case 'failed': return <AlertTriangle size={20} />;
      default: return <Clock size={20} />;
    }
  };

  return (
    <Container>
      <Header>
        <Title>Real-Time Analysis: Your Upload</Title>
      </Header>

      <FileInfo>
        <FileIcon>
          <Shield size={32} />
        </FileIcon>
        <FileDetails>
          <FileName>{activeMedia?.fileName || 'No file uploaded'}</FileName>
          <FileMetadata>
            {activeMedia ? (
              <>
                Media ID: {activeMedia.mediaId}<br/>
                {Math.round(activeMedia.fileSize / 1024)} KB • {activeMedia.fileType} • {new Date(activeMedia.uploadedAt).toLocaleString()}
              </>
            ) : (
              'Upload a file in the Media Upload section to see real-time analysis'
            )}
          </FileMetadata>
        </FileDetails>
      </FileInfo>

      <ProcessingSteps>
        {steps.map(step => (
          <StepCard key={step.id} status={step.status}>
            <StepHeader>
              <StepIcon status={step.status}>
                {step.status === 'processing' ? <Clock size={20} /> : 
                 step.status === 'completed' ? <CheckCircle size={20} /> : 
                 step.icon}
              </StepIcon>
              <StepTitle>{step.title}</StepTitle>
              <StepStatus status={step.status}>
                {step.status === 'processing' ? 'Processing...' :
                 step.status === 'completed' ? 'Completed' :
                 step.status === 'failed' ? 'Failed' : 'Pending'}
              </StepStatus>
            </StepHeader>
            <StepContent>
              {step.description}
              
              {step.id === 'bedrock' && step.details && (
                <BedrockResults>
                  <div style={{ fontWeight: '600', marginBottom: '12px' }}>AI Model Results:</div>
                  <ModelResult>
                    <span>Claude 3 Sonnet (Detailed)</span>
                    <span>Confidence: {(step.details.claudeSonnet.confidence * 100).toFixed(0)}%</span>
                  </ModelResult>
                  <ModelResult>
                    <span>Claude 3 Haiku (Fast)</span>
                    <span>Confidence: {(step.details.claudeHaiku.confidence * 100).toFixed(0)}%</span>
                  </ModelResult>
                  <ModelResult>
                    <span>Amazon Titan (Validation)</span>
                    <span>Confidence: {(step.details.titan.confidence * 100).toFixed(0)}%</span>
                  </ModelResult>
                  <div style={{ marginTop: '12px', fontSize: '14px' }}>
                    <strong>Detected Techniques:</strong> {[
                      ...step.details.claudeSonnet.techniques,
                      ...step.details.claudeHaiku.techniques,
                      ...step.details.titan.techniques
                    ].filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                  </div>
                </BedrockResults>
              )}

              {step.id === 'hitl' && step.details && (
                <BedrockResults>
                  <div style={{ fontWeight: '600', marginBottom: '8px' }}>Review Details:</div>
                  <div>Assigned to: {step.details.assignedModerator}</div>
                  <div>Priority: {step.details.priority}</div>
                  <div>Estimated completion: {step.details.estimatedTime}</div>
                </BedrockResults>
              )}
            </StepContent>
          </StepCard>
        ))}
      </ProcessingSteps>

      <TrustScore>
        <h3 style={{ margin: '0 0 16px', color: '#1f2937' }}>Trust Score</h3>
        <ScoreValue score={trustScore}>{trustScore}</ScoreValue>
        <div style={{ color: '#6b7280', fontSize: '16px' }}>
          {trustScore >= 70 ? 'Likely Authentic' :
           trustScore >= 40 ? 'Suspicious - Under Review' : 'Likely Deepfake'}
        </div>
        <div style={{ marginTop: '16px', fontSize: '14px', color: '#6b7280' }}>
          Based on multi-model AI analysis and metadata verification
        </div>
      </TrustScore>
    </Container>
  );
};

export default RealTimeAnalysis;