import React from 'react';
import styled from 'styled-components';
import { 
  FileText, 
  Shield, 
  AlertTriangle, 
  Users, 
  Clock, 
  TrendingUp,
  CheckCircle,
  Eye
} from 'lucide-react';

interface DashboardStatsProps {
  stats: {
    totalMedia: number;
    analyzedToday: number;
    averageTrustScore: number;
    flaggedContent: number;
    underReview: number;
    completedReviews: number;
    processingTime: number;
    threatReports: number;
  };
  trends?: {
    totalMedia: number;
    averageTrustScore: number;
    flaggedContent: number;
    processingTime: number;
  };
}

const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
`;

const StatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const StatIcon = styled.div<{ color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.color}20;
  color: ${props => props.color};
`;

const StatTrend = styled.div<{ positive: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${props => props.positive ? '#10b981' : '#ef4444'};
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
`;

const StatDescription = styled.div`
  font-size: 12px;
  color: #9ca3af;
  margin-top: 8px;
`;

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, trends }) => {
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatTrend = (current: number, previous: number): { value: number; positive: boolean } => {
    const change = ((current - previous) / previous) * 100;
    return { value: Math.abs(change), positive: change >= 0 };
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <StatsContainer>
      <StatCard>
        <StatHeader>
          <StatIcon color="#3b82f6">
            <FileText size={24} />
          </StatIcon>
          {trends && (
            <StatTrend positive={formatTrend(stats.totalMedia, trends.totalMedia).positive}>
              <TrendingUp size={12} />
              {formatTrend(stats.totalMedia, trends.totalMedia).value.toFixed(1)}%
            </StatTrend>
          )}
        </StatHeader>
        <StatValue>{formatNumber(stats.totalMedia)}</StatValue>
        <StatLabel>Total Media Files</StatLabel>
        <StatDescription>{stats.analyzedToday} analyzed today</StatDescription>
      </StatCard>

      <StatCard>
        <StatHeader>
          <StatIcon color="#10b981">
            <Shield size={24} />
          </StatIcon>
          {trends && (
            <StatTrend positive={formatTrend(stats.averageTrustScore, trends.averageTrustScore).positive}>
              <TrendingUp size={12} />
              {formatTrend(stats.averageTrustScore, trends.averageTrustScore).value.toFixed(1)}%
            </StatTrend>
          )}
        </StatHeader>
        <StatValue>{stats.averageTrustScore.toFixed(1)}%</StatValue>
        <StatLabel>Average Trust Score</StatLabel>
        <StatDescription>Across all analyzed media</StatDescription>
      </StatCard>

      <StatCard>
        <StatHeader>
          <StatIcon color="#ef4444">
            <AlertTriangle size={24} />
          </StatIcon>
          {trends && (
            <StatTrend positive={!formatTrend(stats.flaggedContent, trends.flaggedContent).positive}>
              <TrendingUp size={12} />
              {formatTrend(stats.flaggedContent, trends.flaggedContent).value.toFixed(1)}%
            </StatTrend>
          )}
        </StatHeader>
        <StatValue>{formatNumber(stats.flaggedContent)}</StatValue>
        <StatLabel>Flagged Content</StatLabel>
        <StatDescription>Requires attention</StatDescription>
      </StatCard>

      <StatCard>
        <StatHeader>
          <StatIcon color="#f59e0b">
            <Users size={24} />
          </StatIcon>
        </StatHeader>
        <StatValue>{formatNumber(stats.underReview)}</StatValue>
        <StatLabel>Under Human Review</StatLabel>
        <StatDescription>{stats.completedReviews} completed today</StatDescription>
      </StatCard>

      <StatCard>
        <StatHeader>
          <StatIcon color="#8b5cf6">
            <Clock size={24} />
          </StatIcon>
          {trends && (
            <StatTrend positive={!formatTrend(stats.processingTime, trends.processingTime).positive}>
              <TrendingUp size={12} />
              {formatTrend(stats.processingTime, trends.processingTime).value.toFixed(1)}%
            </StatTrend>
          )}
        </StatHeader>
        <StatValue>{formatTime(stats.processingTime)}</StatValue>
        <StatLabel>Avg Processing Time</StatLabel>
        <StatDescription>End-to-end analysis</StatDescription>
      </StatCard>

      <StatCard>
        <StatHeader>
          <StatIcon color="#dc2626">
            <Eye size={24} />
          </StatIcon>
        </StatHeader>
        <StatValue>{formatNumber(stats.threatReports)}</StatValue>
        <StatLabel>Threat Reports</StatLabel>
        <StatDescription>Generated this week</StatDescription>
      </StatCard>
    </StatsContainer>
  );
};

export default DashboardStats;