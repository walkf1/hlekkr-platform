import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Grid, 
  List,
  ChevronDown,
  Calendar,
  BarChart3
} from 'lucide-react';
import TrustScoreDisplay from './TrustScoreDisplay';
import TrustScoreBreakdown from './TrustScoreBreakdown';
import TrustScoreHistoryChart from './TrustScoreHistoryChart';

interface MediaTrustScore {
  mediaId: string;
  filename: string;
  uploadTimestamp: string;
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
}

interface TrustScoreExplorerProps {
  data: MediaTrustScore[];
  onMediaSelect?: (mediaId: string) => void;
  onScoreRefresh?: (mediaId: string) => void;
  onExport?: (filters: any) => void;
  className?: string;
}

interface FilterState {
  scoreRange: 'all' | 'high' | 'medium' | 'low' | 'very_low';
  confidence: 'all' | 'high' | 'medium' | 'low';
  dateRange: 'all' | '24h' | '7d' | '30d' | '90d';
  searchTerm: string;
}

const Container = styled.div`
  background: white;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #E5E7EB;
  background: #F9FAFB;
`;

const Title = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  background: white;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #F9FAFB;
    border-color: #D1D5DB;
  }
`;

const ViewToggle = styled.div`
  display: flex;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  overflow: hidden;
`;

const ViewButton = styled.button<{ active: boolean }>`
  padding: 8px 12px;
  border: none;
  background: ${props => props.active ? '#3B82F6' : 'white'};
  color: ${props => props.active ? 'white' : '#6B7280'};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.active ? '#2563EB' : '#F9FAFB'};
  }
`;

const FiltersContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #E5E7EB;
  background: white;
  flex-wrap: wrap;
`;

const SearchInput = styled.div`
  position: relative;
  flex: 1;
  min-width: 200px;
`;

const SearchField = styled.input`
  width: 100%;
  padding: 8px 12px 8px 36px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #3B82F6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #6B7280;
`;

const FilterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #3B82F6;
  }
`;

const StatsBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  font-size: 14px;
  color: #6B7280;
`;

const Content = styled.div`
  padding: 24px;
`;

const GridView = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
`;

const ListView = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const MediaCard = styled.div`
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #3B82F6;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`;

const MediaHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const MediaInfo = styled.div`
  flex: 1;
`;

const MediaFilename = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
  word-break: break-all;
`;

const MediaTimestamp = styled.div`
  font-size: 12px;
  color: #6B7280;
`;

const MediaActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActionIcon = styled.button`
  padding: 4px;
  border: none;
  background: none;
  color: #6B7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:hover {
    background: #F3F4F6;
    color: #374151;
  }
`;

const MediaDetails = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
`;

const QuickStats = styled.div`
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6B7280;
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const NoResults = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #6B7280;
  text-align: center;
`;

const TrustScoreExplorer: React.FC<TrustScoreExplorerProps> = ({
  data,
  onMediaSelect,
  onScoreRefresh,
  onExport,
  className
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    scoreRange: 'all',
    confidence: 'all',
    dateRange: 'all',
    searchTerm: ''
  });

  // Filter data based on current filters
  const filteredData = data.filter(item => {
    // Score range filter
    if (filters.scoreRange !== 'all') {
      const scoreRange = item.compositeScore >= 80 ? 'high' :
                        item.compositeScore >= 60 ? 'medium' :
                        item.compositeScore >= 40 ? 'low' : 'very_low';
      if (scoreRange !== filters.scoreRange) return false;
    }

    // Confidence filter
    if (filters.confidence !== 'all' && item.confidence !== filters.confidence) {
      return false;
    }

    // Search term filter
    if (filters.searchTerm && !item.filename.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }

    return true;
  });

  // Calculate statistics
  const stats = {
    total: filteredData.length,
    high: filteredData.filter(item => item.compositeScore >= 80).length,
    medium: filteredData.filter(item => item.compositeScore >= 60 && item.compositeScore < 80).length,
    low: filteredData.filter(item => item.compositeScore >= 40 && item.compositeScore < 60).length,
    veryLow: filteredData.filter(item => item.compositeScore < 40).length,
    avgScore: filteredData.length > 0 ? 
      Math.round(filteredData.reduce((sum, item) => sum + item.compositeScore, 0) / filteredData.length) : 0
  };

  const handleMediaClick = (mediaId: string) => {
    setSelectedMedia(selectedMedia === mediaId ? null : mediaId);
    onMediaSelect?.(mediaId);
  };

  const handleRefresh = (mediaId: string) => {
    onScoreRefresh?.(mediaId);
  };

  const handleExport = () => {
    onExport?.(filters);
  };

  return (
    <Container className={className}>
      <Header>
        <Title>Trust Score Explorer</Title>
        <HeaderActions>
          <ActionButton onClick={handleExport}>
            <Download size={16} />
            Export
          </ActionButton>
          
          <ViewToggle>
            <ViewButton 
              active={viewMode === 'grid'} 
              onClick={() => setViewMode('grid')}
            >
              <Grid size={16} />
            </ViewButton>
            <ViewButton 
              active={viewMode === 'list'} 
              onClick={() => setViewMode('list')}
            >
              <List size={16} />
            </ViewButton>
          </ViewToggle>
        </HeaderActions>
      </Header>

      <FiltersContainer>
        <SearchInput>
          <SearchIcon>
            <Search size={16} />
          </SearchIcon>
          <SearchField
            placeholder="Search media files..."
            value={filters.searchTerm}
            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
          />
        </SearchInput>

        <FilterSelect
          value={filters.scoreRange}
          onChange={(e) => setFilters(prev => ({ ...prev, scoreRange: e.target.value as any }))}
        >
          <option value="all">All Scores</option>
          <option value="high">High Trust (80+)</option>
          <option value="medium">Medium Trust (60-79)</option>
          <option value="low">Low Trust (40-59)</option>
          <option value="very_low">Very Low Trust (&lt;40)</option>
        </FilterSelect>

        <FilterSelect
          value={filters.confidence}
          onChange={(e) => setFilters(prev => ({ ...prev, confidence: e.target.value as any }))}
        >
          <option value="all">All Confidence</option>
          <option value="high">High Confidence</option>
          <option value="medium">Medium Confidence</option>
          <option value="low">Low Confidence</option>
        </FilterSelect>

        <FilterSelect
          value={filters.dateRange}
          onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
        >
          <option value="all">All Time</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </FilterSelect>
      </FiltersContainer>

      <StatsBar>
        <div>
          Showing {stats.total} of {data.length} media files
        </div>
        <div>
          High: {stats.high} | Medium: {stats.medium} | Low: {stats.low} | Very Low: {stats.veryLow} | Avg: {stats.avgScore}
        </div>
      </StatsBar>

      <Content>
        {filteredData.length === 0 ? (
          <NoResults>
            <Search size={48} color="#D1D5DB" />
            <h3>No media files found</h3>
            <p>Try adjusting your filters or search terms</p>
          </NoResults>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <GridView>
                {filteredData.map(item => (
                  <MediaCard 
                    key={item.mediaId} 
                    onClick={() => handleMediaClick(item.mediaId)}
                  >
                    <MediaHeader>
                      <MediaInfo>
                        <MediaFilename>{item.filename}</MediaFilename>
                        <MediaTimestamp>
                          {new Date(item.uploadTimestamp).toLocaleDateString()}
                        </MediaTimestamp>
                      </MediaInfo>
                      <MediaActions>
                        <ActionIcon onClick={(e) => {
                          e.stopPropagation();
                          handleRefresh(item.mediaId);
                        }}>
                          <RefreshCw size={14} />
                        </ActionIcon>
                      </MediaActions>
                    </MediaHeader>

                    <MediaDetails>
                      <TrustScoreDisplay
                        score={item.compositeScore}
                        confidence={item.confidence}
                        size="small"
                        showIcon={true}
                      />
                      
                      <QuickStats>
                        <StatItem>
                          <BarChart3 size={12} />
                          {item.factors.length} factors
                        </StatItem>
                        <StatItem>
                          <Calendar size={12} />
                          {item.confidence}
                        </StatItem>
                      </QuickStats>
                    </MediaDetails>

                    {selectedMedia === item.mediaId && (
                      <div style={{ marginTop: '16px' }}>
                        <TrustScoreBreakdown
                          breakdown={item.breakdown}
                          factors={item.factors}
                          compositeScore={item.compositeScore}
                        />
                      </div>
                    )}
                  </MediaCard>
                ))}
              </GridView>
            ) : (
              <ListView>
                {filteredData.map(item => (
                  <MediaCard 
                    key={item.mediaId}
                    onClick={() => handleMediaClick(item.mediaId)}
                  >
                    <MediaHeader>
                      <MediaInfo>
                        <MediaFilename>{item.filename}</MediaFilename>
                        <MediaTimestamp>
                          Uploaded: {new Date(item.uploadTimestamp).toLocaleString()}
                        </MediaTimestamp>
                      </MediaInfo>
                      
                      <MediaDetails>
                        <TrustScoreDisplay
                          score={item.compositeScore}
                          confidence={item.confidence}
                          size="medium"
                          showIcon={true}
                          showLabel={true}
                        />
                        
                        <MediaActions>
                          <ActionIcon onClick={(e) => {
                            e.stopPropagation();
                            handleRefresh(item.mediaId);
                          }}>
                            <RefreshCw size={16} />
                          </ActionIcon>
                        </MediaActions>
                      </MediaDetails>
                    </MediaHeader>

                    {selectedMedia === item.mediaId && (
                      <div style={{ marginTop: '16px' }}>
                        <TrustScoreBreakdown
                          breakdown={item.breakdown}
                          factors={item.factors}
                          compositeScore={item.compositeScore}
                        />
                      </div>
                    )}
                  </MediaCard>
                ))}
              </ListView>
            )}
          </>
        )}
      </Content>
    </Container>
  );
};

export default TrustScoreExplorer;