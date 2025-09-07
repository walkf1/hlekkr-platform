# Hlekkr Media Upload Interface

## Overview

The Hlekkr Media Upload Interface is a comprehensive React component suite for uploading media files with advanced features including drag & drop, progress tracking, resumable uploads, file validation, and real-time deepfake analysis integration.

## Features

### 🎯 **Core Upload Features**

- **Drag & Drop Interface**: Intuitive drag and drop with visual feedback
- **Batch Upload Support**: Upload multiple files simultaneously with concurrency control
- **Progress Tracking**: Real-time upload progress with visual indicators
- **Resumable Uploads**: Pause and resume large file uploads using multipart upload
- **File Validation**: Comprehensive validation for file types, sizes, and content
- **Error Handling**: Graceful error handling with retry mechanisms

### 🔍 **Advanced Analysis Integration**

- **Real-time Analysis**: Automatic deepfake detection and trust score calculation
- **Trust Score Display**: Visual trust score indicators with color-coded badges
- **Analysis Results**: Detailed analysis results including manipulation techniques
- **Processing Status**: Real-time status updates during analysis
- **Interactive Results**: Expandable analysis details and recommendations

### 🛠️ **Technical Features**

- **Multipart Upload**: Efficient handling of large files with chunked uploads
- **S3 Integration**: Direct upload to AWS S3 with presigned URLs
- **Upload Resume**: Resume interrupted uploads from where they left off
- **Concurrent Uploads**: Configurable concurrent upload limits
- **File Integrity**: Hash-based file integrity verification
- **Memory Efficient**: Streaming uploads without loading entire files into memory

## Components

### MediaUploadInterface

Basic upload interface with core functionality:

```tsx
import { MediaUploadInterface } from './components/MediaUpload';

<MediaUploadInterface
  config={{
    maxFileSize: 500 * 1024 * 1024, // 500MB
    maxFiles: 10,
    allowedTypes: ['video/mp4', 'image/jpeg', 'audio/mp3'],
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    maxConcurrentUploads: 3,
    apiEndpoint: '/api/media'
  }}
  onUploadComplete={(files) => console.log('Completed:', files)}
  onUploadProgress={(files) => console.log('Progress:', files)}
  onError={(error, file) => console.error('Error:', error, file)}
/>
```

### EnhancedMediaUpload

Advanced upload interface with analysis integration:

```tsx
import { EnhancedMediaUpload } from './components/MediaUpload';

<EnhancedMediaUpload
  config={{
    maxFileSize: 500 * 1024 * 1024,
    maxFiles: 10,
    allowedTypes: ['video/mp4', 'image/jpeg', 'audio/mp3'],
    chunkSize: 5 * 1024 * 1024,
    maxConcurrentUploads: 3,
    apiEndpoint: '/api/media'
  }}
  autoStart={true}
  showTrustScores={true}
  enableResumableUploads={true}
  onUploadComplete={(files) => console.log('Upload completed:', files)}
  onFileAnalysisComplete={(file, analysis) => console.log('Analysis:', analysis)}
  onError={(error, file) => console.error('Error:', error)}
/>
```

### MediaUploadDemo

Complete demo showcasing all features:

```tsx
import { MediaUploadDemo } from './components/MediaUpload/MediaUploadDemo';

<MediaUploadDemo />
```

## Configuration

### MediaUploadConfig

```typescript
interface MediaUploadConfig {
  maxFileSize: number;        // Maximum file size in bytes
  maxFiles: number;           // Maximum number of files
  allowedTypes: string[];     // Allowed MIME types
  chunkSize: number;          // Chunk size for multipart upload
  maxConcurrentUploads: number; // Max concurrent uploads
  apiEndpoint: string;        // API endpoint for uploads
}
```

### Supported File Types

- **Video**: MP4, AVI, MOV, WMV, FLV
- **Image**: JPEG, JPG, PNG, GIF, WebP
- **Audio**: MP3, WAV, AAC, OGG

### Default Configuration

```typescript
const defaultConfig = {
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
```

## Upload Service Integration

### UploadService

The upload service handles the actual file uploads with S3 integration:

```typescript
import { uploadService } from './services/uploadService';

// Configure the service
const service = new UploadService({
  apiEndpoint: '/api',
  region: 'us-east-1',
  chunkSize: 5 * 1024 * 1024,
  maxRetries: 3
});

// Use with components
<EnhancedMediaUpload uploadService={service} />
```

### Upload Methods

- **Simple Upload**: For files smaller than chunk size
- **Multipart Upload**: For large files with resumable capability
- **Resumable Upload**: Resume interrupted multipart uploads

### S3 Integration

```typescript
// Get upload credentials
const credentials = await service.getUploadCredentials();

// Initialize multipart upload
const upload = await service.initializeMultipartUpload(fileName, fileType);

// Upload parts
const result = await service.uploadFileMultipart(uploadFile, onProgress);
```

## Styling and Theming

### Styled Components

The components use styled-components for styling with a modern, accessible design:

```typescript
const UploadContainer = styled.div`
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
`;
```

### Customization

Override styles by passing a `className` prop:

```tsx
<EnhancedMediaUpload 
  className="custom-upload-interface"
  // ... other props
/>
```

### Theme Colors

- **Primary**: #3b82f6 (Blue)
- **Success**: #10b981 (Green)
- **Warning**: #f59e0b (Amber)
- **Error**: #ef4444 (Red)
- **Gray**: #6b7280 (Neutral)

## State Management

### Upload File State

```typescript
interface UploadFile {
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
```

### Status Flow

```
pending → uploading → completed
    ↓         ↓
  error ← paused → uploading
    ↓
  validating → completed
```

## Event Handling

### Callback Props

```typescript
interface CallbackProps {
  onUploadComplete?: (files: UploadFile[]) => void;
  onUploadProgress?: (files: UploadFile[]) => void;
  onError?: (error: string, file?: UploadFile) => void;
  onFileAnalysisComplete?: (file: UploadFile, analysis: MediaAnalysisResult) => void;
}
```

### Usage Examples

```tsx
<EnhancedMediaUpload
  onUploadComplete={(files) => {
    console.log(`${files.length} files uploaded successfully`);
    // Update application state
    setUploadedFiles(prev => [...prev, ...files]);
  }}
  
  onUploadProgress={(files) => {
    const totalProgress = files.reduce((sum, f) => sum + f.progress, 0) / files.length;
    setOverallProgress(totalProgress);
  }}
  
  onError={(error, file) => {
    console.error('Upload error:', error);
    // Show user notification
    showNotification(`Upload failed: ${error}`, 'error');
  }}
  
  onFileAnalysisComplete={(file, analysis) => {
    console.log(`Analysis complete for ${file.name}:`, analysis);
    // Update trust score display
    updateTrustScore(file.mediaId, analysis.trustScore);
  }}
/>
```

## Performance Optimization

### Memory Management

- **Streaming Uploads**: Files are uploaded in chunks without loading entirely into memory
- **Garbage Collection**: Completed uploads are cleaned up automatically
- **Abort Controllers**: Proper cleanup of cancelled uploads

### Network Optimization

- **Concurrent Limits**: Configurable concurrent upload limits prevent network congestion
- **Retry Logic**: Exponential backoff for failed uploads
- **Compression**: Optional client-side compression for supported file types

### UI Performance

- **Virtual Scrolling**: For large file lists (planned feature)
- **Debounced Updates**: Progress updates are debounced to prevent excessive re-renders
- **Memoization**: Components use React.memo and useMemo for optimization

## Accessibility

### ARIA Support

- **Screen Reader Support**: Proper ARIA labels and descriptions
- **Keyboard Navigation**: Full keyboard accessibility
- **Focus Management**: Proper focus handling during uploads
- **Status Announcements**: Screen reader announcements for status changes

### Keyboard Shortcuts

- **Space/Enter**: Activate dropzone
- **Escape**: Cancel current operation
- **Tab**: Navigate between elements
- **Delete**: Remove selected files

## Testing

### Test Coverage

- **Unit Tests**: Component rendering and behavior
- **Integration Tests**: Upload service integration
- **E2E Tests**: Complete upload workflows
- **Accessibility Tests**: ARIA compliance and keyboard navigation

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test MediaUpload.test.tsx
```

### Test Utilities

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaUploadInterface } from './MediaUploadInterface';

// Mock file for testing
const mockFile = new File(['test content'], 'test.mp4', { type: 'video/mp4' });

// Test file drop
const dropzone = screen.getByTestId('dropzone');
fireEvent.drop(dropzone, { dataTransfer: { files: [mockFile] } });
```

## Browser Support

### Supported Browsers

- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

### Required APIs

- **File API**: For file handling
- **Drag and Drop API**: For drag & drop functionality
- **Fetch API**: For upload requests
- **Web Crypto API**: For file hashing (optional)

### Polyfills

```typescript
// Add polyfills for older browsers
import 'whatwg-fetch'; // Fetch API
import 'web-streams-polyfill'; // Streams API
```

## Deployment

### Environment Variables

```bash
# API Configuration
REACT_APP_API_ENDPOINT=https://api.hlekkr.com
REACT_APP_AWS_REGION=us-east-1

# Upload Configuration
REACT_APP_MAX_FILE_SIZE=524288000  # 500MB
REACT_APP_MAX_FILES=10
REACT_APP_CHUNK_SIZE=5242880       # 5MB
```

### Build Configuration

```json
{
  "scripts": {
    "build": "react-scripts build",
    "build:analyze": "npm run build && npx webpack-bundle-analyzer build/static/js/*.js"
  }
}
```

### CDN Integration

```typescript
// Configure for CDN deployment
const uploadService = new UploadService({
  apiEndpoint: process.env.REACT_APP_API_ENDPOINT,
  region: process.env.REACT_APP_AWS_REGION,
  // ... other config
});
```

## Security Considerations

### File Validation

- **Client-side Validation**: Initial validation for user experience
- **Server-side Validation**: Authoritative validation on the backend
- **Content Scanning**: Virus and malware scanning integration
- **File Type Detection**: Magic number validation beyond MIME types

### Upload Security

- **Presigned URLs**: Secure, time-limited upload URLs
- **CORS Configuration**: Proper CORS setup for S3 uploads
- **Authentication**: User authentication for upload permissions
- **Rate Limiting**: Upload rate limiting to prevent abuse

### Data Protection

- **Encryption**: Files encrypted in transit and at rest
- **Access Control**: IAM-based access control for uploads
- **Audit Logging**: Complete audit trail of upload activities
- **Data Retention**: Configurable data retention policies

## Troubleshooting

### Common Issues

1. **Upload Failures**
   - Check network connectivity
   - Verify API endpoint configuration
   - Check file size and type restrictions
   - Review browser console for errors

2. **Performance Issues**
   - Reduce concurrent upload limit
   - Increase chunk size for large files
   - Check available bandwidth
   - Monitor memory usage

3. **UI Issues**
   - Clear browser cache
   - Check for JavaScript errors
   - Verify component props
   - Test in different browsers

### Debug Mode

```typescript
// Enable debug logging
const uploadService = new UploadService({
  // ... config
  debug: true
});

// Component debug props
<EnhancedMediaUpload
  debug={true}
  // ... other props
/>
```

### Error Codes

- **VALIDATION_ERROR**: File validation failed
- **UPLOAD_ERROR**: Upload request failed
- **NETWORK_ERROR**: Network connectivity issue
- **SERVER_ERROR**: Server-side error
- **QUOTA_EXCEEDED**: Upload quota exceeded

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm start`
4. Run tests: `npm test`

### Code Style

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb configuration with React hooks
- **Prettier**: Automatic code formatting
- **Styled Components**: CSS-in-JS styling

### Pull Request Process

1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Code review and approval

## License

This project is licensed under the MIT License - see the LICENSE file for details.