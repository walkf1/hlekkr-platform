import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface UploadedMedia {
  mediaId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  location: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress?: number;
  
  // Analysis results
  trustScore?: number;
  deepfakeConfidence?: number;
  analysisStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  
  // Processing stages
  securityScan?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: 'clean' | 'threat_detected';
  };
  
  metadataExtraction?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    data?: any;
  };
  
  bedrockAnalysis?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    claudeSonnet?: { confidence: number; techniques: string[] };
    claudeHaiku?: { confidence: number; techniques: string[] };
    titan?: { confidence: number; techniques: string[] };
  };
  
  hitlReview?: {
    status: 'not_required' | 'pending' | 'in_progress' | 'completed';
    assignedModerator?: string;
    decision?: 'authentic' | 'deepfake' | 'uncertain';
    confidence?: number;
  };
}

interface MediaContextType {
  uploadedMedia: UploadedMedia[];
  currentMedia: UploadedMedia | null;
  addUploadedMedia: (media: UploadedMedia) => void;
  updateMediaStatus: (mediaId: string, updates: Partial<UploadedMedia>) => void;
  setCurrentMedia: (mediaId: string | null) => void;
  getMediaById: (mediaId: string) => UploadedMedia | undefined;
  error: string | null;
  clearError: () => void;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const useMedia = () => {
  const context = useContext(MediaContext);
  if (!context) {
    throw new Error('useMedia must be used within a MediaProvider');
  }
  return context;
};

interface MediaProviderProps {
  children: ReactNode;
}

export const MediaProvider: React.FC<MediaProviderProps> = ({ children }) => {
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const [currentMedia, setCurrentMediaState] = useState<UploadedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('hlekkr-uploaded-media');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUploadedMedia(parsed);
      } catch (err) {
        setError('Failed to load saved media');
        console.error('Failed to load saved media:', err);
      }
    }
  }, []);

  // Save to localStorage when media changes
  useEffect(() => {
    try {
      localStorage.setItem('hlekkr-uploaded-media', JSON.stringify(uploadedMedia));
    } catch (err) {
      setError('Failed to save media data');
      console.error('Failed to save media data:', err);
    }
  }, [uploadedMedia]);

  const addUploadedMedia = (media: UploadedMedia) => {
    try {
      setUploadedMedia(prev => {
        const existing = prev.find(m => m.mediaId === media.mediaId);
        if (existing) {
          return prev.map(m => m.mediaId === media.mediaId ? { ...m, ...media } : m);
        }
        return [media, ...prev];
      });
      setError(null);
    } catch (err) {
      setError('Failed to add media');
      console.error('MediaContext error:', err);
    }
  };

  const updateMediaStatus = (mediaId: string, updates: Partial<UploadedMedia>) => {
    try {
      setUploadedMedia(prev => 
        prev.map(media => 
          media.mediaId === mediaId 
            ? { ...media, ...updates }
            : media
        )
      );
      
      // Update current media if it's the one being updated
      if (currentMedia?.mediaId === mediaId) {
        setCurrentMediaState(prev => prev ? { ...prev, ...updates } : null);
      }
      setError(null);
    } catch (err) {
      setError('Failed to update media');
      console.error('MediaContext error:', err);
    }
  };

  const setCurrentMedia = (mediaId: string | null) => {
    try {
      if (mediaId) {
        const media = uploadedMedia.find(m => m.mediaId === mediaId);
        setCurrentMediaState(media || null);
      } else {
        setCurrentMediaState(null);
      }
      setError(null);
    } catch (err) {
      setError('Failed to set current media');
      console.error('MediaContext error:', err);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const getMediaById = (mediaId: string) => {
    return uploadedMedia.find(m => m.mediaId === mediaId);
  };

  return (
    <MediaContext.Provider value={{
      uploadedMedia,
      currentMedia,
      addUploadedMedia,
      updateMediaStatus,
      setCurrentMedia,
      getMediaById,
      error,
      clearError
    }}>
      {children}
    </MediaContext.Provider>
  );
};