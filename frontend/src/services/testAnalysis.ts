import { analysisService } from './analysisService';

/**
 * Test function to verify API connectivity
 */
export async function testApiConnection(): Promise<boolean> {
  try {
    // Try a simple health check or test endpoint
    const testMediaId = 'test-media-id';
    
    // This will fail gracefully if API is not available
    await analysisService.getAnalysisStatus(testMediaId);
    
    console.log('✅ Real API is available');
    return true;
  } catch (error) {
    console.log('⚠️ Real API unavailable, using demo mode:', error);
    return false;
  }
}

/**
 * Test analysis workflow
 */
export async function testAnalysisWorkflow(mediaId: string): Promise<void> {
  try {
    console.log('🚀 Starting analysis for:', mediaId);
    
    // Start analysis
    const startResult = await analysisService.startAnalysis(mediaId);
    console.log('📊 Analysis started:', startResult);
    
    // Poll for completion
    const result = await analysisService.pollAnalysisCompletion(
      mediaId,
      (status) => {
        console.log('📈 Progress update:', status);
      },
      60000 // 1 minute timeout for testing
    );
    
    console.log('✅ Analysis completed:', result);
    
  } catch (error) {
    console.error('❌ Analysis test failed:', error);
    throw error;
  }
}

export default { testApiConnection, testAnalysisWorkflow };