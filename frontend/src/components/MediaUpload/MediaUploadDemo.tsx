import React, { useState } from 'react';
import styled from 'styled-components';
import { EnhancedMediaUpload } from './EnhancedMediaUpload';
import { UploadFile } from './MediaUploadInterface';
import { useMedia } from '../../context/MediaContext';
// import { testApiConnection } from '../../services/testAnalysis';
import { 
  Upload, 
  Shield, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  FileText,
  Settings
} from 'lucide-react';

const DemoContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
`;

const DemoContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 48px;
  color: white;
`;

const Title = styled.h1`
  font-size: 48px;
  font-weight: 800;
  margin: 0 0 16px;
  background: linear-gradient(135deg, #ffffff, #e0e7ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Subtitle = styled.p`
  font-size: 20px;
  opacity: 0.9;
  margin: 0 0 32px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 48px;
`;

const FeatureCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

const FeatureIcon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
`;

const FeatureTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
`;

const FeatureDescription = styled.p`
  font-size: 14px;
  opacity: 0.8;
  margin: 0;
`;

const ConfigSection = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 32px;
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

const ConfigTitle = styled.h3`
  color: white;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ConfigGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const ConfigItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ConfigLabel = styled.label`
  color: white;
  font-size: 14px;
  font-weight: 500;
`;

const ConfigInput = styled.input`
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  
  &::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.15);
  }
`;

const ConfigSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.15);
  }
  
  option {
    background: #374151;
    color: white;
  }
`;

const ConfigCheckbox = styled.input`
  margin-right: 8px;
`;

const StatsSection = styled.div`
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 24px;
  margin-top: 32px;
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

const StatsTitle = styled.h3`
  color: white;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
`;

const StatItem = styled.div`
  text-align: center;
  color: white;
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  opacity: 0.8;
`;

const FileList = styled.div`
  margin-top: 16px;
  max-height: 200px;
  overflow-y: auto;
`;

const FileItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 8px;
  color: white;
  font-size: 14px;
`;

const FileStatus = styled.span<{ status: string }>`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => {
    switch (props.status) {
      case 'completed': return 'rgba(16, 185, 129, 0.2)';
      case 'error': return 'rgba(239, 68, 68, 0.2)';
      case 'uploading': return 'rgba(59, 130, 246, 0.2)';
      default: return 'rgba(156, 163, 175, 0.2)';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'completed': return '#10b981';
      case 'error': return '#ef4444';
      case 'uploading': return '#3b82f6';
      default: return '#9ca3af';
    }
  }};
`;

export const MediaUploadDemo: React.FC = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [allFiles, setAllFiles] = useState<UploadFile[]>([]);
  const [config, setConfig] = useState({
    maxFileSize: 500,
    maxFiles: 10,
    maxConcurrentUploads: 3,
    autoStart: false,
    showTrustScores: true,
    enableResumableUploads: true
  });

  const { addUploadedMedia } = useMedia();
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(false);
  
  const handleUploadComplete = (files: UploadFile[]) => {
    setUploadedFiles(prev => [...prev, ...files]);
    
    // Add each file to media context
    files.forEach(file => {
      const trustScore = file.trustScore || (file.type.startsWith('image/') ? 85 : 32);
      addUploadedMedia({
        mediaId: file.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        location: file.url || '',
        status: 'completed',
        trustScore: trustScore > 1 ? trustScore : Math.round(trustScore * 100),
        deepfakeConfidence: file.type.startsWith('image/') ? 0.15 : 0.75,
        analysisStatus: 'completed',
        securityScan: { status: 'completed', result: 'clean' },
        metadataExtraction: { status: 'completed' },
        bedrockAnalysis: { 
          status: 'completed',
          claudeSonnet: { confidence: file.type.startsWith('image/') ? 0.15 : 0.78, techniques: ['analysis_complete'] },
          claudeHaiku: { confidence: file.type.startsWith('image/') ? 0.12 : 0.72, techniques: ['processing_done'] },
          titan: { confidence: file.type.startsWith('image/') ? 0.18 : 0.75, techniques: ['validation_complete'] }
        },
        hitlReview: { status: 'not_required' }
      });
    });
    
    console.log('Upload completed and added to context:', files);
  };

  const handleUploadProgress = (files: UploadFile[]) => {
    setAllFiles(files);
  };

  const handleError = (error: string, file?: UploadFile) => {
    console.error('Upload error:', error, file);
  };

  const handleFileAnalysisComplete = (file: UploadFile, analysis: any) => {
    console.log('Analysis completed:', file, analysis);
    
    // Convert trust score to 0-100 scale if needed
    const trustScore = analysis.trustScore > 1 ? analysis.trustScore : analysis.trustScore * 100;
    
    // Add to media context when analysis completes
    addUploadedMedia({
      mediaId: analysis.mediaId || file.id,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      location: file.url || '',
      status: 'completed',
      trustScore: Math.round(trustScore),
      deepfakeConfidence: analysis.analysisResults?.deepfakeDetection?.probability || 0.5,
      analysisStatus: 'completed',
      securityScan: { status: 'completed', result: 'clean' },
      metadataExtraction: { status: 'completed' },
      bedrockAnalysis: { 
        status: 'completed',
        claudeSonnet: { confidence: analysis.analysisResults?.deepfakeDetection?.confidence || 0.5, techniques: ['analysis_complete'] },
        claudeHaiku: { confidence: analysis.analysisResults?.deepfakeDetection?.confidence || 0.5, techniques: ['processing_done'] },
        titan: { confidence: analysis.analysisResults?.deepfakeDetection?.confidence || 0.5, techniques: ['validation_complete'] }
      },
      hitlReview: { status: 'not_required' }
    });
  };

  const formatFileSize = (mb: number) => {
    return mb >= 1000 ? `${(mb / 1000).toFixed(1)}GB` : `${mb}MB`;
  };

  const stats = {
    totalFiles: allFiles.length,
    completedFiles: allFiles.filter(f => f.status === 'completed').length,
    uploadingFiles: allFiles.filter(f => f.status === 'uploading').length,
    errorFiles: allFiles.filter(f => f.status === 'error').length,
    totalSize: allFiles.reduce((sum, f) => sum + f.size, 0),
    uploadedSize: allFiles.reduce((sum, f) => sum + f.uploadedBytes, 0),
    averageTrustScore: allFiles.filter(f => f.trustScore !== undefined).length > 0 
      ? allFiles.filter(f => f.trustScore !== undefined).reduce((sum, f) => sum + (f.trustScore || 0), 0) / allFiles.filter(f => f.trustScore !== undefined).length
      : 0
  };

  return (
    <DemoContainer>
      <DemoContent>
        <Header>
          <Title>Hlekkr Media Upload</Title>
          <Subtitle>
            Advanced media upload interface with drag & drop, progress tracking, 
            resumable uploads, and simulated deepfake analysis
          </Subtitle>

        </Header>

        <FeatureGrid>
          <FeatureCard>
            <FeatureIcon>
              <Upload size={32} />
            </FeatureIcon>
            <FeatureTitle>Drag & Drop Upload</FeatureTitle>
            <FeatureDescription>
              Intuitive drag and drop interface with support for batch uploads
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <Shield size={32} />
            </FeatureIcon>
            <FeatureTitle>Real-time Analysis</FeatureTitle>
            <FeatureDescription>
              Automatic deepfake detection and trust score calculation
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <Clock size={32} />
            </FeatureIcon>
            <FeatureTitle>Resumable Uploads</FeatureTitle>
            <FeatureDescription>
              Pause and resume large file uploads with multipart support
            </FeatureDescription>
          </FeatureCard>

          <FeatureCard>
            <FeatureIcon>
              <CheckCircle size={32} />
            </FeatureIcon>
            <FeatureTitle>File Validation</FeatureTitle>
            <FeatureDescription>
              Comprehensive file type and size validation with error handling
            </FeatureDescription>
          </FeatureCard>
        </FeatureGrid>

        <ConfigSection>
          <ConfigTitle>
            <Settings size={20} />
            Upload Configuration
          </ConfigTitle>
          <ConfigGrid>
            <ConfigItem>
              <ConfigLabel>Max File Size</ConfigLabel>
              <ConfigSelect
                value={config.maxFileSize}
                onChange={(e) => setConfig(prev => ({ ...prev, maxFileSize: Number(e.target.value) }))}
              >
                <option value={100}>100MB</option>
                <option value={250}>250MB</option>
                <option value={500}>500MB</option>
                <option value={1000}>1GB</option>
                <option value={2000}>2GB</option>
              </ConfigSelect>
            </ConfigItem>

            <ConfigItem>
              <ConfigLabel>Max Files</ConfigLabel>
              <ConfigInput
                type="number"
                min="1"
                max="50"
                value={config.maxFiles}
                onChange={(e) => setConfig(prev => ({ ...prev, maxFiles: Number(e.target.value) }))}
              />
            </ConfigItem>

            <ConfigItem>
              <ConfigLabel>Concurrent Uploads</ConfigLabel>
              <ConfigSelect
                value={config.maxConcurrentUploads}
                onChange={(e) => setConfig(prev => ({ ...prev, maxConcurrentUploads: Number(e.target.value) }))}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </ConfigSelect>
            </ConfigItem>

            <ConfigItem>
              <ConfigLabel>
                <ConfigCheckbox
                  type="checkbox"
                  checked={config.autoStart}
                  onChange={(e) => setConfig(prev => ({ ...prev, autoStart: e.target.checked }))}
                />
                Auto-start uploads
              </ConfigLabel>
            </ConfigItem>

            <ConfigItem>
              <ConfigLabel>
                <ConfigCheckbox
                  type="checkbox"
                  checked={config.showTrustScores}
                  onChange={(e) => setConfig(prev => ({ ...prev, showTrustScores: e.target.checked }))}
                />
                Show trust scores
              </ConfigLabel>
            </ConfigItem>

            <ConfigItem>
              <ConfigLabel>
                <ConfigCheckbox
                  type="checkbox"
                  checked={config.enableResumableUploads}
                  onChange={(e) => setConfig(prev => ({ ...prev, enableResumableUploads: e.target.checked }))}
                />
                Enable resumable uploads
              </ConfigLabel>
            </ConfigItem>
          </ConfigGrid>
        </ConfigSection>

        <EnhancedMediaUpload
          config={{
            maxFileSize: config.maxFileSize * 1024 * 1024,
            maxFiles: config.maxFiles,
            maxConcurrentUploads: config.maxConcurrentUploads,
            allowedTypes: [
              'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
              'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
              'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg'
            ],
            chunkSize: 5 * 1024 * 1024,
            apiEndpoint: '/api/media'
          }}
          autoStart={config.autoStart}
          showTrustScores={config.showTrustScores}
          enableResumableUploads={config.enableResumableUploads}
          onUploadComplete={handleUploadComplete}
          onUploadProgress={handleUploadProgress}
          onError={handleError}
          onFileAnalysisComplete={handleFileAnalysisComplete}
        />

        {allFiles.length > 0 && (
          <StatsSection>
            <StatsTitle>
              <FileText size={20} />
              Upload Statistics
            </StatsTitle>
            <StatsGrid>
              <StatItem>
                <StatValue>{stats.totalFiles}</StatValue>
                <StatLabel>Total Files</StatLabel>
              </StatItem>
              <StatItem>
                <StatValue>{stats.completedFiles}</StatValue>
                <StatLabel>Completed</StatLabel>
              </StatItem>
              <StatItem>
                <StatValue>{stats.uploadingFiles}</StatValue>
                <StatLabel>Uploading</StatLabel>
              </StatItem>
              <StatItem>
                <StatValue>{stats.errorFiles}</StatValue>
                <StatLabel>Errors</StatLabel>
              </StatItem>
              <StatItem>
                <StatValue>{formatFileSize(Math.round(stats.totalSize / (1024 * 1024)))}</StatValue>
                <StatLabel>Total Size</StatLabel>
              </StatItem>
              <StatItem>
                <StatValue>{stats.averageTrustScore.toFixed(1)}%</StatValue>
                <StatLabel>Avg Trust Score</StatLabel>
              </StatItem>
            </StatsGrid>

            {allFiles.length > 0 && (
              <FileList>
                {allFiles.map(file => (
                  <FileItem key={file.id}>
                    <span>{file.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {file.trustScore !== undefined && (
                        <span>{file.trustScore.toFixed(1)}%</span>
                      )}
                      <FileStatus status={file.status}>
                        {file.status}
                      </FileStatus>
                    </div>
                  </FileItem>
                ))}
              </FileList>
            )}
          </StatsSection>
        )}
      </DemoContent>
    </DemoContainer>
  );
};

export default MediaUploadDemo;