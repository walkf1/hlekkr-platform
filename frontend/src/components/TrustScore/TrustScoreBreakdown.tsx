import React, { useState } from 'react';
import styled from 'styled-components';
import { ChevronDown, ChevronRight, Info, Eye, Shield, FileCheck, Clock, Zap } from 'lucide-react';

interface TrustScoreBreakdownProps {
  breakdown: {
    deepfakeScore: number;
    sourceReliabilityScore: number;
    metadataConsistencyScore: number;
    historicalPatternScore: number;
    technicalIntegrityScore: number;
  };
  factors?: Array<{
    category: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
    weight: 'high' | 'medium' | 'low';
  }>;
  compositeScore: number;
  className?: string;
}

interface ComponentConfig {
  icon: React.ComponentType<any>;
  label: string;
  description: string;
  weight: number;
}

const componentConfigs: Record<string, ComponentConfig> = {
  deepfakeScore: {
    icon: Eye,
    label: 'Deepfake Detection',
    description: 'AI-powered analysis of potential manipulation techniques',
    weight: 35
  },
  sourceReliabilityScore: {
    icon: Shield,
    label: 'Source Reliability',
    description: 'Verification of content source and reputation',
    weight: 25
  },
  metadataConsistencyScore: {
    icon: FileCheck,
    label: 'Metadata Consistency',
    description: 'Technical metadata validation and integrity checks',
    weight: 20
  },
  technicalIntegrityScore: {
    icon: Zap,
    label: 'Technical Integrity',
    description: 'File integrity and processing validation',
    weight: 15
  },
  historicalPatternScore: {
    icon: Clock,
    label: 'Historical Patterns',
    description: 'Behavioral pattern analysis and upload history',
    weight: 5
  }
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return '#10B981'; // Green
  if (score >= 60) return '#F59E0B'; // Yellow
  if (score >= 40) return '#EF4444'; // Red
  return '#DC2626'; // Dark Red
};

const Container = styled.div`
  background: white;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #E5E7EB;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const CompositeScore = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: bold;
  color: ${props => getScoreColor(props.score || 0)};
`;

const ComponentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ComponentItem = styled.div<{ isExpanded: boolean }>`
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #D1D5DB;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }
`;

const ComponentHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 16px;
  cursor: pointer;
  background: #F9FAFB;
  transition: background-color 0.2s ease;
  
  &:hover {
    background: #F3F4F6;
  }
`;

const ComponentIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #EBF8FF;
  margin-right: 12px;
`;

const ComponentInfo = styled.div`
  flex: 1;
`;

const ComponentName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
`;

const ComponentWeight = styled.div`
  font-size: 12px;
  color: #6B7280;
`;

const ComponentScore = styled.div<{ score: number }>`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 12px;
`;

const ScoreValue = styled.div<{ score: number }>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => getScoreColor(props.score)};
  min-width: 40px;
  text-align: right;
`;

const ScoreBar = styled.div<{ score: number }>`
  width: 80px;
  height: 6px;
  background: #E5E7EB;
  border-radius: 3px;
  overflow: hidden;
  
  &::after {
    content: '';
    display: block;
    width: ${props => props.score}%;
    height: 100%;
    background: ${props => getScoreColor(props.score)};
    transition: width 0.3s ease;
  }
`;

const ExpandIcon = styled.div<{ isExpanded: boolean }>`
  transition: transform 0.2s ease;
  transform: ${props => props.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const ComponentDetails = styled.div<{ isExpanded: boolean }>`
  padding: ${props => props.isExpanded ? '16px' : '0'};
  max-height: ${props => props.isExpanded ? '200px' : '0'};
  overflow: hidden;
  transition: all 0.3s ease;
  background: white;
  border-top: ${props => props.isExpanded ? '1px solid #E5E7EB' : 'none'};
`;

const ComponentDescription = styled.p`
  font-size: 14px;
  color: #6B7280;
  margin: 0 0 12px 0;
  line-height: 1.5;
`;

const FactorsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FactorItem = styled.div<{ impact: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  background: ${props => {
    switch (props.impact) {
      case 'positive': return '#ECFDF5';
      case 'negative': return '#FEF2F2';
      default: return '#F9FAFB';
    }
  }};
  border: 1px solid ${props => {
    switch (props.impact) {
      case 'positive': return '#10B981';
      case 'negative': return '#EF4444';
      default: return '#E5E7EB';
    }
  }};
`;

const FactorImpact = styled.div<{ impact: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => {
    switch (props.impact) {
      case 'positive': return '#10B981';
      case 'negative': return '#EF4444';
      default: return '#6B7280';
    }
  }};
`;

const TrustScoreBreakdown: React.FC<TrustScoreBreakdownProps> = ({
  breakdown,
  factors = [],
  compositeScore,
  className
}) => {
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());

  const toggleComponent = (componentKey: string) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(componentKey)) {
      newExpanded.delete(componentKey);
    } else {
      newExpanded.add(componentKey);
    }
    setExpandedComponents(newExpanded);
  };

  const getComponentFactors = (componentKey: string) => {
    const categoryMap: Record<string, string[]> = {
      deepfakeScore: ['deepfake_detection', 'manipulation_detection'],
      sourceReliabilityScore: ['source_verification', 'source_reputation'],
      metadataConsistencyScore: ['metadata_validation', 'technical_validation'],
      technicalIntegrityScore: ['file_integrity', 'processing_validation'],
      historicalPatternScore: ['behavioral_analysis', 'upload_patterns']
    };

    const categories = categoryMap[componentKey] || [];
    return factors.filter(factor => categories.includes(factor.category));
  };

  return (
    <Container className={className}>
      <Header>
        <Title>Trust Score Breakdown</Title>
        <CompositeScore score={compositeScore}>
          {Math.round(compositeScore)}
          <Info size={16} color="#6B7280" />
        </CompositeScore>
      </Header>

      <ComponentList>
        {Object.entries(breakdown).map(([key, score]) => {
          const config = componentConfigs[key];
          if (!config) return null;

          const isExpanded = expandedComponents.has(key);
          const componentFactors = getComponentFactors(key);
          const IconComponent = config.icon;

          return (
            <ComponentItem key={key} isExpanded={isExpanded}>
              <ComponentHeader onClick={() => toggleComponent(key)}>
                <ComponentIcon>
                  <IconComponent size={16} color="#3B82F6" />
                </ComponentIcon>
                
                <ComponentInfo>
                  <ComponentName>{config.label}</ComponentName>
                  <ComponentWeight>Weight: {config.weight}%</ComponentWeight>
                </ComponentInfo>

                <ComponentScore score={score}>
                  <ScoreBar score={score} />
                  <ScoreValue score={score}>{Math.round(score)}</ScoreValue>
                </ComponentScore>

                <ExpandIcon isExpanded={isExpanded}>
                  <ChevronRight size={16} color="#6B7280" />
                </ExpandIcon>
              </ComponentHeader>

              <ComponentDetails isExpanded={isExpanded}>
                <ComponentDescription>
                  {config.description}
                </ComponentDescription>

                {componentFactors.length > 0 && (
                  <FactorsList>
                    {componentFactors.map((factor, index) => (
                      <FactorItem key={index} impact={factor.impact}>
                        <FactorImpact impact={factor.impact} />
                        <span>{factor.description}</span>
                      </FactorItem>
                    ))}
                  </FactorsList>
                )}
              </ComponentDetails>
            </ComponentItem>
          );
        })}
      </ComponentList>
    </Container>
  );
};

export default TrustScoreBreakdown;