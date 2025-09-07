import json
import boto3
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from decimal import Decimal
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')

# Environment variables
TRUST_SCORE_TABLE_NAME = os.environ['TRUST_SCORE_TABLE_NAME']
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']

# DynamoDB tables
trust_score_table = dynamodb.Table(TRUST_SCORE_TABLE_NAME)
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)

def handler(event, context):
    """
    Lambda function for advanced trust score storage and retrieval.
    Supports versioning, historical tracking, and efficient querying.
    """
    try:
        logger.info(f"Processing trust score storage request: {json.dumps(event)}")
        
        # Determine operation type
        http_method = event.get('httpMethod', 'POST')
        path_parameters = event.get('pathParameters', {})
        query_parameters = event.get('queryStringParameters', {}) or {}
        
        if http_method == 'POST':
            # Store new trust score
            body = json.loads(event.get('body', '{}'))
            result = store_trust_score(body)
            
        elif http_method == 'GET':
            media_id = path_parameters.get('mediaId')
            
            if not media_id:
                # Query trust scores with filters
                result = query_trust_scores(query_parameters)
            else:
                # Get specific media trust score
                version = query_parameters.get('version', 'latest')
                include_history = query_parameters.get('includeHistory', 'false').lower() == 'true'
                result = get_trust_score(media_id, version, include_history)
                
        elif http_method == 'PUT':
            # Update existing trust score
            media_id = path_parameters.get('mediaId')
            body = json.loads(event.get('body', '{}'))
            result = update_trust_score(media_id, body)
            
        elif http_method == 'DELETE':
            # Delete trust score (soft delete)
            media_id = path_parameters.get('mediaId')
            version = query_parameters.get('version')
            result = delete_trust_score(media_id, version)
            
        else:
            return {
                'statusCode': 405,
                'body': json.dumps({'error': 'Method not allowed'})
            }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result, default=decimal_default)
        }
        
    except Exception as e:
        logger.error(f"Error in trust score storage: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Trust score storage operation failed',
                'message': str(e)
            })
        }

def store_trust_score(trust_score_data: Dict[str, Any]) -> Dict[str, Any]:
    """Store a new trust score with versioning."""
    try:
        media_id = trust_score_data.get('mediaId')
        if not media_id:
            raise ValueError("Missing mediaId in trust score data")
        
        # Generate version ID
        version_id = generate_version_id()
        calculation_timestamp = datetime.utcnow().isoformat()
        
        # Prepare trust score record
        trust_score_record = {
            'mediaId': media_id,
            'version': version_id,
            'calculationTimestamp': calculation_timestamp,
            'calculationDate': calculation_timestamp[:10],  # YYYY-MM-DD for GSI
            'compositeScore': Decimal(str(trust_score_data.get('compositeScore', 0))),
            'confidence': trust_score_data.get('confidence', 'low'),
            'breakdown': convert_to_decimal(trust_score_data.get('breakdown', {})),
            'factors': trust_score_data.get('factors', []),
            'recommendations': trust_score_data.get('recommendations', []),
            'scoreRange': determine_score_range(trust_score_data.get('compositeScore', 0)),
            'isLatest': 'true',  # Mark as latest version
            'ttl': int((datetime.utcnow() + timedelta(days=365)).timestamp()),  # 1 year TTL
            'metadata': {
                'calculationMethod': trust_score_data.get('calculationMethod', 'composite'),
                'modelVersion': trust_score_data.get('modelVersion', '1.0'),
                'processingTime': trust_score_data.get('processingTime', 0),
                'dataCompleteness': calculate_data_completeness(trust_score_data)
            }
        }
        
        # Mark previous versions as not latest
        update_previous_versions_status(media_id)
        
        # Store the new trust score
        trust_score_table.put_item(Item=trust_score_record)
        
        # Update historical trends
        update_historical_trends(media_id, trust_score_record)
        
        logger.info(f"Stored trust score for {media_id}, version {version_id}, score: {trust_score_data.get('compositeScore')}")
        
        return {
            'mediaId': media_id,
            'version': version_id,
            'status': 'stored',
            'calculationTimestamp': calculation_timestamp,
            'compositeScore': float(trust_score_record['compositeScore'])
        }
        
    except Exception as e:
        logger.error(f"Error storing trust score: {str(e)}")
        raise

def get_trust_score(media_id: str, version: str = 'latest', include_history: bool = False) -> Dict[str, Any]:
    """Retrieve trust score with optional historical data."""
    try:
        if version == 'latest':
            # Get the latest version
            response = trust_score_table.query(
                KeyConditionExpression='mediaId = :media_id',
                FilterExpression='isLatest = :is_latest',
                ExpressionAttributeValues={
                    ':media_id': media_id,
                    ':is_latest': 'true'
                },
                ScanIndexForward=False,
                Limit=1
            )
        else:
            # Get specific version
            response = trust_score_table.get_item(
                Key={
                    'mediaId': media_id,
                    'version': version
                }
            )
            
            if 'Item' in response:
                response = {'Items': [response['Item']]}
            else:
                response = {'Items': []}
        
        if not response['Items']:
            return {
                'error': 'Trust score not found',
                'mediaId': media_id,
                'version': version
            }
        
        trust_score = response['Items'][0]
        
        # Convert Decimal to float for JSON serialization
        result = convert_from_decimal(trust_score)
        
        # Add historical data if requested
        if include_history:
            historical_data = get_historical_trust_scores(media_id)
            result['historicalData'] = historical_data
        
        # Add trend analysis
        result['trendAnalysis'] = analyze_trust_score_trends(media_id)
        
        logger.info(f"Retrieved trust score for {media_id}, version {version}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error retrieving trust score: {str(e)}")
        raise

def query_trust_scores(query_params: Dict[str, str]) -> Dict[str, Any]:
    """Query trust scores with various filters."""
    try:
        # Parse query parameters
        score_range = query_params.get('scoreRange')
        date_from = query_params.get('dateFrom')
        date_to = query_params.get('dateTo')
        confidence_level = query_params.get('confidence')
        limit = int(query_params.get('limit', '50'))
        last_evaluated_key = query_params.get('lastEvaluatedKey')
        
        # Build query based on available parameters
        if score_range:
            # Query by score range
            key_condition = 'scoreRange = :score_range'
            expression_values = {':score_range': score_range}
            
            if date_from:
                key_condition += ' AND calculationTimestamp >= :date_from'
                expression_values[':date_from'] = date_from
            
            query_kwargs = {
                'IndexName': 'ScoreRangeIndex',
                'KeyConditionExpression': key_condition,
                'ExpressionAttributeValues': expression_values,
                'Limit': limit,
                'ScanIndexForward': False  # Most recent first
            }
            
        elif date_from or date_to:
            # Query by date range
            if date_from and date_to:
                key_condition = 'calculationDate BETWEEN :date_from AND :date_to'
                expression_values = {
                    ':date_from': date_from[:10],
                    ':date_to': date_to[:10]
                }
            elif date_from:
                key_condition = 'calculationDate >= :date_from'
                expression_values = {':date_from': date_from[:10]}
            else:
                key_condition = 'calculationDate <= :date_to'
                expression_values = {':date_to': date_to[:10]}
            
            query_kwargs = {
                'IndexName': 'TimestampIndex',
                'KeyConditionExpression': key_condition,
                'ExpressionAttributeValues': expression_values,
                'Limit': limit,
                'ScanIndexForward': False
            }
            
        else:
            # Query latest scores
            query_kwargs = {
                'IndexName': 'LatestScoreIndex',
                'KeyConditionExpression': 'isLatest = :is_latest',
                'ExpressionAttributeValues': {':is_latest': 'true'},
                'Limit': limit,
                'ScanIndexForward': False
            }
        
        # Add filter expression for confidence level
        if confidence_level:
            query_kwargs['FilterExpression'] = 'confidence = :confidence'
            query_kwargs['ExpressionAttributeValues'][':confidence'] = confidence_level
        
        # Add pagination
        if last_evaluated_key:
            query_kwargs['ExclusiveStartKey'] = json.loads(last_evaluated_key)
        
        # Execute query
        response = trust_score_table.query(**query_kwargs)
        
        # Convert results
        items = [convert_from_decimal(item) for item in response['Items']]
        
        result = {
            'items': items,
            'count': len(items),
            'scannedCount': response.get('ScannedCount', len(items))
        }
        
        # Add pagination info
        if 'LastEvaluatedKey' in response:
            result['lastEvaluatedKey'] = json.dumps(response['LastEvaluatedKey'], default=str)
        
        logger.info(f"Queried trust scores: {len(items)} results")
        
        return result
        
    except Exception as e:
        logger.error(f"Error querying trust scores: {str(e)}")
        raise

def update_trust_score(media_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing trust score (creates new version)."""
    try:
        # Get current latest version
        current_score = get_trust_score(media_id, 'latest')
        
        if 'error' in current_score:
            raise ValueError(f"Cannot update non-existent trust score for {media_id}")
        
        # Merge update data with current score
        updated_score = current_score.copy()
        updated_score.update(update_data)
        updated_score['mediaId'] = media_id  # Ensure media ID is preserved
        
        # Store as new version
        result = store_trust_score(updated_score)
        result['status'] = 'updated'
        
        logger.info(f"Updated trust score for {media_id}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error updating trust score: {str(e)}")
        raise

def delete_trust_score(media_id: str, version: Optional[str] = None) -> Dict[str, Any]:
    """Soft delete trust score (marks as deleted)."""
    try:
        if version:
            # Delete specific version
            trust_score_table.update_item(
                Key={
                    'mediaId': media_id,
                    'version': version
                },
                UpdateExpression='SET isDeleted = :deleted, deletedAt = :deleted_at',
                ExpressionAttributeValues={
                    ':deleted': True,
                    ':deleted_at': datetime.utcnow().isoformat()
                }
            )
            
            result = {
                'mediaId': media_id,
                'version': version,
                'status': 'deleted'
            }
            
        else:
            # Mark all versions as deleted
            response = trust_score_table.query(
                KeyConditionExpression='mediaId = :media_id',
                ExpressionAttributeValues={':media_id': media_id}
            )
            
            deleted_count = 0
            for item in response['Items']:
                trust_score_table.update_item(
                    Key={
                        'mediaId': media_id,
                        'version': item['version']
                    },
                    UpdateExpression='SET isDeleted = :deleted, deletedAt = :deleted_at',
                    ExpressionAttributeValues={
                        ':deleted': True,
                        ':deleted_at': datetime.utcnow().isoformat()
                    }
                )
                deleted_count += 1
            
            result = {
                'mediaId': media_id,
                'status': 'deleted',
                'deletedVersions': deleted_count
            }
        
        logger.info(f"Deleted trust score for {media_id}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error deleting trust score: {str(e)}")
        raise

def get_historical_trust_scores(media_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Get historical trust scores for trend analysis."""
    try:
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            ExpressionAttributeValues={':media_id': media_id},
            ScanIndexForward=False,  # Most recent first
            Limit=limit
        )
        
        historical_scores = []
        for item in response['Items']:
            score_data = {
                'version': item['version'],
                'calculationTimestamp': item['calculationTimestamp'],
                'compositeScore': float(item['compositeScore']),
                'confidence': item['confidence'],
                'scoreRange': item['scoreRange']
            }
            historical_scores.append(score_data)
        
        return historical_scores
        
    except Exception as e:
        logger.error(f"Error getting historical trust scores: {str(e)}")
        return []

def analyze_trust_score_trends(media_id: str) -> Dict[str, Any]:
    """Analyze trust score trends for a media item."""
    try:
        historical_scores = get_historical_trust_scores(media_id, 20)
        
        if len(historical_scores) < 2:
            return {
                'trend': 'insufficient_data',
                'dataPoints': len(historical_scores)
            }
        
        # Calculate trend
        scores = [score['compositeScore'] for score in historical_scores]
        scores.reverse()  # Chronological order
        
        # Simple linear trend calculation
        n = len(scores)
        x_sum = sum(range(n))
        y_sum = sum(scores)
        xy_sum = sum(i * score for i, score in enumerate(scores))
        x2_sum = sum(i * i for i in range(n))
        
        slope = (n * xy_sum - x_sum * y_sum) / (n * x2_sum - x_sum * x_sum)
        
        # Determine trend direction
        if slope > 0.5:
            trend = 'improving'
        elif slope < -0.5:
            trend = 'declining'
        else:
            trend = 'stable'
        
        # Calculate volatility
        if len(scores) > 1:
            mean_score = sum(scores) / len(scores)
            variance = sum((score - mean_score) ** 2 for score in scores) / len(scores)
            volatility = variance ** 0.5
        else:
            volatility = 0
        
        return {
            'trend': trend,
            'slope': round(slope, 4),
            'volatility': round(volatility, 2),
            'dataPoints': len(historical_scores),
            'scoreRange': {
                'min': min(scores),
                'max': max(scores),
                'current': scores[-1] if scores else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Error analyzing trust score trends: {str(e)}")
        return {'trend': 'error', 'error': str(e)}

def update_previous_versions_status(media_id: str):
    """Mark previous versions as not latest."""
    try:
        response = trust_score_table.query(
            KeyConditionExpression='mediaId = :media_id',
            FilterExpression='isLatest = :is_latest',
            ExpressionAttributeValues={
                ':media_id': media_id,
                ':is_latest': 'true'
            }
        )
        
        for item in response['Items']:
            trust_score_table.update_item(
                Key={
                    'mediaId': media_id,
                    'version': item['version']
                },
                UpdateExpression='SET isLatest = :not_latest',
                ExpressionAttributeValues={':not_latest': 'false'}
            )
        
    except Exception as e:
        logger.error(f"Error updating previous versions status: {str(e)}")

def update_historical_trends(media_id: str, trust_score_record: Dict[str, Any]):
    """Update historical trend data for analytics."""
    try:
        # This could be enhanced to maintain aggregated trend data
        # For now, we rely on querying historical records
        pass
        
    except Exception as e:
        logger.error(f"Error updating historical trends: {str(e)}")

def generate_version_id() -> str:
    """Generate a unique version ID."""
    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
    unique_id = str(uuid.uuid4())[:8]
    return f"v{timestamp}-{unique_id}"

def determine_score_range(score: float) -> str:
    """Determine score range category for indexing."""
    if score >= 90:
        return 'excellent'
    elif score >= 80:
        return 'high'
    elif score >= 60:
        return 'moderate'
    elif score >= 40:
        return 'low'
    elif score >= 20:
        return 'very_low'
    else:
        return 'critical'

def calculate_data_completeness(trust_score_data: Dict[str, Any]) -> float:
    """Calculate data completeness score."""
    required_fields = ['compositeScore', 'confidence', 'breakdown']
    optional_fields = ['factors', 'recommendations']
    
    completeness = 0.0
    
    # Check required fields
    for field in required_fields:
        if field in trust_score_data and trust_score_data[field]:
            completeness += 0.6 / len(required_fields)
    
    # Check optional fields
    for field in optional_fields:
        if field in trust_score_data and trust_score_data[field]:
            completeness += 0.4 / len(optional_fields)
    
    return round(completeness, 2)

def convert_to_decimal(obj):
    """Convert float values to Decimal for DynamoDB storage."""
    if isinstance(obj, dict):
        return {k: convert_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_decimal(item) for item in obj]
    elif isinstance(obj, float):
        return Decimal(str(obj))
    else:
        return obj

def convert_from_decimal(obj):
    """Convert Decimal values back to float for JSON serialization."""
    if isinstance(obj, dict):
        return {k: convert_from_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_from_decimal(item) for item in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

def decimal_default(obj):
    """JSON serializer for Decimal objects."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")