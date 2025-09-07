import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AnalysisResultsApp } from '../AnalysisResultsApp';
import { AnalysisResultsService } from '../../../services/analysisResultsService';
import { MediaAnalysisResult } from '../AnalysisResultsDashboard';

// Mock the service
jest.mock('../../../services/analysisResultsService');

const mockService = AnalysisResultsService as jest.MockedClass<typeof AnalysisResultsService>;

// Mock data
const mockAnalysisResult: MediaAnalysisResult = {
  mediaId: 'test-media-1',
  fileName: 'test-video.mp4',
  fileType: 'video/mp4',
  fileSize: 1024000,
  uploadedAt: '2024-01-15T10:00:00Z',
  analyzedAt: '2024-01-15T10:05:00Z',
  trustScore: {
    composite: 45.5,
    breakdown: {
      deepfakeScore: 40.0,
      sourceReliabilityScore: 60.0,
      metadataConsistencyScore: 35.0,
      technicalQualityScore: 47.0
    },
    confidence: 'medium',
    version: '2.1.0'
  },
  deepfakeAnalysis: {
    probability: 0.75,
    confidence: 0.85,
    techniques: ['face_swap', 'voice_clone'],
    modelVersion: 'deepfake-detector-v3.2',
    processingTime: 15000
  },
  sourceVerification: {
    status: 'suspicious',
    domain: 'unknown-source.com',
    reputationScore: 25,
    verificationMethod: 'domain_analysis',
    lastChecked: '2024-01-15T10:03:00Z'
  },
  metadataAnalysis: {
    consistent: false,
    anomalies: ['timestamp_mismatch', 'location_inconsistency'],
    extractedData: {
      camera: 'Unknown',
      location: 'Conflicting GPS data',
      timestamp: '2024-01-10T15:30:00Z'
    },
    verificationStatus: 'failed'
  },
  reviewStatus: {
    status: 'pending',
    assignedModerator: undefined,
    reviewStarted: undefined,
    reviewCompleted: undefined,
    moderatorDecision: undefined,
    escalationReason: undefined
  },
  threatIntelligence: {
    reportGenerated: true,
    threatLevel: 'high',
    indicators: 5,
    reportId: 'threat-report-123'
  },
  processingHistory: [
    {
      stage: 'upload',
      status: 'completed',
      timestamp: '2024-01-15T10:00:00Z',
      duration: 1000
    },
    {
      stage: 'deepfake_analysis',
      status: 'completed',
      timestamp: '2024-01-15T10:02:00Z',
      duration: 15000
    },
    {
      stage: 'source_verification',
      status: 'completed',
      timestamp: '2024-01-15T10:04:00Z',
      duration: 8000
    },
    {
      stage: 'metadata_analysis',
      status: 'completed',
      timestamp: '2024-01-15T10:05:00Z',
      duration: 3000
    }
  ]
};

const mockAnalysisResults = {
  results: [mockAnalysisResult],
  totalCount: 1,
  currentPage: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false
};

const mockStats = {
  totalItems: 100,
  avgTrustScore: 65.5,
  highRiskItems: 15,
  inReviewItems: 8,
  completedReviews: 45,
  threatReports: 12,
  trendsData: {
    trustScoreTrend: 2.5,
    highRiskTrend: -1.2,
    reviewTrend: 5.8,
    threatTrend: 0.5
  }
};

const mockModerators = [
  { id: 'mod-1', name: 'Alice Johnson', role: 'Senior Moderator', workload: 3 },
  { id: 'mod-2', name: 'Bob Smith', role: 'Moderator', workload: 7 },
  { id: 'mod-3', name: 'Carol Davis', role: 'Junior Moderator', workload: 2 }
];

const mockQueueStats = {
  pending: 25,
  inReview: 8,
  completed: 45,
  escalated: 3,
  avgReviewTime: 1800000, // 30 minutes in ms
  moderatorWorkloads: mockModerators.map(mod => ({
    moderatorId: mod.id,
    name: mod.name,
    activeReviews: mod.workload
  }))
};

describe('AnalysisResultsApp HITL Integration', () => {
  let mockServiceInstance: jest.Mocked<AnalysisResultsService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock service instance
    mockServiceInstance = {
      getAnalysisResults: jest.fn(),
      getAnalysisDetail: jest.fn(),
      getAnalysisStats: jest.fn(),
      getMediaUrl: jest.fn(),
      performReviewAction: jest.fn(),
      performBulkAction: jest.fn(),
      exportResults: jest.fn(),
      getModerators: jest.fn(),
      getReviewQueueStats: jest.fn(),
      findSimilarMedia: jest.fn(),
      getProcessingTimeline: jest.fn(),
      reprocessMedia: jest.fn(),
      getThreatReport: jest.fn(),
      updateReviewStatus: jest.fn(),
      getModelInfo: jest.fn(),
      getRealtimeMetrics: jest.fn(),
      subscribeToUpdates: jest.fn()
    } as any;

    // Mock constructor to return our mock instance
    mockService.mockImplementation(() => mockServiceInstance);

    // Setup default mock responses
    mockServiceInstance.getAnalysisResults.mockResolvedValue(mockAnalysisResults);
    mockServiceInstance.getAnalysisStats.mockResolvedValue(mockStats);
    mockServiceInstance.getModerators.mockResolvedValue(mockModerators);
    mockServiceInstance.getReviewQueueStats.mockResolvedValue(mockQueueStats);
    mockServiceInstance.getAnalysisDetail.mockResolvedValue(mockAnalysisResult);
    mockServiceInstance.getMediaUrl.mockResolvedValue({ 
      url: 'https://example.com/media/test-video.mp4',
      expiresAt: '2024-01-15T12:00:00Z'
    });
    mockServiceInstance.performReviewAction.mockResolvedValue({ 
      success: true, 
      message: 'Review action completed successfully' 
    });
    mockServiceInstance.subscribeToUpdates.mockReturnValue(() => {});
  });

  test('renders dashboard with HITL workflow integration', async () => {
    render(<AnalysisResultsApp />);

    // Wait for initial data load
    await waitFor(() => {
      expect(screen.getByText('Analysis Results Dashboard')).toBeInTheDocument();
    });

    // Check that stats are displayed
    expect(screen.getByText('100')).toBeInTheDocument(); // Total items
    expect(screen.getByText('65.5%')).toBeInTheDocument(); // Avg trust score
    expect(screen.getByText('15')).toBeInTheDocument(); // High risk items
    expect(screen.getByText('8')).toBeInTheDocument(); // In review items

    // Check that the media item is displayed
    expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    expect(screen.getByText('45.5%')).toBeInTheDocument(); // Trust score
    expect(screen.getByText('pending')).toBeInTheDocument(); // Review status
  });

  test('navigates to detail view when media item is selected', async () => {
    render(<AnalysisResultsApp />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    // Click on media item
    fireEvent.click(screen.getByText('test-video.mp4'));

    // Wait for detail view to load
    await waitFor(() => {
      expect(screen.getByText('Back to Results')).toBeInTheDocument();
    });

    // Check detail view content
    expect(screen.getByText('Media Preview')).toBeInTheDocument();
    expect(screen.getByText('Trust Score Analysis')).toBeInTheDocument();
    expect(screen.getByText('Human Review Status')).toBeInTheDocument();
    expect(screen.getByText('Detailed Analysis Results')).toBeInTheDocument();
  });

  test('starts human review workflow', async () => {
    render(<AnalysisResultsApp />);

    // Wait for initial load and navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('Start Human Review')).toBeInTheDocument();
    });

    // Click start review button
    fireEvent.click(screen.getByText('Start Human Review'));

    // Verify review action was called
    await waitFor(() => {
      expect(mockServiceInstance.performReviewAction).toHaveBeenCalledWith({
        mediaId: 'test-media-1',
        action: 'start_review',
        data: {}
      });
    });

    // Check for success notification
    await waitFor(() => {
      expect(screen.getByText('Review Action Completed')).toBeInTheDocument();
    });
  });

  test('handles review completion workflow', async () => {
    // Mock in-review status
    const inReviewResult = {
      ...mockAnalysisResult,
      reviewStatus: {
        ...mockAnalysisResult.reviewStatus,
        status: 'in_review' as const,
        assignedModerator: 'Alice Johnson',
        reviewStarted: '2024-01-15T10:30:00Z'
      }
    };

    mockServiceInstance.getAnalysisDetail.mockResolvedValue(inReviewResult);

    render(<AnalysisResultsApp />);

    // Navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('IN REVIEW')).toBeInTheDocument();
    });

    // Check for review action buttons
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();

    // Click confirm button
    fireEvent.click(screen.getByText('Confirm'));

    // Verify review completion action was called
    await waitFor(() => {
      expect(mockServiceInstance.performReviewAction).toHaveBeenCalledWith({
        mediaId: 'test-media-1',
        action: 'complete_review',
        data: { decision: 'confirm' }
      });
    });
  });

  test('displays moderator information in review status', async () => {
    // Mock assigned moderator
    const assignedResult = {
      ...mockAnalysisResult,
      reviewStatus: {
        ...mockAnalysisResult.reviewStatus,
        status: 'in_review' as const,
        assignedModerator: 'Alice Johnson',
        reviewStarted: '2024-01-15T10:30:00Z'
      }
    };

    mockServiceInstance.getAnalysisDetail.mockResolvedValue(assignedResult);

    render(<AnalysisResultsApp />);

    // Navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Content Moderator')).toBeInTheDocument();
    });
  });

  test('shows completed review with moderator decision', async () => {
    // Mock completed review
    const completedResult = {
      ...mockAnalysisResult,
      reviewStatus: {
        ...mockAnalysisResult.reviewStatus,
        status: 'completed' as const,
        assignedModerator: 'Alice Johnson',
        reviewStarted: '2024-01-15T10:30:00Z',
        reviewCompleted: '2024-01-15T10:45:00Z',
        moderatorDecision: {
          decision: 'confirm' as const,
          confidence: 0.9,
          notes: 'High confidence deepfake detection. Multiple manipulation techniques identified.',
          tags: ['deepfake', 'high-risk', 'face-swap']
        }
      }
    };

    mockServiceInstance.getAnalysisDetail.mockResolvedValue(completedResult);

    render(<AnalysisResultsApp />);

    // Navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      expect(screen.getByText('Moderator Decision')).toBeInTheDocument();
      expect(screen.getByText('CONFIRM')).toBeInTheDocument();
      expect(screen.getByText('90.0%')).toBeInTheDocument(); // Confidence
      expect(screen.getByText('High confidence deepfake detection. Multiple manipulation techniques identified.')).toBeInTheDocument();
      expect(screen.getByText('deepfake')).toBeInTheDocument();
      expect(screen.getByText('high-risk')).toBeInTheDocument();
      expect(screen.getByText('face-swap')).toBeInTheDocument();
    });
  });

  test('handles escalated reviews', async () => {
    // Mock escalated review
    const escalatedResult = {
      ...mockAnalysisResult,
      reviewStatus: {
        ...mockAnalysisResult.reviewStatus,
        status: 'escalated' as const,
        assignedModerator: 'Alice Johnson',
        reviewStarted: '2024-01-15T10:30:00Z',
        escalationReason: 'Complex case requiring senior moderator review'
      }
    };

    mockServiceInstance.getAnalysisDetail.mockResolvedValue(escalatedResult);

    render(<AnalysisResultsApp />);

    // Navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('ESCALATED')).toBeInTheDocument();
      expect(screen.getByText('This case has been escalated to senior moderators for additional review.')).toBeInTheDocument();
      expect(screen.getByText('Escalation Reason: Complex case requiring senior moderator review')).toBeInTheDocument();
    });
  });

  test('handles real-time updates', async () => {
    let updateCallback: (update: any) => void = () => {};

    mockServiceInstance.subscribeToUpdates.mockImplementation((callback) => {
      updateCallback = callback;
      return () => {}; // cleanup function
    });

    render(<AnalysisResultsApp />);

    await waitFor(() => {
      expect(screen.getByText('Analysis Results Dashboard')).toBeInTheDocument();
    });

    // Simulate real-time update
    act(() => {
      updateCallback({
        type: 'review_status_change',
        mediaId: 'test-media-1',
        data: { newStatus: 'completed' },
        timestamp: '2024-01-15T11:00:00Z'
      });
    });

    // Check for notification
    await waitFor(() => {
      expect(screen.getByText('Review Status Updated')).toBeInTheDocument();
    });
  });

  test('handles threat detection alerts', async () => {
    let updateCallback: (update: any) => void = () => {};

    mockServiceInstance.subscribeToUpdates.mockImplementation((callback) => {
      updateCallback = callback;
      return () => {}; // cleanup function
    });

    render(<AnalysisResultsApp />);

    await waitFor(() => {
      expect(screen.getByText('Analysis Results Dashboard')).toBeInTheDocument();
    });

    // Simulate threat detection
    act(() => {
      updateCallback({
        type: 'threat_detected',
        mediaId: 'test-media-1',
        data: { threatLevel: 'high' },
        timestamp: '2024-01-15T11:00:00Z'
      });
    });

    // Check for threat notification
    await waitFor(() => {
      expect(screen.getByText('Threat Detected')).toBeInTheDocument();
      expect(screen.getByText('High-risk content detected in media item test-media-1')).toBeInTheDocument();
    });
  });

  test('filters results by review status', async () => {
    render(<AnalysisResultsApp />);

    await waitFor(() => {
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // Find and interact with review status filter
    const reviewStatusSelect = screen.getByDisplayValue('');
    fireEvent.change(reviewStatusSelect, { target: { value: 'pending' } });

    // Verify API was called with filter
    await waitFor(() => {
      expect(mockServiceInstance.getAnalysisResults).toHaveBeenCalledWith(
        1,
        20,
        expect.objectContaining({
          reviewStatus: ['pending']
        })
      );
    });
  });

  test('handles error states gracefully', async () => {
    // Mock API error
    mockServiceInstance.getAnalysisResults.mockRejectedValue(new Error('API Error'));

    render(<AnalysisResultsApp />);

    // Check for error notification
    await waitFor(() => {
      expect(screen.getByText('Error Loading Results')).toBeInTheDocument();
    });
  });

  test('navigates back to dashboard from detail view', async () => {
    render(<AnalysisResultsApp />);

    // Navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('Back to Results')).toBeInTheDocument();
    });

    // Click back button
    fireEvent.click(screen.getByText('Back to Results'));

    // Verify we're back on dashboard
    await waitFor(() => {
      expect(screen.getByText('Analysis Results Dashboard')).toBeInTheDocument();
    });
  });
});

describe('HITL Workflow Integration Edge Cases', () => {
  let mockServiceInstance: jest.Mocked<AnalysisResultsService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceInstance = {
      getAnalysisResults: jest.fn(),
      getAnalysisDetail: jest.fn(),
      getAnalysisStats: jest.fn(),
      getMediaUrl: jest.fn(),
      performReviewAction: jest.fn(),
      performBulkAction: jest.fn(),
      exportResults: jest.fn(),
      getModerators: jest.fn(),
      getReviewQueueStats: jest.fn(),
      findSimilarMedia: jest.fn(),
      getProcessingTimeline: jest.fn(),
      reprocessMedia: jest.fn(),
      getThreatReport: jest.fn(),
      updateReviewStatus: jest.fn(),
      getModelInfo: jest.fn(),
      getRealtimeMetrics: jest.fn(),
      subscribeToUpdates: jest.fn()
    } as any;

    mockService.mockImplementation(() => mockServiceInstance);
    mockServiceInstance.subscribeToUpdates.mockReturnValue(() => {});
  });

  test('handles review action failures', async () => {
    mockServiceInstance.getAnalysisResults.mockResolvedValue(mockAnalysisResults);
    mockServiceInstance.getAnalysisDetail.mockResolvedValue(mockAnalysisResult);
    mockServiceInstance.performReviewAction.mockRejectedValue(new Error('Review action failed'));

    render(<AnalysisResultsApp />);

    // Navigate to detail and attempt review
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('Start Human Review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Human Review'));

    // Check for error notification
    await waitFor(() => {
      expect(screen.getByText('Review Action Failed')).toBeInTheDocument();
    });
  });

  test('handles missing moderator assignment', async () => {
    const noModeratorResult = {
      ...mockAnalysisResult,
      reviewStatus: {
        ...mockAnalysisResult.reviewStatus,
        status: 'in_review' as const,
        assignedModerator: undefined,
        reviewStarted: '2024-01-15T10:30:00Z'
      }
    };

    mockServiceInstance.getAnalysisResults.mockResolvedValue(mockAnalysisResults);
    mockServiceInstance.getAnalysisDetail.mockResolvedValue(noModeratorResult);

    render(<AnalysisResultsApp />);

    // Navigate to detail view
    await waitFor(() => {
      expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('IN REVIEW')).toBeInTheDocument();
    });

    // Should not show moderator info section
    expect(screen.queryByText('Content Moderator')).not.toBeInTheDocument();
  });

  test('handles high-risk items requiring immediate review', async () => {
    const highRiskResult = {
      ...mockAnalysisResult,
      trustScore: {
        ...mockAnalysisResult.trustScore,
        composite: 15.0 // Very low trust score
      },
      deepfakeAnalysis: {
        ...mockAnalysisResult.deepfakeAnalysis,
        probability: 0.95 // Very high deepfake probability
      }
    };

    mockServiceInstance.getAnalysisResults.mockResolvedValue({
      ...mockAnalysisResults,
      results: [highRiskResult]
    });
    mockServiceInstance.getAnalysisDetail.mockResolvedValue(highRiskResult);

    render(<AnalysisResultsApp />);

    await waitFor(() => {
      expect(screen.getByText('15.0%')).toBeInTheDocument(); // Low trust score
    });

    // Navigate to detail view
    fireEvent.click(screen.getByText('test-video.mp4'));

    await waitFor(() => {
      expect(screen.getByText('Flag as High Risk')).toBeInTheDocument();
    });

    // Should show high risk indicators
    expect(screen.getByText('High Risk')).toBeInTheDocument();
  });
});