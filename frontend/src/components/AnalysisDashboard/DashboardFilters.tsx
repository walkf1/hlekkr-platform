import React, { useState } from 'react';
import styled from 'styled-components';
import { 
  Search, 
  Filter, 
  X, 
  Calendar,
  ChevronDown,
  SlidersHorizontal
} from 'lucide-react';
import { DashboardFilters } from './AnalysisResultsDashboard';

interface DashboardFiltersProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onClearFilters: () => void;
  totalResults: number;
  filteredResults: number;
}

const FiltersContainer = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 24px;
`;

const FiltersHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const FiltersTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ResultsCount = styled.div`
  font-size: 14px;
  color: #6b7280;
`;

const ClearButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }
`;

const FiltersGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
  
  @media (max-width: 1024px) {
    grid-template-columns: 1fr 1fr;
  }
  
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const SearchContainer = styled.div`
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 16px 12px 44px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  background: #f9fafb;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    background: white;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  &::placeholder {
    color: #9ca3af;
  }
`;

const SearchIcon = styled(Search)`
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
`;

const FilterSelect = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  background: #f9fafb;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    background: white;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const RangeContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RangeInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
`;

const RangeSeparator = styled.span`
  color: #6b7280;
  font-size: 14px;
`;

const AdvancedFilters = styled.div<{ expanded: boolean }>`
  display: ${props => props.expanded ? 'block' : 'none'};
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
`;

const AdvancedGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FilterLabel = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: #374151;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  
  input[type="checkbox"] {
    margin: 0;
  }
`;

const ToggleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
  
  &:hover {
    color: #2563eb;
  }
`;

export const DashboardFiltersComponent: React.FC<DashboardFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  totalResults,
  filteredResults
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleTrustScoreRangeChange = (min: number, max: number) => {
    onFiltersChange({ ...filters, trustScoreRange: [min, max] });
  };

  const handleStatusChange = (status: string[]) => {
    onFiltersChange({ ...filters, status });
  };

  const handleReviewStatusChange = (reviewStatus: string[]) => {
    onFiltersChange({ ...filters, reviewStatus });
  };

  const handleFileTypesChange = (fileTypes: string[]) => {
    onFiltersChange({ ...filters, fileTypes });
  };

  const handleSortChange = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    onFiltersChange({ ...filters, sortBy: sortBy as any, sortOrder });
  };

  const statusOptions = [
    { value: 'analyzing', label: 'Analyzing' },
    { value: 'completed', label: 'Completed' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'reviewed', label: 'Reviewed' },
    { value: 'flagged', label: 'Flagged' }
  ];

  const reviewStatusOptions = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Review Completed' }
  ];

  const fileTypeOptions = [
    { value: 'video/mp4', label: 'MP4 Video' },
    { value: 'video/avi', label: 'AVI Video' },
    { value: 'image/jpeg', label: 'JPEG Image' },
    { value: 'image/png', label: 'PNG Image' },
    { value: 'audio/mp3', label: 'MP3 Audio' },
    { value: 'audio/wav', label: 'WAV Audio' }
  ];

  return (
    <FiltersContainer>
      <FiltersHeader>
        <FiltersTitle>
          <Filter size={20} />
          Filters & Search
        </FiltersTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <ResultsCount>
            Showing {filteredResults.toLocaleString()} of {totalResults.toLocaleString()} results
          </ResultsCount>
          <ClearButton onClick={onClearFilters}>
            <X size={14} />
            Clear All
          </ClearButton>
        </div>
      </FiltersHeader>

      <FiltersGrid>
        <SearchContainer>
          <SearchIcon size={20} />
          <SearchInput
            type="text"
            placeholder="Search by filename, media ID, or content..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </SearchContainer>

        <FilterSelect
          value={filters.status.join(',')}
          onChange={(e) => handleStatusChange(e.target.value ? e.target.value.split(',') : [])}
        >
          <option value="">All Statuses</option>
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>

        <RangeContainer>
          <RangeInput
            type="number"
            min="0"
            max="100"
            placeholder="Min"
            value={filters.trustScoreRange[0]}
            onChange={(e) => handleTrustScoreRangeChange(Number(e.target.value), filters.trustScoreRange[1])}
          />
          <RangeSeparator>-</RangeSeparator>
          <RangeInput
            type="number"
            min="0"
            max="100"
            placeholder="Max"
            value={filters.trustScoreRange[1]}
            onChange={(e) => handleTrustScoreRangeChange(filters.trustScoreRange[0], Number(e.target.value))}
          />
        </RangeContainer>

        <FilterSelect
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split('-');
            handleSortChange(sortBy, sortOrder as 'asc' | 'desc');
          }}
        >
          <option value="uploadedAt-desc">Newest First</option>
          <option value="uploadedAt-asc">Oldest First</option>
          <option value="trustScore-desc">Highest Trust Score</option>
          <option value="trustScore-asc">Lowest Trust Score</option>
          <option value="fileName-asc">Name A-Z</option>
          <option value="fileName-desc">Name Z-A</option>
        </FilterSelect>
      </FiltersGrid>

      <ToggleButton onClick={() => setShowAdvanced(!showAdvanced)}>
        <SlidersHorizontal size={16} />
        {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        <ChevronDown size={16} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none' }} />
      </ToggleButton>

      <AdvancedFilters expanded={showAdvanced}>
        <AdvancedGrid>
          <FilterGroup>
            <FilterLabel>Review Status</FilterLabel>
            <CheckboxGroup>
              {reviewStatusOptions.map(option => (
                <CheckboxItem key={option.value}>
                  <input
                    type="checkbox"
                    checked={filters.reviewStatus.includes(option.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleReviewStatusChange([...filters.reviewStatus, option.value]);
                      } else {
                        handleReviewStatusChange(filters.reviewStatus.filter(s => s !== option.value));
                      }
                    }}
                  />
                  {option.label}
                </CheckboxItem>
              ))}
            </CheckboxGroup>
          </FilterGroup>

          <FilterGroup>
            <FilterLabel>File Types</FilterLabel>
            <CheckboxGroup>
              {fileTypeOptions.map(option => (
                <CheckboxItem key={option.value}>
                  <input
                    type="checkbox"
                    checked={filters.fileTypes.includes(option.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleFileTypesChange([...filters.fileTypes, option.value]);
                      } else {
                        handleFileTypesChange(filters.fileTypes.filter(t => t !== option.value));
                      }
                    }}
                  />
                  {option.label}
                </CheckboxItem>
              ))}
            </CheckboxGroup>
          </FilterGroup>
        </AdvancedGrid>
      </AdvancedFilters>
    </FiltersContainer>
  );
};

export default DashboardFiltersComponent;