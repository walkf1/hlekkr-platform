# Trust Score Storage and Retrieval System

## Overview

The Trust Score Storage and Retrieval System provides comprehensive functionality for storing, versioning, and retrieving trust scores for media content in the Hlekkr platform. This system implements advanced trust score calculation with historical tracking, efficient querying, and API endpoints for integration.

## Features

### ✅ Core Functionality
- **Trust Score Calculation**: Advanced composite scoring algorithm with multiple factors
- **Versioned Storage**: Complete version history with automatic latest version tracking
- **Historical Tracking**: Full audit trail of all trust score calculations
- **Efficient Retrieval**: Optimized queries for various use cases
- **API Integration**: RESTful endpoints for calculation and retrieval operations

### ✅ Storage Features
- **DynamoDB Integration**: Dedicated trust score table with GSI indexes
- **Data Type Handling**: Proper Decimal conversion for DynamoDB storage
- **TTL Management**: Automatic cleanup with 7-year retention policy
- **Version Management**: Automatic cleanup of old versions (configurable)

### ✅ Query Capabilities
- **Latest Score Retrieval**: Get the most recent trust score for any media
- **Historical Queries**: Retrieve complete trust score history
- **Range Filtering**: Query by score ranges (high, medium, low, very_low)
- **Date Range Queries**: Filter by calculation date ranges
- **Statistics**: Comprehensive analytics and trend analysis

### ✅ API Endpoints
- `GET /trust-scores` - Get trust scores with various filters
- `GET /trust-scores/{mediaId}` - Get trust score for specific media
- `POST /trust-scores/{mediaId}` - Calculate new trust score
- Query parameters for filtering, pagination, and statistics

## Architecture

### Database Schema

#### Trust Score Table
```
Primary Key: mediaId (String), version (String)
Attributes:
- calculationTimestamp (String)
- calculationDate (String) 
- compositeScore (Number)
- confidence (String)
- scoreRange (String)
- isLatest (String)
- breakdown (Map)
- factors (List)
- recommendations (List)
- ttl (Number)
```

#### Global Secondary Indexes
1. **ScoreRangeIndex**: `scoreRange` + `calculationTimestamp`
2. **TimestampIndex**: `calculationDate` + `calculationTimestamp`  
3. **LatestScoreIndex**: `isLatest` + `compositeScore`

### Trust Score Components

The composite trust score is calculated from multiple weighted factors:

1. **Deepfake Score (35%)**: AI-powered deepfake detection confidence
2. **Source Reliability (25%)**: Source verification and reputation
3. **Metadata Consistency (20%)**: Technical metadata validation
4. **Technical Integrity (15%)**: File integrity and processing checks
5. **Historical Pattern (5%)**: Behavioral pattern analysis

### Score Ranges

- **High (80-100)**: Highly trustworthy content
- **Medium (60-79)**: Generally reliable with minor concerns
- **Low (40-59)**: Questionable content requiring verification
- **Very Low (0-39)**: High risk content requiring manual review

## API Usage

### Calculate Trust Score
```bash
POST /trust-scores/{mediaId}
```

Response:
```json
{
  "mediaId": "media-123",
  "trustScore": {
    "compositeScore": 85.5,
    "confidence": "high",
    "breakdown": {
      "deepfakeScore": 90.0,
      "sourceReliabilityScore": 80.5,
      "metadataConsistencyScore": 85.0,
      "historicalPatternScore": 88.0,
      "technicalIntegrityScore": 83.5
    },
    "factors": [...],
    "recommendations": [...]
  },
  "stored": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Get Latest Trust Score
```bash
GET /trust-scores/{mediaId}
```

### Get Trust Score History
```bash
GET /trust-scores/{mediaId}?history=true&limit=10
```

### Get Trust Scores by Range
```bash
GET /trust-scores?scoreRange=high&limit=50
```

### Get Statistics
```bash
GET /trust-scores?statistics=true&days=30
```

Response:
```json
{
  "statistics": {
    "totalScores": 1250,
    "averageScore": 72.5,
    "medianScore": 75.0,
    "scoreDistribution": {
      "high": 425,
      "medium": 520,
      "low": 235,
      "very_low": 70
    },
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z",
      "days": 30
    }
  }
}
```

## Implementation Details

### Storage Process
1. Calculate trust score using composite algorithm
2. Generate unique version ID
3. Store in trust score table with proper data types
4. Update previous versions' `isLatest` flag
5. Create audit trail entry
6. Return success response

### Retrieval Process
1. Parse query parameters and filters
2. Execute appropriate DynamoDB query using GSI
3. Convert Decimal values back to float
4. Format response according to API specification
5. Return paginated results if applicable

### Data Type Handling
- All numeric values converted to Decimal for DynamoDB storage
- Nested objects and arrays properly handled
- Automatic conversion back to float for JSON responses
- Proper error handling for conversion failures

### Version Management
- Each trust score calculation creates a new version
- Only latest version marked with `isLatest = 'true'`
- Configurable cleanup of old versions (default: keep 5 latest)
- TTL set for 7-year retention compliance

## Configuration

### Environment Variables
```bash
AUDIT_TABLE_NAME=hlekkr-audit-table
TRUST_SCORE_TABLE_NAME=hlekkr-trust-scores-table
MEDIA_BUCKET_NAME=hlekkr-media-uploads
```

### CDK Configuration
```typescript
// Trust Score Table
const trustScoreTable = new dynamodb.Table(this, 'TrustScoreTable', {
  partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'version', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl'
});

// Lambda Function
const trustScoreCalculator = new lambda.Function(this, 'TrustScoreCalculator', {
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'index.handler',
  environment: {
    TRUST_SCORE_TABLE_NAME: trustScoreTable.tableName
  }
});
```

## Error Handling

### Common Error Scenarios
- **Missing Media ID**: Returns 400 Bad Request
- **Trust Score Not Found**: Returns 404 Not Found  
- **Storage Failure**: Returns 500 Internal Server Error
- **Invalid Query Parameters**: Returns 400 Bad Request
- **DynamoDB Errors**: Automatic retry with exponential backoff

### Error Response Format
```json
{
  "statusCode": 500,
  "body": {
    "error": "Trust score operation failed",
    "message": "Detailed error description"
  }
}
```

## Performance Considerations

### Optimization Features
- **GSI Indexes**: Efficient querying by score range, date, and latest flag
- **Pagination**: Configurable limits to prevent large result sets
- **Connection Pooling**: Reuse DynamoDB connections across invocations
- **Caching**: Lambda container reuse for improved performance

### Scaling
- **Auto-scaling**: DynamoDB auto-scaling enabled
- **Lambda Concurrency**: Configurable concurrent execution limits
- **Batch Operations**: Batch writes for improved throughput
- **Query Optimization**: Efficient query patterns using GSI

## Monitoring and Observability

### CloudWatch Metrics
- Trust score calculation latency
- Storage success/failure rates
- Query performance metrics
- Error rates by operation type

### Logging
- Structured JSON logging
- Request/response tracing
- Error details with context
- Performance timing information

## Testing

### Validation Script
Run the validation script to verify implementation:
```bash
python3 validate_implementation.py
```

### Test Coverage
- Score range categorization
- Decimal conversion handling
- Data structure validation
- API response formats
- Storage record structure
- Query pattern validation

## Security

### Access Control
- IAM roles with least privilege
- API Gateway authentication
- Resource-based permissions
- Encryption at rest and in transit

### Data Protection
- PII handling compliance
- Audit trail integrity
- Secure data transmission
- Access logging

## Maintenance

### Regular Tasks
- Monitor storage costs and optimize
- Review and update retention policies
- Analyze query performance patterns
- Update trust score algorithm weights

### Version Cleanup
```python
# Cleanup old versions (keep latest 5)
delete_trust_score_versions(media_id, keep_latest=5)
```

## Integration

### Workflow Integration
The trust score calculator integrates with:
- Media processing pipeline
- Deepfake detection system
- Human review workflow
- Audit trail system
- Monitoring dashboards

### Event Triggers
- Automatic calculation after deepfake analysis
- Manual recalculation via API
- Scheduled batch recalculation
- Human review completion triggers

## Future Enhancements

### Planned Features
- Machine learning model feedback integration
- Real-time score updates via WebSocket
- Advanced analytics and trend prediction
- Cross-media correlation analysis
- Automated threshold-based alerting

---

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **4.4**: Store trust scores in DynamoDB with versioning ✅
- **4.5**: Support score updates and recalculation ✅  
- **4.1**: Combine deepfake probability with other factors ✅
- **4.2**: Weight metadata consistency and provenance ✅
- **8.1**: Statistical analysis and pattern detection ✅
- **8.3**: Interactive charts and visualization support ✅

The trust score storage and retrieval system is now fully implemented and ready for production use.