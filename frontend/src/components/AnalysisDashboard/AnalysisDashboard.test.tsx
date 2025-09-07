import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AnalysisResultsDashboard, MediaAnalysisResult } from './AnalysisResultsDashboard';
import { DashboardStats } from './DashboardStats';
import { MediaResultsTable } from './MediaResultsTable';
import { DetailedAnalysisView } from './DetailedAnalysisView';

// Mock data
const mockMediaResult: MediaAnalysisResult = {
  mediaId: 'test-media-001',
  fileName: 'test-video.mp4',
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
};

const mockStats = {
  totalMedia: 1247,
  analyzedToday: 89,
  averageTrustScore: 76.3,
  flaggedContent: 23,
  underReview: 12,
  completedReviews: 156,
  processingTime: 45.2,
  threatReports: 8
};

describe('AnalysisResultsDashboard', () => {
  test('renders dashboard header correctly', () => {
    render(<AnalysisResultsDashboard />);
    
    expect(screen.getByText('Analysis Results Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('handles refresh action', async () => {
    render(<AnalysisResultsDashboard />);
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Loading analysis results...')).toBeInTheDocument();
    });
  });

  test('handles export action', () => {
    // Mock URL.createObjectURL
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    global.URL.revokeObjectURL = jest.fn();
    
    // Mock document.createElement
    const mockLink = {
      href: '',
      download: '',
      click: jest.fn()
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

    render(<AnalysisResultsDashboard />);
    
    const exportButton = screen.getByText('Export');
    fireEvent.click(exportButton);
    
    expect(mockLink.click).toHaveBeenCalled();
  });

  test('displays media results when loaded', async () => {
    render(<AnalysisResultsDashboard />);
    
    // Wait for mock data to load
    await waitFor(() => {
      expect(screen.getByText('Analysis Results (1)')).toBeInTheDocument();
    });
  });
});

describe('DashboardStats', () => {
  test('renders all stat cards', () => {
    render(<DashboardStats stats={mockStats} />);
    
    expect(screen.getByText('1.2K')).toBeInTheDocument(); // Total media
    expect(screen.getByText('76.3%')).toBeInTheDocument(); // Average trust score
    expect(screen.getByText('23')).toBeInTheDocument(); // Flagged content
    expect(screen.getByText('12')).toBeInTheDocument(); // Under review
    expect(screen.getByText('45.2s')).toBeInTheDocument(); // Processing time
    expect(screen.getByText('8')).toBeInTheDocument(); // Threat reports
  });

  test('displays trends when provided', () => {
    const trends = {
      totalMedia: 1200,
      averageTrustScore: 74.1,
      flaggedContent: 25,
      processingTime: 48.5
    };

    render(<DashboardStats stats={mockStats} trends={trends} />);
    
    // Should show trend indicators
    expect(screen.getAllByText(/\d+\.\d+%/)).toHaveLength(4); // Trend percentages
  });

  test('formats large numbers correctly', () => {
    const largeStats = {
      ...mockStats,
      totalMedia: 1500000,
      analyzedToday: 2500
    };

    render(<DashboardStats stats={largeStats} />);
    
    expect(screen.getByText('1.5M')).toBeInTheDocument();
    expect(screen.getByText('2.5K')).toBeInTheDocument();
  });
});

describe('MediaResultsTable', () => {
  const mockResults = [mockMediaResult];

  test('renders table with media results', () => {
    render(
      <MediaResultsTable
        results={mockResults}
        selectedItems={new Set()}
        onSelectionChange={() => {}}
        onItemClick={() => {}}
        onBulkAction={() => {}}
      />
    );
    
    expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    expect(screen.getByText('23.5%')).toBeInTheDocument();
    expect(screen.getByText('under review')).toBeInTheDocument();
  });

  test('handles item selection', async () => {
    const onSelectionChange = jest.fn();
    
    render(
      <MediaResultsTable
        results={mockResults}
        selectedItems={new Set()}
        onSelectionChange={onSelectionChange}
        onItemClick={() => {}}
        onBulkAction={() => {}}
      />
    );
    
    const checkbox = screen.getAllByRole('checkbox')[1]; // First item checkbox
    fireEvent.click(checkbox);
    
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['test-media-001']));
  });

  test('handles select all', () => {
    const onSelectionChange = jest.fn();
    
    render(
      <MediaResultsTable
        results={mockResults}
        selectedItems={new Set()}
        onSelectionChange={onSelectionChange}
        onItemClick={() => {}}
        onBulkAction={() => {}}
      />
    );
    
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);
    
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['test-media-001']));
  });

  test('shows bulk actions when items selected', () => {
    render(
      <MediaResultsTable
        results={mockResults}
        selectedItems={new Set(['test-media-001'])}
        onSelectionChange={() => {}}
        onItemClick={() => {}}
        onBulkAction={() => {}}
      />
    );
    
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Send to Review')).toBeInTheDocument();
  });

  test('handles item click', () => {
    const onItemClick = jest.fn();
    
    render(
      <MediaResultsTable
        results={mockResults}
        selectedItems={new Set()}
        onSelectionChange={() => {}}
        onItemClick={onItemClick}
        onBulkAction={() => {}}
      />
    );
    
    const row = screen.getByText('test-video.mp4').closest('tr');
    if (row) {
      fireEvent.click(row);
      expect(onItemClick).toHaveBeenCalledWith(mockMediaResult);
    }
  });

  test('displays loading state', () => {
    render(
      <MediaResultsTable
        results={[]}
        selectedItems={new Set()}
        onSelectionChange={() => {}}
        onItemClick={() => {}}
        onBulkAction={() => {}}
        loading={true}
      />
    );
    
    expect(screen.getByText('Loading analysis results...')).toBeInTheDocument();
  });

  test('displays empty state', () => {
    render(
      <MediaResultsTable
        results={[]}
        selectedItems={new Set()}
        onSelectionChange={() => {}}
        onItemClick={() => {}}
        onBulkAction={() => {}}
        loading={false}
      />
    );
    
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });
});

describe('DetailedAnalysisView', () => {
  test('renders detailed analysis modal', () => {
    render(
      <DetailedAnalysisView
        media={mockMediaResult}
        onClose={() => {}}
      />
    );
    
    expect(screen.getByText('Detailed Analysis: test-video.mp4')).toBeInTheDocument();
    expect(screen.getByText('23%')).toBeInTheDocument(); // Trust score
    expect(screen.getByText('Deepfake Detection')).toBeInTheDocument();
    expect(screen.getByText('Source Verification')).toBeInTheDocument();
    expect(screen.getByText('Metadata Analysis')).toBeInTheDocument();
  });

  test('displays human review information', () => {
    render(
      <DetailedAnalysisView
        media={mockMediaResult}
        onClose={() => {}}
      />
    );
    
    expect(screen.getByText('Human Review')).toBeInTheDocument();
    expect(screen.getByText('moderator_jane')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  test('displays threat intelligence when available', () => {
    render(
      <DetailedAnalysisView
        media={mockMediaResult}
        onClose={() => {}}
      />
    );
    
    expect(screen.getByText('Threat Intelligence')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Indicators count
    expect(screen.getByText('high')).toBeInTheDocument(); // Severity
  });

  test('handles close action', () => {
    const onClose = jest.fn();
    
    render(
      <DetailedAnalysisView
        media={mockMediaResult}
        onClose={onClose}
      />
    );
    
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalled();
  });

  test('handles send to review action', () => {
    const onSendToReview = jest.fn();
    const mediaWithoutReview = { ...mockMediaResult, humanReview: undefined };
    
    render(
      <DetailedAnalysisView
        media={mediaWithoutReview}
        onClose={() => {}}
        onSendToReview={onSendToReview}
      />
    );
    
    const sendToReviewButton = screen.getByText('Send to Review');
    fireEvent.click(sendToReviewButton);
    
    expect(onSendToReview).toHaveBeenCalledWith('test-media-001');
  });

  test('handles flag action', () => {
    const onFlag = jest.fn();
    
    render(
      <DetailedAnalysisView
        media={mockMediaResult}
        onClose={() => {}}
        onFlag={onFlag}
      />
    );
    
    const flagButton = screen.getByText('Flag Content');
    fireEvent.click(flagButton);
    
    expect(onFlag).toHaveBeenCalledWith('test-media-001', expect.any(String));
  });
});