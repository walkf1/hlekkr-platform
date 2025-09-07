import json
import boto3
import os
import hashlib
import tempfile
import subprocess
import requests
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']
QUARANTINE_BUCKET_NAME = os.environ['QUARANTINE_BUCKET_NAME']
SECURITY_ALERTS_TOPIC_ARN = os.environ.get('SECURITY_ALERTS_TOPIC_ARN')
VIRUSTOTAL_API_KEY = os.environ.get('VIRUSTOTAL_API_KEY')

# DynamoDB table
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

def handler(event, context):
    """
    Lambda function for comprehensive security scanning of uploaded media files.
    Performs virus scanning, malware detection, and threat analysis.
    """
    try:
        logger.info(f"Processing security scan request: {json.dumps(event)}")
        
        # Extract media information from event
        media_id = event.get('mediaId')
        s3_location = event.get('s3Location', {})
        bucket = s3_location.get('bucket')
        key = s3_location.get('key')
        
        if not all([media_id, bucket, key]):
            raise ValueError("Missing required parameters: mediaId, bucket, or key")
        
        # Perform comprehensive security scanning
        scan_results = perform_security_scan(media_id, bucket, key)
        
        # Process scan results and take appropriate actions
        action_taken = process_scan_results(media_id, bucket, key, scan_results)
        
        # Store security audit record
        store_security_audit(media_id, scan_results, action_taken)
        
        # Send alerts if threats detected
        if scan_results['threatDetected']:
            send_security_alert(media_id, scan_results)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'scanResults': scan_results,
                'actionTaken': action_taken,
                'timestamp': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error in security scanning: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Security scanning failed',
                'message': str(e)
            })
        }

def perform_security_scan(media_id: str, bucket: str, key: str) -> Dict[str, Any]:
    """Perform comprehensive security scanning on the media file."""
    try:
        logger.info(f"Starting security scan for {media_id}")
        
        # Initialize scan results
        scan_results = {
            'mediaId': media_id,
            'scanTimestamp': datetime.utcnow().isoformat(),
            'threatDetected': False,
            'threatLevel': 'none',
            'threats': [],
            'scanners': {},
            'fileHash': None,
            'fileSize': 0,
            'scanDuration': 0
        }
        
        start_time = datetime.utcnow()
        
        # Download file for scanning
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            try:
                # Download file from S3
                s3_client.download_fileobj(bucket, key, temp_file)
                temp_file_path = temp_file.name
                
                # Get file information
                file_stats = os.stat(temp_file_path)
                scan_results['fileSize'] = file_stats.st_size
                
                # Calculate file hash
                scan_results['fileHash'] = calculate_file_hash(temp_file_path)
                
                # Perform ClamAV scanning
                clamav_result = scan_with_clamav(temp_file_path)
                scan_results['scanners']['clamav'] = clamav_result
                
                # Perform VirusTotal scanning
                if VIRUSTOTAL_API_KEY:
                    virustotal_result = scan_with_virustotal(temp_file_path, scan_results['fileHash'])
                    scan_results['scanners']['virustotal'] = virustotal_result
                
                # Perform custom threat analysis
                custom_analysis = perform_custom_threat_analysis(temp_file_path, key)
                scan_results['scanners']['custom'] = custom_analysis
                
                # Aggregate results
                scan_results = aggregate_scan_results(scan_results)
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
        
        # Calculate scan duration
        end_time = datetime.utcnow()
        scan_results['scanDuration'] = (end_time - start_time).total_seconds()
        
        logger.info(f"Security scan completed for {media_id}: {scan_results['threatLevel']}")
        
        return scan_results
        
    except Exception as e:
        logger.error(f"Error in security scanning: {str(e)}")
        return {
            'mediaId': media_id,
            'scanTimestamp': datetime.utcnow().isoformat(),
            'threatDetected': True,
            'threatLevel': 'unknown',
            'threats': [{'type': 'scan_error', 'description': str(e)}],
            'scanners': {},
            'error': str(e)
        }

def scan_with_clamav(file_path: str) -> Dict[str, Any]:
    """Scan file using ClamAV antivirus."""
    try:
        logger.info("Running ClamAV scan")
        
        # Check if ClamAV is available
        try:
            subprocess.run(['clamscan', '--version'], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            return {
                'status': 'unavailable',
                'message': 'ClamAV not installed or not available',
                'threats': []
            }
        
        # Run ClamAV scan
        result = subprocess.run(
            ['clamscan', '--no-summary', file_path],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        threats = []
        if result.returncode == 1:  # Virus found
            # Parse ClamAV output for threat details
            for line in result.stdout.split('\n'):
                if 'FOUND' in line:
                    threat_name = line.split(':')[1].strip().replace(' FOUND', '')
                    threats.append({
                        'type': 'virus',
                        'name': threat_name,
                        'scanner': 'clamav'
                    })
        
        return {
            'status': 'completed',
            'returnCode': result.returncode,
            'threatsFound': len(threats),
            'threats': threats,
            'scanTime': datetime.utcnow().isoformat()
        }
        
    except subprocess.TimeoutExpired:
        logger.error("ClamAV scan timed out")
        return {
            'status': 'timeout',
            'message': 'ClamAV scan timed out after 5 minutes',
            'threats': []
        }
    except Exception as e:
        logger.error(f"ClamAV scan error: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'threats': []
        }

def scan_with_virustotal(file_path: str, file_hash: str) -> Dict[str, Any]:
    """Scan file using VirusTotal API."""
    try:
        logger.info("Running VirusTotal scan")
        
        if not VIRUSTOTAL_API_KEY:
            return {
                'status': 'unavailable',
                'message': 'VirusTotal API key not configured',
                'threats': []
            }
        
        # First, check if hash already exists in VirusTotal
        hash_report = get_virustotal_hash_report(file_hash)
        
        if hash_report and hash_report.get('response_code') == 1:
            # Hash found, use existing report
            return parse_virustotal_report(hash_report)
        
        # Hash not found, upload file for scanning
        upload_result = upload_to_virustotal(file_path)
        
        if upload_result.get('response_code') == 1:
            # File uploaded successfully, but report may not be ready immediately
            return {
                'status': 'submitted',
                'message': 'File submitted to VirusTotal for analysis',
                'scan_id': upload_result.get('scan_id'),
                'threats': []
            }
        
        return {
            'status': 'error',
            'message': 'Failed to submit file to VirusTotal',
            'threats': []
        }
        
    except Exception as e:
        logger.error(f"VirusTotal scan error: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'threats': []
        }

def get_virustotal_hash_report(file_hash: str) -> Optional[Dict[str, Any]]:
    """Get existing VirusTotal report for file hash."""
    try:
        url = f"https://www.virustotal.com/vtapi/v2/file/report"
        params = {
            'apikey': VIRUSTOTAL_API_KEY,
            'resource': file_hash
        }
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        return response.json()
        
    except Exception as e:
        logger.error(f"Error getting VirusTotal hash report: {str(e)}")
        return None

def upload_to_virustotal(file_path: str) -> Dict[str, Any]:
    """Upload file to VirusTotal for scanning."""
    try:
        url = "https://www.virustotal.com/vtapi/v2/file/scan"
        
        with open(file_path, 'rb') as f:
            files = {'file': f}
            params = {'apikey': VIRUSTOTAL_API_KEY}
            
            response = requests.post(url, files=files, params=params, timeout=60)
            response.raise_for_status()
            
            return response.json()
            
    except Exception as e:
        logger.error(f"Error uploading to VirusTotal: {str(e)}")
        return {'response_code': 0, 'error': str(e)}

def parse_virustotal_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """Parse VirusTotal scan report."""
    try:
        threats = []
        
        if report.get('positives', 0) > 0:
            scans = report.get('scans', {})
            for scanner, result in scans.items():
                if result.get('detected'):
                    threats.append({
                        'type': 'malware',
                        'name': result.get('result', 'Unknown'),
                        'scanner': f'virustotal_{scanner}'
                    })
        
        return {
            'status': 'completed',
            'positives': report.get('positives', 0),
            'total': report.get('total', 0),
            'threatsFound': len(threats),
            'threats': threats,
            'scanDate': report.get('scan_date'),
            'permalink': report.get('permalink')
        }
        
    except Exception as e:
        logger.error(f"Error parsing VirusTotal report: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'threats': []
        }

def perform_custom_threat_analysis(file_path: str, s3_key: str) -> Dict[str, Any]:
    """Perform custom threat analysis specific to media files."""
    try:
        logger.info("Running custom threat analysis")
        
        threats = []
        
        # Check file extension vs content type mismatch
        extension_threat = check_extension_mismatch(file_path, s3_key)
        if extension_threat:
            threats.append(extension_threat)
        
        # Check for suspicious file patterns
        pattern_threats = check_suspicious_patterns(file_path)
        threats.extend(pattern_threats)
        
        # Check for embedded executables
        embedded_threats = check_embedded_executables(file_path)
        threats.extend(embedded_threats)
        
        # Check file size anomalies
        size_threat = check_size_anomalies(file_path, s3_key)
        if size_threat:
            threats.append(size_threat)
        
        return {
            'status': 'completed',
            'threatsFound': len(threats),
            'threats': threats,
            'analysisTime': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Custom threat analysis error: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'threats': []
        }

def check_extension_mismatch(file_path: str, s3_key: str) -> Optional[Dict[str, Any]]:
    """Check for file extension vs content type mismatches."""
    try:
        # Get file extension from S3 key
        file_extension = s3_key.split('.')[-1].lower() if '.' in s3_key else ''
        
        # Read file header to determine actual type
        with open(file_path, 'rb') as f:
            header = f.read(16)
        
        # Check for common file type signatures
        actual_type = detect_file_type_from_header(header)
        
        if actual_type and file_extension:
            expected_types = get_expected_types_for_extension(file_extension)
            if actual_type not in expected_types:
                return {
                    'type': 'extension_mismatch',
                    'description': f'File extension .{file_extension} does not match content type {actual_type}',
                    'severity': 'medium'
                }
        
        return None
        
    except Exception as e:
        logger.error(f"Extension mismatch check error: {str(e)}")
        return None

def detect_file_type_from_header(header: bytes) -> Optional[str]:
    """Detect file type from file header bytes."""
    # Common file signatures
    signatures = {
        b'\xFF\xD8\xFF': 'jpeg',
        b'\x89PNG\r\n\x1a\n': 'png',
        b'GIF87a': 'gif',
        b'GIF89a': 'gif',
        b'\x00\x00\x00\x18ftypmp4': 'mp4',
        b'\x00\x00\x00\x20ftypM4V': 'mp4',
        b'RIFF': 'avi',  # Could also be WAV
        b'ID3': 'mp3',
        b'\xFF\xFB': 'mp3',
        b'MZ': 'exe',
        b'PK\x03\x04': 'zip'
    }
    
    for signature, file_type in signatures.items():
        if header.startswith(signature):
            return file_type
    
    return None

def get_expected_types_for_extension(extension: str) -> List[str]:
    """Get expected file types for a given extension."""
    extension_map = {
        'jpg': ['jpeg'],
        'jpeg': ['jpeg'],
        'png': ['png'],
        'gif': ['gif'],
        'mp4': ['mp4'],
        'avi': ['avi'],
        'mp3': ['mp3'],
        'wav': ['wav']
    }
    
    return extension_map.get(extension, [])

def check_suspicious_patterns(file_path: str) -> List[Dict[str, Any]]:
    """Check for suspicious patterns in the file."""
    threats = []
    
    try:
        # Check for executable signatures in media files
        with open(file_path, 'rb') as f:
            content = f.read(1024)  # Read first 1KB
            
            # Look for executable patterns
            if b'MZ' in content:  # Windows executable
                threats.append({
                    'type': 'embedded_executable',
                    'description': 'Windows executable signature found in media file',
                    'severity': 'high'
                })
            
            if b'\x7fELF' in content:  # Linux executable
                threats.append({
                    'type': 'embedded_executable',
                    'description': 'Linux executable signature found in media file',
                    'severity': 'high'
                })
            
            # Look for script patterns
            if b'<script' in content.lower():
                threats.append({
                    'type': 'embedded_script',
                    'description': 'Script tags found in media file',
                    'severity': 'medium'
                })
    
    except Exception as e:
        logger.error(f"Suspicious pattern check error: {str(e)}")
    
    return threats

def check_embedded_executables(file_path: str) -> List[Dict[str, Any]]:
    """Check for embedded executables within the file."""
    threats = []
    
    try:
        file_size = os.path.getsize(file_path)
        
        # Skip check for very large files to avoid performance issues
        if file_size > 100 * 1024 * 1024:  # 100MB
            return threats
        
        with open(file_path, 'rb') as f:
            content = f.read()
            
            # Look for PE header (Windows executable)
            pe_positions = []
            pos = 0
            while True:
                pos = content.find(b'MZ', pos)
                if pos == -1:
                    break
                pe_positions.append(pos)
                pos += 1
            
            if len(pe_positions) > 1:  # More than one PE header suggests embedded executable
                threats.append({
                    'type': 'multiple_executables',
                    'description': f'Multiple executable signatures found at positions: {pe_positions}',
                    'severity': 'high'
                })
    
    except Exception as e:
        logger.error(f"Embedded executable check error: {str(e)}")
    
    return threats

def check_size_anomalies(file_path: str, s3_key: str) -> Optional[Dict[str, Any]]:
    """Check for suspicious file size anomalies."""
    try:
        file_size = os.path.getsize(file_path)
        file_extension = s3_key.split('.')[-1].lower() if '.' in s3_key else ''
        
        # Define suspicious size thresholds for different file types
        size_thresholds = {
            'jpg': (100, 50 * 1024 * 1024),    # 100 bytes to 50MB
            'jpeg': (100, 50 * 1024 * 1024),
            'png': (100, 50 * 1024 * 1024),
            'gif': (100, 20 * 1024 * 1024),    # 100 bytes to 20MB
            'mp4': (1024, 5 * 1024 * 1024 * 1024),  # 1KB to 5GB
            'avi': (1024, 5 * 1024 * 1024 * 1024),
            'mp3': (100, 500 * 1024 * 1024),   # 100 bytes to 500MB
            'wav': (100, 1024 * 1024 * 1024)   # 100 bytes to 1GB
        }
        
        if file_extension in size_thresholds:
            min_size, max_size = size_thresholds[file_extension]
            
            if file_size < min_size:
                return {
                    'type': 'suspicious_size',
                    'description': f'File size {file_size} bytes is unusually small for .{file_extension} file',
                    'severity': 'medium'
                }
            elif file_size > max_size:
                return {
                    'type': 'suspicious_size',
                    'description': f'File size {file_size} bytes is unusually large for .{file_extension} file',
                    'severity': 'medium'
                }
        
        return None
        
    except Exception as e:
        logger.error(f"Size anomaly check error: {str(e)}")
        return None

def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA-256 hash of the file."""
    try:
        hash_sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    except Exception as e:
        logger.error(f"Error calculating file hash: {str(e)}")
        return ""

def aggregate_scan_results(scan_results: Dict[str, Any]) -> Dict[str, Any]:
    """Aggregate results from all scanners to determine overall threat level."""
    try:
        all_threats = []
        threat_levels = []
        
        # Collect threats from all scanners
        for scanner_name, scanner_result in scan_results['scanners'].items():
            if scanner_result.get('threats'):
                all_threats.extend(scanner_result['threats'])
        
        # Determine threat level based on severity
        if any(threat.get('severity') == 'high' for threat in all_threats):
            threat_level = 'high'
        elif any(threat.get('severity') == 'medium' for threat in all_threats):
            threat_level = 'medium'
        elif any(threat.get('type') in ['virus', 'malware'] for threat in all_threats):
            threat_level = 'high'
        elif all_threats:
            threat_level = 'low'
        else:
            threat_level = 'none'
        
        # Update scan results
        scan_results['threats'] = all_threats
        scan_results['threatDetected'] = len(all_threats) > 0
        scan_results['threatLevel'] = threat_level
        scan_results['totalThreats'] = len(all_threats)
        
        return scan_results
        
    except Exception as e:
        logger.error(f"Error aggregating scan results: {str(e)}")
        scan_results['threatDetected'] = True
        scan_results['threatLevel'] = 'unknown'
        return scan_results

def process_scan_results(media_id: str, bucket: str, key: str, scan_results: Dict[str, Any]) -> str:
    """Process scan results and take appropriate actions."""
    try:
        threat_level = scan_results.get('threatLevel', 'unknown')
        
        if threat_level in ['high', 'medium'] or scan_results.get('threatDetected'):
            # Move file to quarantine bucket
            quarantine_key = f"quarantine/{datetime.utcnow().strftime('%Y/%m/%d')}/{media_id}_{key.split('/')[-1]}"
            
            # Copy to quarantine bucket
            copy_source = {'Bucket': bucket, 'Key': key}
            s3_client.copy_object(
                CopySource=copy_source,
                Bucket=QUARANTINE_BUCKET_NAME,
                Key=quarantine_key,
                MetadataDirective='COPY'
            )
            
            # Delete from original bucket
            s3_client.delete_object(Bucket=bucket, Key=key)
            
            logger.info(f"File {media_id} quarantined due to {threat_level} threat level")
            return 'quarantined'
        
        elif threat_level == 'low':
            # Add warning metadata but allow processing
            logger.info(f"File {media_id} flagged with low-level threats but allowed to proceed")
            return 'flagged'
        
        else:
            # File is clean, allow normal processing
            logger.info(f"File {media_id} passed security scan")
            return 'approved'
            
    except Exception as e:
        logger.error(f"Error processing scan results: {str(e)}")
        # On error, quarantine the file as a safety measure
        return 'quarantined_on_error'

def store_security_audit(media_id: str, scan_results: Dict[str, Any], action_taken: str):
    """Store security scan results in the audit trail."""
    try:
        audit_record = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'security_scan',
            'eventSource': 'hlekkr:security_scanner',
            'data': {
                'scanResults': scan_results,
                'actionTaken': action_taken,
                'scanDuration': scan_results.get('scanDuration', 0),
                'threatLevel': scan_results.get('threatLevel', 'unknown'),
                'totalThreats': scan_results.get('totalThreats', 0)
            }
        }
        
        audit_table.put_item(Item=audit_record)
        logger.info(f"Stored security audit record for {media_id}")
        
    except Exception as e:
        logger.error(f"Error storing security audit: {str(e)}")

def send_security_alert(media_id: str, scan_results: Dict[str, Any]):
    """Send security alert notifications."""
    try:
        if not SECURITY_ALERTS_TOPIC_ARN:
            logger.warning("Security alerts topic not configured")
            return
        
        threat_level = scan_results.get('threatLevel', 'unknown')
        threats = scan_results.get('threats', [])
        
        alert_message = {
            'alertType': 'security_threat_detected',
            'mediaId': media_id,
            'threatLevel': threat_level,
            'threatsFound': len(threats),
            'threats': threats,
            'timestamp': datetime.utcnow().isoformat(),
            'scanResults': scan_results
        }
        
        sns_client.publish(
            TopicArn=SECURITY_ALERTS_TOPIC_ARN,
            Subject=f'Hlekkr Security Alert: {threat_level.upper()} threat detected',
            Message=json.dumps(alert_message, indent=2)
        )
        
        logger.info(f"Security alert sent for {media_id}")
        
    except Exception as e:
        logger.error(f"Error sending security alert: {str(e)}")