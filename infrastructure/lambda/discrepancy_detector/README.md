# Hlekkr Discrepancy Detection System

## Overview

The Hlekkr Discrepancy Detection System is a comprehensive anomaly detection engine that analyzes media verification data to identify inconsistencies, suspicious patterns, and potential security threats across the entire media processing pipeline.

## Features

### 🔍 **Comprehensive Analysis Types**

1. **Source Consistency Analysis**
   - Validates source verification results
   - Detects suspicious domain reputations
   - Identifies missing critical source information

2. **Metadata Consistency Analysis**
   - Compares source metadata with extracted metadata
   - Detects timestamp inconsistencies
   - Identifies content type mismatches

3. **Chain of Custody Integrity Analysis**
   - Validates processing stage completeness
   - Detects hash integrity violations
   - Identifies temporal inconsistencies in processing

4. **Trust Score Anomaly Analysis**
   - Detects extremely low trust scores
   - Identifies high variance in component scores
   - Compares trust scores with source verification results

5. **Processing Timeline Analysis**
   - Detects unusual processing delays
   - Identifies timeline gaps and inconsistencies
   - Monitors processing performance anomalies

6. **Content Hash Consistency Analysis**
   - Validates hash integrity across processing steps
   - Detects potential content tampering
   - Ensures cryptographic chain integrity

7. **Suspicious Pattern Analysis**
   - Identifies coordinated attack patterns
   - Detects evasion attempts
   - Monitors cross-platform manipulation patterns

8. **Cross-Platform Pattern Detection**
   - Identifies domain flooding attacks
   - Detects score manipulation attempts
   - Monitors distributed threat patterns

### 🚨 **Real-time Alerting System**

- **Severity-based Alert Routing**: Critical, High, Medium, Low
- **SNS Integration**: Real-time notifications via Amazon SNS
- **CloudWatch Metrics**: Performance and anomaly metrics
- **Manual Review Integration**: Automatic escalation for critical issues

### 📊 **Monitoring and Analytics**

- **CloudWatch Integration**: Custom metrics and dashboards
- **Performance Tracking**: Analysis execution times and accuracy
- **Trend Analysis**: Historical pattern recognition
- **Audit Trail**: Complete discrepancy detection history

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Data Sources  │    │   Discrepancy    │    │   Alerting &    │
│                 │───▶│    Detector      │───▶│   Monitoring    │
│ • Audit Trail   │    │                  │    │                 │
│ • Source Verify │    │ • 8 Analysis     │    │ • SNS Alerts    │
│ • Chain Custody │    │   Types          │    │ • CloudWatch    │
│ • Trust Scores  │    │ • Severity       │    │ • Manual Review │
└─────────────────┘    │   Classification │    └─────────────────┘
                       │ • Pattern        │
                       │   Recognition    │
                       └──────────────────┘
```

## API Operations

### 1. Detect Discrepancies
```json
{
  "operation": "detect_discrepancies",
  "timeRangeHours": 24,
  "severityThreshold": "medium"
}
```

### 2. Analyze Media
```json
{
  "operation": "analyze_media",
  "mediaId": "media-123"
}
```

### 3. Get Discrepancies
```json
{
  "operation": "get_discrepancies",
  "mediaId": "media-123"
}
```

### 4. Analyze Patterns
```json
{
  "operation": "analyze_patterns",
  "timeRangeHours": 168,
  "minSeverity": "high"
}
```

## Discrepancy Types and Severity Levels

### Severity Classification

| Severity | Description | Response Time | Actions |
|----------|-------------|---------------|---------|
| **Critical** | Immediate security threat | < 5 minutes | Automatic quarantine, immediate alert |
| **High** | Significant anomaly | < 30 minutes | Manual review required, priority alert |
| **Medium** | Notable inconsistency | < 2 hours | Investigation recommended |
| **Low** | Minor discrepancy | < 24 hours | Monitoring and logging |

### Discrepancy Types

1. **SOURCE_INCONSISTENCY**
   - Suspicious source verification results
   - Low domain reputation scores
   - Missing critical source information

2. **METADATA_MISMATCH**
   - Publication date inconsistencies
   - Content type mismatches
   - Technical metadata discrepancies

3. **CHAIN_INTEGRITY_VIOLATION**
   - Missing processing stages
   - Incomplete workflow execution
   - Stage sequence violations

4. **TRUST_SCORE_ANOMALY**
   - Extremely low composite scores
   - High component score variance
   - Score-source reputation mismatches

5. **PROCESSING_ANOMALY**
   - Unusual processing delays
   - Performance degradation patterns
   - Resource utilization anomalies

6. **TEMPORAL_INCONSISTENCY**
   - Chronological order violations
   - Timestamp manipulation indicators
   - Processing timeline gaps

7. **CONTENT_HASH_MISMATCH**
   - Hash integrity violations
   - Potential content tampering
   - Cryptographic chain breaks

8. **SUSPICIOUS_PATTERN**
   - Coordinated attack indicators
   - Evasion attempt patterns
   - Cross-platform manipulation

## Configuration

### Environment Variables

```bash
# Required
AUDIT_TABLE_NAME=hlekkr-audit-table
SOURCE_VERIFICATION_TABLE_NAME=hlekkr-source-verification-table
CHAIN_OF_CUSTODY_TABLE_NAME=hlekkr-chain-of-custody-table
TRUST_SCORE_TABLE_NAME=hlekkr-trust-score-table
DISCREPANCY_ALERTS_TOPIC_ARN=arn:aws:sns:region:account:topic

# Optional
LOG_LEVEL=INFO
ANALYSIS_TIMEOUT_SECONDS=300
MAX_DISCREPANCIES_PER_RESPONSE=100
```

### IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/hlekkr-*",
        "arn:aws:dynamodb:*:*:table/hlekkr-*/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": "arn:aws:sns:*:*:hlekkr-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

## Deployment

### Using AWS CDK

The discrepancy detector is automatically deployed as part of the Hlekkr CDK stack:

```typescript
// Discrepancy Detection Lambda Function
const discrepancyDetector = new lambda.Function(this, 'HlekkrDiscrepancyDetector', {
  functionName: `hlekkr-discrepancy-detector-${this.account}-${this.region}`,
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('../lambda/discrepancy_detector'),
  timeout: cdk.Duration.minutes(10),
  memorySize: 1024,
  environment: {
    // Environment variables
  }
});
```

### Periodic Execution

The system runs automatically every hour via CloudWatch Events:

```typescript
const discrepancyDetectionRule = new events.Rule(this, 'HlekkrDiscrepancyDetectionRule', {
  schedule: events.Schedule.rate(cdk.Duration.hours(1))
});
```

## Testing

### Running Tests

```bash
# Install dependencies
pip install -r requirements.txt

# Run all tests
python -m pytest test_discrepancy_detector.py -v

# Run specific test categories
python -m pytest test_discrepancy_detector.py::TestDiscrepancyDetector::test_source_consistency_analysis -v
```

### Test Coverage

The test suite covers:
- ✅ All 8 discrepancy analysis types
- ✅ Severity classification and filtering
- ✅ Alert generation and SNS integration
- ✅ Error handling and edge cases
- ✅ API operation validation
- ✅ Data consistency checks

## Monitoring and Observability

### CloudWatch Metrics

- `DiscrepanciesDetected`: Total discrepancies found
- `CriticalDiscrepancies`: Critical severity discrepancies
- `AnalysisExecutionTime`: Processing time per analysis
- `AlertsSent`: Number of alerts generated
- `ErrorRate`: Analysis failure rate

### CloudWatch Dashboards

The system provides pre-built dashboards for:
- Real-time discrepancy detection metrics
- Severity distribution analysis
- Processing performance monitoring
- Alert generation tracking

### Logging

Structured logging with correlation IDs:
```python
logger.info("Discrepancy detected", extra={
    "media_id": media_id,
    "discrepancy_type": discrepancy.discrepancy_type.value,
    "severity": discrepancy.severity.value,
    "confidence": discrepancy.confidence
})
```

## Integration Points

### Manual Review Workflow
- Automatic escalation for D-F trust scores
- Integration with moderator assignment system
- Review queue prioritization based on severity

### Security Scanning
- Integration with virus/malware detection
- Threat intelligence correlation
- Automated quarantine triggers

### Trust Score System
- Feedback loop for model improvement
- Score recalculation triggers
- Historical trend analysis

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**: Analyze multiple media items in single execution
2. **Caching**: Cache frequently accessed data patterns
3. **Parallel Analysis**: Concurrent execution of analysis types
4. **Smart Filtering**: Early termination for low-risk content

### Scalability

- **Auto-scaling**: Lambda automatically scales with load
- **DynamoDB**: On-demand billing scales with usage
- **SNS**: Handles high-volume alert distribution
- **CloudWatch**: Scales monitoring with system growth

## Security Considerations

### Data Protection
- All data encrypted in transit and at rest
- IAM role-based access control
- VPC isolation for sensitive operations
- Audit logging for all operations

### Threat Mitigation
- Input validation and sanitization
- Rate limiting on API endpoints
- Anomaly detection for system abuse
- Automated threat response capabilities

## Troubleshooting

### Common Issues

1. **High False Positive Rate**
   - Adjust severity thresholds
   - Review analysis algorithm parameters
   - Validate data quality inputs

2. **Performance Degradation**
   - Monitor CloudWatch metrics
   - Optimize DynamoDB queries
   - Increase Lambda memory allocation

3. **Missing Alerts**
   - Verify SNS topic configuration
   - Check IAM permissions
   - Validate alert routing logic

### Debug Mode

Enable detailed logging:
```bash
export LOG_LEVEL=DEBUG
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `pip install -r requirements.txt`
3. Run tests: `python -m pytest`
4. Deploy changes: `cdk deploy`

### Adding New Analysis Types

1. Define new `DiscrepancyType` enum value
2. Implement analysis function
3. Add to `analyze_single_media()` function
4. Create comprehensive tests
5. Update documentation

## License

This project is licensed under the MIT License - see the LICENSE file for details.