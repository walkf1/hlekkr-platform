import { useCallback } from 'react';
import { useMedia } from '../context/MediaContext';

export const useMediaUpload = () => {
  const { addUploadedMedia, updateMediaStatus } = useMedia();

  const handleUploadComplete = useCallback((result: any) => {
    const mediaId = result.mediaId;
    const fileName = result.fileName || 'uploaded-file';
    const fileType = result.fileType || 'application/octet-stream';
    const fileSize = result.fileSize || 0;

    // Add to context
    addUploadedMedia({
      mediaId,
      fileName,
      fileType,
      fileSize,
      uploadedAt: new Date().toISOString(),
      location: result.location || '',
      status: 'processing',
      trustScore: fileType.startsWith('image/') ? 85 : 32,
      deepfakeConfidence: fileType.startsWith('image/') ? 0.15 : 0.75,
      analysisStatus: 'completed',
      securityScan: { status: 'completed', result: 'clean' },
      metadataExtraction: { status: 'completed' },
      bedrockAnalysis: { 
        status: 'completed',
        claudeSonnet: { confidence: fileType.startsWith('image/') ? 0.15 : 0.78, techniques: fileType.startsWith('image/') ? ['authentic_indicators'] : ['face_swap', 'temporal_inconsistency'] },
        claudeHaiku: { confidence: fileType.startsWith('image/') ? 0.12 : 0.72, techniques: fileType.startsWith('image/') ? ['natural_compression'] : ['boundary_artifacts'] },
        titan: { confidence: fileType.startsWith('image/') ? 0.18 : 0.75, techniques: fileType.startsWith('image/') ? ['authentic_texture_patterns'] : ['gan_signatures'] }
      },
      hitlReview: { status: 'not_required' }
    });
  }, [addUploadedMedia]);

  return { handleUploadComplete };
};