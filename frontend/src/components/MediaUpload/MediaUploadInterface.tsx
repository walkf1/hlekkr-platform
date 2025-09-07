import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Pause, 
  Play, 
  RotateCcw,
  FileVideo,
  FileImage,
  FileAudio,
  File
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';

// Types
export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error' | 'validating';
  progress: number;
  uploadedBytes: number;
  error?: string;
  uploadId?: string;
  parts?: UploadPart[];
  mediaId?: string;
  trustScore?: number;
}

export interface UploadPart {
  partNumber: number;
  etag?: string;
  size: number;
  uploaded: boolean;
}

export interface MediaUploadConfig {
  maxFileSize: number; // in bytes
  maxFiles: number;
  allowedTypes: string[];
  chunkSize: number; // for multipart upload
  maxConcurrentUploads: number;
  apiEndpoint: string;
  s3Config?: {
    bucket: string;
    region: string;
  };
}

interface MediaUploadInterfaceProps {
  config: MediaUploadConfig;
  onUploadComplete?: (files: UploadFile[]) => void;
  onUploadProgress?: (files: UploadFile[]) => void;
  onError?: (error: string, file?: UploadFile) => void;
  className?: string;
}

// Styled Components
const UploadContainer = styled.div`
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
`;

const DropzoneArea = styled.div<{ isDragActive: boolean; isDragReject: boolean }>`
  border: 2px dashed ${props => 
    props.isDragReject ? '#ef4444' : 
    props.isDragActive ? '#3b82f6' : '#d1d5db'
  };
  border-radius: 8px;
  padding: 48px 24px;
  text-align: center;
  background: ${props => 
    props.isDragReject ? '#fef2f2' : 
    props.isDragActive ? '#eff6ff' : '#fafafa'
  };
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    border-color: #3b82f6;
    background: #eff6ff;
  }
`;

const UploadIcon = styled(Upload)`
  width: 48px;
  height: 48px;
  color: #6b7280;
  margin: 0 auto 16px;
`;

const DropzoneText = styled.div`
  h3 {
    font-size: 18px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px;
  }
  
  p {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 16px;
  }
`;

const BrowseButton = styled.button`
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
  
  &:hover {
    background: #2563eb;
  }
  
  &:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
`;

const FileList = styled.div`
  margin-top: 24px;
`;

const FileItem = styled.div`
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #ffffff;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const FileIcon = styled.div`
  margin-right: 12px;
  color: #6b7280;
`;

const FileInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileName = styled.div`
  font-weight: 500;
  color: #111827;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileDetails = styled.div`
  font-size: 12px;
  color: #6b7280;
  display: flex;
  gap: 12px;
`;

const ProgressContainer = styled.div`
  margin: 8px 0;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ progress: number; status: string }>`
  height: 100%;
  width: ${props => props.progress}%;
  background: ${props => {
    switch (props.status) {
      case 'completed': return '#10b981';
      case 'error': return '#ef4444';
      case 'paused': return '#f59e0b';
      default: return '#3b82f6';
    }
  }};
  transition: width 0.3s ease;
`;

const FileActions = styled.div`
  display: flex;
  gap: 8px;
  margin-left: 12px;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusIcon = styled.div<{ status: string }>`
  margin-left: 8px;
  color: ${props => {
    switch (props.status) {
      case 'completed': return '#10b981';
      case 'error': return '#ef4444';
      case 'uploading': return '#3b82f6';
      case 'paused': return '#f59e0b';
      default: return '#6b7280';
    }
  }};
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  font-size: 12px;
  margin-top: 4px;
`;

const UploadStats = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  color: #6b7280;
`;

const GlobalActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;
`;

const GlobalButton = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid;
  
  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
          &:hover { background: #2563eb; border-color: #2563eb; }
        `;
      case 'danger':
        return `
          background: #ef4444;
          color: white;
          border-color: #ef4444;
          &:hover { background: #dc2626; border-color: #dc2626; }
        `;
      default:
        return `
          background: white;
          color: #374151;
          border-color: #d1d5db;
          &:hover { background: #f9fafb; border-color: #9ca3af; }
        `;
    }
  }}
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Default configuration
const defaultConfig: MediaUploadConfig = {
  maxFileSize: 500 * 1024 * 1024, // 500MB
  maxFiles: 10,
  allowedTypes: [
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg'
  ],
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  maxConcurrentUploads: 3,
  apiEndpoint: '/api/media'
};

export const MediaUploadInterface: React.FC<MediaUploadInterfaceProps> = ({
  config = defaultConfig,
  onUploadComplete,
  onUploadProgress,
  onError,
  className
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploadControllers = useRef<Map<string, AbortController>>(new Map());

  // File validation
  const validateFile = useCallback((file: File): string | null => {
    if (file.size > config.maxFileSize) {
      return `File size exceeds ${formatFileSize(config.maxFileSize)} limit`;
    }
    
    if (!config.allowedTypes.includes(file.type)) {
      return `File type ${file.type} is not supported`;
    }
    
    return null;
  }, [config]);

  // Handle file drop/selection
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files
    rejectedFiles.forEach(({ file, errors }) => {
      const errorMessage = errors.map((e: any) => e.message).join(', ');
      onError?.(errorMessage, undefined);
    });

    // Process accepted files
    const newFiles: UploadFile[] = acceptedFiles.map(file => {
      const validationError = validateFile(file);
      
      return {
        id: uuidv4(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: validationError ? 'error' : 'pending',
        progress: 0,
        uploadedBytes: 0,
        error: validationError || undefined
      };
    });

    setFiles(prev => {
      const combined = [...prev, ...newFiles];
      if (combined.length > config.maxFiles) {
        onError?.(`Maximum ${config.maxFiles} files allowed`);
        return combined.slice(0, config.maxFiles);
      }
      return combined;
    });
  }, [config, validateFile, onError]);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: config.allowedTypes.reduce((acc, type) => {
      acc[type] = [];
      return acc;
    }, {} as Record<string, string[]>),
    maxSize: config.maxFileSize,
    disabled: isUploading
  });

  // File upload logic (simplified - would integrate with actual S3/API)
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const controller = new AbortController();
    uploadControllers.current.set(uploadFile.id, controller);

    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ));

      // Simulate upload progress (replace with actual upload logic)
      for (let progress = 0; progress <= 100; progress += 10) {
        if (controller.signal.aborted) {
          throw new Error('Upload cancelled');
        }

        await new Promise(resolve => setTimeout(resolve, 200));
        
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { 
                ...f, 
                progress, 
                uploadedBytes: Math.floor((progress / 100) * f.size),
                status: progress === 100 ? 'completed' : 'uploading'
              }
            : f
        ));
      }

      // Simulate getting media ID and trust score
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              mediaId: `media-${uuidv4()}`,
              trustScore: Math.random() * 100
            }
          : f
      ));

    } catch (error) {
      if (error instanceof Error && error.message !== 'Upload cancelled') {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'error', error: error.message }
            : f
        ));
        onError?.(error.message, uploadFile);
      }
    } finally {
      uploadControllers.current.delete(uploadFile.id);
    }
  };

  // Start uploads
  const startUploads = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' && !f.error);
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    try {
      // Upload files with concurrency limit
      const uploadPromises: Promise<void>[] = [];
      let activeUploads = 0;

      for (const file of pendingFiles) {
        if (activeUploads >= config.maxConcurrentUploads) {
          await Promise.race(uploadPromises);
          activeUploads--;
        }

        const uploadPromise = uploadFile(file).finally(() => {
          activeUploads--;
        });
        
        uploadPromises.push(uploadPromise);
        activeUploads++;
      }

      await Promise.all(uploadPromises);
      
      const completedFiles = files.filter(f => f.status === 'completed');
      onUploadComplete?.(completedFiles);
      
    } finally {
      setIsUploading(false);
    }
  };

  // Pause upload
  const pauseUpload = (fileId: string) => {
    const controller = uploadControllers.current.get(fileId);
    if (controller) {
      controller.abort();
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'paused' } : f
      ));
    }
  };

  // Resume upload
  const resumeUpload = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file && file.status === 'paused') {
      uploadFile(file);
    }
  };

  // Retry upload
  const retryUpload = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file && file.status === 'error') {
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'pending', error: undefined, progress: 0 } : f
      ));
    }
  };

  // Remove file
  const removeFile = (fileId: string) => {
    const controller = uploadControllers.current.get(fileId);
    if (controller) {
      controller.abort();
      uploadControllers.current.delete(fileId);
    }
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Clear all files
  const clearAll = () => {
    uploadControllers.current.forEach(controller => controller.abort());
    uploadControllers.current.clear();
    setFiles([]);
  };

  // Get file icon
  const getFileIcon = (type: string) => {
    if (type.startsWith('video/')) return <FileVideo size={20} />;
    if (type.startsWith('image/')) return <FileImage size={20} />;
    if (type.startsWith('audio/')) return <FileAudio size={20} />;
    return <File size={20} />;
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} />;
      case 'error': return <AlertCircle size={16} />;
      case 'uploading': return <div className="animate-spin">⟳</div>;
      default: return null;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calculate stats
  const stats = {
    total: files.length,
    completed: files.filter(f => f.status === 'completed').length,
    uploading: files.filter(f => f.status === 'uploading').length,
    errors: files.filter(f => f.status === 'error').length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    uploadedSize: files.reduce((sum, f) => sum + f.uploadedBytes, 0)
  };

  // Update progress callback
  useEffect(() => {
    onUploadProgress?.(files);
  }, [files, onUploadProgress]);

  return (
    <UploadContainer className={className}>
      <DropzoneArea 
        {...getRootProps()} 
        isDragActive={isDragActive} 
        isDragReject={isDragReject}
      >
        <input {...getInputProps()} />
        <UploadIcon />
        <DropzoneText>
          <h3>
            {isDragActive 
              ? 'Drop files here...' 
              : 'Drag & drop media files here'
            }
          </h3>
          <p>
            Support for videos, images, and audio files up to {formatFileSize(config.maxFileSize)}
          </p>
          <BrowseButton type="button" disabled={isUploading}>
            Browse Files
          </BrowseButton>
        </DropzoneText>
      </DropzoneArea>

      {files.length > 0 && (
        <>
          <FileList>
            {files.map(file => (
              <FileItem key={file.id}>
                <FileIcon>
                  {getFileIcon(file.type)}
                </FileIcon>
                
                <FileInfo>
                  <FileName>{file.name}</FileName>
                  <FileDetails>
                    <span>{formatFileSize(file.size)}</span>
                    <span>{file.type}</span>
                    {file.mediaId && <span>ID: {file.mediaId}</span>}
                    {file.trustScore !== undefined && (
                      <span>Trust Score: {file.trustScore.toFixed(1)}%</span>
                    )}
                  </FileDetails>
                  
                  {file.status !== 'pending' && file.status !== 'error' && (
                    <ProgressContainer>
                      <ProgressBar>
                        <ProgressFill progress={file.progress} status={file.status} />
                      </ProgressBar>
                    </ProgressContainer>
                  )}
                  
                  {file.error && (
                    <ErrorMessage>{file.error}</ErrorMessage>
                  )}
                </FileInfo>

                <FileActions>
                  {file.status === 'uploading' && (
                    <ActionButton onClick={() => pauseUpload(file.id)}>
                      <Pause size={16} />
                    </ActionButton>
                  )}
                  
                  {file.status === 'paused' && (
                    <ActionButton onClick={() => resumeUpload(file.id)}>
                      <Play size={16} />
                    </ActionButton>
                  )}
                  
                  {file.status === 'error' && (
                    <ActionButton onClick={() => retryUpload(file.id)}>
                      <RotateCcw size={16} />
                    </ActionButton>
                  )}
                  
                  <ActionButton onClick={() => removeFile(file.id)}>
                    <X size={16} />
                  </ActionButton>
                </FileActions>

                <StatusIcon status={file.status}>
                  {getStatusIcon(file.status)}
                </StatusIcon>
              </FileItem>
            ))}
          </FileList>

          <UploadStats>
            <div>
              {stats.total} files • {formatFileSize(stats.totalSize)} total
              {stats.uploadedSize > 0 && (
                <> • {formatFileSize(stats.uploadedSize)} uploaded</>
              )}
            </div>
            <div>
              {stats.completed} completed • {stats.uploading} uploading • {stats.errors} errors
            </div>
          </UploadStats>

          <GlobalActions>
            <GlobalButton 
              variant="primary" 
              onClick={startUploads}
              disabled={isUploading || files.filter(f => f.status === 'pending' && !f.error).length === 0}
            >
              {isUploading ? 'Uploading...' : 'Start Upload'}
            </GlobalButton>
            
            <GlobalButton onClick={clearAll} disabled={isUploading}>
              Clear All
            </GlobalButton>
            
            {stats.errors > 0 && (
              <GlobalButton 
                variant="secondary"
                onClick={() => {
                  files.filter(f => f.status === 'error').forEach(f => retryUpload(f.id));
                }}
              >
                Retry Failed
              </GlobalButton>
            )}
          </GlobalActions>
        </>
      )}
    </UploadContainer>
  );
};

export default MediaUploadInterface;