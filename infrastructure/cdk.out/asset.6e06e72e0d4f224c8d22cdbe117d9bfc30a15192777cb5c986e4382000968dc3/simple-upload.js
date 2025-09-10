const { S3Client, CreateMultipartUploadCommand, PutObjectCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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