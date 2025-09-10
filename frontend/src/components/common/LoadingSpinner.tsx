import React from 'react';
import styled, { keyframes } from 'styled-components';

interface LoadingSpinnerProps {
  message?: string;
  aiModel?: string;
  size?: 'small' | 'medium' | 'large';
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const Container = styled.div<{ size: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: ${props => props.size === 'large' ? '40px' : '20px'};
`;

const Spinner = styled.div<{ size: string }>`
  width: ${props => 
    props.size === 'large' ? '48px' : 
    props.size === 'medium' ? '32px' : '24px'
  };
  height: ${props => 
    props.size === 'large' ? '48px' : 
    props.size === 'medium' ? '32px' : '24px'
  };
  border: 3px solid #e5e7eb;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const Message = styled.div<{ size: string }>`
  font-size: ${props => 
    props.size === 'large' ? '18px' : 
    props.size === 'medium' ? '16px' : '14px'
  };
  font-weight: 500;
  color: #374151;
  text-align: center;
`;

const AIModel = styled.div<{ size: string }>`
  font-size: ${props => 
    props.size === 'large' ? '14px' : 
    props.size === 'medium' ? '12px' : '11px'
  };
  color: #6b7280;
  text-align: center;
  font-family: 'Monaco', 'Menlo', monospace;
`;

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  aiModel,
  size = 'medium'
}) => {
  return (
    <Container size={size}>
      <Spinner size={size} />
      <Message size={size}>{message}</Message>
      {aiModel && (
        <AIModel size={size}>
          {aiModel}
        </AIModel>
      )}
    </Container>
  );
};