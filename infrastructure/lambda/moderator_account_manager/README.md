# Moderator Account Manager

This Lambda function provides comprehensive account management for Hlekkr moderators, including user creation, profile management, authentication, and authorization.

## Features

### Account Management
- **Create Moderator Accounts**: Register new moderators with Cognito and DynamoDB profiles
- **Update Profiles**: Modify moderator information and sync with Cognito
- **Delete Accounts**: Soft delete with active review validation
- **List Moderators**: Query moderators with filtering and pagination

### Authentication & Authorization
- **Cognito Integration**: Secure user pool with MFA requirements
- **Role-Based Access**: Junior, Senior, and Lead moderator roles
- **Custom Attributes**: Certification levels and specializations
- **Session Management**: Secure token handling with refresh capabilities

### Profile Management
- **Comprehensive Profiles**: Personal info, roles, certifications, specializations
- **Statistics Tracking**: Review counts, accuracy scores, performance metrics
- **Workload Management**: Current assignments and capacity tracking
- **Working Hours**: Configurable availability and timezone settings

## API Endpoints

### Create Moderator
```http
POST /moderators
Content-Type: application/json

{
  "email": "moderator@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "senior",
  "certificationLevel": "advanced",
  "specializations": ["deepfake", "audio"],
  "workingHours": {
    "timezone": "UTC",
    "startHour": 9,
    "endHour": 17,
    "workingDays": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }
}
```

### Get Moderator Profile
```http
GET /moderators/{moderatorId}
```

### Update Moderator Profile
```http
PUT /moderators/{moderatorId}
Content-Type: application/json

{
  "firstName": "Jane",
  "role": "lead",
  "certificationLevel": "expert"
}
```

### List Moderators
```http
GET /moderators?role=senior&status=active&limit=20
```

### Delete Moderator
```http
DELETE /moderators/{moderatorId}
```

## Direct Lambda Invocations

### Create Moderator
```json
{
  "action": "create_moderator",
  "email": "moderator@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "senior"
}
```

### Get Moderator Statistics
```json
{
  "action": "get_moderator_stats",
  "moderatorId": "mod_123456789abc"
}
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MODERATOR_USER_POOL_ID` | Cognito User Pool ID | `us-east-1_ABC123DEF` |
| `MODERATOR_PROFILE_TABLE_NAME` | DynamoDB table for profiles | `hlekkr-moderator-profile-123-us-east-1` |
| `REVIEW_QUEUE_TABLE_NAME` | DynamoDB table for reviews | `hlekkr-review-queue-123-us-east-1` |
| `MODERATOR_ALERTS_TOPIC_ARN` | SNS topic for notifications | `arn:aws:sns:us-east-1:123:moderator-alerts` |

## Data Models

### Moderator Profile
```json
{
  "moderatorId": "mod_123456789abc",
  "email": "moderator@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "senior",
  "certificationLevel": "advanced",
  "specializations": ["deepfake", "audio"],
  "status": "active",
  "createdAt": "2024-01-01T00:00:00.000000",
  "lastActive": "2024-01-15T10:30:00.000000",
  "statistics": {
    "totalReviews": 150,
    "accurateReviews": 142,
    "accuracyScore": 0.947,
    "averageReviewTime": 28.5,
    "currentWorkload": 3
  },
  "workingHours": {
    "timezone": "UTC",
    "startHour": 9,
    "endHour": 17,
    "workingDays": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  },
  "preferences": {
    "maxConcurrentReviews": 5,
    "notificationMethods": ["email", "sns"],
    "autoAssignment": true
  }
}
```

## Role-Based Permissions

### Junior Moderator
- **Max Concurrent Reviews**: 3
- **Review Types**: Standard content
- **Escalation**: Can escalate complex cases
- **Permissions**: Basic review operations

### Senior Moderator
- **Max Concurrent Reviews**: 5
- **Review Types**: All content types
- **Escalation**: Can handle escalated cases
- **Permissions**: Advanced review operations, mentoring

### Lead Moderator
- **Max Concurrent Reviews**: 7
- **Review Types**: All content types, critical cases
- **Escalation**: Final escalation level
- **Permissions**: All operations, team management

## Security Features

### Password Policy
- **Minimum Length**: 12 characters
- **Requirements**: Uppercase, lowercase, digits, symbols
- **Temporary Passwords**: Auto-generated secure passwords
- **MFA**: Required for all moderators

### Access Control
- **Cognito Integration**: Secure authentication
- **Custom Attributes**: Role and certification tracking
- **Session Management**: Configurable token validity
- **API Security**: CORS and authorization headers

## Monitoring & Logging

### CloudWatch Metrics
- Function invocations and duration
- Error rates and success rates
- Custom business metrics

### Logging
- Comprehensive request/response logging
- Error tracking with stack traces
- Performance monitoring
- Security event logging

## Error Handling

### Validation Errors
- Missing required fields
- Invalid role assignments
- Email format validation
- Duplicate account detection

### Business Logic Errors
- Active review conflicts
- Capacity limit violations
- Invalid state transitions
- Authorization failures

### System Errors
- Cognito service failures
- DynamoDB connectivity issues
- SNS notification failures
- Graceful degradation

## Testing

### Unit Tests
```bash
python -m pytest test_account_manager.py -v
```

### Validation Script
```bash
python validate_account_manager.py
```

### Integration Testing
- End-to-end account creation flow
- Profile update synchronization
- Role-based access validation
- Error scenario handling

## Deployment

### CDK Resources
- Lambda function with proper IAM permissions
- Cognito User Pool with custom attributes
- DynamoDB tables with GSI indexes
- SNS topic for notifications

### Dependencies
- boto3 >= 1.26.0
- Python 3.11 runtime
- 512MB memory allocation
- 5-minute timeout

## Usage Examples

### Creating a New Moderator
```python
import boto3

lambda_client = boto3.client('lambda')

response = lambda_client.invoke(
    FunctionName='hlekkr-moderator-account-manager',
    Payload=json.dumps({
        'action': 'create_moderator',
        'email': 'new.moderator@example.com',
        'firstName': 'Alice',
        'lastName': 'Smith',
        'role': 'senior',
        'certificationLevel': 'advanced',
        'specializations': ['deepfake', 'manipulation']
    })
)
```

### Getting Moderator Statistics
```python
response = lambda_client.invoke(
    FunctionName='hlekkr-moderator-account-manager',
    Payload=json.dumps({
        'action': 'get_moderator_stats',
        'moderatorId': 'mod_123456789abc'
    })
)
```

## Performance Considerations

### Optimization
- Efficient DynamoDB queries with GSI usage
- Batch operations for bulk updates
- Connection pooling for AWS services
- Caching for frequently accessed data

### Scalability
- Stateless function design
- Auto-scaling Lambda concurrency
- DynamoDB on-demand billing
- SNS fan-out for notifications

## Troubleshooting

### Common Issues
1. **Cognito User Creation Fails**: Check user pool configuration and IAM permissions
2. **Profile Sync Issues**: Verify DynamoDB table structure and GSI configuration
3. **Notification Failures**: Validate SNS topic ARN and publish permissions
4. **Role Assignment Errors**: Ensure valid role values and custom attribute configuration

### Debug Commands
```bash
# Check Lambda logs
aws logs tail /aws/lambda/hlekkr-moderator-account-manager --follow

# Test function directly
aws lambda invoke --function-name hlekkr-moderator-account-manager \
  --payload '{"action":"list_moderators"}' response.json

# Validate Cognito configuration
aws cognito-idp describe-user-pool --user-pool-id YOUR_POOL_ID
```