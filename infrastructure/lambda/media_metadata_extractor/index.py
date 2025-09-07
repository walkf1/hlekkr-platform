import json
import boto3
import os
import uuid
import tempfile
from datetime import datetime
from typing import Dict, Any
import logging

# Media processing libraries
try:
    from PIL import Image
    from PIL.ExifTags import TAGS
    import exifread
    import ffmpeg
    from mutagen import File as MutagenFile
    MEDIA_LIBRARIES_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Media processing libraries not available: {e}")
    MEDIA_LIBRARIES_AVAILABLE = False

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']
SECURITY_SCANNER_FUNCTION_NAME = os.environ.get('SECURITY_SCANNER_FUNCTION_NAME')

# DynamoDB table
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

def handler(event, context):
    """
    Lambda function to extract metadata from uploaded media files.
    Triggered by S3 events when media files are uploaded.
    """
    try:
        logger.info(f"Processing event: {json.dumps(event)}")
        
        # Process each record in the event
        for record in event.get('Records', []):
            if record.get('eventSource') == 'aws:s3':
                process_s3_event(record)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Metadata extraction completed successfully',
                'processedRecords': len(event.get('Records', []))
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing metadata extraction: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Metadata extraction failed',
                'message': str(e)
            })
        }

def process_s3_event(record: Dict[str, Any]):
    """Process a single S3 event record."""
    try:
        # Extract S3 event details
        bucket_name = record['s3']['bucket']['name']
        object_key = record['s3']['object']['key']
        event_name = record['eventName']
        
        logger.info(f"Processing {event_name} for {object_key} in {bucket_name}")
        
        # Generate media ID from object key
        media_id = generate_media_id(object_key)
        
        # First, invoke security scanner if configured
        security_result = None
        if SECURITY_SCANNER_FUNCTION_NAME:
            security_result = invoke_security_scanner(media_id, bucket_name, object_key)
            
            # Check if file was quarantined
            if security_result and security_result.get('actionTaken') == 'quarantined':
                logger.warning(f"File {media_id} was quarantined, skipping metadata extraction")
                return
        
        # Extract metadata from the media file (only if not quarantined)
        metadata = extract_media_metadata(bucket_name, object_key)
        
        # Add security scan results to metadata if available
        if security_result:
            metadata['securityScan'] = security_result
        
        # Store metadata in audit table
        store_metadata_audit(media_id, object_key, metadata, event_name)
        
        logger.info(f"Successfully processed metadata for {media_id}")
        
    except Exception as e:
        logger.error(f"Error processing S3 event: {str(e)}")
        raise

def generate_media_id(object_key: str) -> str:
    """Generate a unique media ID from the object key."""
    # Remove path prefix and file extension, then add UUID for uniqueness
    filename = object_key.split('/')[-1]
    base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
    unique_id = str(uuid.uuid4())[:8]
    return f"{base_name}_{unique_id}"

def extract_media_metadata(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """Extract metadata from the media file."""
    try:
        # Get object metadata from S3
        response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
        
        # Extract basic file information
        metadata = {
            'filename': object_key.split('/')[-1],
            'fileSize': response.get('ContentLength', 0),
            'contentType': response.get('ContentType', 'unknown'),
            'lastModified': response.get('LastModified').isoformat() if response.get('LastModified') else None,
            'etag': response.get('ETag', '').strip('"'),
            'storageClass': response.get('StorageClass', 'STANDARD'),
            'serverSideEncryption': response.get('ServerSideEncryption'),
            's3Location': {
                'bucket': bucket_name,
                'key': object_key
            }
        }
        
        # Add file type specific metadata
        file_extension = object_key.split('.')[-1].lower() if '.' in object_key else ''
        metadata['fileExtension'] = file_extension
        metadata['mediaType'] = determine_media_type(file_extension)
        
        # Add technical metadata based on file type
        try:
            if metadata['mediaType'] == 'video':
                metadata['technicalMetadata'] = extract_video_metadata(bucket_name, object_key)
            elif metadata['mediaType'] == 'image':
                metadata['technicalMetadata'] = extract_image_metadata(bucket_name, object_key)
            elif metadata['mediaType'] == 'audio':
                metadata['technicalMetadata'] = extract_audio_metadata(bucket_name, object_key)
            else:
                metadata['technicalMetadata'] = {
                    'type': metadata['mediaType'],
                    'extractionMethod': 'none',
                    'note': 'No specific metadata extraction for this file type'
                }
        except Exception as e:
            logger.error(f"Error extracting technical metadata: {str(e)}")
            metadata['technicalMetadata'] = {
                'type': metadata['mediaType'],
                'extractionMethod': 'failed',
                'error': str(e),
                'extractionFailed': True
            }
        
        return metadata
        
    except Exception as e:
        logger.error(f"Error extracting metadata: {str(e)}")
        return {
            'error': str(e),
            'filename': object_key.split('/')[-1],
            'extractionFailed': True
        }

def determine_media_type(file_extension: str) -> str:
    """Determine media type based on file extension."""
    video_extensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm']
    image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp']
    audio_extensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']
    
    if file_extension in video_extensions:
        return 'video'
    elif file_extension in image_extensions:
        return 'image'
    elif file_extension in audio_extensions:
        return 'audio'
    else:
        return 'unknown'

def extract_video_metadata(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """Extract video-specific metadata using ffmpeg."""
    if not MEDIA_LIBRARIES_AVAILABLE:
        return {
            'type': 'video',
            'extractionMethod': 'placeholder',
            'note': 'Video metadata extraction libraries not available'
        }
    
    try:
        # Download file to temporary location
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            s3_client.download_fileobj(bucket_name, object_key, temp_file)
            temp_path = temp_file.name
        
        try:
            # Use ffmpeg to probe video metadata
            probe = ffmpeg.probe(temp_path)
            
            # Extract video stream information
            video_streams = [stream for stream in probe['streams'] if stream['codec_type'] == 'video']
            audio_streams = [stream for stream in probe['streams'] if stream['codec_type'] == 'audio']
            
            metadata = {
                'type': 'video',
                'extractionMethod': 'ffmpeg',
                'format': probe.get('format', {}),
                'duration': float(probe['format'].get('duration', 0)),
                'bitrate': int(probe['format'].get('bit_rate', 0)),
                'size': int(probe['format'].get('size', 0)),
                'videoStreams': len(video_streams),
                'audioStreams': len(audio_streams)
            }
            
            # Add primary video stream details
            if video_streams:
                video_stream = video_streams[0]
                metadata['video'] = {
                    'codec': video_stream.get('codec_name'),
                    'width': video_stream.get('width'),
                    'height': video_stream.get('height'),
                    'frameRate': eval(video_stream.get('r_frame_rate', '0/1')),
                    'pixelFormat': video_stream.get('pix_fmt'),
                    'bitrate': int(video_stream.get('bit_rate', 0)) if video_stream.get('bit_rate') else None
                }
            
            # Add primary audio stream details
            if audio_streams:
                audio_stream = audio_streams[0]
                metadata['audio'] = {
                    'codec': audio_stream.get('codec_name'),
                    'sampleRate': int(audio_stream.get('sample_rate', 0)),
                    'channels': audio_stream.get('channels'),
                    'bitrate': int(audio_stream.get('bit_rate', 0)) if audio_stream.get('bit_rate') else None
                }
            
            return metadata
            
        finally:
            # Clean up temporary file
            os.unlink(temp_path)
            
    except Exception as e:
        logger.error(f"Error extracting video metadata: {str(e)}")
        return {
            'type': 'video',
            'extractionMethod': 'ffmpeg',
            'error': str(e),
            'extractionFailed': True
        }

def extract_image_metadata(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """Extract image-specific metadata using Pillow and exifread."""
    if not MEDIA_LIBRARIES_AVAILABLE:
        return {
            'type': 'image',
            'extractionMethod': 'placeholder',
            'note': 'Image metadata extraction libraries not available'
        }
    
    try:
        # Download file to temporary location
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            s3_client.download_fileobj(bucket_name, object_key, temp_file)
            temp_path = temp_file.name
        
        try:
            # Use Pillow to extract basic image information
            with Image.open(temp_path) as img:
                metadata = {
                    'type': 'image',
                    'extractionMethod': 'pillow',
                    'dimensions': {
                        'width': img.width,
                        'height': img.height
                    },
                    'format': img.format,
                    'mode': img.mode,
                    'hasTransparency': img.mode in ('RGBA', 'LA') or 'transparency' in img.info
                }
                
                # Extract EXIF data if available
                if hasattr(img, '_getexif') and img._getexif():
                    exif_data = {}
                    exif = img._getexif()
                    for tag_id, value in exif.items():
                        tag = TAGS.get(tag_id, tag_id)
                        exif_data[tag] = str(value)  # Convert to string for JSON serialization
                    metadata['exif'] = exif_data
                
                # Try to get additional EXIF data using exifread
                try:
                    with open(temp_path, 'rb') as f:
                        exif_tags = exifread.process_file(f, details=False)
                        if exif_tags:
                            detailed_exif = {}
                            for tag, value in exif_tags.items():
                                if not tag.startswith('JPEGThumbnail'):  # Skip thumbnail data
                                    detailed_exif[tag] = str(value)
                            if detailed_exif:
                                metadata['detailedExif'] = detailed_exif
                except Exception as e:
                    logger.warning(f"Could not extract detailed EXIF: {str(e)}")
                
                return metadata
                
        finally:
            # Clean up temporary file
            os.unlink(temp_path)
            
    except Exception as e:
        logger.error(f"Error extracting image metadata: {str(e)}")
        return {
            'type': 'image',
            'extractionMethod': 'pillow',
            'error': str(e),
            'extractionFailed': True
        }

def extract_audio_metadata(bucket_name: str, object_key: str) -> Dict[str, Any]:
    """Extract audio-specific metadata using mutagen."""
    if not MEDIA_LIBRARIES_AVAILABLE:
        return {
            'type': 'audio',
            'extractionMethod': 'placeholder',
            'note': 'Audio metadata extraction libraries not available'
        }
    
    try:
        # Download file to temporary location
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            s3_client.download_fileobj(bucket_name, object_key, temp_file)
            temp_path = temp_file.name
        
        try:
            # Use mutagen to extract audio metadata
            audio_file = MutagenFile(temp_path)
            
            if audio_file is None:
                return {
                    'type': 'audio',
                    'extractionMethod': 'mutagen',
                    'error': 'Unsupported audio format',
                    'extractionFailed': True
                }
            
            metadata = {
                'type': 'audio',
                'extractionMethod': 'mutagen',
                'duration': getattr(audio_file.info, 'length', 0),
                'bitrate': getattr(audio_file.info, 'bitrate', 0),
                'sampleRate': getattr(audio_file.info, 'sample_rate', 0),
                'channels': getattr(audio_file.info, 'channels', 0),
                'fileType': audio_file.mime[0] if audio_file.mime else 'unknown'
            }
            
            # Extract tags/metadata
            if audio_file.tags:
                tags = {}
                for key, value in audio_file.tags.items():
                    # Convert list values to strings
                    if isinstance(value, list):
                        tags[key] = ', '.join(str(v) for v in value)
                    else:
                        tags[key] = str(value)
                metadata['tags'] = tags
                
                # Extract common fields
                common_tags = {
                    'title': ['TIT2', 'TITLE', '\xa9nam'],
                    'artist': ['TPE1', 'ARTIST', '\xa9ART'],
                    'album': ['TALB', 'ALBUM', '\xa9alb'],
                    'date': ['TDRC', 'DATE', '\xa9day'],
                    'genre': ['TCON', 'GENRE', '\xa9gen'],
                    'track': ['TRCK', 'TRACKNUMBER', 'trkn']
                }
                
                extracted_tags = {}
                for field, possible_keys in common_tags.items():
                    for key in possible_keys:
                        if key in tags:
                            extracted_tags[field] = tags[key]
                            break
                
                if extracted_tags:
                    metadata['commonTags'] = extracted_tags
            
            return metadata
            
        finally:
            # Clean up temporary file
            os.unlink(temp_path)
            
    except Exception as e:
        logger.error(f"Error extracting audio metadata: {str(e)}")
        return {
            'type': 'audio',
            'extractionMethod': 'mutagen',
            'error': str(e),
            'extractionFailed': True
        }

def invoke_security_scanner(media_id: str, bucket_name: str, object_key: str) -> Dict[str, Any]:
    """Invoke the security scanner Lambda function."""
    try:
        logger.info(f"Invoking security scanner for {media_id}")
        
        payload = {
            'mediaId': media_id,
            's3Location': {
                'bucket': bucket_name,
                'key': object_key
            }
        }
        
        response = lambda_client.invoke(
            FunctionName=SECURITY_SCANNER_FUNCTION_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        # Parse response
        response_payload = json.loads(response['Payload'].read())
        
        if response['StatusCode'] == 200:
            result = json.loads(response_payload.get('body', '{}'))
            logger.info(f"Security scan completed for {media_id}: {result.get('actionTaken', 'unknown')}")
            return result
        else:
            logger.error(f"Security scanner returned error: {response_payload}")
            return {'error': 'Security scan failed', 'actionTaken': 'error'}
            
    except Exception as e:
        logger.error(f"Error invoking security scanner: {str(e)}")
        return {'error': str(e), 'actionTaken': 'error'}

def store_metadata_audit(media_id: str, object_key: str, metadata: Dict[str, Any], event_name: str):
    """Store metadata extraction event in the audit table."""
    try:
        timestamp = datetime.utcnow().isoformat()
        
        audit_record = {
            'mediaId': media_id,
            'timestamp': timestamp,
            'eventType': 'metadata_extraction',
            'eventSource': 'hlekkr:metadata_extractor',
            'eventName': event_name,
            'objectKey': object_key,
            'data': {
                'metadata': metadata,
                'processingStatus': 'completed' if not metadata.get('extractionFailed') else 'failed',
                'processingTimestamp': timestamp
            }
        }
        
        # Store in DynamoDB
        audit_table.put_item(Item=audit_record)
        
        logger.info(f"Stored metadata audit record for {media_id}")
        
    except Exception as e:
        logger.error(f"Error storing metadata audit: {str(e)}")
        raise