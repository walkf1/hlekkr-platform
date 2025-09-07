export { MediaUploadInterface } from './MediaUploadInterface';
export { EnhancedMediaUpload } from './EnhancedMediaUpload';
export type { 
  UploadFile, 
  UploadPart, 
  MediaUploadConfig 
} from './MediaUploadInterface';

// Re-export the enhanced version as default
export { EnhancedMediaUpload as default } from './EnhancedMediaUpload';