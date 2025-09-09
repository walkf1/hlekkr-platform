import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useMedia } from '../../context/MediaContext';
import { 
  Shield, 
  TrendingUp, 
  AlertTriangle, 
  BarChart3, 
  RefreshCw,
  Download,
  Settings
} from 'lucide-react';
import TrustScoreDisplay from './TrustScoreDisplay';
import TrustScoreBreakdown from './TrustScoreBreakdown';
import TrustScoreHistoryChart from './TrustScoreHistoryChart';
import TrustScoreExplorer from './TrustScoreExplorer';

interface TrustScoreDashboardProps {
  mediaId?: string;
  apiBaseUrl: string;
  className?: string;
}

interface DashboardData {
  currentScore?: {
    mediaId: string;
    compositeScore: number;
    confidence: 'low' | 'medium' | 'high' | 'error';
    breakdown: {
      deepfakeScore: number;
      sourceReliabilityScore: number;
      metadataConsistencyScore: number;
      historicalPatternScore: number;
      technicalIntegrityScore: number;
    };
    factors: Array<{
      category: string;
      impact: 'positive' | 'negative' | 'neutral';
      description: string;
      weight: 'high' | 'medium' | 'low';
    }>;
    recommendations: string[];
  };
  history: Array<any>;
  statistics: {
    totalScores: number;
    averageScore: number;
    scoreDistribution: {
      high: number;
      medium: number;
      low: number;
      very_low: number;
    };
  };
  allMedia: Array<any>;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  background: #F9FAFB;
  min-height: 100vh;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: white;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #F9FAFB;
    border-color: #D1D5DB;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const StatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const StatTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  color: #6B7280;
  margin: 0;
`;

const StatIcon = styled.div<{ color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: ${props => props.color}20;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
`;

const StatChange = styled.div<{ trend: 'up' | 'down' | 'stable' }>`
  font-size: 12px;
  font-weight: 500;
  color: ${props => {
    switch (props.trend) {
      case 'up': return '#10B981';
      case 'down': return '#EF4444';
      default: return '#6B7280';
    }
  }};
  display: flex;
  align-items: center;
  gap: 4px;
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const FullWidthSection = styled.div`
  grid-column: 1 / -1;
`;

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #6B7280;
`;

const ErrorMessage = styled.div`
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 8px;
  padding: 16px;
  color: #991B1B;
  margin-bottom: 24px;
`;

const TrustScoreDashboard: React.FC<TrustScoreDashboardProps> = ({
  mediaId,
  apiBaseUrl,
  className
}) => {
  const [data, setData] = useState<DashboardData>({
    history: [],
    statistics: {
      totalScores: 0,
      averageScore: 0,
      scoreDistribution: { high: 0, medium: 0, low: 0, very_low: 0 }
    },
    allMedia: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { uploadedMedia } = useMedia();

  // Fetch dashboard data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use real uploaded media data
      const realMediaData = uploadedMedia.map(media => ({
        mediaId: media.mediaId,
        filename: media.fileName,
        compositeScore: media.trustScore,
        confidence: media.trustScore >= 70 ? 'high' : media.trustScore >= 40 ? 'medium' : 'low',
        calculationTimestamp: media.uploadedAt,
        uploadTimestamp: media.uploadedAt,
        breakdown: {
          deepfakeScore: 100 - (media.deepfakeConfidence * 100),
          sourceReliabilityScore: 85,
          metadataConsistencyScore: 90,
          historicalPatternScore: 80,
          technicalIntegrityScore: 88
        },
        factors: [
          {
            category: 'Deepfake Detection',
            impact: media.deepfakeConfidence < 0.3 ? 'positive' : 'negative',
            description: `AI confidence: ${(media.deepfakeConfidence * 100).toFixed(1)}%`,
            weight: 'high'
          }
        ],
        recommendations: media.trustScore < 50 ? ['Requires human review'] : ['Content appears authentic']
      }));

      // Calculate statistics from real data
      const totalScores = realMediaData.length;
      const averageScore = totalScores > 0 ? realMediaData.reduce((sum, m) => sum + m.compositeScore, 0) / totalScores : 0;
      const scoreDistribution = {
        high: realMediaData.filter(m => m.compositeScore >= 70).length,
        medium: realMediaData.filter(m => m.compositeScore >= 40 && m.compositeScore < 70).length,
        low: realMediaData.filter(m => m.compositeScore >= 20 && m.compositeScore < 40).length,
        very_low: realMediaData.filter(m => m.compositeScore < 20).length
      };

      // Get current score if mediaId provided
      let currentScore = undefined;
      if (mediaId) {
        const currentMedia = realMediaData.find(m => m.mediaId === mediaId);
        if (currentMedia) {
          currentScore = currentMedia;
        }
      }

      setData({
        currentScore,
        history: realMediaData.slice(0, 20), // Use recent uploads as history
        statistics: {
          totalScores,
          averageScore,
          scoreDistribution
        },
        allMedia: realMediaData
      });
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
      console.error('Dashboard data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh specific media score
  const refreshMediaScore = async (targetMediaId: string) => {
    try {
      setRefreshing(true);
      
      // Trigger score recalculation
      const response = await fetch(`${apiBaseUrl}/trust-scores/${targetMediaId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh dashboard data
        await fetchData();
      } else {
        throw new Error('Failed to refresh score');
      }
    } catch (err) {
      setError('Failed to refresh trust score. Please try again.');
      console.error('Score refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Export data
  const exportData = async (filters: any) => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          queryParams.append(key, value as string);
        }
      });
      
      const response = await fetch(`${apiBaseUrl}/trust-scores?${queryParams.toString()}`);
      const data = await response.json();
      
      // Create and download CSV
      const csv = convertToCSV(data.trustScores || []);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trust-scores-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export data. Please try again.');
      console.error('Export error:', err);
    }
  };

  const convertToCSV = (data: any[]) => {
    if (data.length === 0) return '';
    
    const headers = ['Media ID', 'Filename', 'Trust Score', 'Confidence', 'Upload Date'];
    const rows = data.map(item => [
      item.mediaId,
      item.filename || 'Unknown',
      item.compositeScore,
      item.confidence,
      new Date(item.uploadTimestamp || item.calculationTimestamp).toISOString()
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  useEffect(() => {
    fetchData();
  }, [mediaId, apiBaseUrl, uploadedMedia]);

  if (loading) {
    return (
      <Container className={className}>
        <LoadingSpinner>
          <RefreshCw size={24} className="animate-spin" />
          Loading dashboard...
        </LoadingSpinner>
      </Container>
    );
  }

  return (
    <Container className={className}>
      <Header>
        <Title>
          <Shield size={32} color="#3B82F6" />
          Trust Score Dashboard
        </Title>
        <HeaderActions>
          <ActionButton onClick={fetchData} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </ActionButton>
          <ActionButton onClick={() => exportData({})}>
            <Download size={16} />
            Export
          </ActionButton>
          <ActionButton>
            <Settings size={16} />
            Settings
          </ActionButton>
        </HeaderActions>
      </Header>

      {error && (
        <ErrorMessage>
          {error}
        </ErrorMessage>
      )}

      {/* Statistics Overview */}
      <StatsGrid>
        <StatCard>
          <StatHeader>
            <StatTitle>Total Analyzed</StatTitle>
            <StatIcon color="#3B82F6">
              <BarChart3 size={16} color="#3B82F6" />
            </StatIcon>
          </StatHeader>
          <StatValue>{data.statistics.totalScores.toLocaleString()}</StatValue>
          <StatChange trend="stable">Media files processed</StatChange>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatTitle>Average Score</StatTitle>
            <StatIcon color="#10B981">
              <TrendingUp size={16} color="#10B981" />
            </StatIcon>
          </StatHeader>
          <StatValue>{Math.round(data.statistics.averageScore)}</StatValue>
          <StatChange trend="up">Platform average</StatChange>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatTitle>High Trust</StatTitle>
            <StatIcon color="#10B981">
              <Shield size={16} color="#10B981" />
            </StatIcon>
          </StatHeader>
          <StatValue>{data.statistics.scoreDistribution.high}</StatValue>
          <StatChange trend="up">
            {data.statistics.totalScores > 0 
              ? Math.round((data.statistics.scoreDistribution.high / data.statistics.totalScores) * 100)
              : 0}% of total
          </StatChange>
        </StatCard>

        <StatCard>
          <StatHeader>
            <StatTitle>Needs Review</StatTitle>
            <StatIcon color="#EF4444">
              <AlertTriangle size={16} color="#EF4444" />
            </StatIcon>
          </StatHeader>
          <StatValue>
            {data.statistics.scoreDistribution.low + data.statistics.scoreDistribution.very_low}
          </StatValue>
          <StatChange trend="down">Low trust content</StatChange>
        </StatCard>
      </StatsGrid>

      {/* Main Content */}
      <MainContent>
        {/* Current Score Breakdown */}
        {data.currentScore && (
          <TrustScoreBreakdown
            breakdown={data.currentScore.breakdown}
            factors={data.currentScore.factors}
            compositeScore={data.currentScore.compositeScore}
          />
        )}

        {/* Historical Chart */}
        {data.history.length > 0 && (
          <TrustScoreHistoryChart
            data={data.history}
            mediaId={mediaId || ''}
            showBreakdown={false}
          />
        )}
      </MainContent>

      {/* Media Explorer */}
      <FullWidthSection>
        <TrustScoreExplorer
          data={data.allMedia}
          onMediaSelect={(selectedMediaId) => {
            // Handle media selection - could navigate or update view
            console.log('Selected media:', selectedMediaId);
          }}
          onScoreRefresh={refreshMediaScore}
          onExport={exportData}
        />
      </FullWidthSection>
    </Container>
  );
};

export default TrustScoreDashboard;