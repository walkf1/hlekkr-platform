import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { 
  RefreshCw, 
  Download,
  BarChart3,
  Settings
} from 'lucide-react';
import { DashboardStats } from './DashboardStats';
import { DashboardFiltersComponent } from './DashboardFilters';
import { MediaResultsTable } from './MediaResultsTable';
import { DetailedAnalysisView } from './DetailedAnalysisView';

// Types
export interface MediaAnalysisResult {
  mediaId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  analyzedAt: string;
  trustScore: number;
  status: 'analyzing' | 'completed' | 'under_review' | 'reviewed' | 'flagged';
  deepfakeAnalysis: {
    probability: number;
    confidence: number;
    techniques: string[];
    modelVersion: string;
  };
  sourceVerification: {
    status: 'verified' | 'suspicious' | 'unknown';
    reputationScore: number;
    domain?: string;
    verificationDetails: Record<string, any>;
  };
  metadataAnalysis: {
    consistent: boolean;
    anomalies: string[];
    extractedData: Record<string, any>;
    originalMetadata: Record<string, any>;
  };
  humanReview?: {
    reviewId: string;
    status: 'pending' | 'in_progress' | 'completed';
    assignedModerator?: string;
    decision?: 'confirm' | 'override' | 'escalate';
    confidence?: number;
    notes?: string;
    reviewedAt?: string;
    processingTime?: number;
  };
  threatIntelligence?: {
    indicators: number;
    reportGenerated: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface DashboardFilters {
  search: string;
  trustScoreRange: [number, number];
  status: string[];
  dateRange: [Date | null, Date | null];
  fileTypes: string[];
  reviewStatus: string[];
  sortBy: 'uploadedAt' | 'trustScore' | 'analyzedAt' | 'fileName';
  sortOrder: 'asc' | 'desc';
}

interface AnalysisResultsDashboardProps {
  apiEndpoint?: string;
  refreshInterval?: number;
  pageSize?: number;
  onMediaSelect?: (media: MediaAnalysisResult) => void;
  onBulkAction?: (action: string, mediaIds: string[]) => void;
  className?: string;
}

// Styled Components
const DashboardContainer = styled.div`
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  background: #f9fafb;
  min-height: 100vh;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
  gap: 12px;
`;

const ActionButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
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
  
  ${props => props.variant === 'primary' ? `
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
    &:hover { background: #2563eb; border-color: #2563eb; }
  ` : `
    background: white;
    color: #374151;
    border-color: #d1d5db;
    &:hover { background: #f9fafb; border-color: #9ca3af; }
  `}
`;

export const AnalysisResultsDashboard: React.FC<AnalysisResultsDashboardProps> = ({
  apiEndpoint = '/api/analysis',
  refreshInterval = 30000,
  pageSize = 20,
  onMediaSelect,
  onBulkAction,
  className
}) => {
  const [results, setResults] = useState<MediaAnalysisResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<MediaAnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<MediaAnalysisResult | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({
    search: '',
    trustScoreRange: [0, 100],
    status: [],
    dateRange: [null, null],
    fileTypes: [],
    reviewStatus: [],
    sortBy: 'uploadedAt',
    sortOrder: 'desc'
  });

  // Mock data for demonstration
  const mockResults: MediaAnalysisResult[] = [
    {
      mediaId: 'media-001',
      fileName: 'suspicious_video.mp4',
      fileType: 'video/mp4',
      fileSize: 15728640,
      uploadedAt: '2024-01-15T10:30:00Z',
      analyzedAt: '2024-01-15T10:32:15Z',
      trustScore: 23.5,
      status: 'under_review',
      deepfakeAnalysis: {
        probability: 0.87,
        confidence: 0.92,
        techniques: ['face_swap', 'voice_cloning'],
        modelVersion: 'v2.1.0'
      },
      sourceVerification: {
        status: 'suspicious',
        reputationScore: 15.2,
        domain: 'fake-news-site.com',
        verificationDetails: {}
      },
      metadataAnalysis: {
        consistent: false,
        anomalies: ['timestamp_mismatch', 'location_inconsistency'],
        extractedData: {},
        originalMetadata: {}
      },
      humanReview: {
        reviewId: 'review-001',
        status: 'in_progress',
        assignedModerator: 'moderator_jane',
        processingTime: 1800
      },
      threatIntelligence: {
        indicators: 5,
        reportGenerated: true,
        severity: 'high'
      }
    },
    // Add more mock data...
  ];

  const stats = {
    totalMedia: 1247,
    analyzedToday: 89,
    averageTrustScore: 76.3,
    flaggedContent: 23,
    underReview: 12,
    completedReviews: 156,
    processingTime: 45.2,
    threatReports: 8
  };

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // In a real app, this would be an API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        setResults(mockResults);
        setFilteredResults(mockResults);
      } catch (err) {
        setError('Failed to load analysis results');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter results
  useEffect(() => {
    let filtered = [...results];

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(item => 
        item.fileName.toLowerCase().includes(searchLower) ||
        item.mediaId.toLowerCase().includes(searchLower)
      );
    }

    // Apply trust score range filter
    filtered = filtered.filter(item => 
      item.trustScore >= filters.trustScoreRange[0] && 
      item.trustScore <= filters.trustScoreRange[1]
    );

    // Apply status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter(item => filters.status.includes(item.status));
    }

    // Apply review status filter
    if (filters.reviewStatus.length > 0) {
      filtered = filtered.filter(item => 
        item.humanReview && filters.reviewStatus.includes(item.humanReview.status)
      );
    }

    // Apply file type filter
    if (filters.fileTypes.length > 0) {
      filtered = filtered.filter(item => filters.fileTypes.includes(item.fileType));
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[filters.sortBy];
      let bValue: any = b[filters.sortBy];

      if (filters.sortBy === 'uploadedAt' || filters.sortBy === 'analyzedAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredResults(filtered);
  }, [results, filters]);

  const handleRefresh = useCallback(async () => {
    // Refresh data
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  }, []);

  const handleExport = useCallback(() => {
    // Export filtered results
    const dataStr = JSON.stringify(filteredResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'analysis-results.json';
    link.click();
  }, [filteredResults]);

  const handleClearFilters = useCallback(() => {
    setFilters({
      search: '',
      trustScoreRange: [0, 100],
      status: [],
      dateRange: [null, null],
      fileTypes: [],
      reviewStatus: [],
      sortBy: 'uploadedAt',
      sortOrder: 'desc'
    });
  }, []);

  const handleMediaClick = useCallback((media: MediaAnalysisResult) => {
    setSelectedMedia(media);
    onMediaSelect?.(media);
  }, [onMediaSelect]);

  const handleBulkAction = useCallback((action: string, mediaIds: string[]) => {
    console.log(`Bulk action: ${action}`, mediaIds);
    onBulkAction?.(action, mediaIds);
  }, [onBulkAction]);

  const handleSendToReview = useCallback((mediaId: string) => {
    console.log('Send to review:', mediaId);
    // Implementation would trigger HITL workflow
  }, []);

  const handleFlag = useCallback((mediaId: string, reason: string) => {
    console.log('Flag content:', mediaId, reason);
    // Implementation would flag content
  }, []);

  return (
    <DashboardContainer className={className}>
      <Header>
        <Title>
          <BarChart3 size={32} />
          Analysis Results Dashboard
        </Title>
        <HeaderActions>
          <ActionButton variant="secondary" onClick={handleRefresh}>
            <RefreshCw size={16} />
            Refresh
          </ActionButton>
          <ActionButton variant="secondary" onClick={handleExport}>
            <Download size={16} />
            Export
          </ActionButton>
          <ActionButton variant="primary">
            <Settings size={16} />
            Settings
          </ActionButton>
        </HeaderActions>
      </Header>

      <DashboardStats stats={stats} />

      <DashboardFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={handleClearFilters}
        totalResults={results.length}
        filteredResults={filteredResults.length}
      />

      <MediaResultsTable
        results={filteredResults}
        selectedItems={selectedItems}
        onSelectionChange={setSelectedItems}
        onItemClick={handleMediaClick}
        onBulkAction={handleBulkAction}
        loading={loading}
      />

      {selectedMedia && (
        <DetailedAnalysisView
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onSendToReview={handleSendToReview}
          onFlag={handleFlag}
        />
      )}
    </DashboardContainer>
  );
};

export default AnalysisResultsDashboard;