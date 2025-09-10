const { S3Client, CreateMultipartUploadCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
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