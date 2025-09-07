import React from 'react';
import styled from 'styled-components';
import { Shield, AlertTriangle, AlertCircle, XCircle } from 'lucide-react';

interface TrustScoreDisplayProps {
  score: number;
  confidence: 'low' | 'medium' | 'high' | 'error';
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  showLabel?: boolean;
  className?: string;
}

interface ScoreConfig {
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon: React.ComponentType<any>;
  label: string;
  textColor: string;
}

const getScoreConfig = (score: number): ScoreConfig => {
  if (score >= 80) {
    return {
      color: '#10B981', // Green
      backgroundColor: '#ECFDF5',
      borderColor: '#10B981',
      icon: Shield,
      label: 'High Trust',
      textColor: '#065F46'
    };
  } else if (score >= 60) {
    return {
      color: '#F59E0B', // Yellow/Amber
      backgroundColor: '#FFFBEB',
      borderColor: '#F59E0B',
      icon: AlertTriangle,
      label: 'Medium Trust',
      textColor: '#92400E'
    };
  } else if (score >= 40) {
    return {
      color: '#EF4444', // Red
      backgroundColor: '#FEF2F2',
      borderColor: '#EF4444',
      icon: AlertCircle,
      label: 'Low Trust',
      textColor: '#991B1B'
    };
  } else {
    return {
      color: '#DC2626', // Dark Red
      backgroundColor: '#FEF2F2',
      borderColor: '#DC2626',
      icon: XCircle,
      label: 'Very Low Trust',
      textColor: '#991B1B'
    };
  }
};

const getSizeConfig = (size: 'small' | 'medium' | 'large') => {
  switch (size) {
    case 'small':
      return {
        containerSize: '60px',
        fontSize: '14px',
        iconSize: 16,
        padding: '8px'
      };
    case 'large':
      return {
        containerSize: '120px',
        fontSize: '24px',
        iconSize: 32,
        padding: '20px'
      };
    default: // medium
      return {
        containerSize: '80px',
        fontSize: '18px',
        iconSize: 24,
        padding: '12px'
      };
  }
};

const ScoreContainer = styled.div<{
  config: ScoreConfig;
  sizeConfig: any;
}>`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: ${props => props.sizeConfig.containerSize};
  height: ${props => props.sizeConfig.containerSize};
  border-radius: 50%;
  background-color: ${props => props.config.backgroundColor};
  border: 2px solid ${props => props.config.borderColor};
  padding: ${props => props.sizeConfig.padding};
  transition: all 0.3s ease;
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
`;

const ScoreText = styled.div<{
  config: ScoreConfig;
  sizeConfig: any;
}>`
  font-size: ${props => props.sizeConfig.fontSize};
  font-weight: bold;
  color: ${props => props.config.textColor};
  margin-top: 4px;
`;

const ScoreLabel = styled.div<{
  config: ScoreConfig;
}>`
  font-size: 12px;
  font-weight: 500;
  color: ${props => props.config.textColor};
  margin-top: 8px;
  text-align: center;
`;

const ConfidenceBadge = styled.div<{
  confidence: string;
}>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 500;
  margin-top: 4px;
  background-color: ${props => {
    switch (props.confidence) {
      case 'high': return '#ECFDF5';
      case 'medium': return '#FFFBEB';
      case 'low': return '#FEF2F2';
      default: return '#F3F4F6';
    }
  }};
  color: ${props => {
    switch (props.confidence) {
      case 'high': return '#065F46';
      case 'medium': return '#92400E';
      case 'low': return '#991B1B';
      default: return '#374151';
    }
  }};
  border: 1px solid ${props => {
    switch (props.confidence) {
      case 'high': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'low': return '#EF4444';
      default: return '#D1D5DB';
    }
  }};
`;

const TrustScoreDisplay: React.FC<TrustScoreDisplayProps> = ({
  score,
  confidence,
  size = 'medium',
  showIcon = true,
  showLabel = false,
  className
}) => {
  const config = getScoreConfig(score);
  const sizeConfig = getSizeConfig(size);
  const IconComponent = config.icon;

  return (
    <div className={className}>
      <ScoreContainer config={config} sizeConfig={sizeConfig}>
        {showIcon && (
          <IconComponent 
            size={sizeConfig.iconSize} 
            color={config.color}
          />
        )}
        <ScoreText config={config} sizeConfig={sizeConfig}>
          {Math.round(score)}
        </ScoreText>
      </ScoreContainer>
      
      {showLabel && (
        <ScoreLabel config={config}>
          {config.label}
        </ScoreLabel>
      )}
      
      <ConfidenceBadge confidence={confidence}>
        {confidence.toUpperCase()}
      </ConfidenceBadge>
    </div>
  );
};

export default TrustScoreDisplay;