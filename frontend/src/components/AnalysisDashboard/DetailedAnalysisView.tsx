import React, { useState } from 'react';
import styled from 'styled-components';
import { 
  X, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  User,
  Clock,
  FileText,
  Database,
  ExternalLink,
  Download,
  Flag,
  MessageSquare,
  TrendingUp,
  Activity
} from 'lucide-react';
import { MediaAnalysisResult } from './AnalysisResultsDashboard';

interface DetailedAnalysisViewProps {
  media: MediaAnalysisResult;
  onClose: () => void;
  onSendToReview?: (mediaId: string) => void;
  onFlag?: (mediaId: string, reason: string) => void;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const CloseButton = styled.button`
  padding: 8px;
  border: none;
  background: none;
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #e5e7eb;
    color: #374151;
  }
`;

const Content = styled.div`
  display: grid;
  grid-template-columns: 1fr 300px;
  height: calc(90vh - 80px);
  
  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    height: auto;
  }
`;

const MainContent = styled.div`
  padding: 24px;
  overflow-y: auto;
`;

const Sidebar = styled.div`
  background: #f9fafb;
  border-left: 1px solid #e5e7eb;
  padding: 24px;
  overflow-y: auto;
`;

const Section = styled.div`
  margin-bottom: 32px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TrustScoreDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  margin-bottom: 24px;
`;

const ScoreCircle = styled.div<{ score: number }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    ${props => props.score >= 80 ? '#10b981' : props.score >= 60 ? '#f59e0b' : '#ef4444'} 0deg,
    ${props => props.score >= 80 ? '#10b981' : props.score >= 60 ? '#f59e0b' : '#ef4444'} ${props => (props.score / 100) * 360}deg,
    rgba(255, 255, 255, 0.2) ${props => (props.score / 100) * 360}deg,
    rgba(255, 255, 255, 0.2) 360deg
  );
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
  }
  
  span {
    position: relative;
    z-index: 1;
  }
`;

const ScoreDetails = styled.div`
  flex: 1;
`;

const ScoreValue = styled.div`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 4px;
`;

const ScoreLabel = styled.div`
  font-size: 16px;
  opacity: 0.9;
  margin-bottom: 8px;
`;

const ScoreDescription = styled.div`
  font-size: 14px;
  opacity: 0.8;
`;

const AnalysisGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
`;

const AnalysisCard = styled.div`
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const CardTitle = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatusIndicator = styled.div<{ status: 'good' | 'warning' | 'danger' }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => {
    switch (props.status) {
      case 'good': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'danger': return '#ef4444';
    }
  }};
`;

const MetricRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  
  &:last-child {
    border-bottom: none;
  }
`;

const MetricLabel = styled.span`
  font-size: 14px;
  color: #6b7280;
`;

const MetricValue = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #111827;
`;

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
`;

const Tag = styled.span<{ variant?: 'default' | 'warning' | 'danger' }>`
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => {
    switch (props.variant) {
      case 'warning': return '#fef3c7';
      case 'danger': return '#fecaca';
      default: return '#e5e7eb';
    }
  }};
  color: ${props => {
    switch (props.variant) {
      case 'warning': return '#92400e';
      case 'danger': return '#991b1b';
      default: return '#374151';
    }
  }};
`;

const ReviewSection = styled.div`
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  padding: 20px;
`;

const ReviewHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const ReviewStatus = styled.div<{ status: string }>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    switch (props.status) {
      case 'completed': return '#dcfce7';
      case 'in_progress': return '#dbeafe';
      case 'pending': return '#fef3c7';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'completed': return '#166534';
      case 'in_progress': return '#1e40af';
      case 'pending': return '#92400e';
      default: return '#374151';
    }
  }};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const ActionButton = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid;
  
  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
          &:hover { background: #2563eb; border-color: #2563eb; }
        `;
      case 'danger':
        return `
          background: #ef4444;
          color: white;
          border-color: #ef4444;
          &:hover { background: #dc2626; border-color: #dc2626; }
        `;
      default:
        return `
          background: white;
          color: #374151;
          border-color: #d1d5db;
          &:hover { background: #f9fafb; border-color: #9ca3af; }
        `;
    }
  }}
`;

export const DetailedAnalysisView: React.FC<DetailedAnalysisViewProps> = ({
  media,
  onClose,
  onSendToReview,
  onFlag
}) => {
  const [flagReason, setFlagReason] = useState('');

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const getScoreDescription = (score: number): string => {
    if (score >= 80) return 'High confidence - Content appears authentic';
    if (score >= 60) return 'Medium confidence - Some concerns detected';
    if (score >= 40) return 'Low confidence - Multiple red flags';
    return 'Very low confidence - Likely manipulated content';
  };

  const getAnalysisStatus = (probability: number): 'good' | 'warning' | 'danger' => {
    if (probability < 0.3) return 'good';
    if (probability < 0.7) return 'warning';
    return 'danger';
  };

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>
            <FileText size={24} />
            Detailed Analysis: {media.fileName}
          </Title>
          <CloseButton onClick={onClose}>
            <X size={20} />
          </CloseButton>
        </Header>

        <Content>
          <MainContent>
            <TrustScoreDisplay>
              <ScoreCircle score={media.trustScore}>
                <span>{media.trustScore.toFixed(0)}%</span>
              </ScoreCircle>
              <ScoreDetails>
                <ScoreValue>{media.trustScore.toFixed(1)}%</ScoreValue>
                <ScoreLabel>Trust Score</ScoreLabel>
                <ScoreDescription>{getScoreDescription(media.trustScore)}</ScoreDescription>
              </ScoreDetails>
            </TrustScoreDisplay>

            <Section>
              <SectionTitle>
                <Activity size={20} />
                Analysis Results
              </SectionTitle>
              
              <AnalysisGrid>
                <AnalysisCard>
                  <CardHeader>
                    <CardTitle>
                      <Shield size={16} />
                      Deepfake Detection
                    </CardTitle>
                    <StatusIndicator status={getAnalysisStatus(media.deepfakeAnalysis.probability)} />
                  </CardHeader>
                  
                  <MetricRow>
                    <MetricLabel>Manipulation Probability</MetricLabel>
                    <MetricValue>{(media.deepfakeAnalysis.probability * 100).toFixed(1)}%</MetricValue>
                  </MetricRow>
                  
                  <MetricRow>
                    <MetricLabel>AI Confidence</MetricLabel>
                    <MetricValue>{(media.deepfakeAnalysis.confidence * 100).toFixed(1)}%</MetricValue>
                  </MetricRow>
                  
                  <MetricRow>
                    <MetricLabel>Model Version</MetricLabel>
                    <MetricValue>{media.deepfakeAnalysis.modelVersion}</MetricValue>
                  </MetricRow>

                  {media.deepfakeAnalysis.techniques.length > 0 && (
                    <TagList>
                      {media.deepfakeAnalysis.techniques.map((technique, index) => (
                        <Tag key={index} variant="warning">{technique}</Tag>
                      ))}
                    </TagList>
                  )}
                </AnalysisCard>

                <AnalysisCard>
                  <CardHeader>
                    <CardTitle>
                      <CheckCircle size={16} />
                      Source Verification
                    </CardTitle>
                    <StatusIndicator 
                      status={
                        media.sourceVerification.status === 'verified' ? 'good' :
                        media.sourceVerification.status === 'suspicious' ? 'danger' : 'warning'
                      } 
                    />
                  </CardHeader>
                  
                  <MetricRow>
                    <MetricLabel>Verification Status</MetricLabel>
                    <MetricValue>{media.sourceVerification.status}</MetricValue>
                  </MetricRow>
                  
                  <MetricRow>
                    <MetricLabel>Reputation Score</MetricLabel>
                    <MetricValue>{media.sourceVerification.reputationScore.toFixed(1)}</MetricValue>
                  </MetricRow>
                  
                  {media.sourceVerification.domain && (
                    <MetricRow>
                      <MetricLabel>Source Domain</MetricLabel>
                      <MetricValue>{media.sourceVerification.domain}</MetricValue>
                    </MetricRow>
                  )}
                </AnalysisCard>

                <AnalysisCard>
                  <CardHeader>
                    <CardTitle>
                      <Database size={16} />
                      Metadata Analysis
                    </CardTitle>
                    <StatusIndicator 
                      status={media.metadataAnalysis.consistent ? 'good' : 'warning'} 
                    />
                  </CardHeader>
                  
                  <MetricRow>
                    <MetricLabel>Consistency Check</MetricLabel>
                    <MetricValue>{media.metadataAnalysis.consistent ? 'Passed' : 'Failed'}</MetricValue>
                  </MetricRow>
                  
                  <MetricRow>
                    <MetricLabel>Anomalies Detected</MetricLabel>
                    <MetricValue>{media.metadataAnalysis.anomalies.length}</MetricValue>
                  </MetricRow>

                  {media.metadataAnalysis.anomalies.length > 0 && (
                    <TagList>
                      {media.metadataAnalysis.anomalies.map((anomaly, index) => (
                        <Tag key={index} variant="danger">{anomaly}</Tag>
                      ))}
                    </TagList>
                  )}
                </AnalysisCard>
              </AnalysisGrid>
            </Section>

            {media.humanReview && (
              <Section>
                <SectionTitle>
                  <User size={20} />
                  Human Review
                </SectionTitle>
                
                <ReviewSection>
                  <ReviewHeader>
                    <User size={20} />
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        Review by {media.humanReview.assignedModerator || 'Unassigned'}
                      </div>
                      <ReviewStatus status={media.humanReview.status}>
                        {media.humanReview.status.replace('_', ' ')}
                      </ReviewStatus>
                    </div>
                  </ReviewHeader>

                  {media.humanReview.decision && (
                    <MetricRow>
                      <MetricLabel>Decision</MetricLabel>
                      <MetricValue>{media.humanReview.decision}</MetricValue>
                    </MetricRow>
                  )}

                  {media.humanReview.confidence && (
                    <MetricRow>
                      <MetricLabel>Moderator Confidence</MetricLabel>
                      <MetricValue>{(media.humanReview.confidence * 100).toFixed(1)}%</MetricValue>
                    </MetricRow>
                  )}

                  {media.humanReview.processingTime && (
                    <MetricRow>
                      <MetricLabel>Review Time</MetricLabel>
                      <MetricValue>{Math.round(media.humanReview.processingTime / 60)} minutes</MetricValue>
                    </MetricRow>
                  )}

                  {media.humanReview.notes && (
                    <div style={{ marginTop: '16px' }}>
                      <MetricLabel>Notes:</MetricLabel>
                      <div style={{ 
                        marginTop: '8px', 
                        padding: '12px', 
                        background: 'white', 
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        {media.humanReview.notes}
                      </div>
                    </div>
                  )}
                </ReviewSection>
              </Section>
            )}

            {media.threatIntelligence && (
              <Section>
                <SectionTitle>
                  <AlertTriangle size={20} />
                  Threat Intelligence
                </SectionTitle>
                
                <AnalysisCard>
                  <MetricRow>
                    <MetricLabel>Threat Indicators</MetricLabel>
                    <MetricValue>{media.threatIntelligence.indicators}</MetricValue>
                  </MetricRow>
                  
                  <MetricRow>
                    <MetricLabel>Severity Level</MetricLabel>
                    <MetricValue>
                      <Tag variant={media.threatIntelligence.severity === 'critical' || media.threatIntelligence.severity === 'high' ? 'danger' : 'warning'}>
                        {media.threatIntelligence.severity}
                      </Tag>
                    </MetricValue>
                  </MetricRow>
                  
                  <MetricRow>
                    <MetricLabel>Report Generated</MetricLabel>
                    <MetricValue>{media.threatIntelligence.reportGenerated ? 'Yes' : 'No'}</MetricValue>
                  </MetricRow>
                </AnalysisCard>
              </Section>
            )}
          </MainContent>

          <Sidebar>
            <Section>
              <SectionTitle>File Information</SectionTitle>
              <MetricRow>
                <MetricLabel>Media ID</MetricLabel>
                <MetricValue>{media.mediaId}</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>File Type</MetricLabel>
                <MetricValue>{media.fileType}</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>File Size</MetricLabel>
                <MetricValue>{(media.fileSize / (1024 * 1024)).toFixed(2)} MB</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Uploaded</MetricLabel>
                <MetricValue>{formatDate(media.uploadedAt)}</MetricValue>
              </MetricRow>
              <MetricRow>
                <MetricLabel>Analyzed</MetricLabel>
                <MetricValue>{formatDate(media.analyzedAt)}</MetricValue>
              </MetricRow>
            </Section>

            <ActionButtons>
              <ActionButton onClick={() => window.open(`/api/media/${media.mediaId}/download`, '_blank')}>
                <Download size={16} />
                Download
              </ActionButton>
              
              {!media.humanReview && onSendToReview && (
                <ActionButton variant="primary" onClick={() => onSendToReview(media.mediaId)}>
                  <User size={16} />
                  Send to Review
                </ActionButton>
              )}
              
              {media.humanReview?.reviewId && (
                <ActionButton onClick={() => window.open(`/review/${media.humanReview?.reviewId}`, '_blank')}>
                  <ExternalLink size={16} />
                  View Review
                </ActionButton>
              )}
              
              <ActionButton variant="danger" onClick={() => onFlag?.(media.mediaId, 'Manual flag from analysis view')}>
                <Flag size={16} />
                Flag Content
              </ActionButton>
            </ActionButtons>
          </Sidebar>
        </Content>
      </Modal>
    </Overlay>
  );
};

export default DetailedAnalysisView;