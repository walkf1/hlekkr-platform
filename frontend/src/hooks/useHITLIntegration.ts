import { useState, useEffect, useCallback, useMemo } from 'react';
import { analysisResultsService } from '../services/analysisResultsService';
import { MediaAnalysisResult } from '../components/AnalysisResults/AnalysisResultsDashboard';

export interface HITLWorkflowState {
  pendingReviews: MediaAnalysisResult[];
  inReviewItems: MediaAnalysisResult[];
  completedReviews: MediaAnalysisResult[];
  escalatedItems: MediaAnalysisResult[];
  moderatorWorkloads: Array<{
    moderatorId: string;
    name: string;
    activeReviews: number;
    completedToday: number;
    avgReviewTime: number;
  }>;
  queueStats: {
    totalPending: number;
    avgWaitTime: number;
    priorityDistribution: {
      high: number;
      medium: number;
      low: number;
    };
  };
}

export interface HITLActions {
  startReview: (mediaId: string, moderatorId?: string) => Promise<void>;
  completeReview: (mediaId: string, decision: {
    decision: 'confirm' | 'reject' | 'uncertain' | 'escalate';
    confidence: number;
    notes: string;
    tags: string[];
  }) => Promise<void>;
  escalateReview: (mediaId: string, reason: string) => Promise<void>;
  assignModerator: (mediaId: string, moderatorId: string) => Promise<void>;
  bulkAssign: (mediaIds: string[], moderatorId: string) => Promise<void>;
  updatePriority: (mediaId: string, priority: 'low' | 'medium' | 'high') => Promise<void>;
}

export interface UseHITLIntegrationOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  moderatorId?: string;
  onReviewStatusChange?: (mediaId: string, newStatus: string) => void;
  onError?: (error: Error) => void;
}

export const useHITLIntegration = (options: UseHITLIntegrationOptions = {}) => {
  const {
    autoRefresh = true,
    refreshInterval = 30000,
    moderatorId,
    onReviewStatusChange,
    onError
  } = options;

  const [workflowState, setWorkflowState] = useState<HITLWorkflowState>({
    pendingReviews: [],
    inReviewItems: [],
    completedReviews: [],
    escalatedItems: [],
    moderatorWorkloads: [],
    queueStats: {
      totalPending: 0,
      avgWaitTime: 0,
      priorityDistribution: { high: 0, medium: 0, low: 0 }
    }
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch workflow data
  const fetchWorkflowData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch pending reviews
      const pendingResponse = await analysisResultsService.getAnalysisResults(1, 100, {
        reviewStatus: ['pending']
      });

      // Fetch in-review items
      const inReviewResponse = await analysisResultsService.getAnalysisResults(1, 100, {
        reviewStatus: ['in_review'],
        ...(moderatorId && { moderators: [moderatorId] })
      });

      // Fetch completed reviews (last 24 hours)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const completedResponse = await analysisResultsService.getAnalysisResults(1, 100, {
        reviewStatus: ['completed'],
        dateRange: {
          start: yesterday.toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0]
        }
      });

      // Fetch escalated items
      const escalatedResponse = await analysisResultsService.getAnalysisResults(1, 100, {
        reviewStatus: ['escalated']
      });

      // Fetch queue statistics
      const queueStats = await analysisResultsService.getReviewQueueStats();

      // Fetch moderator workloads
      const moderators = await analysisResultsService.getModerators();

      setWorkflowState({
        pendingReviews: pendingResponse.results,
        inReviewItems: inReviewResponse.results,
        completedReviews: completedResponse.results,
        escalatedItems: escalatedResponse.results,
        moderatorWorkloads: moderators.map(mod => ({
          moderatorId: mod.id,
          name: mod.name,
          activeReviews: mod.workload,
          completedToday: 0, // This would come from a separate endpoint
          avgReviewTime: 0    // This would come from a separate endpoint
        })),
        queueStats: {
          totalPending: queueStats.pending,
          avgWaitTime: queueStats.avgReviewTime,
          priorityDistribution: {
            high: Math.floor(queueStats.pending * 0.2), // Estimated distribution
            medium: Math.floor(queueStats.pending * 0.5),
            low: Math.floor(queueStats.pending * 0.3)
          }
        }
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch workflow data');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [moderatorId, onError]);

  // HITL Actions
  const actions: HITLActions = useMemo(() => ({
    startReview: async (mediaId: string, assignedModeratorId?: string) => {
      try {
        await analysisResultsService.performReviewAction({
          mediaId,
          action: 'start_review',
          data: {
            ...(assignedModeratorId && { moderatorId: assignedModeratorId })
          }
        });

        onReviewStatusChange?.(mediaId, 'in_review');
        await fetchWorkflowData(); // Refresh data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to start review');
        onError?.(error);
        throw error;
      }
    },

    completeReview: async (mediaId: string, decision) => {
      try {
        await analysisResultsService.performReviewAction({
          mediaId,
          action: 'complete_review',
          data: decision
        });

        onReviewStatusChange?.(mediaId, 'completed');
        await fetchWorkflowData(); // Refresh data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to complete review');
        onError?.(error);
        throw error;
      }
    },

    escalateReview: async (mediaId: string, reason: string) => {
      try {
        await analysisResultsService.performReviewAction({
          mediaId,
          action: 'escalate_review',
          data: { escalationReason: reason }
        });

        onReviewStatusChange?.(mediaId, 'escalated');
        await fetchWorkflowData(); // Refresh data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to escalate review');
        onError?.(error);
        throw error;
      }
    },

    assignModerator: async (mediaId: string, assignedModeratorId: string) => {
      try {
        await analysisResultsService.performReviewAction({
          mediaId,
          action: 'assign_moderator',
          data: { moderatorId: assignedModeratorId }
        });

        await fetchWorkflowData(); // Refresh data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to assign moderator');
        onError?.(error);
        throw error;
      }
    },

    bulkAssign: async (mediaIds: string[], assignedModeratorId: string) => {
      try {
        await analysisResultsService.performBulkAction({
          mediaIds,
          action: 'bulk_assign',
          data: { moderatorId: assignedModeratorId }
        });

        await fetchWorkflowData(); // Refresh data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to bulk assign');
        onError?.(error);
        throw error;
      }
    },

    updatePriority: async (mediaId: string, priority: 'low' | 'medium' | 'high') => {
      try {
        await analysisResultsService.updateReviewStatus(mediaId, 'pending', { priority });
        await fetchWorkflowData(); // Refresh data
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update priority');
        onError?.(error);
        throw error;
      }
    }
  }), [fetchWorkflowData, onReviewStatusChange, onError]);

  // Computed values
  const computedStats = useMemo(() => {
    const totalItems = workflowState.pendingReviews.length + 
                      workflowState.inReviewItems.length + 
                      workflowState.completedReviews.length + 
                      workflowState.escalatedItems.length;

    const highRiskPending = workflowState.pendingReviews.filter(
      item => item.trustScore.composite < 40
    ).length;

    const avgTrustScore = workflowState.pendingReviews.length > 0
      ? workflowState.pendingReviews.reduce((sum, item) => sum + item.trustScore.composite, 0) / workflowState.pendingReviews.length
      : 0;

    const moderatorEfficiency = workflowState.moderatorWorkloads.map(mod => ({
      ...mod,
      efficiency: mod.avgReviewTime > 0 ? mod.completedToday / mod.avgReviewTime : 0
    }));

    return {
      totalItems,
      highRiskPending,
      avgTrustScore,
      moderatorEfficiency,
      reviewBacklog: workflowState.pendingReviews.length,
      escalationRate: totalItems > 0 ? (workflowState.escalatedItems.length / totalItems) * 100 : 0
    };
  }, [workflowState]);

  // Auto-refresh
  useEffect(() => {
    fetchWorkflowData();

    if (autoRefresh) {
      const interval = setInterval(fetchWorkflowData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchWorkflowData, autoRefresh, refreshInterval]);

  // Real-time updates subscription
  useEffect(() => {
    const unsubscribe = analysisResultsService.subscribeToUpdates(
      (update) => {
        if (update.type === 'review_status_change' && update.mediaId) {
          onReviewStatusChange?.(update.mediaId, update.data.newStatus);
          // Refresh workflow data to get latest state
          fetchWorkflowData();
        }
      },
      onError
    );

    return unsubscribe;
  }, [fetchWorkflowData, onReviewStatusChange, onError]);

  // Helper functions
  const getNextReviewItem = useCallback((moderatorId?: string): MediaAnalysisResult | null => {
    // Sort pending reviews by priority and trust score
    const sortedPending = [...workflowState.pendingReviews].sort((a, b) => {
      // First by trust score (lower scores first - higher risk)
      if (a.trustScore.composite !== b.trustScore.composite) {
        return a.trustScore.composite - b.trustScore.composite;
      }
      
      // Then by upload date (older first)
      return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
    });

    return sortedPending[0] || null;
  }, [workflowState.pendingReviews]);

  const getModeratorWorkload = useCallback((moderatorId: string) => {
    return workflowState.moderatorWorkloads.find(mod => mod.moderatorId === moderatorId);
  }, [workflowState.moderatorWorkloads]);

  const isModeratorAvailable = useCallback((moderatorId: string, maxWorkload: number = 10): boolean => {
    const workload = getModeratorWorkload(moderatorId);
    return workload ? workload.activeReviews < maxWorkload : false;
  }, [getModeratorWorkload]);

  const getRecommendedModerator = useCallback(): string | null => {
    // Find moderator with lowest workload
    const availableModerators = workflowState.moderatorWorkloads
      .filter(mod => mod.activeReviews < 10) // Max 10 active reviews
      .sort((a, b) => a.activeReviews - b.activeReviews);

    return availableModerators[0]?.moderatorId || null;
  }, [workflowState.moderatorWorkloads]);

  return {
    // State
    workflowState,
    loading,
    error,
    
    // Actions
    actions,
    
    // Computed stats
    stats: computedStats,
    
    // Helper functions
    getNextReviewItem,
    getModeratorWorkload,
    isModeratorAvailable,
    getRecommendedModerator,
    
    // Refresh function
    refresh: fetchWorkflowData
  };
};

export default useHITLIntegration;