import React, { useState } from 'react';
import styled from 'styled-components';
import { 
  Eye, 
  Download, 
  MoreHorizontal,
  FileVideo,
  FileImage,
  FileAudio,
  File,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  ExternalLink
} from 'lucide-react';
import { MediaAnalysisResult } from './AnalysisResultsDashboard';

interface MediaResultsTableProps {
  results: MediaAnalysisResult[];
  selectedItems: Set<string>;
  onSelectionChange: (selectedItems: Set<string>) => void;
  onItemClick: (item: MediaAnalysisResult) => void;
  onBulkAction: (action: string, items: string[]) => void;
  loading?: boolean;
}

const TableContainer = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
`;

const TableTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const BulkActions = styled.div<{ visible: boolean }>`
  display: ${props => props.visible ? 'flex' : 'none'};
  align-items: center;
  gap: 12px;
`;

const BulkButton = styled.button`
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHead = styled.thead`
  background: #f9fafb;
`;

const TableRow = styled.tr<{ clickable?: boolean; selected?: boolean }>`
  border-bottom: 1px solid #e5e7eb;
  transition: background-color 0.2s ease;
  cursor: ${props => props.clickable ? 'pointer' : 'default'};
  background: ${props => props.selected ? '#eff6ff' : 'transparent'};
  
  &:hover {
    background: ${props => props.selected ? '#dbeafe' : '#f9fafb'};
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const TableHeader = styled.th`
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TableCell = styled.td`
  padding: 16px;
  font-size: 14px;
  color: #374151;
  vertical-align: middle;
`;

const MediaInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MediaIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
`;

const MediaDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const MediaName = styled.div`
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
`;

const MediaMeta = styled.div`
  font-size: 12px;
  color: #6b7280;
`;

const TrustScoreBadge = styled.div<{ score: number }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    if (props.score >= 80) return '#dcfce7';
    if (props.score >= 60) return '#fef3c7';
    if (props.score >= 40) return '#fed7aa';
    return '#fecaca';
  }};
  color: ${props => {
    if (props.score >= 80) return '#166534';
    if (props.score >= 60) return '#92400e';
    if (props.score >= 40) return '#c2410c';
    return '#991b1b';
  }};
`;

const StatusBadge = styled.div<{ status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    switch (props.status) {
      case 'completed': return '#dcfce7';
      case 'under_review': return '#e0e7ff';
      case 'reviewed': return '#ddd6fe';
      case 'flagged': return '#fecaca';
      case 'analyzing': return '#fef3c7';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'completed': return '#166534';
      case 'under_review': return '#1e40af';
      case 'reviewed': return '#6d28d9';
      case 'flagged': return '#991b1b';
      case 'analyzing': return '#92400e';
      default: return '#374151';
    }
  }};
`;

const ReviewInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ReviewStatus = styled.div`
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ActionButton = styled.button`
  padding: 6px;
  border: none;
  background: none;
  border-radius: 4px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
`;

const ActionsMenu = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Checkbox = styled.input`
  margin: 0;
  cursor: pointer;
`;

const LoadingRow = styled.tr`
  td {
    padding: 40px;
    text-align: center;
    color: #6b7280;
  }
`;

export const MediaResultsTable: React.FC<MediaResultsTableProps> = ({
  results,
  selectedItems,
  onSelectionChange,
  onItemClick,
  onBulkAction,
  loading = false
}) => {
  const [selectAll, setSelectAll] = useState(false);

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('video/')) return <FileVideo size={20} />;
    if (fileType.startsWith('image/')) return <FileImage size={20} />;
    if (fileType.startsWith('audio/')) return <FileAudio size={20} />;
    return <File size={20} />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={14} />;
      case 'flagged': return <AlertTriangle size={14} />;
      case 'analyzing': return <Clock size={14} />;
      case 'under_review': 
      case 'reviewed': return <User size={14} />;
      default: return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      onSelectionChange(new Set(results.map(r => r.mediaId)));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleItemSelect = (mediaId: string, checked: boolean) => {
    const newSelection = new Set(selectedItems);
    if (checked) {
      newSelection.add(mediaId);
    } else {
      newSelection.delete(mediaId);
    }
    onSelectionChange(newSelection);
    setSelectAll(newSelection.size === results.length);
  };

  return (
    <TableContainer>
      <TableHeader>
        <TableTitle>Analysis Results ({results.length})</TableTitle>
        <BulkActions visible={selectedItems.size > 0}>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>
            {selectedItems.size} selected
          </span>
          <BulkButton onClick={() => onBulkAction('export', Array.from(selectedItems))}>
            <Download size={14} style={{ marginRight: '4px' }} />
            Export
          </BulkButton>
          <BulkButton onClick={() => onBulkAction('review', Array.from(selectedItems))}>
            <User size={14} style={{ marginRight: '4px' }} />
            Send to Review
          </BulkButton>
        </BulkActions>
      </TableHeader>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>
              <Checkbox
                type="checkbox"
                checked={selectAll}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            </TableHeader>
            <TableHeader>Media</TableHeader>
            <TableHeader>Trust Score</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Human Review</TableHeader>
            <TableHeader>Analyzed</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <tbody>
          {loading ? (
            <LoadingRow>
              <td colSpan={7}>Loading analysis results...</td>
            </LoadingRow>
          ) : results.length === 0 ? (
            <LoadingRow>
              <td colSpan={7}>No results found</td>
            </LoadingRow>
          ) : (
            results.map((result) => (
              <TableRow 
                key={result.mediaId}
                clickable
                selected={selectedItems.has(result.mediaId)}
                onClick={() => onItemClick(result)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    type="checkbox"
                    checked={selectedItems.has(result.mediaId)}
                    onChange={(e) => handleItemSelect(result.mediaId, e.target.checked)}
                  />
                </TableCell>
                
                <TableCell>
                  <MediaInfo>
                    <MediaIcon>
                      {getFileIcon(result.fileType)}
                    </MediaIcon>
                    <MediaDetails>
                      <MediaName>{result.fileName}</MediaName>
                      <MediaMeta>
                        {formatFileSize(result.fileSize)} • {result.fileType}
                      </MediaMeta>
                    </MediaDetails>
                  </MediaInfo>
                </TableCell>

                <TableCell>
                  <TrustScoreBadge score={result.trustScore}>
                    <Shield size={12} />
                    {result.trustScore.toFixed(1)}%
                  </TrustScoreBadge>
                </TableCell>

                <TableCell>
                  <StatusBadge status={result.status}>
                    {getStatusIcon(result.status)}
                    {result.status.replace('_', ' ')}
                  </StatusBadge>
                </TableCell>

                <TableCell>
                  {result.humanReview ? (
                    <ReviewInfo>
                      <StatusBadge status={result.humanReview.status}>
                        {result.humanReview.status.replace('_', ' ')}
                      </StatusBadge>
                      {result.humanReview.assignedModerator && (
                        <ReviewStatus>
                          <User size={12} />
                          {result.humanReview.assignedModerator}
                        </ReviewStatus>
                      )}
                    </ReviewInfo>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>No review</span>
                  )}
                </TableCell>

                <TableCell>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {formatDate(result.analyzedAt)}
                  </div>
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ActionsMenu>
                    <ActionButton onClick={() => onItemClick(result)}>
                      <Eye size={16} />
                    </ActionButton>
                    <ActionButton onClick={() => window.open(`/api/media/${result.mediaId}/download`, '_blank')}>
                      <Download size={16} />
                    </ActionButton>
                    {result.humanReview?.reviewId && (
                      <ActionButton onClick={() => window.open(`/review/${result.humanReview?.reviewId}`, '_blank')}>
                        <ExternalLink size={16} />
                      </ActionButton>
                    )}
                    <ActionButton>
                      <MoreHorizontal size={16} />
                    </ActionButton>
                  </ActionsMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </tbody>
      </Table>
    </TableContainer>
  );
};

export default MediaResultsTable;