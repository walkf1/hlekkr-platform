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

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('hlekkr-uploaded-media');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUploadedMedia(parsed);
      } catch (error) {
        console.error('Failed to load saved media:', error);
      }
    }
  }, []);

  // Save to localStorage when media changes
  useEffect(() => {
    localStorage.setItem('hlekkr-uploaded-media', JSON.stringify(uploadedMedia));
  }, [uploadedMedia]);

  const addUploadedMedia = (media: UploadedMedia) => {
    setUploadedMedia(prev => {
      const existing = prev.find(m => m.mediaId === media.mediaId);
      if (existing) {
        return prev.map(m => m.mediaId === media.mediaId ? { ...m, ...media } : m);
      }
      return [media, ...prev];
    });
  };

  const updateMediaStatus = (mediaId: string, updates: Partial<UploadedMedia>) => {
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
  };

  const setCurrentMedia = (mediaId: string | null) => {
    if (mediaId) {
      const media = uploadedMedia.find(m => m.mediaId === mediaId);
      setCurrentMediaState(media || null);
    } else {
      setCurrentMediaState(null);
    }
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
      getMediaById
    }}>
      {children}
    </MediaContext.Provider>
  );
};