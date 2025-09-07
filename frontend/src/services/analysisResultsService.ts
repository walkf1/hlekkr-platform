import { MediaAnalysisResult, DashboardFilters } from '../components/AnalysisResults/AnalysisResultsDashboard';

export interface AnalysisResultsResponse {
  results: MediaAnalysisResult[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AnalysisStatsResponse {
  totalItems: number;
  avgTrustScore: number;
  highRiskItems: number;
  inReviewItems: number;
  completedReviews: number;
  threatReports: number;
  trendsData: {
    trustScoreTrend: number;
    highRiskTrend: number;
    reviewTrend: number;
    threatTrend: number;
  };
}

export interface ReviewActionRequest {
  mediaId: string;
  action: 'start_review' | 'complete_review' | 'escalate_review' | 'assign_moderator';
  data?: {
    decision?: 'confirm' | 'reject' | 'uncertain' | 'escalate';
    confidence?: number;
    notes?: string;
    tags?: string[];
    moderatorId?: string;
    escalationReason?: string;
  };
}

export interface BulkActionRequest {
  mediaIds: string[];
  action: 'bulk_review' | 'bulk_export' | 'bulk_flag' | 'bulk_assign';
  data?: {
    moderatorId?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  };
}

export interface ExportRequest {
  filters?: Partial<DashboardFilters>;
  format: 'csv' | 'json' | 'pdf';
  includeMedia?: boolean;
  fields?: string[];
}

export class AnalysisResultsService {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.authToken = authToken;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    return response.text() as unknown as T;
  }

  /**
   * Fetch analysis results with filtering and pagination
   */
  async getAnalysisResults(
    page: number = 1,
    limit: number = 20,
    filters: Partial<DashboardFilters> = {}
  ): Promise<AnalysisResultsResponse> {
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    // Add filter parameters
    if (filters.search) {
      queryParams.append('search', filters.search);
    }

    if (filters.trustScoreRange) {
      queryParams.append('trustScoreMin', filters.trustScoreRange[0].toString());
      queryParams.append('trustScoreMax', filters.trustScoreRange[1].toString());
    }

    if (filters.deepfakeProbability) {
      queryParams.append('deepfakeProbabilityMin', filters.deepfakeProbability[0].toString());
      queryParams.append('deepfakeProbabilityMax', filters.deepfakeProbability[1].toString());
    }

    if (filters.reviewStatus && filters.reviewStatus.length > 0) {
      queryParams.append('reviewStatus', filters.reviewStatus.join(','));
    }

    if (filters.sourceStatus && filters.sourceStatus.length > 0) {
      queryParams.append('sourceStatus', filters.sourceStatus.join(','));
    }

    if (filters.fileTypes && filters.fileTypes.length > 0) {
      queryParams.append('fileTypes', filters.fileTypes.join(','));
    }

    if (filters.moderators && filters.moderators.length > 0) {
      queryParams.append('moderators', filters.moderators.join(','));
    }

    if (filters.threatLevel && filters.threatLevel.length > 0) {
      queryParams.append('threatLevel', filters.threatLevel.join(','));
    }

    if (filters.dateRange?.start) {
      queryParams.append('startDate', filters.dateRange.start);
    }

    if (filters.dateRange?.end) {
      queryParams.append('endDate', filters.dateRange.end);
    }

    return this.makeRequest<AnalysisResultsResponse>(`/analysis/results?${queryParams}`);
  }

  /**
   * Get detailed analysis data for a specific media item
   */
  async getAnalysisDetail(mediaId: string): Promise<MediaAnalysisResult> {
    return this.makeRequest<MediaAnalysisResult>(`/analysis/results/${mediaId}`);
  }

  /**
   * Get dashboard statistics
   */
  async getAnalysisStats(filters: Partial<DashboardFilters> = {}): Promise<AnalysisStatsResponse> {
    const queryParams = new URLSearchParams();

    // Add filter parameters for stats calculation
    if (filters.dateRange?.start) {
      queryParams.append('startDate', filters.dateRange.start);
    }

    if (filters.dateRange?.end) {
      queryParams.append('endDate', filters.dateRange.end);
    }

    if (filters.fileTypes && filters.fileTypes.length > 0) {
      queryParams.append('fileTypes', filters.fileTypes.join(','));
    }

    const endpoint = queryParams.toString() 
      ? `/analysis/stats?${queryParams}` 
      : '/analysis/stats';

    return this.makeRequest<AnalysisStatsResponse>(endpoint);
  }

  /**
   * Get media URL for preview
   */
  async getMediaUrl(mediaId: string): Promise<{ url: string; expiresAt: string }> {
    return this.makeRequest<{ url: string; expiresAt: string }>(`/media/${mediaId}/url`);
  }

  /**
   * Perform review action on media item
   */
  async performReviewAction(request: ReviewActionRequest): Promise<{ success: boolean; message: string }> {
    return this.makeRequest<{ success: boolean; message: string }>('/analysis/review-action', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Perform bulk action on multiple media items
   */
  async performBulkAction(request: BulkActionRequest): Promise<{ 
    success: boolean; 
    message: string; 
    processedCount: number;
    failedCount: number;
    errors?: string[];
  }> {
    return this.makeRequest<{ 
      success: boolean; 
      message: string; 
      processedCount: number;
      failedCount: number;
      errors?: string[];
    }>('/analysis/bulk-action', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Export analysis results
   */
  async exportResults(request: ExportRequest): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/analysis/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Export failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.blob();
  }

  /**
   * Get available moderators for assignment
   */
  async getModerators(): Promise<{ id: string; name: string; role: string; workload: number }[]> {
    return this.makeRequest<{ id: string; name: string; role: string; workload: number }[]>('/moderators');
  }

  /**
   * Get review queue statistics
   */
  async getReviewQueueStats(): Promise<{
    pending: number;
    inReview: number;
    completed: number;
    escalated: number;
    avgReviewTime: number;
    moderatorWorkloads: { moderatorId: string; name: string; activeReviews: number }[];
  }> {
    return this.makeRequest('/analysis/review-queue/stats');
  }

  /**
   * Search for similar media items based on content analysis
   */
  async findSimilarMedia(mediaId: string, threshold: number = 0.8): Promise<{
    similarItems: Array<{
      mediaId: string;
      fileName: string;
      similarity: number;
      trustScore: number;
      uploadedAt: string;
    }>;
    totalFound: number;
  }> {
    return this.makeRequest(`/analysis/${mediaId}/similar?threshold=${threshold}`);
  }

  /**
   * Get processing timeline for a media item
   */
  async getProcessingTimeline(mediaId: string): Promise<{
    stages: Array<{
      stage: string;
      status: 'completed' | 'failed' | 'in_progress' | 'pending';
      startTime: string;
      endTime?: string;
      duration?: number;
      details?: Record<string, any>;
      error?: string;
    }>;
    totalDuration: number;
    currentStage?: string;
  }> {
    return this.makeRequest(`/analysis/${mediaId}/timeline`);
  }

  /**
   * Reprocess media item with updated models
   */
  async reprocessMedia(mediaId: string, options: {
    forceReprocess?: boolean;
    skipStages?: string[];
    priority?: 'low' | 'medium' | 'high';
  } = {}): Promise<{ 
    success: boolean; 
    message: string; 
    jobId: string;
  }> {
    return this.makeRequest(`/analysis/${mediaId}/reprocess`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * Get threat intelligence report for media item
   */
  async getThreatReport(mediaId: string): Promise<{
    reportId: string;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    indicators: Array<{
      type: string;
      value: string;
      confidence: number;
      source: string;
      firstSeen: string;
      lastSeen: string;
    }>;
    mitigationRecommendations: string[];
    relatedIncidents: Array<{
      incidentId: string;
      similarity: number;
      description: string;
      date: string;
    }>;
    generatedAt: string;
  }> {
    return this.makeRequest(`/analysis/${mediaId}/threat-report`);
  }

  /**
   * Update review status manually
   */
  async updateReviewStatus(
    mediaId: string, 
    status: 'pending' | 'in_review' | 'completed' | 'escalated' | 'not_required',
    data?: {
      moderatorId?: string;
      notes?: string;
      priority?: 'low' | 'medium' | 'high';
    }
  ): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/analysis/${mediaId}/review-status`, {
      method: 'PUT',
      body: JSON.stringify({ status, ...data }),
    });
  }

  /**
   * Get analysis model information and versions
   */
  async getModelInfo(): Promise<{
    deepfakeModel: {
      name: string;
      version: string;
      accuracy: number;
      lastUpdated: string;
    };
    sourceVerificationModel: {
      name: string;
      version: string;
      coverage: number;
      lastUpdated: string;
    };
    metadataAnalysisModel: {
      name: string;
      version: string;
      supportedFormats: string[];
      lastUpdated: string;
    };
  }> {
    return this.makeRequest('/analysis/models');
  }

  /**
   * Get real-time analysis metrics
   */
  async getRealtimeMetrics(): Promise<{
    activeAnalyses: number;
    queuedItems: number;
    avgProcessingTime: number;
    systemLoad: number;
    errorRate: number;
    throughputPerHour: number;
    lastUpdated: string;
  }> {
    return this.makeRequest('/analysis/metrics/realtime');
  }

  /**
   * Subscribe to real-time updates via WebSocket
   */
  subscribeToUpdates(
    onUpdate: (update: {
      type: 'analysis_complete' | 'review_status_change' | 'threat_detected' | 'system_alert';
      mediaId?: string;
      data: any;
      timestamp: string;
    }) => void,
    onError?: (error: Error) => void
  ): () => void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/analysis/updates';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        onUpdate(update);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        onError?.(error as Error);
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      onError?.(new Error('WebSocket connection error'));
    };

    ws.onclose = (event) => {
      if (!event.wasClean) {
        console.warn('WebSocket connection closed unexpectedly:', event);
        onError?.(new Error('WebSocket connection closed unexpectedly'));
      }
    };

    // Return cleanup function
    return () => {
      ws.close();
    };
  }
}

// Default service instance
export const analysisResultsService = new AnalysisResultsService(
  process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api'
);

// Helper functions for common operations
export const formatTrustScore = (score: number): string => {
  return `${score.toFixed(1)}%`;
};

export const getTrustScoreColor = (score: number): string => {
  if (score >= 80) return '#10b981'; // green
  if (score >= 60) return '#f59e0b'; // yellow
  if (score >= 40) return '#f97316'; // orange
  return '#ef4444'; // red
};

export const getReviewStatusColor = (status: string): string => {
  switch (status) {
    case 'completed': return '#10b981';
    case 'in_review': return '#3b82f6';
    case 'escalated': return '#f97316';
    case 'pending': return '#f59e0b';
    default: return '#6b7280';
  }
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

export const getFileTypeIcon = (fileType: string): string => {
  if (fileType.startsWith('video')) return '🎥';
  if (fileType.startsWith('image')) return '🖼️';
  if (fileType.startsWith('audio')) return '🎵';
  return '📄';
};

export const getRiskLevel = (trustScore: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (trustScore >= 80) return 'low';
  if (trustScore >= 60) return 'medium';
  if (trustScore >= 40) return 'high';
  return 'critical';
};

export const shouldRequireReview = (result: MediaAnalysisResult): boolean => {
  return (
    result.trustScore.composite < 60 ||
    result.deepfakeAnalysis.probability > 0.5 ||
    result.sourceVerification.status === 'suspicious' ||
    result.metadataAnalysis.verificationStatus === 'failed' ||
    (result.threatIntelligence && ['high', 'critical'].includes(result.threatIntelligence.threatLevel))
  );
};