import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { Upload, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useMedia } from '../../context/MediaContext';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const UploadArea = styled.div<{ isDragOver: boolean }>`
  border: 2px dashed ${props => props.isDragOver ? '#3b82f6' : '#d1d5db'};
  border-radius: 12px;
  padding: 60px 20px;
  text-align: center;
  background: ${props => props.isDragOver ? '#eff6ff' : '#f9fafb'};
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    border-color: #3b82f6;
    background: #eff6ff;
  }
`;

const UploadIcon = styled.div`
  width: 64px;
  height: 64px;
  background: #3b82f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  color: white;
`;

const UploadText = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
`;

const UploadSubtext = styled.div`
  color: #6b7280;
  font-size: 14px;
`;

const FileInput = styled.input`
  display: none;
`;

const UploadedFiles = styled.div`
  margin-top: 32px;
`;

const FileItem = styled.div`
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
`;

const FileIcon = styled.div<{ status: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => 
    props.status === 'completed' ? '#10b981' :
    props.status === 'failed' ? '#ef4444' :
    props.status === 'processing' ? '#3b82f6' : '#f59e0b'
  };
  color: white;
`;

const FileDetails = styled.div`
  flex: 1;
`;

const FileName = styled.div`
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
`;

const FileInfo = styled.div`
  font-size: 14px;
  color: #6b7280;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ progress: number }>`
  height: 100%;
  background: #3b82f6;
  width: ${props => props.progress}%;
  transition: width 0.3s ease;
`;

export const ConnectedMediaUpload: React.FC = () => {
  const { addUploadedMedia, updateMediaStatus, uploadedMedia } = useMedia();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = useCallback(async (file: File) => {
    const mediaId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to context immediately
    addUploadedMedia({
      mediaId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      location: '',
      status: 'uploading',
      progress: 0
    });

    setIsUploading(true);

    try {
      // Simulate upload progress
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        updateMediaStatus(mediaId, { progress });
      }

      // Simulate API call to complete upload
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://your-api-gateway-url.amazonaws.com/prod'}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: `uploads/${mediaId}/${file.name}`,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Update with completed status and start processing simulation
        updateMediaStatus(mediaId, {
          status: 'processing',
          location: result.location,
          securityScan: { status: 'processing' },
          metadataExtraction: { status: 'pending' },
          bedrockAnalysis: { status: 'pending' },
          hitlReview: { status: 'not_required' }
        });

        // Simulate processing stages
        setTimeout(() => {
          updateMediaStatus(mediaId, {
            securityScan: { status: 'completed', result: 'clean' },
            metadataExtraction: { status: 'processing' }
          });
        }, 1000);

        setTimeout(() => {
          updateMediaStatus(mediaId, {
            metadataExtraction: { status: 'completed' },
            bedrockAnalysis: { status: 'processing' }
          });
        }, 2000);

        setTimeout(() => {
          const isImage = file.type.startsWith('image/');
          const trustScore = isImage ? Math.floor(Math.random() * 40) + 60 : Math.floor(Math.random() * 30) + 30;
          const deepfakeConfidence = (100 - trustScore) / 100;
          
          updateMediaStatus(mediaId, {
            status: 'completed',
            analysisStatus: 'completed',
            trustScore,
            deepfakeConfidence,
            bedrockAnalysis: {
              status: 'completed',
              claudeSonnet: { 
                confidence: deepfakeConfidence + (Math.random() * 0.1 - 0.05), 
                techniques: isImage ? ['facial_analysis', 'texture_consistency'] : ['temporal_analysis', 'audio_artifacts']
              },
              claudeHaiku: { 
                confidence: deepfakeConfidence + (Math.random() * 0.1 - 0.05), 
                techniques: ['compression_analysis']
              },
              titan: { 
                confidence: deepfakeConfidence + (Math.random() * 0.1 - 0.05), 
                techniques: ['embedding_analysis']
              }
            },
            hitlReview: {
              status: trustScore < 70 ? 'pending' : 'not_required'
            }
          });
        }, 4000);

      } else {
        updateMediaStatus(mediaId, { status: 'failed' });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      updateMediaStatus(mediaId, { status: 'failed' });
    } finally {
      setIsUploading(false);
    }
  }, [addUploadedMedia, updateMediaStatus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(handleFileUpload);
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(handleFileUpload);
  }, [handleFileUpload]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={20} />;
      case 'failed': return <AlertCircle size={20} />;
      case 'processing': return <Clock size={20} />;
      default: return <Upload size={20} />;
    }
  };

  const getStatusText = (media: any) => {
    if (media.status === 'uploading') return `Uploading... ${media.progress || 0}%`;
    if (media.status === 'processing') {
      if (media.bedrockAnalysis?.status === 'processing') return 'AI Analysis in progress...';
      if (media.metadataExtraction?.status === 'processing') return 'Extracting metadata...';
      if (media.securityScan?.status === 'processing') return 'Security scanning...';
      return 'Processing...';
    }
    if (media.status === 'completed') return `Trust Score: ${media.trustScore || 'N/A'}%`;
    if (media.status === 'failed') return 'Upload failed';
    return 'Ready';
  };

  return (
    <Container>
      <UploadArea
        isDragOver={isDragOver}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <UploadIcon>
          <Upload size={32} />
        </UploadIcon>
        <UploadText>
          {isUploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </UploadText>
        <UploadSubtext>
          Supports images, videos, and audio files up to 100MB
        </UploadSubtext>
        <FileInput
          id="file-input"
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          onChange={handleFileSelect}
        />
      </UploadArea>

      {uploadedMedia.length > 0 && (
        <UploadedFiles>
          <h3 style={{ marginBottom: '16px', color: '#1f2937' }}>Uploaded Files</h3>
          {uploadedMedia.map((media) => (
            <FileItem key={media.mediaId}>
              <FileIcon status={media.status}>
                {getStatusIcon(media.status)}
              </FileIcon>
              <FileDetails>
                <FileName>{media.fileName}</FileName>
                <FileInfo>
                  {Math.round(media.fileSize / 1024)} KB • {media.fileType} • {getStatusText(media)}
                </FileInfo>
                {media.status === 'uploading' && media.progress !== undefined && (
                  <ProgressBar>
                    <ProgressFill progress={media.progress} />
                  </ProgressBar>
                )}
              </FileDetails>
            </FileItem>
          ))}
        </UploadedFiles>
      )}
    </Container>
  );
};