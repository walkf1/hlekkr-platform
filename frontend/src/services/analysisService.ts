import { apiClient } from './apiClient';

export interface BedrockAnalysisResult {
  mediaId: string;
  trustScore: number;
  deepfakeConfidence: number;
  analysisResults: {
    deepfakeDetection: {
      probability: number;
      confidence: number;
      techniques: string[];
    };
    sourceVerification: {
      status: 'verified' | 'suspicious' | 'unknown';
      reputationScore: number;
      domain?: string;
    };
    metadataAnalysis: {
      consistent: boolean;
      anomalies: string[];
      extractedData: Record<string, any>;
    };
  };
  bedrockModels: {
    claudeSonnet: {
      confidence: number;
      techniques: string[];
      reasoning: string;
    };
    claudeHaiku: {
      confidence: number;
      techniques: string[];
      reasoning: string;
    };
    titan: {
      confidence: number;
      techniques: string[];
      reasoning: string;
    };
  };
  processingTime: number;
  status: 'processing' | 'completed' | 'failed';
}

export interface AnalysisStatus {
  mediaId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStage: 'security' | 'metadata' | 'bedrock' | 'hitl' | 'complete';
  estimatedTimeRemaining?: number;
}

export class AnalysisService {
  private apiEndpoint: string;

  constructor(apiEndpoint: string = process.env.REACT_APP_API_URL || '/api') {
    this.apiEndpoint = apiEndpoint;
  }

  /**
   * Start analysis for uploaded media
   */
  async startAnalysis(mediaId: string): Promise<{ analysisId: string; status: string }> {
    try {
      return await apiClient.post(`/media/${mediaId}/analyze`, {
        enableBedrockAnalysis: true,
        enableSecurityScan: true,
        enableMetadataExtraction: true,
        priority: 'normal'
      });
    } catch (error) {
      throw new Error(`Failed to start analysis: ${error}`);
    }
  }

  /**
   * Get analysis status
   */
  async getAnalysisStatus(mediaId: string): Promise<AnalysisStatus> {
    try {
      return await apiClient.get(`/media/${mediaId}/status`);
    } catch (error) {
      throw new Error(`Failed to get analysis status: ${error}`);
    }
  }

  /**
   * Get completed analysis results
   */
  async getAnalysisResults(mediaId: string): Promise<BedrockAnalysisResult> {
    try {
      return await apiClient.get(`/media/${mediaId}/analysis`);
    } catch (error) {
      throw new Error(`Failed to get analysis results: ${error}`);
    }
  }

  /**
   * Poll for analysis completion
   */
  async pollAnalysisCompletion(
    mediaId: string, 
    onProgress?: (status: AnalysisStatus) => void,
    maxWaitTime: number = 300000 // 5 minutes
  ): Promise<BedrockAnalysisResult> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          if (Date.now() - startTime > maxWaitTime) {
            reject(new Error('Analysis timeout'));
            return;
          }

          const status = await this.getAnalysisStatus(mediaId);
          onProgress?.(status);

          if (status.status === 'completed') {
            const results = await this.getAnalysisResults(mediaId);
            resolve(results);
          } else if (status.status === 'failed') {
            reject(new Error('Analysis failed'));
          } else {
            setTimeout(poll, pollInterval);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Get trust score for media
   */
  async getTrustScore(mediaId: string): Promise<{ trustScore: number; lastUpdated: string }> {
    try {
      return await apiClient.get(`/trust-scores/${mediaId}`);
    } catch (error) {
      throw new Error(`Failed to get trust score: ${error}`);
    }
  }

  /**
   * Calculate trust score (trigger recalculation)
   */
  async calculateTrustScore(mediaId: string): Promise<{ trustScore: number; components: any }> {
    try {
      return await apiClient.post(`/trust-scores/${mediaId}`, {
        recalculate: true
      });
    } catch (error) {
      throw new Error(`Failed to calculate trust score: ${error}`);
    }
  }
}

export const analysisService = new AnalysisService();
export default analysisService;