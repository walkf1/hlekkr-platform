import React from 'react';
import styled from 'styled-components';
import { AlertCircle, Zap } from 'lucide-react';

const Banner = styled.div`
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-weight: 500;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 1000;
`;

const Icon = styled.div`
  display: flex;
  align-items: center;
`;

const Message = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const DemoModeBanner: React.FC = () => {
  const isDemoMode = process.env.REACT_APP_DEMO_MODE === 'true';
  
  if (!isDemoMode) return null;

  return (
    <Banner>
      <Icon>
        <Zap size={16} />
      </Icon>
      <Message>
        <strong>DEMO MODE</strong>
        <span>•</span>
        <span>Using mock data for competition demonstration</span>
        <span>•</span>
        <span>Real AI analysis available in production</span>
      </Message>
    </Banner>
  );
};