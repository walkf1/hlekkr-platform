import React, { useState } from 'react';
import styled from 'styled-components';
import { TrustScoreDashboard } from './components/TrustScore';
import { MediaUploadDemo } from './components/MediaUpload/MediaUploadDemo';
import { AnalysisDashboardDemo } from './components/AnalysisDashboard/AnalysisDashboardDemo';
import { Upload, BarChart3, Activity } from 'lucide-react';

const AppContainer = styled.div`
  min-height: 100vh;
  background: #F9FAFB;
`;

const Navigation = styled.nav`
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
`;

const Logo = styled.div`
  font-size: 24px;
  font-weight: 800;
  color: #111827;
  margin-right: auto;
`;

const NavButton = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: ${props => props.active ? '#3b82f6' : 'transparent'};
  color: ${props => props.active ? 'white' : '#6b7280'};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.active ? '#2563eb' : '#f3f4f6'};
    color: ${props => props.active ? 'white' : '#374151'};
  }
`;

type View = 'upload' | 'dashboard' | 'analysis';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('upload');
  
  // In a real application, these would come from environment variables or configuration
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://api.hlekkr.com';
  const MEDIA_ID = process.env.REACT_APP_MEDIA_ID; // Optional, for single media view

  return (
    <AppContainer>
      <Navigation>
        <Logo>Hlekkr</Logo>
        
        <NavButton 
          active={currentView === 'upload'} 
          onClick={() => setCurrentView('upload')}
        >
          <Upload size={16} />
          Media Upload
        </NavButton>
        
        <NavButton 
          active={currentView === 'analysis'} 
          onClick={() => setCurrentView('analysis')}
        >
          <Activity size={16} />
          Analysis Dashboard
        </NavButton>
        
        <NavButton 
          active={currentView === 'dashboard'} 
          onClick={() => setCurrentView('dashboard')}
        >
          <BarChart3 size={16} />
          Trust Score Dashboard
        </NavButton>
      </Navigation>

      {currentView === 'upload' && <MediaUploadDemo />}
      
      {currentView === 'analysis' && <AnalysisDashboardDemo />}
      
      {currentView === 'dashboard' && (
        <div style={{ padding: '40px 20px' }}>
          <TrustScoreDashboard
            apiBaseUrl={API_BASE_URL}
            mediaId={MEDIA_ID}
          />
        </div>
      )}
    </AppContainer>
  );
};

export default App;