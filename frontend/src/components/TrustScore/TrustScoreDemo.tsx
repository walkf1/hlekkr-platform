import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Pause, RotateCcw, Download } from 'lucide-react';
import TrustScoreDisplay from './TrustScoreDisplay';
import TrustScoreBreakdown from './TrustScoreBreakdown';
import TrustScoreHistoryChart from './TrustScoreHistoryChart';
import TrustScoreExplorer from './TrustScoreExplorer';

// Mock data for demonstration
const mockTrustScoreData = {
  mediaId: 'demo-media-123',
  compositeScore: 85.5,
  confidence: 'high' as const,
  calculationTimestamp: new Date().toISOString(),
  breakdown: {
    deepfakeScore: 90.0,
    sourceReliabilityScore: 80.5,
    metadataConsistencyScore: 85.0,
    historicalPatternScore: 88.0,
    technicalIntegrityScore: 83.5
  },
  factors: [
    {
      category: 'deepfake_detection',
      impact: 'positive' as const,
      description: 'Low deepfake confidence detected (15%)',
      weight: 'high' as const
    },
    {
      category: 'source_verification',
      impact: 'positive' as const,
      description: 'Source verified from trusted news outlet',
      weight: 'high' as const
    },
    {
      category: 'metadata_validation',
      impact: 'neutral' as const,
      description: 'Metadata consistency check passed',
      weight: 'medium' as const
    },
    {
      category: 'technical_validation',
      impact: 'positive' as const,
      description: 'File integrity verified',
      weight: 'medium' as const
    }
  ],
  recommendations: [
    'High trust content suitable for publication',
    'Minimal additional verification required',
    'Consider cross-referencing with other sources for complete validation'
  ]
};

const mockHistoryData = Array.from({ length: 10 }, (_, i) => ({
  ...mockTrustScoreData,
  version: `v${i + 1}`,
  calculationTimestamp: new Date(Date.now() - (9 - i) * 24 * 60 * 60 * 1000).toISOString(),
  compositeScore: 75 + Math.random() * 20,
  breakdown: {
    deepfakeScore: 80 + Math.random() * 15,
    sourceReliabilityScore: 75 + Math.random() * 20,
    metadataConsistencyScore: 80 + Math.random() * 15,
    historicalPatternScore: 85 + Math.random() * 10,
    technicalIntegrityScore: 80 + Math.random() * 15
  }
}));

const mockMediaData = Array.from({ length: 20 }, (_, i) => ({
  ...mockTrustScoreData,
  mediaId: `media-${i + 1}`,
  filename: `sample-video-${i + 1}.mp4`,
  uploadTimestamp: new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString(),
  compositeScore: 30 + Math.random() * 70,
  confidence: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as any
}));

const Container = styled.div`
  padding: 24px;
  background: #F9FAFB;
  min-height: 100vh;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 40px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #6B7280;
  max-width: 600px;
  margin: 0 auto;
`;

const DemoSection = styled.div`
  margin-bottom: 48px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #111827;
`;

const SectionDescription = styled.p`
  font-size: 14px;
  color: #6B7280;
  margin-bottom: 16px;
`;

const DemoControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ControlButton = styled.button`
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

const ComponentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const ComponentShowcase = styled.div`
  background: white;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const ComponentTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 16px;
`;

const ScoreVariations = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 16px;
  flex-wrap: wrap;
`;

const VariationItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const VariationLabel = styled.div`
  font-size: 12px;
  color: #6B7280;
  font-weight: 500;
`;

const TrustScoreDemo: React.FC = () => {
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [currentScore, setCurrentScore] = useState(85.5);

  const handlePlayAnimation = () => {
    setAnimationPlaying(true);
    
    // Animate score changes
    const interval = setInterval(() => {
      setCurrentScore(prev => {
        const newScore = prev + (Math.random() - 0.5) * 10;
        return Math.max(0, Math.min(100, newScore));
      });
    }, 1000);

    // Stop animation after 10 seconds
    setTimeout(() => {
      clearInterval(interval);
      setAnimationPlaying(false);
    }, 10000);
  };

  const handleReset = () => {
    setCurrentScore(85.5);
    setAnimationPlaying(false);
  };

  const handleExport = () => {
    const demoData = {
      trustScore: mockTrustScoreData,
      history: mockHistoryData,
      mediaCollection: mockMediaData
    };
    
    const blob = new Blob([JSON.stringify(demoData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trust-score-demo-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Container>
      <Header>
        <Title>Trust Score Visualization Components</Title>
        <Subtitle>
          Interactive demonstration of Hlekkr's trust score visualization system featuring 
          color-coded displays, detailed breakdowns, historical trends, and comprehensive exploration tools.
        </Subtitle>
      </Header>

      {/* Trust Score Display Variations */}
      <DemoSection>
        <SectionHeader>
          <div>
            <SectionTitle>Trust Score Display</SectionTitle>
            <SectionDescription>
              Color-coded trust score displays with confidence indicators and multiple size options.
              Green (80+) = High Trust, Yellow (60-79) = Medium Trust, Red (40-59) = Low Trust, Dark Red (&lt;40) = Very Low Trust.
            </SectionDescription>
          </div>
          <DemoControls>
            <ControlButton onClick={handlePlayAnimation} disabled={animationPlaying}>
              {animationPlaying ? <Pause size={16} /> : <Play size={16} />}
              {animationPlaying ? 'Playing' : 'Animate'}
            </ControlButton>
            <ControlButton onClick={handleReset}>
              <RotateCcw size={16} />
              Reset
            </ControlButton>
          </DemoControls>
        </SectionHeader>

        <ComponentGrid>
          <ComponentShowcase>
            <ComponentTitle>Size Variations</ComponentTitle>
            <ScoreVariations>
              <VariationItem>
                <TrustScoreDisplay score={currentScore} confidence="high" size="small" showIcon={true} />
                <VariationLabel>Small</VariationLabel>
              </VariationItem>
              <VariationItem>
                <TrustScoreDisplay score={currentScore} confidence="high" size="medium" showIcon={true} />
                <VariationLabel>Medium</VariationLabel>
              </VariationItem>
              <VariationItem>
                <TrustScoreDisplay score={currentScore} confidence="high" size="large" showIcon={true} />
                <VariationLabel>Large</VariationLabel>
              </VariationItem>
            </ScoreVariations>
          </ComponentShowcase>

          <ComponentShowcase>
            <ComponentTitle>Score Ranges</ComponentTitle>
            <ScoreVariations>
              <VariationItem>
                <TrustScoreDisplay score={95} confidence="high" size="medium" showIcon={true} showLabel={true} />
                <VariationLabel>High Trust</VariationLabel>
              </VariationItem>
              <VariationItem>
                <TrustScoreDisplay score={70} confidence="medium" size="medium" showIcon={true} showLabel={true} />
                <VariationLabel>Medium Trust</VariationLabel>
              </VariationItem>
              <VariationItem>
                <TrustScoreDisplay score={45} confidence="low" size="medium" showIcon={true} showLabel={true} />
                <VariationLabel>Low Trust</VariationLabel>
              </VariationItem>
              <VariationItem>
                <TrustScoreDisplay score={25} confidence="low" size="medium" showIcon={true} showLabel={true} />
                <VariationLabel>Very Low Trust</VariationLabel>
              </VariationItem>
            </ScoreVariations>
          </ComponentShowcase>
        </ComponentGrid>
      </DemoSection>

      {/* Trust Score Breakdown */}
      <DemoSection>
        <SectionHeader>
          <div>
            <SectionTitle>Detailed Breakdown View</SectionTitle>
            <SectionDescription>
              Interactive breakdown showing individual component scores with expandable details and factor analysis.
              Each component is weighted according to its importance in the overall trust calculation.
            </SectionDescription>
          </div>
        </SectionHeader>

        <TrustScoreBreakdown
          breakdown={mockTrustScoreData.breakdown}
          factors={mockTrustScoreData.factors}
          compositeScore={mockTrustScoreData.compositeScore}
        />
      </DemoSection>

      {/* Historical Trend Chart */}
      <DemoSection>
        <SectionHeader>
          <div>
            <SectionTitle>Historical Trend Analysis</SectionTitle>
            <SectionDescription>
              Interactive charts showing trust score evolution over time with breakdown view and statistical analysis.
              Includes reference lines for score thresholds and trend indicators.
            </SectionDescription>
          </div>
        </SectionHeader>

        <TrustScoreHistoryChart
          data={mockHistoryData}
          mediaId="demo-media-123"
          showBreakdown={false}
        />
      </DemoSection>

      {/* Interactive Explorer */}
      <DemoSection>
        <SectionHeader>
          <div>
            <SectionTitle>Interactive Score Explorer</SectionTitle>
            <SectionDescription>
              Comprehensive exploration interface with filtering, search, and detailed views.
              Supports both grid and list layouts with real-time statistics and export capabilities.
            </SectionDescription>
          </div>
          <DemoControls>
            <ControlButton onClick={handleExport}>
              <Download size={16} />
              Export Demo Data
            </ControlButton>
          </DemoControls>
        </SectionHeader>

        <TrustScoreExplorer
          data={mockMediaData}
          onMediaSelect={(mediaId) => console.log('Selected:', mediaId)}
          onScoreRefresh={(mediaId) => console.log('Refreshing:', mediaId)}
          onExport={(filters) => console.log('Exporting with filters:', filters)}
        />
      </DemoSection>
    </Container>
  );
};

export default TrustScoreDemo;