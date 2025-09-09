import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { useMedia } from '../../context/MediaContext';
import { Search, Filter, Download, Eye, BarChart3, Shield, Users, AlertTriangle } from 'lucide-react';

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 800;
  color: #1f2937;
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const StatIcon = styled.div<{ color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${props => props.color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 16px;
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 800;
  color: #1f2937;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  color: #6b7280;
  font-size: 14px;
`;

const FiltersBar = styled.div`
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const MediaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
`;

const MediaCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
`;

const MediaHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const MediaTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  word-break: break-word;
`;

const TrustScore = styled.div<{ score: number }>`
  background: ${props => 
    props.score >= 70 ? '#10b981' :
    props.score >= 40 ? '#f59e0b' : '#ef4444'
  };
  color: white;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  min-width: 60px;
  text-align: center;
`;

const MediaInfo = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
`;

const InfoItem = styled.div`
  font-size: 14px;
`;

const InfoLabel = styled.div`
  color: #6b7280;
  margin-bottom: 2px;
`;

const InfoValue = styled.div`
  color: #1f2937;
  font-weight: 500;
`;

const ProcessingStages = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const Stage = styled.div<{ status: string }>`
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: ${props => 
    props.status === 'completed' ? '#10b981' :
    props.status === 'processing' ? '#3b82f6' :
    props.status === 'failed' ? '#ef4444' : '#e5e7eb'
  };
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  
  &:hover {
    background: #f9fafb;
  }
`;

export const ConnectedAnalysisDashboard: React.FC = () => {
  const { uploadedMedia, setCurrentMedia } = useMedia();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [trustScoreFilter, setTrustScoreFilter] = useState('all');

  const filteredMedia = useMemo(() => {
    return uploadedMedia.filter(media => {
      const matchesSearch = media.fileName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || media.status === statusFilter;
      const matchesTrustScore = trustScoreFilter === 'all' || 
        (trustScoreFilter === 'high' && (media.trustScore || 0) >= 70) ||
        (trustScoreFilter === 'medium' && (media.trustScore || 0) >= 40 && (media.trustScore || 0) < 70) ||
        (trustScoreFilter === 'low' && (media.trustScore || 0) < 40);
      
      return matchesSearch && matchesStatus && matchesTrustScore;
    });
  }, [uploadedMedia, searchTerm, statusFilter, trustScoreFilter]);

  const stats = useMemo(() => {
    const total = uploadedMedia.length;
    const completed = uploadedMedia.filter(m => m.status === 'completed').length;
    const processing = uploadedMedia.filter(m => m.status === 'processing').length;
    const avgTrustScore = uploadedMedia.length > 0 
      ? uploadedMedia.reduce((sum, m) => sum + (m.trustScore || 0), 0) / uploadedMedia.length 
      : 0;
    const highRisk = uploadedMedia.filter(m => (m.trustScore || 0) < 40).length;
    const needsReview = uploadedMedia.filter(m => m.hitlReview?.status === 'pending').length;

    return { total, completed, processing, avgTrustScore, highRisk, needsReview };
  }, [uploadedMedia]);

  const handleViewDetails = (mediaId: string) => {
    setCurrentMedia(mediaId);
  };

  const getProcessingStages = (media: any) => [
    { name: 'Security', status: media.securityScan?.status || 'pending' },
    { name: 'Metadata', status: media.metadataExtraction?.status || 'pending' },
    { name: 'AI Analysis', status: media.bedrockAnalysis?.status || 'pending' },
    { name: 'Review', status: media.hitlReview?.status === 'not_required' ? 'completed' : media.hitlReview?.status || 'pending' }
  ];

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploading': return 'Uploading';
      case 'processing': return 'Processing';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      default: return 'Unknown';
    }
  };

  return (
    <Container>
      <Header>
        <Title>Analysis Dashboard</Title>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatIcon color="#3b82f6">
            <BarChart3 size={24} />
          </StatIcon>
          <StatValue>{stats.total}</StatValue>
          <StatLabel>Total Files</StatLabel>
        </StatCard>

        <StatCard>
          <StatIcon color="#10b981">
            <Shield size={24} />
          </StatIcon>
          <StatValue>{stats.avgTrustScore.toFixed(1)}%</StatValue>
          <StatLabel>Avg Trust Score</StatLabel>
        </StatCard>

        <StatCard>
          <StatIcon color="#f59e0b">
            <Users size={24} />
          </StatIcon>
          <StatValue>{stats.needsReview}</StatValue>
          <StatLabel>Needs Review</StatLabel>
        </StatCard>

        <StatCard>
          <StatIcon color="#ef4444">
            <AlertTriangle size={24} />
          </StatIcon>
          <StatValue>{stats.highRisk}</StatValue>
          <StatLabel>High Risk</StatLabel>
        </StatCard>
      </StatsGrid>

      <FiltersBar>
        <SearchInput
          placeholder="Search files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <FilterSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="uploading">Uploading</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </FilterSelect>

        <FilterSelect value={trustScoreFilter} onChange={(e) => setTrustScoreFilter(e.target.value)}>
          <option value="all">All Trust Scores</option>
          <option value="high">High (70%+)</option>
          <option value="medium">Medium (40-69%)</option>
          <option value="low">Low (<40%)</option>
        </FilterSelect>
      </FiltersBar>

      {filteredMedia.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          {uploadedMedia.length === 0 ? 'No files uploaded yet. Go to Media Upload to get started.' : 'No files match your filters.'}
        </div>
      ) : (
        <MediaGrid>
          {filteredMedia.map((media) => (
            <MediaCard key={media.mediaId}>
              <MediaHeader>
                <MediaTitle>{media.fileName}</MediaTitle>
                {media.trustScore !== undefined && (
                  <TrustScore score={media.trustScore}>
                    {media.trustScore}%
                  </TrustScore>
                )}
              </MediaHeader>

              <MediaInfo>
                <InfoItem>
                  <InfoLabel>Status</InfoLabel>
                  <InfoValue>{getStatusText(media.status)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Size</InfoLabel>
                  <InfoValue>{formatFileSize(media.fileSize)}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Type</InfoLabel>
                  <InfoValue>{media.fileType}</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>Uploaded</InfoLabel>
                  <InfoValue>{new Date(media.uploadedAt).toLocaleDateString()}</InfoValue>
                </InfoItem>
              </MediaInfo>

              <ProcessingStages>
                {getProcessingStages(media).map((stage, index) => (
                  <Stage key={index} status={stage.status} title={`${stage.name}: ${stage.status}`} />
                ))}
              </ProcessingStages>

              <ActionButtons>
                <ActionButton onClick={() => handleViewDetails(media.mediaId)}>
                  <Eye size={16} />
                  View Details
                </ActionButton>
                <ActionButton>
                  <Download size={16} />
                  Export
                </ActionButton>
              </ActionButtons>
            </MediaCard>
          ))}
        </MediaGrid>
      )}
    </Container>
  );
};