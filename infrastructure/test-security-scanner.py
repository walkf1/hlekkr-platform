#!/usr/bin/env python3
"""
Test script for Hlekkr security scanner functionality.
"""

import json
import boto3
import os
import tempfile
import hashlib
from datetime import datetime

def create_test_files():
    """Create test files for security scanning."""
    test_files = []
    
    # Create a clean test image
    clean_image = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    # Simple JPEG header
    clean_image.write(b'\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xFF\xDB')
    clean_image.write(b'Test clean image content')
    clean_image.close()
    test_files.append(('clean_image.jpg', clean_image.name))
    
    # Create a suspicious file (executable disguised as image)
    suspicious_file = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    suspicious_file.write(b'MZ')  # PE header signature
    suspicious_file.write(b'This is actually an executable disguised as an image')
    suspicious_file.close()
    test_files.append(('suspicious_file.jpg', suspicious_file.name))
    
    # Create a file with wrong extension
    wrong_extension = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
    wrong_extension.write(b'\xFF\xD8\xFF\xE0')  # JPEG header in MP4 file
    wrong_extension.write(b'This is actually a JPEG with wrong extension')
    wrong_extension.close()
    test_files.append(('wrong_extension.mp4', wrong_extension.name))
    
    return test_files

def upload_test_files(s3_client, bucket_name, test_files):
    """Upload test files to S3."""
    uploaded_files = []
    
    for filename, filepath in test_files:
        key = f"uploads/test/{filename}"
        try:
            s3_client.upload_file(filepath, bucket_name, key)
            uploaded_files.append((filename, key))
            print(f"✅ Uploaded {filename} to s3://{bucket_name}/{key}")
        except Exception as e:
            print(f"❌ Failed to upload {filename}: {str(e)}")
    
    return uploaded_files

def test_security_scanner(lambda_client, function_name, media_id, bucket_name, key):
    """Test the security scanner Lambda function."""
    payload = {
        'mediaId': media_id,
        's3Location': {
            'bucket': bucket_name,
            'key': key
        }
    }
    
    try:
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        result = json.loads(response['Payload'].read())
        
        if response['StatusCode'] == 200:
            body = json.loads(result.get('body', '{}'))
            return {
                'success': True,
                'mediaId': body.get('mediaId'),
                'threatLevel': body.get('scanResults', {}).get('threatLevel'),
                'actionTaken': body.get('actionTaken'),
                'threats': body.get('scanResults', {}).get('threats', [])
            }
        else:
            return {
                'success': False,
                'error': result.get('errorMessage', 'Unknown error')
            }
            
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def check_quarantine_bucket(s3_client, quarantine_bucket):
    """Check if files were moved to quarantine bucket."""
    try:
        response = s3_client.list_objects_v2(Bucket=quarantine_bucket, Prefix='quarantine/')
        return response.get('Contents', [])
    except Exception as e:
        print(f"❌ Error checking quarantine bucket: {str(e)}")
        return []

def main():
    """Main test function."""
    print("🛡️  Testing Hlekkr Security Scanner")
    print("=" * 50)
    
    # Initialize AWS clients
    s3_client = boto3.client('s3')
    lambda_client = boto3.client('lambda')
    
    # Get stack outputs (you may need to adjust these)
    try:
        cf_client = boto3.client('cloudformation')
        stack_response = cf_client.describe_stacks(StackName='HlekkrMvpStack')
        outputs = {output['OutputKey']: output['OutputValue'] 
                  for output in stack_response['Stacks'][0]['Outputs']}
        
        media_bucket = outputs.get('MediaUploadsBucketName')
        quarantine_bucket = outputs.get('QuarantineBucketName')
        security_scanner_arn = outputs.get('SecurityScannerArn')
        
        if not all([media_bucket, quarantine_bucket, security_scanner_arn]):
            print("❌ Could not retrieve all required stack outputs")
            return
            
        function_name = security_scanner_arn.split(':')[-1]
        
    except Exception as e:
        print(f"❌ Error getting stack outputs: {str(e)}")
        print("Please ensure the HlekkrMvpStack is deployed")
        return
    
    print(f"📦 Media bucket: {media_bucket}")
    print(f"🔒 Quarantine bucket: {quarantine_bucket}")
    print(f"⚡ Security scanner: {function_name}")
    print()
    
    # Create test files
    print("📁 Creating test files...")
    test_files = create_test_files()
    
    # Upload test files
    print("⬆️  Uploading test files...")
    uploaded_files = upload_test_files(s3_client, media_bucket, test_files)
    
    # Test security scanner
    print("🔍 Testing security scanner...")
    test_results = []
    
    for filename, key in uploaded_files:
        media_id = f"test_{filename.split('.')[0]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        print(f"\n  Testing {filename} (ID: {media_id})...")
        
        result = test_security_scanner(lambda_client, function_name, media_id, media_bucket, key)
        test_results.append((filename, result))
        
        if result['success']:
            print(f"    ✅ Scan completed")
            print(f"    🎯 Threat level: {result['threatLevel']}")
            print(f"    🚨 Action taken: {result['actionTaken']}")
            if result['threats']:
                print(f"    ⚠️  Threats found: {len(result['threats'])}")
                for threat in result['threats']:
                    print(f"       - {threat.get('type', 'unknown')}: {threat.get('description', 'No description')}")
        else:
            print(f"    ❌ Scan failed: {result['error']}")
    
    # Check quarantine bucket
    print("\n🔒 Checking quarantine bucket...")
    quarantined_files = check_quarantine_bucket(s3_client, quarantine_bucket)
    if quarantined_files:
        print(f"    Found {len(quarantined_files)} quarantined files:")
        for file_obj in quarantined_files:
            print(f"    - {file_obj['Key']} ({file_obj['Size']} bytes)")
    else:
        print("    No files in quarantine")
    
    # Summary
    print("\n📊 Test Summary")
    print("-" * 30)
    successful_scans = sum(1 for _, result in test_results if result['success'])
    print(f"Total tests: {len(test_results)}")
    print(f"Successful scans: {successful_scans}")
    print(f"Failed scans: {len(test_results) - successful_scans}")
    print(f"Files quarantined: {len(quarantined_files)}")
    
    # Cleanup
    print("\n🧹 Cleaning up test files...")
    for filename, filepath in test_files:
        try:
            os.unlink(filepath)
        except:
            pass
    
    print("✅ Security scanner testing completed!")

if __name__ == '__main__':
    main()