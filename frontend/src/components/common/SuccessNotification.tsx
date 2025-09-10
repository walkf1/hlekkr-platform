import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { CheckCircle, ArrowRight, X } from 'lucide-react';

interface SuccessNotificationProps {
  show: boolean;
  fileName: string;
  trustScore: number;
  onClose: () => void;
  onNavigate: () => void;
}

const Notification = styled.div<{ show: boolean }>`
  position: fixed;
  top: 80px;
  right: 20px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
  transform: ${props => props.show ? 'translateX(0)' : 'translateX(400px)'};
  transition: transform 0.3s ease;
  z-index: 1000;
  max-width: 350px;
  min-width: 300px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  margin-left: auto;
`;

const Content = styled.div`
  margin-bottom: 16px;
`;

const FileName = styled.div`
  font-weight: 500;
  margin-bottom: 8px;
  word-break: break-word;
`;

const TrustScore = styled.div`
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
`;

const ScoreLabel = styled.div`
  font-size: 12px;
  opacity: 0.9;
`;

const ActionButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  justify-content: center;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

export const SuccessNotification: React.FC<SuccessNotificationProps> = ({
  show,
  fileName,
  trustScore,
  onClose,
  onNavigate
}) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 8000); // Auto-close after 8 seconds
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <Notification show={show}>
      <Header>
        <CheckCircle size={20} />
        <Title>Analysis Complete!</Title>
        <CloseButton onClick={onClose}>
          <X size={16} />
        </CloseButton>
      </Header>
      
      <Content>
        <FileName>{fileName}</FileName>
        <TrustScore>{trustScore}%</TrustScore>
        <ScoreLabel>Trust Score</ScoreLabel>
      </Content>
      
      <ActionButton onClick={onNavigate}>
        View Results
        <ArrowRight size={16} />
      </ActionButton>
    </Notification>
  );
};