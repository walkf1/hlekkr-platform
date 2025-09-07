import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { AnalysisResultsDashboard } from './AnalysisResultsDashboard';
import { MediaAnalysisDetailView } from './MediaAnalysisDetailView';
import { 
  analysisResultsService, 
  AnalysisResultsService,
  ReviewActionRequest,
  BulkActionRequest 
} from '../../services/analysisResultsService';
import { 
  Bell, 
  Settings, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  X 
} from 'lucide-react';

interface AnalysisResultsAppProps {
  apiBaseUrl?: string;
  authToken?: string;
  onNavigate?: (route: string) => void;
  className?: string;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  autoClose?: boolean;
}

// Styled Components
const AppContainer = styled.div`
  width: 100%;
  min-height: 100vh;
  background: #f9fafb;
  position: relative;
`;

const NotificationContainer = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
`;

const NotificationCard = styled.div<{ type: string }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: white;
  border-left: 4px solid ${props => {
    switch (props.type) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#6b7280';
    }
  }};
  animation: slideIn 0.3s ease-out;
  
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

const NotificationIcon = styled.div<{ type: string }>`
  color: ${props => {
    switch (props.type) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#6b7280';
    }
  }};
  margin-top: 2px;
`;

const NotificationContent = styled.div`
  flex: 1;
`;

const NotificationTitle = styled.div`
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
`;

const NotificationMessage = styled.div`
  font-size: 14px;
  color: #6b7280;
  line-height: 1.4;
`;

const NotificationTime = styled.div`
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
`;

const NotificationClose = styled.button`
  padding: 4px;
  border: none;
  background: none;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f3f4f6;
    color: #6b7280;
  }
`;

const LoadingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #f3f4f6;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export const AnalysisResultsApp: React.FC<AnalysisResultsAppProps> = ({
  apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api',
  authToken,
  onNavigate,
  className
}) => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'detail'>('dashboard');
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [service] = useState(() => new AnalysisResultsService(apiBaseUrl, authToken));

  // Add notification
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      autoClose: notification.autoClose !== false
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove notification after 5 seconds
    if (newNotification.autoClose) {
      setTimeout(() => {
        removeNotification(newNotification.id);
      }, 5000);
    }
  }, []);

  // Remove notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Handle media selection
  const handleMediaSelect = useCallback((mediaId: string) => {
    setSelectedMediaId(mediaId);
    setCurrentView('detail');
  }, []);

  // Handle back to dashboard
  const handleBackToDashboard = useCallback(() => {
    setSelectedMediaId(null);
    setCurrentView('dashboard');
  }, []);

  // Handle review actions
  const handleReviewAction = useCallback(async (action: string, data: any) => {
    try {
      setLoading(true);

      const request: ReviewActionRequest = {
        mediaId: data.mediaId,
        action: action as any,
        data: data
      };

      const result = await service.performReviewAction(request);

      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Review Action Completed',
          message: result.message
        });

        // Refresh the current view
        if (currentView === 'detail') {
          // The detail view will refresh automatically
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Review action failed:', error);
      addNotification({
        type: 'error',
        title: 'Review Action Failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    } finally {
      setLoading(false);
    }
  }, [service, addNotification, currentView]);

  // Handle bulk actions
  const handleBulkAction = useCallback(async (action: string, mediaIds: string[]) => {
    try {
      setLoading(true);

      const request: BulkActionRequest = {
        mediaIds,
        action: action as any
      };

      const result = await service.performBulkAction(request);

      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Bulk Action Completed',
          message: `${result.processedCount} items processed successfully${result.failedCount > 0 ? `, ${result.failedCount} failed` : ''}`
        });

        if (result.errors && result.errors.length > 0) {
          result.errors.forEach(error => {
            addNotification({
              type: 'warning',
              title: 'Bulk Action Warning',
              message: error
            });
          });
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Bulk action failed:', error);
      addNotification({
        type: 'error',
        title: 'Bulk Action Failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    } finally {
      setLoading(false);
    }
  }, [service, addNotification]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = service.subscribeToUpdates(
      (update) => {
        switch (update.type) {
          case 'analysis_complete':
            addNotification({
              type: 'success',
              title: 'Analysis Complete',
              message: `Analysis completed for media item ${update.mediaId}`
            });
            break;

          case 'review_status_change':
            addNotification({
              type: 'info',
              title: 'Review Status Updated',
              message: `Review status changed for media item ${update.mediaId}`
            });
            break;

          case 'threat_detected':
            addNotification({
              type: 'warning',
              title: 'Threat Detected',
              message: `High-risk content detected in media item ${update.mediaId}`,
              autoClose: false
            });
            break;

          case 'system_alert':
            addNotification({
              type: 'error',
              title: 'System Alert',
              message: update.data.message || 'System alert received',
              autoClose: false
            });
            break;

          default:
            console.log('Unknown update type:', update.type);
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
        addNotification({
          type: 'warning',
          title: 'Connection Issue',
          message: 'Real-time updates may be delayed due to connection issues'
        });
      }
    );

    return unsubscribe;
  }, [service, addNotification]);

  // Get notification icon
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle size={20} />;
      case 'error': return <AlertTriangle size={20} />;
      case 'warning': return <AlertTriangle size={20} />;
      case 'info': return <Info size={20} />;
      default: return <Bell size={20} />;
    }
  };

  // Format notification time
  const formatNotificationTime = (timestamp: Date): string => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return timestamp.toLocaleDateString();
  };

  return (
    <AppContainer className={className}>
      {/* Loading Overlay */}
      {loading && (
        <LoadingOverlay>
          <LoadingSpinner />
        </LoadingOverlay>
      )}

      {/* Notifications */}
      <NotificationContainer>
        {notifications.map((notification) => (
          <NotificationCard key={notification.id} type={notification.type}>
            <NotificationIcon type={notification.type}>
              {getNotificationIcon(notification.type)}
            </NotificationIcon>
            <NotificationContent>
              <NotificationTitle>{notification.title}</NotificationTitle>
              <NotificationMessage>{notification.message}</NotificationMessage>
              <NotificationTime>
                {formatNotificationTime(notification.timestamp)}
              </NotificationTime>
            </NotificationContent>
            <NotificationClose onClick={() => removeNotification(notification.id)}>
              <X size={16} />
            </NotificationClose>
          </NotificationCard>
        ))}
      </NotificationContainer>

      {/* Main Content */}
      {currentView === 'dashboard' ? (
        <AnalysisResultsDashboard
          apiBaseUrl={apiBaseUrl}
          onMediaSelect={handleMediaSelect}
          onBulkAction={handleBulkAction}
          refreshInterval={30000}
          pageSize={20}
        />
      ) : currentView === 'detail' && selectedMediaId ? (
        <MediaAnalysisDetailView
          mediaId={selectedMediaId}
          apiBaseUrl={apiBaseUrl}
          onBack={handleBackToDashboard}
          onReviewAction={handleReviewAction}
        />
      ) : (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh',
          color: '#6b7280'
        }}>
          <div style={{ textAlign: 'center' }}>
            <AlertTriangle size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px', color: '#374151' }}>
              Invalid View State
            </h3>
            <p style={{ fontSize: '14px', margin: '0' }}>
              Unable to display the requested view
            </p>
            <button
              onClick={handleBackToDashboard}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </AppContainer>
  );
};

export default AnalysisResultsApp;