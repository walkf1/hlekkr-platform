const { S3Client, CreateMultipartUploadCommand, PutObjectCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
// const { InputValidator } = require('./shared/input-validator');

// Inline validation for demo
function validateFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid fileName: must be non-empty string');
  }
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Invalid fileName: path traversal detected');
  }
  if (fileName.length > 255 || !/^[a-zA-Z0-9._\s-]+$/.test(fileName)) {
    throw new Error('Invalid fileName: invalid characters or too long');
  }
  return fileName.trim();
}

function validateFileType(fileType) {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/avi', 'video/mov', 'video/webm'
  ];
  if (!allowedTypes.includes(fileType)) {
    throw new Error(`Invalid fileType: ${fileType} not allowed`);
  }
  return fileType;
}

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION,
  requestChecksumCalculation: 'WHEN_REQUIRED'
});
const MEDIA_BUCKET = process.env.MEDIA_BUCKET_NAME;

exports.handler = async (event) => {
  console.log('Upload request:', event);
  
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const path = event.path || event.resource;
    const body = JSON.parse(event.body || '{}');

    // Handle multipart initialize
    if (path.includes('/multipart/initialize')) {
      const { fileName, fileType } = body;
      if (!fileName || !fileType) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'fileName and fileType required' })
        };
      }

      const mediaId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const s3Key = `uploads/${mediaId}/${fileName}`;

      const createMultipartCommand = new CreateMultipartUploadCommand({
        Bucket: MEDIA_BUCKET,
        Key: s3Key,
        ContentType: fileType
      });

      const multipartResult = await s3Client.send(createMultipartCommand);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          uploadId: multipartResult.UploadId,
          key: s3Key
        })
      };
    }

    // Handle multipart URLs
    if (path.includes('/multipart/urls')) {
      const { uploadId, key, partNumbers } = body;
      if (!uploadId || !key || !partNumbers) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'uploadId, key, and partNumbers required' })
        };
      }

      const urls = {};
      for (const partNumber of partNumbers) {
        const uploadPartCommand = new UploadPartCommand({
          Bucket: MEDIA_BUCKET,
          Key: key,
          PartNumber: partNumber,
          UploadId: uploadId
        });
        urls[partNumber] = await getSignedUrl(s3Client, uploadPartCommand, { expiresIn: 3600 });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ urls })
      };
    }

    // Handle multipart complete
    if (path.includes('/multipart/complete')) {
      const { uploadId, key, parts } = body;
      if (!uploadId || !key || !parts) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'uploadId, key, and parts required' })
        };
      }

      // Validate parts have ETags
      const validParts = parts.filter(part => part.etag);
      if (validParts.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Parts must include etag values from upload responses' })
        };
      }

      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: MEDIA_BUCKET,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { 
          Parts: validParts.map(part => ({
            PartNumber: part.partNumber,
            ETag: part.etag
          }))
        }
      });

      const result = await s3Client.send(completeCommand);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          location: result.Location,
          mediaId: key.split('/')[1]
        })
      };
    }

    // Handle multipart abort
    if (path.includes('/multipart/abort')) {
      const { uploadId, key } = body;
      if (!uploadId || !key) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'uploadId and key required' })
        };
      }

      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: MEDIA_BUCKET,
        Key: key,
        UploadId: uploadId
      });

      await s3Client.send(abortCommand);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // Handle presigned URL for simple upload
    if (path.includes('/presigned-url')) {
      const { fileName, fileType } = body;
      if (!fileName || !fileType) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'fileName and fileType required' })
        };
      }
      
      try {
        validateFileName(fileName);
        validateFileType(fileType);
      } catch (error) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: error.message })
        };
      }

      const mediaId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const s3Key = `uploads/${mediaId}/${fileName}`;

      const putCommand = new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: s3Key,
        ContentType: fileType
      });

      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          uploadUrl,
          key: s3Key
        })
      };
    }

    // Handle upload complete notification
    if (path.includes('/complete')) {
      const { key, fileName, fileSize, fileType } = body;
      if (!key || !fileName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'key and fileName required' })
        };
      }

      // Extract mediaId from key
      const mediaId = key.split('/')[1];
      
      // Store metadata in DynamoDB for deepfake analysis
      const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
      const { marshall } = require('@aws-sdk/util-dynamodb');
      const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
      
      try {
        await dynamoClient.send(new PutItemCommand({
          TableName: process.env.AUDIT_TABLE_NAME,
          Item: marshall({
            mediaId,
            timestamp: new Date().toISOString(),
            eventType: 'metadata_extraction',
            eventSource: 'hlekkr:upload_handler',
            metadata: {
              fileName,
              fileSize: fileSize || 0,
              mediaType: fileType?.startsWith('video/') ? 'video' : fileType?.startsWith('image/') ? 'image' : 'unknown',
              contentType: fileType,
              s3Location: {
                bucket: MEDIA_BUCKET,
                key: key
              },
              uploadedAt: new Date().toISOString()
            }
          })
        }));
      } catch (error) {
        console.error('Failed to store metadata:', error);
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          mediaId,
          location: `https://${MEDIA_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
        })
      };
    }

    // Handle regular upload
    const { fileName, fileType, fileSize } = body;

    if (!fileName || !fileType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'fileName and fileType required' })
      };
    }

    const mediaId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const s3Key = `uploads/${mediaId}/${fileName}`;

    // For large files, use multipart upload
    if (fileSize && fileSize > 100 * 1024 * 1024) {
      const createMultipartCommand = new CreateMultipartUploadCommand({
        Bucket: MEDIA_BUCKET,
        Key: s3Key,
        ContentType: fileType
      });

      const multipartResult = await s3Client.send(createMultipartCommand);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          mediaId,
          uploadId: multipartResult.UploadId,
          key: s3Key,
          type: 'multipart'
        })
      };
    }

    // For smaller files, use presigned URL
    const putCommand = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: s3Key,
      ContentType: fileType
    });

    const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        mediaId,
        uploadUrl,
        key: s3Key,
        type: 'direct'
      })
    };

  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Upload failed' })
    };
  }
};