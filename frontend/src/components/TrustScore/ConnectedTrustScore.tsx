import React from 'react';
import styled from 'styled-components';
import { useMedia } from '../../context/MediaContext';
import TrustScoreDashboard from './TrustScoreDashboard';

const Container = styled.div`
  padding: 40px 20px;
`;

const NoDataMessage = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #6b7280;
  font-size: 18px;
`;

export const ConnectedTrustScore: React.FC = () => {
  const { currentMedia, uploadedMedia } = useMedia();
  
  const mediaToAnalyze = currentMedia || uploadedMedia[0];
  
  if (!mediaToAnalyze) {
    return (
      <Container>
        <NoDataMessage>
          No media files available. Upload a file to see trust score analysis.
        </NoDataMessage>
      </Container>
    );
  }

  return (
    <Container>
      <TrustScoreDashboard
        apiBaseUrl={process.env.REACT_APP_API_URL || 'https://api.example.com/prod'}
        mediaId={mediaToAnalyze.mediaId}
      />
    </Container>
  );
};