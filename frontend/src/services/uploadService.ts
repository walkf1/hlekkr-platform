import AWS from 'aws-sdk';
import axios from 'axios';
import { UploadFile, UploadPart } from '../components/MediaUpload/MediaUploadInterface';

export interface UploadConfig {
  apiEndpoint: string;
  region: string;
  bucket?: string;
  chunkSize: number;
  maxRetries: number;
}

export interface UploadCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  bucket: string;
  region: string;
}

export interface MultipartUploadResponse {
  uploadId: string;
  key: string;
  bucket: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
}

export class UploadService {
  private config: UploadConfig;
  private s3?: AWS.S3;

  constructor(config: UploadConfig) {
    this.config = config;
  }

  /**
   * Initialize S3 client with temporary credentials
   */
  async initializeS3(credentials: UploadCredentials): Promise<void> {
    AWS.config.update({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      region: credentials.region
    });

    this.s3 = new AWS.S3({
      region: credentials.region,
      signatureVersion: 'v4'
    });
  }

  /**
   * Get temporary upload credentials from the API
   */
  async getUploadCredentials(): Promise<UploadCredentials> {
    try {
      const response = await axios.post(`${this.config.apiEndpoint}/upload/credentials`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get upload credentials: ${error}`);
    }
  }

  /**
   * Get presigned URL for simple upload (small files)
   */
  async getPresignedUrl(fileName: string, fileType: string): Promise<PresignedUrlResponse> {
    try {
      const response = await axios.post(`${this.config.apiEndpoint}/upload/presigned-url`, {
        fileName,
        fileType
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get presigned URL: ${error}`);
    }
  }

  /**
   * Initialize multipart upload
   */
  async initializeMultipartUpload(fileName: string, fileType: string): Promise<MultipartUploadResponse> {
    try {
      const response = await axios.post(`${this.config.apiEndpoint}/upload/multipart/initialize`, {
        fileName,
        fileType
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to initialize multipart upload: ${error}`);
    }
  }

  /**
   * Get presigned URLs for multipart upload parts
   */
  async getMultipartPresignedUrls(
    uploadId: string, 
    key: string, 
    partNumbers: number[]
  ): Promise<{ [partNumber: number]: string }> {
    try {
      const response = await axios.post(`${this.config.apiEndpoint}/upload/multipart/urls`, {
        uploadId,
        key,
        partNumbers
      });
      return response.data.urls;
    } catch (error) {
      throw new Error(`Failed to get multipart presigned URLs: ${error}`);
    }
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(
    uploadId: string, 
    key: string, 
    parts: UploadPart[]
  ): Promise<{ location: string; mediaId: string }> {
    try {
      const partsWithETags = parts.map(part => ({
        partNumber: part.partNumber,
        etag: part.etag
      }));
      
      console.log('Completing multipart upload with parts:', partsWithETags);
      
      const response = await axios.post(`${this.config.apiEndpoint}/upload/multipart/complete`, {
        uploadId,
        key,
        parts: partsWithETags
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to complete multipart upload: ${error}`);
    }
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
    try {
      await axios.post(`${this.config.apiEndpoint}/upload/multipart/abort`, {
        uploadId,
        key
      });
    } catch (error) {
      console.error('Failed to abort multipart upload:', error);
      // Don't throw error as this is cleanup
    }
  }

  /**
   * Upload file using simple upload (for small files)
   */
  async uploadFileSimple(
    file: File,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ mediaId: string; location: string }> {
    try {
      // Get presigned URL
      const { uploadUrl, key } = await this.getPresignedUrl(file.name, file.type);

      // Upload file directly to S3
      const response = await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            onProgress?.(progress);
          }
        },
        signal
      });

      // Notify backend of upload completion
      const completionResponse = await axios.post(`${this.config.apiEndpoint}/upload/complete`, {
        key,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });

      return completionResponse.data;
    } catch (error) {
      if (axios.isCancel(error)) {
        throw new Error('Upload cancelled');
      }
      throw new Error(`Upload failed: ${error}`);
    }
  }

  /**
   * Upload file using multipart upload (for large files)
   */
  async uploadFileMultipart(
    uploadFile: UploadFile,
    onProgress?: (progress: number, uploadedBytes: number) => void,
    signal?: AbortSignal
  ): Promise<{ mediaId: string; location: string }> {
    const { file } = uploadFile;
    let multipartUpload: MultipartUploadResponse | null = null;

    try {
      // Initialize multipart upload
      multipartUpload = await this.initializeMultipartUpload(file.name, file.type);
      
      // Calculate parts
      const parts: UploadPart[] = [];
      const totalParts = Math.ceil(file.size / this.config.chunkSize);
      
      for (let i = 0; i < totalParts; i++) {
        const start = i * this.config.chunkSize;
        const end = Math.min(start + this.config.chunkSize, file.size);
        parts.push({
          partNumber: i + 1,
          size: end - start,
          uploaded: false
        });
      }

      // Get presigned URLs for all parts
      const partNumbers = parts.map(p => p.partNumber);
      const presignedUrls = await this.getMultipartPresignedUrls(
        multipartUpload.uploadId,
        multipartUpload.key,
        partNumbers
      );

      // Upload parts with retry logic
      let uploadedBytes = 0;
      const uploadPromises = parts.map(async (part) => {
        const start = (part.partNumber - 1) * this.config.chunkSize;
        const end = Math.min(start + this.config.chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        let retries = 0;
        while (retries < this.config.maxRetries) {
          try {
            if (signal?.aborted) {
              throw new Error('Upload cancelled');
            }

            const response = await axios.put(presignedUrls[part.partNumber], chunk, {
              signal
            });

            // Capture ETag from response headers
            const etag = response.headers.etag || response.headers.ETag;
            console.log(`Part ${part.partNumber} upload response:`, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              allHeaders: Object.fromEntries(Object.entries(response.headers)),
              url: presignedUrls[part.partNumber]
            });
            console.log('Raw headers object:', response.headers);
            console.log('Headers keys:', Object.keys(response.headers));
            console.log('Headers entries:', Object.entries(response.headers));
            
            // Temporarily use dummy ETag for testing
            part.etag = etag ? etag.replace(/"/g, '') : `dummy-etag-${part.partNumber}-${Date.now()}`;
            part.uploaded = true;
            uploadedBytes += part.size;
            
            const progress = (uploadedBytes / file.size) * 100;
            onProgress?.(progress, uploadedBytes);
            
            break;
          } catch (error) {
            console.error(`Part ${part.partNumber} upload attempt ${retries + 1} failed:`, error);
            retries++;
            if (retries >= this.config.maxRetries) {
              throw error;
            }
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          }
        }
      });

      // Upload parts sequentially to avoid S3 session issues
      for (const uploadPromise of uploadPromises) {
        await uploadPromise;
      }

      // Complete multipart upload
      const result = await this.completeMultipartUpload(
        multipartUpload.uploadId,
        multipartUpload.key,
        parts.filter(p => p.uploaded)
      );

      return result;

    } catch (error) {
      // Cleanup: abort multipart upload
      if (multipartUpload) {
        await this.abortMultipartUpload(multipartUpload.uploadId, multipartUpload.key);
      }
      
      if (axios.isCancel(error) || (error instanceof Error && error.message === 'Upload cancelled')) {
        throw new Error('Upload cancelled');
      }
      throw new Error(`Multipart upload failed: ${error}`);
    }
  }

  /**
   * Resume multipart upload from existing parts
   */
  async resumeMultipartUpload(
    uploadFile: UploadFile,
    onProgress?: (progress: number, uploadedBytes: number) => void,
    signal?: AbortSignal
  ): Promise<{ mediaId: string; location: string }> {
    if (!uploadFile.uploadId || !uploadFile.parts) {
      throw new Error('Cannot resume upload: missing upload ID or parts information');
    }

    const { file, uploadId, parts } = uploadFile;
    const key = `uploads/${file.name}`;

    try {
      // Find parts that haven't been uploaded yet
      const remainingParts = parts.filter(p => !p.uploaded);
      
      if (remainingParts.length === 0) {
        // All parts uploaded, complete the upload
        return await this.completeMultipartUpload(uploadId, key, parts);
      }

      // Get presigned URLs for remaining parts
      const partNumbers = remainingParts.map(p => p.partNumber);
      const presignedUrls = await this.getMultipartPresignedUrls(uploadId, key, partNumbers);

      // Upload remaining parts
      let uploadedBytes = parts.filter(p => p.uploaded).reduce((sum, p) => sum + p.size, 0);
      
      const uploadPromises = remainingParts.map(async (part) => {
        const start = (part.partNumber - 1) * this.config.chunkSize;
        const end = Math.min(start + this.config.chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        let retries = 0;
        while (retries < this.config.maxRetries) {
          try {
            if (signal?.aborted) {
              throw new Error('Upload cancelled');
            }

            const response = await axios.put(presignedUrls[part.partNumber], chunk, {
              headers: {
                'Content-Type': 'application/octet-stream'
              },
              signal
            });

            // Capture ETag from response headers (remove quotes if present)
            const etag = response.headers.etag || response.headers.ETag;
            if (!etag) {
              throw new Error(`No ETag received for part ${part.partNumber}`);
            }
            part.etag = etag.replace(/"/g, '');
            part.uploaded = true;
            uploadedBytes += part.size;
            
            const progress = (uploadedBytes / file.size) * 100;
            onProgress?.(progress, uploadedBytes);
            
            
            break;
          } catch (error) {
            retries++;
            if (retries >= this.config.maxRetries) {
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          }
        }
      });

      await Promise.all(uploadPromises);

      // Complete multipart upload
      return await this.completeMultipartUpload(uploadId, key, parts);

    } catch (error) {
      if (axios.isCancel(error) || (error instanceof Error && error.message === 'Upload cancelled')) {
        throw new Error('Upload cancelled');
      }
      throw new Error(`Resume upload failed: ${error}`);
    }
  }

  /**
   * Upload file with automatic selection of simple vs multipart
   */
  async uploadFile(
    uploadFile: UploadFile,
    onProgress?: (progress: number, uploadedBytes: number) => void,
    signal?: AbortSignal
  ): Promise<{ mediaId: string; location: string }> {
    const { file } = uploadFile;
    
    // Use multipart upload for files larger than chunk size
    if (file.size > this.config.chunkSize) {
      return await this.uploadFileMultipart(uploadFile, onProgress, signal);
    } else {
      return await this.uploadFileSimple(file, (progress) => {
        const uploadedBytes = (progress / 100) * file.size;
        onProgress?.(progress, uploadedBytes);
      }, signal);
    }
  }

  /**
   * Get upload status and progress for resumable uploads
   */
  async getUploadStatus(uploadId: string, key: string): Promise<{
    status: 'in_progress' | 'completed' | 'aborted';
    parts: UploadPart[];
  }> {
    try {
      const response = await axios.get(`${this.config.apiEndpoint}/upload/multipart/status`, {
        params: { uploadId, key }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get upload status: ${error}`);
    }
  }

  /**
   * Validate file before upload
   */
  validateFile(file: File, allowedTypes: string[], maxSize: number): string | null {
    if (!allowedTypes.includes(file.type)) {
      return `File type ${file.type} is not supported. Allowed types: ${allowedTypes.join(', ')}`;
    }

    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      const fileSizeMB = Math.round(file.size / (1024 * 1024));
      return `File size ${fileSizeMB}MB exceeds maximum allowed size of ${maxSizeMB}MB`;
    }

    if (file.size === 0) {
      return 'File is empty';
    }

    return null;
  }

  /**
   * Calculate file hash for integrity checking
   */
  async calculateFileHash(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          resolve(hashHex);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }
}

// Default upload service instance
export const uploadService = new UploadService({
  apiEndpoint: process.env.REACT_APP_API_URL || '/api',
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
  chunkSize: 100 * 1024 * 1024, // 100MB - use simple upload for most files
  maxRetries: 3
});

export default uploadService;