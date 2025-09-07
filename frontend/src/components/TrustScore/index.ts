// Trust Score Visualization Components
export { default as TrustScoreDisplay } from './TrustScoreDisplay';
export { default as TrustScoreBreakdown } from './TrustScoreBreakdown';
export { default as TrustScoreHistoryChart } from './TrustScoreHistoryChart';
export { default as TrustScoreExplorer } from './TrustScoreExplorer';
export { default as TrustScoreDashboard } from './TrustScoreDashboard';

// Type definitions
export interface TrustScoreData {
  mediaId: string;
  compositeScore: number;
  confidence: 'low' | 'medium' | 'high' | 'error';
  calculationTimestamp: string;
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

export interface TrustScoreHistoryData extends TrustScoreData {
  version: string;
}

export interface MediaTrustScore extends TrustScoreData {
  filename: string;
  uploadTimestamp: string;
}