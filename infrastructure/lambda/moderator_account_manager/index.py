import json
import boto3
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import logging
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
cognito_client = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

# Environment variables
MODERATOR_USER_POOL_ID = os.environ['MODERATOR_USER_POOL_ID']
MODERATOR_PROFILE_TABLE_NAME = os.environ['MODERATOR_PROFILE_TABLE_NAME']
REVIEW_QUEUE_TABLE_NAME = os.environ['REVIEW_QUEUE_TABLE_NAME']
MODERATOR_ALERTS_TOPIC_ARN = os.environ['MODERATOR_ALERTS_TOPIC_ARN']

# DynamoDB tables
moderator_profile_table = dynamodb.Table(MODERATOR_PROFILE_TABLE_NAME)
review_queue_table = dynamodb.Table(REVIEW_QUEUE_TABLE_NAME)

def handler(event, context):
    """
    Lambda function for moderator account management.
    Handles CRUD operations for moderator accounts and profiles.
    """
    try:
        logger.info(f"Processing moderator account management request: {json.dumps(event)}")
        
        # Parse the request
        if 'httpMethod' in event:
            # API Gateway request
            return handle_api_request(event, context)
        else:
            # Direct Lambda invocation
            return handle_direct_request(event, context)
            
    except Exception as e:
        logger.error(f"Error in moderator account management: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
            },
            'body': json.dumps({
                'error': 'Account management failed',
                'message': str(e)
            })
        }

def handle_api_request(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle API Gateway requests."""
    method = event['httpMethod']
    path = event['path']
    
    # CORS preflight
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
            },
            'body': ''
        }
    
    try:
        if method == 'POST' and '/moderators' in path:
            return create_moderator_account(event)
        elif method == 'GET' and '/moderators' in path:
            if '/moderators/' in path:
                moderator_id = path.split('/moderators/')[-1]
                return get_moderator_profile(moderator_id)
            else:
                return list_moderators(event)
        elif method == 'PUT' and '/moderators/' in path:
            moderator_id = path.split('/moderators/')[-1]
            return update_moderator_profile(moderator_id, event)
        elif method == 'DELETE' and '/moderators/' in path:
            moderator_id = path.split('/moderators/')[-1]
            return delete_moderator_account(moderator_id)
        else:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Endpoint not found'})
            }
            
    except Exception as e:
        logger.error(f"Error handling API request: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

def handle_direct_request(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Handle direct Lambda invocations."""
    action = event.get('action')
    
    if action == 'create_moderator':
        return create_moderator_account_direct(event)
    elif action == 'get_moderator':
        return get_moderator_profile_direct(event.get('moderatorId'))
    elif action == 'update_moderator':
        return update_moderator_profile_direct(event.get('moderatorId'), event)
    elif action == 'delete_moderator':
        return delete_moderator_account_direct(event.get('moderatorId'))
    elif action == 'list_moderators':
        return list_moderators_direct(event)
    elif action == 'get_moderator_stats':
        return get_moderator_statistics(event.get('moderatorId'))
    else:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Unknown action: {action}'})
        }

def create_moderator_account(event: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new moderator account via API Gateway."""
    try:
        body = json.loads(event.get('body', '{}'))
        result = create_moderator_account_direct(body)
        
        return {
            'statusCode': 201 if result.get('success') else 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        logger.error(f"Error creating moderator account: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

def create_moderator_account_direct(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new moderator account and profile."""
    try:
        # Validate required fields
        required_fields = ['email', 'firstName', 'lastName', 'role']
        for field in required_fields:
            if field not in data:
                return {'success': False, 'error': f'Missing required field: {field}'}
        
        email = data['email']
        first_name = data['firstName']
        last_name = data['lastName']
        role = data['role']
        
        # Validate role
        valid_roles = ['junior', 'senior', 'lead']
        if role not in valid_roles:
            return {'success': False, 'error': f'Invalid role. Must be one of: {valid_roles}'}
        
        # Generate moderator ID
        moderator_id = f"mod_{uuid.uuid4().hex[:12]}"
        
        # Create Cognito user
        try:
            cognito_response = cognito_client.admin_create_user(
                UserPoolId=MODERATOR_USER_POOL_ID,
                Username=moderator_id,
                UserAttributes=[
                    {'Name': 'email', 'Value': email},
                    {'Name': 'email_verified', 'Value': 'true'},
                    {'Name': 'given_name', 'Value': first_name},
                    {'Name': 'family_name', 'Value': last_name},
                    {'Name': 'custom:moderator_role', 'Value': role},
                    {'Name': 'custom:certification_level', 'Value': data.get('certificationLevel', 'basic')},
                    {'Name': 'custom:specializations', 'Value': ','.join(data.get('specializations', []))}
                ],
                TemporaryPassword=generate_temporary_password(),
                MessageAction='SUPPRESS',  # Don't send welcome email yet
                ForceAliasCreation=False
            )
            
            logger.info(f"Created Cognito user for moderator: {moderator_id}")
            
        except cognito_client.exceptions.UsernameExistsException:
            return {'success': False, 'error': 'User already exists'}
        except Exception as e:
            logger.error(f"Error creating Cognito user: {str(e)}")
            return {'success': False, 'error': f'Failed to create user account: {str(e)}'}
        
        # Create moderator profile in DynamoDB
        try:
            profile_data = {
                'moderatorId': moderator_id,
                'email': email,
                'firstName': first_name,
                'lastName': last_name,
                'role': role,
                'certificationLevel': data.get('certificationLevel', 'basic'),
                'specializations': data.get('specializations', []),
                'status': 'active',
                'createdAt': datetime.utcnow().isoformat(),
                'lastActive': datetime.utcnow().isoformat(),
                'statistics': {
                    'totalReviews': 0,
                    'accurateReviews': 0,
                    'accuracyScore': Decimal('0.0'),
                    'averageReviewTime': Decimal('0.0'),
                    'currentWorkload': 0
                },
                'workingHours': data.get('workingHours', {
                    'timezone': 'UTC',
                    'startHour': 9,
                    'endHour': 17,
                    'workingDays': ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
                }),
                'preferences': data.get('preferences', {
                    'maxConcurrentReviews': get_max_concurrent_reviews(role),
                    'notificationMethods': ['email', 'sns'],
                    'autoAssignment': True
                })
            }
            
            moderator_profile_table.put_item(Item=profile_data)
            logger.info(f"Created moderator profile: {moderator_id}")
            
        except Exception as e:
            # Rollback Cognito user creation
            try:
                cognito_client.admin_delete_user(
                    UserPoolId=MODERATOR_USER_POOL_ID,
                    Username=moderator_id
                )
            except:
                pass
            
            logger.error(f"Error creating moderator profile: {str(e)}")
            return {'success': False, 'error': f'Failed to create moderator profile: {str(e)}'}
        
        # Send welcome notification
        try:
            send_moderator_welcome_notification(moderator_id, email, first_name, role)
        except Exception as e:
            logger.warning(f"Failed to send welcome notification: {str(e)}")
        
        return {
            'success': True,
            'moderatorId': moderator_id,
            'message': 'Moderator account created successfully'
        }
        
    except Exception as e:
        logger.error(f"Error in create_moderator_account_direct: {str(e)}")
        return {'success': False, 'error': str(e)}

def get_moderator_profile(moderator_id: str) -> Dict[str, Any]:
    """Get moderator profile via API Gateway."""
    try:
        result = get_moderator_profile_direct(moderator_id)
        
        return {
            'statusCode': 200 if result.get('success') else 404,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result, default=decimal_to_float)
        }
        
    except Exception as e:
        logger.error(f"Error getting moderator profile: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

def get_moderator_profile_direct(moderator_id: str) -> Dict[str, Any]:
    """Get moderator profile and statistics."""
    try:
        # Get profile from DynamoDB
        response = moderator_profile_table.get_item(Key={'moderatorId': moderator_id})
        
        if 'Item' not in response:
            return {'success': False, 'error': 'Moderator not found'}
        
        profile = response['Item']
        
        # Get current workload
        current_workload = get_current_workload(moderator_id)
        profile['statistics']['currentWorkload'] = current_workload
        
        # Get recent activity
        recent_reviews = get_recent_reviews(moderator_id, days=7)
        profile['recentActivity'] = recent_reviews
        
        return {
            'success': True,
            'profile': profile
        }
        
    except Exception as e:
        logger.error(f"Error getting moderator profile: {str(e)}")
        return {'success': False, 'error': str(e)}

def update_moderator_profile(moderator_id: str, event: Dict[str, Any]) -> Dict[str, Any]:
    """Update moderator profile via API Gateway."""
    try:
        body = json.loads(event.get('body', '{}'))
        result = update_moderator_profile_direct(moderator_id, body)
        
        return {
            'statusCode': 200 if result.get('success') else 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        logger.error(f"Error updating moderator profile: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

def update_moderator_profile_direct(moderator_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update moderator profile and Cognito attributes."""
    try:
        # Get current profile
        response = moderator_profile_table.get_item(Key={'moderatorId': moderator_id})
        if 'Item' not in response:
            return {'success': False, 'error': 'Moderator not found'}
        
        current_profile = response['Item']
        
        # Prepare update expressions
        update_expression = "SET updatedAt = :updatedAt"
        expression_values = {':updatedAt': datetime.utcnow().isoformat()}
        
        # Update allowed fields
        updatable_fields = [
            'firstName', 'lastName', 'role', 'certificationLevel', 
            'specializations', 'status', 'workingHours', 'preferences'
        ]
        
        cognito_updates = []
        
        for field in updatable_fields:
            if field in data:
                update_expression += f", {field} = :{field}"
                expression_values[f':{field}'] = data[field]
                
                # Update Cognito attributes if needed
                if field == 'firstName':
                    cognito_updates.append({'Name': 'given_name', 'Value': data[field]})
                elif field == 'lastName':
                    cognito_updates.append({'Name': 'family_name', 'Value': data[field]})
                elif field == 'role':
                    cognito_updates.append({'Name': 'custom:moderator_role', 'Value': data[field]})
                elif field == 'certificationLevel':
                    cognito_updates.append({'Name': 'custom:certification_level', 'Value': data[field]})
                elif field == 'specializations':
                    cognito_updates.append({'Name': 'custom:specializations', 'Value': ','.join(data[field])})
        
        # Update DynamoDB
        moderator_profile_table.update_item(
            Key={'moderatorId': moderator_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values
        )
        
        # Update Cognito if needed
        if cognito_updates:
            try:
                cognito_client.admin_update_user_attributes(
                    UserPoolId=MODERATOR_USER_POOL_ID,
                    Username=moderator_id,
                    UserAttributes=cognito_updates
                )
            except Exception as e:
                logger.warning(f"Failed to update Cognito attributes: {str(e)}")
        
        logger.info(f"Updated moderator profile: {moderator_id}")
        
        return {
            'success': True,
            'message': 'Moderator profile updated successfully'
        }
        
    except Exception as e:
        logger.error(f"Error updating moderator profile: {str(e)}")
        return {'success': False, 'error': str(e)}

def delete_moderator_account(moderator_id: str) -> Dict[str, Any]:
    """Delete moderator account via API Gateway."""
    try:
        result = delete_moderator_account_direct(moderator_id)
        
        return {
            'statusCode': 200 if result.get('success') else 404,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        logger.error(f"Error deleting moderator account: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

def delete_moderator_account_direct(moderator_id: str) -> Dict[str, Any]:
    """Delete moderator account and profile."""
    try:
        # Check if moderator has active reviews
        active_reviews = get_active_reviews(moderator_id)
        if active_reviews:
            return {
                'success': False, 
                'error': f'Cannot delete moderator with {len(active_reviews)} active reviews'
            }
        
        # Soft delete - mark as inactive instead of hard delete
        try:
            moderator_profile_table.update_item(
                Key={'moderatorId': moderator_id},
                UpdateExpression="SET #status = :status, updatedAt = :updatedAt, deletedAt = :deletedAt",
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'deleted',
                    ':updatedAt': datetime.utcnow().isoformat(),
                    ':deletedAt': datetime.utcnow().isoformat()
                }
            )
        except Exception as e:
            logger.error(f"Error updating moderator profile for deletion: {str(e)}")
            return {'success': False, 'error': 'Failed to delete moderator profile'}
        
        # Disable Cognito user
        try:
            cognito_client.admin_disable_user(
                UserPoolId=MODERATOR_USER_POOL_ID,
                Username=moderator_id
            )
        except Exception as e:
            logger.warning(f"Failed to disable Cognito user: {str(e)}")
        
        logger.info(f"Deleted moderator account: {moderator_id}")
        
        return {
            'success': True,
            'message': 'Moderator account deleted successfully'
        }
        
    except Exception as e:
        logger.error(f"Error deleting moderator account: {str(e)}")
        return {'success': False, 'error': str(e)}

def list_moderators(event: Dict[str, Any]) -> Dict[str, Any]:
    """List moderators via API Gateway."""
    try:
        query_params = event.get('queryStringParameters') or {}
        result = list_moderators_direct(query_params)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result, default=decimal_to_float)
        }
        
    except Exception as e:
        logger.error(f"Error listing moderators: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }

def list_moderators_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """List moderators with optional filtering."""
    try:
        # Parse query parameters
        role_filter = params.get('role')
        status_filter = params.get('status', 'active')
        limit = int(params.get('limit', 50))
        
        # Build scan parameters
        scan_params = {
            'Limit': limit,
            'FilterExpression': '#status = :status',
            'ExpressionAttributeNames': {'#status': 'status'},
            'ExpressionAttributeValues': {':status': status_filter}
        }
        
        # Add role filter if specified
        if role_filter:
            scan_params['FilterExpression'] += ' AND #role = :role'
            scan_params['ExpressionAttributeNames']['#role'] = 'role'
            scan_params['ExpressionAttributeValues'][':role'] = role_filter
        
        # Scan table
        response = moderator_profile_table.scan(**scan_params)
        moderators = response.get('Items', [])
        
        # Add current workload for each moderator
        for moderator in moderators:
            moderator['statistics']['currentWorkload'] = get_current_workload(moderator['moderatorId'])
        
        return {
            'success': True,
            'moderators': moderators,
            'count': len(moderators)
        }
        
    except Exception as e:
        logger.error(f"Error listing moderators: {str(e)}")
        return {'success': False, 'error': str(e)}

def get_moderator_statistics(moderator_id: str) -> Dict[str, Any]:
    """Get detailed moderator statistics."""
    try:
        # Get basic profile
        profile_result = get_moderator_profile_direct(moderator_id)
        if not profile_result.get('success'):
            return profile_result
        
        profile = profile_result['profile']
        
        # Calculate additional statistics
        stats = {
            'basic': profile['statistics'],
            'workload': {
                'current': get_current_workload(moderator_id),
                'capacity': get_max_concurrent_reviews(profile['role']),
                'utilizationRate': 0.0
            },
            'performance': {
                'recentAccuracy': calculate_recent_accuracy(moderator_id, days=30),
                'averageResponseTime': calculate_average_response_time(moderator_id, days=30),
                'reviewsThisWeek': count_reviews_in_period(moderator_id, days=7),
                'reviewsThisMonth': count_reviews_in_period(moderator_id, days=30)
            }
        }
        
        # Calculate utilization rate
        if stats['workload']['capacity'] > 0:
            stats['workload']['utilizationRate'] = stats['workload']['current'] / stats['workload']['capacity']
        
        return {
            'success': True,
            'moderatorId': moderator_id,
            'statistics': stats
        }
        
    except Exception as e:
        logger.error(f"Error getting moderator statistics: {str(e)}")
        return {'success': False, 'error': str(e)}

# Helper functions

def generate_temporary_password() -> str:
    """Generate a secure temporary password."""
    import secrets
    import string
    
    # Generate a 16-character password with mixed case, digits, and symbols
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(16))
    
    # Ensure it meets the password policy
    if not any(c.islower() for c in password):
        password = password[:-1] + 'a'
    if not any(c.isupper() for c in password):
        password = password[:-1] + 'A'
    if not any(c.isdigit() for c in password):
        password = password[:-1] + '1'
    if not any(c in "!@#$%^&*" for c in password):
        password = password[:-1] + '!'
    
    return password

def get_max_concurrent_reviews(role: str) -> int:
    """Get maximum concurrent reviews for a role."""
    role_limits = {
        'junior': 3,
        'senior': 5,
        'lead': 7
    }
    return role_limits.get(role, 3)

def get_current_workload(moderator_id: str) -> int:
    """Get current number of active reviews for a moderator."""
    try:
        response = review_queue_table.query(
            IndexName='ModeratorIndex',
            KeyConditionExpression='assignedModerator = :moderator_id',
            FilterExpression='#status IN (:assigned, :in_progress)',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':moderator_id': moderator_id,
                ':assigned': 'assigned',
                ':in_progress': 'in_progress'
            }
        )
        return response['Count']
    except Exception as e:
        logger.error(f"Error getting current workload: {str(e)}")
        return 0

def get_active_reviews(moderator_id: str) -> List[Dict[str, Any]]:
    """Get active reviews for a moderator."""
    try:
        response = review_queue_table.query(
            IndexName='ModeratorIndex',
            KeyConditionExpression='assignedModerator = :moderator_id',
            FilterExpression='#status IN (:assigned, :in_progress)',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':moderator_id': moderator_id,
                ':assigned': 'assigned',
                ':in_progress': 'in_progress'
            }
        )
        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error getting active reviews: {str(e)}")
        return []

def get_recent_reviews(moderator_id: str, days: int = 7) -> List[Dict[str, Any]]:
    """Get recent reviews for a moderator."""
    try:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        response = review_queue_table.query(
            IndexName='ModeratorIndex',
            KeyConditionExpression='assignedModerator = :moderator_id AND createdAt >= :cutoff_date',
            ExpressionAttributeValues={
                ':moderator_id': moderator_id,
                ':cutoff_date': cutoff_date
            },
            Limit=20
        )
        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error getting recent reviews: {str(e)}")
        return []

def calculate_recent_accuracy(moderator_id: str, days: int = 30) -> float:
    """Calculate recent accuracy for a moderator."""
    # This would query the review decision table and calculate accuracy
    # For now, return a placeholder
    return 0.85

def calculate_average_response_time(moderator_id: str, days: int = 30) -> float:
    """Calculate average response time for a moderator."""
    # This would calculate average time from assignment to completion
    # For now, return a placeholder
    return 45.5  # minutes

def count_reviews_in_period(moderator_id: str, days: int) -> int:
    """Count reviews completed in a specific period."""
    # This would count completed reviews in the specified period
    # For now, return a placeholder
    return 12

def send_moderator_welcome_notification(moderator_id: str, email: str, first_name: str, role: str):
    """Send welcome notification to new moderator."""
    try:
        message = {
            'notification_type': 'MODERATOR_WELCOME',
            'moderator_id': moderator_id,
            'email': email,
            'first_name': first_name,
            'role': role,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        sns_client.publish(
            TopicArn=MODERATOR_ALERTS_TOPIC_ARN,
            Subject=f'Welcome to Hlekkr Moderation Team - {first_name}',
            Message=json.dumps(message),
            MessageAttributes={
                'notification_type': {'DataType': 'String', 'StringValue': 'MODERATOR_WELCOME'},
                'moderator_id': {'DataType': 'String', 'StringValue': moderator_id},
                'role': {'DataType': 'String', 'StringValue': role}
            }
        )
        
        logger.info(f"Sent welcome notification for moderator: {moderator_id}")
        
    except Exception as e:
        logger.error(f"Error sending welcome notification: {str(e)}")
        raise

def decimal_to_float(obj):
    """Convert Decimal objects to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")