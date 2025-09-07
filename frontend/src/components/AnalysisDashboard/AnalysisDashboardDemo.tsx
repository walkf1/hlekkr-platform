import React, { useState } from 'react';
import styled from 'styled-components';
import { AnalysisResultsDashboard, MediaAnalysisResult } from './AnalysisResultsDashboard';
import { 
  BarChart3, 
  Shield, 
  Users, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Database
} from 'lucide-react';

const DemoContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
`;

const DemoContent = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const DemoHeader = styled.div`
  text-align: center;
  margin-bottom: 48px;
  color: white;
`;

const DemoTitle = styled.h1`
  font-size: 48px;
  font-weight: 800;
  margin: 0 0 16px;
  background: linear-gradient(135deg, #ffffff, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const DemoSubtitle = styled.p`
  font-size: 20px;
  opacity: 0.9;
  margin: 0 0 32px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 48px;
`;

const FeatureCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: transform 0.2s ease;
  
  &:hover {
    transform: translateY(-4px);
  }
`;

const FeatureIcon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
`;

const FeatureTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
`;

const FeatureDescription = styled.p`
  font-size: 14px;
  opacity: 0.8;
  margin: 0;
  line-height: 1.5;
`;

const DashboardWrapper = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

const StatsOverlay = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 100;
  min-width: 200px;
`;

const StatItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 14px;
  color: #374151;
`;

const StatLabel = styled.span`
  color: #6b7280;
`;

const StatValue = styled.span`
  font-weight: 600;
  color: #111827;
`;

// Generate comprehensive mock data
const generateMockData = (): MediaAnalysisResult[] => {
  const fileTypes = ['video/mp4', 'image/jpeg', 'image/png', 'audio/mp3', 'video/avi'];
  const statuses = ['analyzing', 'completed', 'under_review', 'reviewed', 'flagged'];
  const techniques = ['face_swap', 'voice_cloning', 'lip_sync', 'full_body', 'audio_synthesis'];
  const domains = ['news-site.com', 'social-media.com', 'suspicious-domain.com', 'verified-source.org'];
  const moderators = ['alice_moderator', 'bob_reviewer', 'carol_analyst', 'david_expert'];

  return Array.from({ length: 50 }, (_, i) => {
    const trustScore = Math.random() * 100;
    const deepfakeProbability = Math.random();
    const hasReview = Math.random() > 0.6;
    const hasThreatIntel = Math.random() > 0.8;
    
    return {
      mediaId: `media-${String(i + 1).padStart(3, '0')}`,
      fileName: `sample_media_${i + 1}.${fileTypes[i % fileTypes.length].split('/')[1]}`,
      fileType: fileTypes[i % fileTypes.length],
      fileSize: Math.floor(Math.random() * 100000000) + 1000000, // 1MB to 100MB
      uploadedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      analyzedAt: new Date(Date.now() - Math.random() * 29 * 24 * 60 * 60 * 1000).toISOString(),
      trustScore: Math.round(trustScore * 10) / 10,
      status: statuses[Math.floor(Math.random() * statuses.length)] as any,
      deepfakeAnalysis: {
        probability: Math.round(deepfakeProbability * 100) / 100,
        confidence: Math.round(Math.random() * 100) / 100,
        techniques: techniques.filter(() => Math.random() > 0.7),
        modelVersion: `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 5)}.0`
      },
      sourceVerification: {
        status: Math.random() > 0.7 ? 'verified' : Math.random() > 0.5 ? 'suspicious' : 'unknown',
        reputationScore: Math.round(Math.random() * 100 * 10) / 10,
        domain: domains[Math.floor(Math.random() * domains.length)],
        verificationDetails: {}
      },
      metadataAnalysis: {
        consistent: Math.random() > 0.3,
        anomalies: ['timestamp_mismatch', 'location_inconsistency', 'device_spoofing'].filter(() => Math.random() > 0.8),
        extractedData: {},
        originalMetadata: {}
      },
      humanReview: hasReview ? {
        reviewId: `review-${String(i + 1).padStart(3, '0')}`,
        status: ['pending', 'in_progress', 'completed'][Math.floor(Math.random() * 3)] as any,
        assignedModerator: moderators[Math.floor(Math.random() * moderators.length)],
        decision: Math.random() > 0.5 ? ['confirm', 'override', 'escalate'][Math.floor(Math.random() * 3)] as any : undefined,
        confidence: Math.random(),
        notes: Math.random() > 0.7 ? 'Detailed analysis reveals suspicious patterns in facial movements.' : undefined,
        reviewedAt: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : undefined,
        processingTime: Math.floor(Math.random() * 3600) + 300 // 5 minutes to 1 hour
      } : undefined,
      threatIntelligence: hasThreatIntel ? {
        indicators: Math.floor(Math.random() * 10) + 1,
        reportGenerated: Math.random() > 0.5,
        severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any
      } : undefined
    };
  });
};

export const AnalysisDashboardDemo: React.FC = () => {
  const [selectedMedia, setSelectedMedia] = useState<MediaAnalysisResult | null>(null);
  const [interactionStats, setInteractionStats] = useState({
    mediaViewed: 0,
    bulkActions: 0,
    filtersApplied: 0,
    exportsGenerated: 0
  });

  const mockData = generateMockData();

  const handleMediaSelect = (media: MediaAnalysisResult) => {
    setSelectedMedia(media);
    setInteractionStats(prev => ({ ...prev, mediaViewed: prev.mediaViewed + 1 }));
  };

  const handleBulkAction = (action: string, mediaIds: string[]) => {
    console.log(`Demo: Bulk action ${action} on ${mediaIds.length} items`);
    setInteractionStats(prev => ({ ...prev, bulkActions: prev.bulkActions + 1 }));
  };

  return (
    <DemoContainer>
      <DemoContent>
        <DemoHeader>
          <DemoTitle>Analysis Results Dashboard</DemoTitle>
          <DemoSubtitle>
            Comprehensive media analysis dashboard with HITL workflow integration, 
            real-time filtering, trust score visualization, and detailed analysis drill-down
          </DemoSubtitle>
        </DemoHeader>

        <FeatureGrid>
          <FeatureCard>
            <FeatureIcon>
              <BarChart3 size={32} />
            </FeatureIcon>
            <FeatureTitle>Comprehensive Analytics</FeatureTitle>
            <FeatureDescription>
              Real-time statistics, trust score distributions, and processing metrics 
              with trend analysis and performance insights
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <Shield size={32} />
            </FeatureIcon>
            <FeatureTitle>Trust Score Visualization</FeatureTitle>
            <FeatureDescription>
              Interactive trust score displays with detailed breakdowns, 
              color-coded indicators, and drill-down capabilities
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <Users size={32} />
            </FeatureIcon>
            <FeatureTitle>HITL Integration</FeatureTitle>
            <FeatureDescription>
              Seamless integration with human review workflow, showing review status, 
              moderator assignments, and decision outcomes
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <Eye size={32} />
            </FeatureIcon>
            <FeatureTitle>Detailed Analysis View</FeatureTitle>
            <FeatureDescription>
              In-depth analysis results with deepfake detection details, 
              source verification, and metadata analysis
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <AlertTriangle size={32} />
            </FeatureIcon>
            <FeatureTitle>Threat Intelligence</FeatureTitle>
            <FeatureDescription>
              Integration with threat intelligence system showing indicators, 
              severity levels, and generated reports
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <Database size={32} />
            </FeatureIcon>
            <FeatureTitle>Advanced Filtering</FeatureTitle>
            <FeatureDescription>
              Powerful filtering and search capabilities with trust score ranges, 
              status filters, and multi-criteria sorting
            </FeatureDescription>
          </FeatureCard>
        </FeatureGrid>

        <DashboardWrapper>
          <AnalysisResultsDashboard
            onMediaSelect={handleMediaSelect}
            onBulkAction={handleBulkAction}
          />
        </DashboardWrapper>

        <StatsOverlay>
          <div style={{ fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
            Demo Interactions
          </div>
          <StatItem>
            <StatLabel>Media Viewed:</StatLabel>
            <StatValue>{interactionStats.mediaViewed}</StatValue>
          </StatItem>
          <StatItem>
            <StatLabel>Bulk Actions:</StatLabel>
            <StatValue>{interactionStats.bulkActions}</StatValue>
          </StatItem>
          <StatItem>
            <StatLabel>Total Media:</StatLabel>
            <StatValue>{mockData.length}</StatValue>
          </StatItem>
          <StatItem>
            <StatLabel>Under Review:</StatLabel>
            <StatValue>{mockData.filter(m => m.status === 'under_review').length}</StatValue>
          </StatItem>
          <StatItem>
            <StatLabel>Flagged:</StatLabel>
            <StatValue>{mockData.filter(m => m.status === 'flagged').length}</StatValue>
          </StatItem>
          <StatItem>
            <StatLabel>Avg Trust Score:</StatLabel>
            <StatValue>
              {(mockData.reduce((sum, m) => sum + m.trustScore, 0) / mockData.length).toFixed(1)}%
            </StatValue>
          </StatItem>
        </StatsOverlay>
      </DemoContent>
    </DemoContainer>
  );
};

export default AnalysisDashboardDemo;