import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { 
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Eye,
  Download,
  Share2,
  Flag,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  FileText,
  Database,
  Activity,
  ExternalLink,
  Tag
} from 'lucide-react';
import { format } from 'date-fns';
import { MediaAnalysisResult } from './AnalysisResultsDashboard';

interface MediaAnalysisDetailViewProps {
  mediaId: string;
  apiBaseUrl: string;
  onBack: () => void;
  onReviewAction?: (action: string, data: any) => void;
  className?: string;
}

// Styled Components
const DetailContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  background: #f9fafb;
  min-height: 100vh;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  background: white;
  padding: 20px 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }
`;

const HeaderInfo = styled.div`
  flex: 1;
`;

const MediaTitle = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px;
`;

const MediaSubtitle = styled.div`
  font-size: 14px;
  color: #6b7280;
  display: flex;
  gap: 16px;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
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

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 24px;
  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const MediaPlayer = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const PlayerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
`;

const PlayerTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const PlayerControls = styled.div`
  display: flex;
  gap: 8px;
`;

const PlayerButton = styled.button`
  padding: 6px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s ease;
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
`;

const PlayerContent = styled.div`
  position: relative;
  background: #000;
  aspect-ratio: 16/9;
  display: flex;
  align-items: center;
  justify-content: center;
  video, img, audio {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`;

const TrustScoreSection = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

const TrustScoreDisplay = styled.div<{ score: number }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  margin: 0 auto 24px;
  position: relative;
  background: conic-gradient(
    ${props => {
      if (props.score >= 80) return '#10b981';
      if (props.score >= 60) return '#f59e0b';
      if (props.score >= 40) return '#f97316';
      return '#ef4444';
    }} ${props => props.score * 3.6}deg,
    #e5e7eb 0deg
  );
  &::before {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: white;
  }
`;

const TrustScoreValue = styled.div`
  position: relative;
  z-index: 1;
  text-align: center;
`;

const ScoreNumber = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #111827;
`;

const ScoreLabel = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
`;

const ScoreBreakdown = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`;

const ScoreItem = styled.div`
  text-align: center;
`;

const ScoreItemValue = styled.div<{ score: number }>`
  font-size: 18px;
  font-weight: 600;
  color: ${props => {
    if (props.score >= 80) return '#10b981';
    if (props.score >= 60) return '#f59e0b';
    if (props.score >= 40) return '#f97316';
    return '#ef4444';
  }};
`;

const ScoreItemLabel = styled.div`
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
`;

const AnalysisSection = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const AnalysisGrid = styled.div`
  display: grid;
  gap: 16px;
`;

const AnalysisItem = styled.div`
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
`;

const AnalysisItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const AnalysisItemTitle = styled.div`
  font-weight: 600;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AnalysisItemValue = styled.div<{ status: 'good' | 'warning' | 'danger' }>`
  font-size: 14px;
  font-weight: 500;
  color: ${props => {
    switch (props.status) {
      case 'good': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'danger': return '#ef4444';
      default: return '#6b7280';
    }
  }};
`;

const AnalysisItemDetails = styled.div`
  font-size: 14px;
  color: #6b7280;
  line-height: 1.5;
`;

const ReviewSection = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const ReviewStatusCard = styled.div<{ status: string }>`
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border-left: 4px solid ${props => {
    switch (props.status) {
      case 'completed': return '#10b981';
      case 'in_review': return '#3b82f6';
      case 'escalated': return '#f97316';
      case 'pending': return '#f59e0b';
      default: return '#6b7280';
    }
  }};
  background: ${props => {
    switch (props.status) {
      case 'completed': return '#dcfce7';
      case 'in_review': return '#dbeafe';
      case 'escalated': return '#fed7aa';
      case 'pending': return '#fef3c7';
      default: return '#f3f4f6';
    }
  }};
`;

const ReviewStatusHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const ReviewStatusTitle = styled.div`
  font-weight: 600;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ReviewStatusTime = styled.div`
  font-size: 12px;
  color: #6b7280;
`;

const ReviewDetails = styled.div`
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
`;

const ModeratorInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  margin-top: 12px;
`;

const ModeratorAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
`;

const ModeratorDetails = styled.div`
  flex: 1;
`;

const ModeratorName = styled.div`
  font-weight: 500;
  color: #111827;
`;

const ModeratorRole = styled.div`
  font-size: 12px;
  color: #6b7280;
`;

const DecisionSection = styled.div`
  margin-top: 16px;
  padding: 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
`;

const DecisionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const DecisionTitle = styled.div`
  font-weight: 600;
  color: #111827;
`;

const DecisionBadge = styled.div<{ decision: string }>`
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => {
    switch (props.decision) {
      case 'confirm': return '#fecaca';
      case 'reject': return '#dcfce7';
      case 'uncertain': return '#fef3c7';
      case 'escalate': return '#fed7aa';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.decision) {
      case 'confirm': return '#991b1b';
      case 'reject': return '#166534';
      case 'uncertain': return '#92400e';
      case 'escalate': return '#c2410c';
      default: return '#374151';
    }
  }};
`;

const DecisionNotes = styled.div`
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
  margin-bottom: 12px;
`;

const DecisionTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const DecisionTag = styled.div`
  padding: 2px 8px;
  background: #e5e7eb;
  color: #374151;
  border-radius: 12px;
  font-size: 12px;
  display: flex;
  align-items: center;
`;

const TimelineSection = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const TimelineItem = styled.div`
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
  &:last-child {
    border-bottom: none;
  }
`;

const TimelineIcon = styled.div<{ status: string }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => {
    switch (props.status) {
      case 'completed': return '#dcfce7';
      case 'failed': return '#fecaca';
      case 'in_progress': return '#dbeafe';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'completed': return '#166534';
      case 'failed': return '#991b1b';
      case 'in_progress': return '#1e40af';
      default: return '#6b7280';
    }
  }};
`;

const TimelineContent = styled.div`
  flex: 1;
`;

const TimelineTitle = styled.div`
  font-weight: 500;
  color: #111827;
  margin-bottom: 4px;
`;

const TimelineDetails = styled.div`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
`;

const TimelineTime = styled.div`
  font-size: 12px;
  color: #9ca3af;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #f3f4f6;
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export const MediaAnalysisDetailView: React.FC<MediaAnalysisDetailViewProps> = ({
  mediaId,
  apiBaseUrl,
  onBack,
  onReviewAction,
  className
}) => {
  const [analysisData, setAnalysisData] = useState<MediaAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Fetch analysis data
  const fetchAnalysisData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${apiBaseUrl}/analysis/results/${mediaId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch analysis data: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAnalysisData(data);
      
      // Get media URL
      const mediaResponse = await fetch(`${apiBaseUrl}/media/${mediaId}/url`);
      if (mediaResponse.ok) {
        const mediaData = await mediaResponse.json();
        setMediaUrl(mediaData.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analysis data');
      console.error('Error fetching analysis data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, mediaId]);

  // Handle review actions
  const handleReviewAction = useCallback((action: string, data: any) => {
    onReviewAction?.(action, { mediaId, ...data });
  }, [mediaId, onReviewAction]);

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} />;
      case 'in_review': return <Eye size={16} />;
      case 'escalated': return <AlertTriangle size={16} />;
      case 'pending': return <Clock size={16} />;
      case 'failed': return <AlertTriangle size={16} />;
      case 'in_progress': return <Activity size={16} />;
      default: return <FileText size={16} />;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Initial load
  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  if (loading) {
    return (
      <DetailContainer className={className}>
        <LoadingSpinner>
          <div className="spinner" />
        </LoadingSpinner>
      </DetailContainer>
    );
  }

  if (error || !analysisData) {
    return (
      <DetailContainer className={className}>
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          <AlertTriangle size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px', color: '#374151' }}>
            Error Loading Analysis
          </h3>
          <p style={{ fontSize: '14px', margin: '0' }}>
            {error || 'Analysis data not found'}
          </p>
        </div>
      </DetailContainer>
    );
  }

  return (
    <DetailContainer className={className}>
      <Header>
        <BackButton onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Results
        </BackButton>
        <HeaderInfo>
          <MediaTitle>{analysisData.fileName}</MediaTitle>
          <MediaSubtitle>
            <span>{analysisData.fileType}</span>
            <span>{formatFileSize(analysisData.fileSize)}</span>
            <span>Analyzed {format(new Date(analysisData.analyzedAt), 'MMM dd, yyyy HH:mm')}</span>
            <span>Media ID: {analysisData.mediaId}</span>
          </MediaSubtitle>
        </HeaderInfo>
        <HeaderActions>
          <ActionButton>
            <Download size={16} />
            Download
          </ActionButton>
          <ActionButton>
            <Share2 size={16} />
            Share
          </ActionButton>
          {analysisData.reviewStatus.status === 'pending' && (
            <ActionButton variant="primary" onClick={() => handleReviewAction('start_review', {})}>
              <Eye size={16} />
              Start Review
            </ActionButton>
          )}
          {analysisData.trustScore.composite < 40 && (
            <ActionButton variant="danger">
              <Flag size={16} />
              Flag as High Risk
            </ActionButton>
          )}
        </HeaderActions>
      </Header>

      <ContentGrid>
        <MainContent>
          <MediaPlayer>
            <PlayerHeader>
              <PlayerTitle>Media Preview</PlayerTitle>
              <PlayerControls>
                {analysisData.fileType.startsWith('video') && (
                  <>
                    <PlayerButton onClick={() => setIsPlaying(!isPlaying)}>
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </PlayerButton>
                    <PlayerButton onClick={() => setIsMuted(!isMuted)}>
                      {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </PlayerButton>
                  </>
                )}
                <PlayerButton>
                  <Maximize size={16} />
                </PlayerButton>
              </PlayerControls>
            </PlayerHeader>
            <PlayerContent>
              {mediaUrl ? (
                analysisData.fileType.startsWith('video') ? (
                  <video
                    src={mediaUrl}
                    controls
                    muted={isMuted}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                ) : analysisData.fileType.startsWith('image') ? (
                  <img src={mediaUrl} alt={analysisData.fileName} />
                ) : analysisData.fileType.startsWith('audio') ? (
                  <audio src={mediaUrl} controls />
                ) : (
                  <div style={{ color: 'white', textAlign: 'center' }}>
                    <FileText size={64} style={{ opacity: 0.5, marginBottom: '16px' }} />
                    <div>Preview not available</div>
                  </div>
                )
              ) : (
                <div style={{ color: 'white', textAlign: 'center' }}>
                  <FileText size={64} style={{ opacity: 0.5, marginBottom: '16px' }} />
                  <div>Loading preview...</div>
                </div>
              )}
            </PlayerContent>
          </MediaPlayer>

          <AnalysisSection>
            <SectionTitle>
              <Database size={20} />
              Detailed Analysis Results
            </SectionTitle>
            <AnalysisGrid>
              <AnalysisItem>
                <AnalysisItemHeader>
                  <AnalysisItemTitle>
                    <Shield size={16} />
                    Deepfake Detection
                  </AnalysisItemTitle>
                  <AnalysisItemValue status={analysisData.deepfakeAnalysis.probability > 0.7 ? 'danger' : analysisData.deepfakeAnalysis.probability > 0.4 ? 'warning' : 'good'}>
                    {(analysisData.deepfakeAnalysis.probability * 100).toFixed(1)}% probability
                  </AnalysisItemValue>
                </AnalysisItemHeader>
                <AnalysisItemDetails>
                  <div>Confidence: {(analysisData.deepfakeAnalysis.confidence * 100).toFixed(1)}%</div>
                  <div>Model: {analysisData.deepfakeAnalysis.modelVersion}</div>
                  <div>Processing Time: {formatDuration(analysisData.deepfakeAnalysis.processingTime)}</div>
                  {analysisData.deepfakeAnalysis.techniques.length > 0 && (
                    <div>Detected Techniques: {analysisData.deepfakeAnalysis.techniques.join(', ')}</div>
                  )}
                </AnalysisItemDetails>
              </AnalysisItem>

              <AnalysisItem>
                <AnalysisItemHeader>
                  <AnalysisItemTitle>
                    <ExternalLink size={16} />
                    Source Verification
                  </AnalysisItemTitle>
                  <AnalysisItemValue status={analysisData.sourceVerification.status === 'verified' ? 'good' : analysisData.sourceVerification.status === 'suspicious' ? 'danger' : 'warning'}>
                    {analysisData.sourceVerification.status}
                  </AnalysisItemValue>
                </AnalysisItemHeader>
                <AnalysisItemDetails>
                  {analysisData.sourceVerification.domain && (
                    <div>Domain: {analysisData.sourceVerification.domain}</div>
                  )}
                  <div>Reputation Score: {analysisData.sourceVerification.reputationScore}/100</div>
                  <div>Method: {analysisData.sourceVerification.verificationMethod}</div>
                  <div>Last Checked: {format(new Date(analysisData.sourceVerification.lastChecked), 'MMM dd, yyyy HH:mm')}</div>
                </AnalysisItemDetails>
              </AnalysisItem>

              <AnalysisItem>
                <AnalysisItemHeader>
                  <AnalysisItemTitle>
                    <Database size={16} />
                    Metadata Analysis
                  </AnalysisItemTitle>
                  <AnalysisItemValue status={analysisData.metadataAnalysis.verificationStatus === 'passed' ? 'good' : analysisData.metadataAnalysis.verificationStatus === 'failed' ? 'danger' : 'warning'}>
                    {analysisData.metadataAnalysis.verificationStatus}
                  </AnalysisItemValue>
                </AnalysisItemHeader>
                <AnalysisItemDetails>
                  <div>Consistency: {analysisData.metadataAnalysis.consistent ? 'Consistent' : 'Inconsistent'}</div>
                  {analysisData.metadataAnalysis.anomalies.length > 0 && (
                    <div>Anomalies: {analysisData.metadataAnalysis.anomalies.join(', ')}</div>
                  )}
                  <div>Extracted Fields: {Object.keys(analysisData.metadataAnalysis.extractedData).length}</div>
                </AnalysisItemDetails>
              </AnalysisItem>

              {analysisData.threatIntelligence && (
                <AnalysisItem>
                  <AnalysisItemHeader>
                    <AnalysisItemTitle>
                      <AlertTriangle size={16} />
                      Threat Intelligence
                    </AnalysisItemTitle>
                    <AnalysisItemValue status={analysisData.threatIntelligence.threatLevel === 'critical' || analysisData.threatIntelligence.threatLevel === 'high' ? 'danger' : analysisData.threatIntelligence.threatLevel === 'medium' ? 'warning' : 'good'}>
                      {analysisData.threatIntelligence.threatLevel} risk
                    </AnalysisItemValue>
                  </AnalysisItemHeader>
                  <AnalysisItemDetails>
                    <div>Report Generated: {analysisData.threatIntelligence.reportGenerated ? 'Yes' : 'No'}</div>
                    <div>Indicators: {analysisData.threatIntelligence.indicators}</div>
                    {analysisData.threatIntelligence.reportId && (
                      <div>Report ID: {analysisData.threatIntelligence.reportId}</div>
                    )}
                  </AnalysisItemDetails>
                </AnalysisItem>
              )}
            </AnalysisGrid>
          </AnalysisSection>

          <TimelineSection>
            <SectionTitle>
              <Activity size={20} />
              Processing Timeline
            </SectionTitle>
            {analysisData.processingHistory.map((item, index) => (
              <TimelineItem key={index}>
                <TimelineIcon status={item.status}>
                  {getStatusIcon(item.status)}
                </TimelineIcon>
                <TimelineContent>
                  <TimelineTitle>{item.stage}</TimelineTitle>
                  <TimelineDetails>
                    Status: {item.status} • Duration: {formatDuration(item.duration)}
                  </TimelineDetails>
                  <TimelineTime>
                    {format(new Date(item.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                  </TimelineTime>
                  {item.details && Object.keys(item.details).length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af' }}>
                      {JSON.stringify(item.details, null, 2)}
                    </div>
                  )}
                </TimelineContent>
              </TimelineItem>
            ))}
          </TimelineSection>
        </MainContent>

        <Sidebar>
          <TrustScoreSection>
            <SectionTitle>
              <Shield size={20} />
              Trust Score Analysis
            </SectionTitle>
            <TrustScoreDisplay score={analysisData.trustScore.composite}>
              <TrustScoreValue>
                <ScoreNumber>{analysisData.trustScore.composite.toFixed(1)}</ScoreNumber>
                <ScoreLabel>Trust Score</ScoreLabel>
              </TrustScoreValue>
            </TrustScoreDisplay>
            <ScoreBreakdown>
              <ScoreItem>
                <ScoreItemValue score={analysisData.trustScore.breakdown.deepfakeScore}>
                  {analysisData.trustScore.breakdown.deepfakeScore.toFixed(1)}
                </ScoreItemValue>
                <ScoreItemLabel>Deepfake</ScoreItemLabel>
              </ScoreItem>
              <ScoreItem>
                <ScoreItemValue score={analysisData.trustScore.breakdown.sourceReliabilityScore}>
                  {analysisData.trustScore.breakdown.sourceReliabilityScore.toFixed(1)}
                </ScoreItemValue>
                <ScoreItemLabel>Source</ScoreItemLabel>
              </ScoreItem>
              <ScoreItem>
                <ScoreItemValue score={analysisData.trustScore.breakdown.metadataConsistencyScore}>
                  {analysisData.trustScore.breakdown.metadataConsistencyScore.toFixed(1)}
                </ScoreItemValue>
                <ScoreItemLabel>Metadata</ScoreItemLabel>
              </ScoreItem>
              <ScoreItem>
                <ScoreItemValue score={analysisData.trustScore.breakdown.technicalQualityScore}>
                  {analysisData.trustScore.breakdown.technicalQualityScore.toFixed(1)}
                </ScoreItemValue>
                <ScoreItemLabel>Quality</ScoreItemLabel>
              </ScoreItem>
            </ScoreBreakdown>
            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
              Confidence: {analysisData.trustScore.confidence} • Version: {analysisData.trustScore.version}
            </div>
          </TrustScoreSection>

          <ReviewSection>
            <SectionTitle>
              <User size={20} />
              Human Review Status
            </SectionTitle>
            <ReviewStatusCard status={analysisData.reviewStatus.status}>
              <ReviewStatusHeader>
                <ReviewStatusTitle>
                  {getStatusIcon(analysisData.reviewStatus.status)}
                  {analysisData.reviewStatus.status.replace('_', ' ').toUpperCase()}
                </ReviewStatusTitle>
                {analysisData.reviewStatus.reviewStarted && (
                  <ReviewStatusTime>
                    Started {format(new Date(analysisData.reviewStatus.reviewStarted), 'MMM dd, HH:mm')}
                  </ReviewStatusTime>
                )}
              </ReviewStatusHeader>
              <ReviewDetails>
                {analysisData.reviewStatus.status === 'pending' && (
                  <div>This media item is queued for human review due to its trust score and risk factors.</div>
                )}
                {analysisData.reviewStatus.status === 'in_review' && (
                  <div>Currently under review by a human moderator. Review process is in progress.</div>
                )}
                {analysisData.reviewStatus.status === 'completed' && (
                  <div>Human review has been completed. See moderator decision below.</div>
                )}
                {analysisData.reviewStatus.status === 'escalated' && (
                  <div>This case has been escalated to senior moderators for additional review.</div>
                )}
                {analysisData.reviewStatus.escalationReason && (
                  <div style={{ marginTop: '8px', fontStyle: 'italic' }}>
                    Escalation Reason: {analysisData.reviewStatus.escalationReason}
                  </div>
                )}
              </ReviewDetails>
              {analysisData.reviewStatus.assignedModerator && (
                <ModeratorInfo>
                  <ModeratorAvatar>
                    {analysisData.reviewStatus.assignedModerator.charAt(0).toUpperCase()}
                  </ModeratorAvatar>
                  <ModeratorDetails>
                    <ModeratorName>{analysisData.reviewStatus.assignedModerator}</ModeratorName>
                    <ModeratorRole>Content Moderator</ModeratorRole>
                  </ModeratorDetails>
                </ModeratorInfo>
              )}
            </ReviewStatusCard>

            {analysisData.reviewStatus.moderatorDecision && (
              <DecisionSection>
                <DecisionHeader>
                  <DecisionTitle>Moderator Decision</DecisionTitle>
                  <DecisionBadge decision={analysisData.reviewStatus.moderatorDecision.decision}>
                    {analysisData.reviewStatus.moderatorDecision.decision.toUpperCase()}
                  </DecisionBadge>
                </DecisionHeader>
                <DecisionNotes>
                  {analysisData.reviewStatus.moderatorDecision.notes}
                </DecisionNotes>
                <div style={{ marginBottom: '12px', fontSize: '14px', color: '#6b7280' }}>
                  Confidence: {(analysisData.reviewStatus.moderatorDecision.confidence * 100).toFixed(1)}%
                </div>
                {analysisData.reviewStatus.moderatorDecision.tags.length > 0 && (
                  <DecisionTags>
                    {analysisData.reviewStatus.moderatorDecision.tags.map((tag, index) => (
                      <DecisionTag key={index}>
                        <Tag size={12} style={{ marginRight: '4px' }} />
                        {tag}
                      </DecisionTag>
                    ))}
                  </DecisionTags>
                )}
                {analysisData.reviewStatus.reviewCompleted && (
                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280' }}>
                    Completed: {format(new Date(analysisData.reviewStatus.reviewCompleted), 'MMM dd, yyyy HH:mm')}
                  </div>
                )}
              </DecisionSection>
            )}

            {analysisData.reviewStatus.status === 'pending' && (
              <div style={{ marginTop: '16px' }}>
                <ActionButton 
                  variant="primary" 
                  style={{ width: '100%' }}
                  onClick={() => handleReviewAction('start_review', {})}
                >
                  <Eye size={16} />
                  Start Human Review
                </ActionButton>
              </div>
            )}

            {analysisData.reviewStatus.status === 'in_review' && (
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <ActionButton 
                  variant="primary" 
                  style={{ flex: 1 }}
                  onClick={() => handleReviewAction('complete_review', { decision: 'confirm' })}
                >
                  <CheckCircle size={16} />
                  Confirm
                </ActionButton>
                <ActionButton 
                  style={{ flex: 1 }}
                  onClick={() => handleReviewAction('complete_review', { decision: 'reject' })}
                >
                  <AlertTriangle size={16} />
                  Reject
                </ActionButton>
              </div>
            )}
          </ReviewSection>
        </Sidebar>
      </ContentGrid>
    </DetailContainer>
  );
};

export default MediaAnalysisDetailView;