const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log('Virus scan request:', JSON.stringify(event, null, 2));
  
  try {
    const { bucket, key } = event;
    
    if (!bucket || !key) {
      throw new Error('Missing bucket or key parameter');
    }
    
    // Download file from S3
    const tempFile = `/tmp/${path.basename(key)}`;
    const getObjectCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getObjectCommand);
    
    // Write to temp file
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    fs.writeFileSync(tempFile, Buffer.concat(chunks));
    
    // Run ClamAV scan
    try {
      execSync(`/opt/bin/clamscan --database=/opt/clamav ${tempFile}`, { 
        stdio: 'pipe',
        timeout: 30000 
      });
      
      // Clean file
      fs.unlinkSync(tempFile);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          bucket,
          key,
          status: 'clean',
          scannedAt: new Date().toISOString()
        })
      };
      
    } catch (scanError) {
      // Virus found or scan error
      fs.unlinkSync(tempFile);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          bucket,
          key,
          status: 'infected',
          error: scanError.message,
          scannedAt: new Date().toISOString()
        })
      };
    }
    
  } catch (error) {
    console.error('Virus scan error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Virus scan failed',
        message: error.message
      })
    };
  }
};