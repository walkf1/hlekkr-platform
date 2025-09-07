# Hlekkr Threat Intelligence Processor

## Overview

The Hlekkr Threat Intelligence Processor is a sophisticated system that transforms human review decisions into actionable threat intelligence. It automatically extracts threat indicators, identifies patterns, generates comprehensive threat reports, and enables sharing of intelligence with external systems.

## Features

### 🎯 **Automated Threat Intelligence Generation**

- **Human Decision Processing**: Converts human moderator decisions into structured threat intelligence
- **Threat Indicator Extraction**: Automatically identifies and catalogs threat indicators from confirmed deepfakes
- **Pattern Recognition**: Detects coordinated campaigns and suspicious activity patterns
- **Report Generation**: Creates comprehensive threat intelligence reports with actionable recommendations

### 🔍 **Comprehensive Indicator Types**

1. **Content Hash Indicators**: Cryptographic fingerprints of malicious content
2. **Malicious Domain Indicators**: Domains distributing deepfake content
3. **Manipulation Technique Indicators**: Specific deepfake creation methods
4. **Metadata Pattern Indicators**: Suspicious metadata patterns and anomalies
5. **File Signature Indicators**: Technical signatures of novel manipulation techniques

### 📊 **Advanced Pattern Analysis**

- **Temporal Clustering**: Identifies time-based attack patterns
- **Source Clustering**: Detects coordinated source manipulation
- **Technique Clustering**: Groups similar manipulation methods
- **Content Similarity**: Finds related malicious content
- **Campaign Detection**: Identifies coordinated disinformation campaigns

### 🚨 **Real-time Alerting and Sharing**

- **Severity-based Alerting**: Critical, High, Medium, Low threat classifications
- **External Intelligence Sharing**: Integration with threat intelligence platforms
- **Automated Report Distribution**: Real-time sharing with security teams
- **API-based Access**: RESTful endpoints for intelligence consumption

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Human Review  │    │   Threat Intel   │    │   Intelligence  │
│   Decisions     │───▶│   Processor      │───▶│   Database &    │
│                 │    │                  │    │   Reports       │
│ • Confirmed     │    │ • Extract        │    │                 │
│   Deepfakes     │    │   Indicators     │    │ • DynamoDB      │
│ • Suspicious    │    │ • Analyze        │    │ • S3 Reports    │
│   Content       │    │   Patterns       │    │ • SNS Alerts    │
│ • Novel         │    │ • Generate       │    │ • External      │
│   Techniques    │    │   Reports        │    │   Sharing       │
└─────────────────┘    │ • Send Alerts    │    └─────────────────┘
                       └──────────────────┘
```

## Data Models

### Threat Indicator
```python
@dataclass
class ThreatIndicator:
    indicator_id: str
    indicator_type: str  # hash, domain, pattern, technique
    indicator_value: str
    confidence: float
    first_seen: str
    last_seen: str
    occurrence_count: int
    associated_media_ids: List[str]
    metadata: Dict[str, Any]
```

### Threat Report
```python
@dataclass
class ThreatReport:
    report_id: str
    threat_type: ThreatType
    severity: ThreatSeverity
    status: ThreatStatus
    title: str
    description: str
    created_at: str
    updated_at: str
    indicators: List[ThreatIndicator]
    affected_media_count: int
    confirmed_by_humans: int
    ai_confidence: float
    mitigation_recommendations: List[str]
    external_references: List[str]
    tags: List[str]
    metadata: Dict[str, Any]
```

## API Operations

### 1. Process Review Decision
Automatically triggered when human moderators complete reviews:

```json
{
  "operation": "process_review_decision",
  "reviewId": "review-123",
  "mediaId": "media-456",
  "moderatorId": "mod-789",
  "decisionData": {
    "decision": "confirm",
    "confidence": 0.95,
    "findings": {
      "manipulationTechniques": ["face_swap", "voice_cloning"],
      "suspiciousPatterns": [...],
      "novelTechnique": false
    },
    "metadata": {
      "contentHash": "sha256:...",
      "sourceDomain": "suspicious-site.com",
      "fileType": "video/mp4"
    }
  }
}
```

### 2. Generate Threat Report
Create comprehensive threat reports:

```json
{
  "operation": "generate_threat_report",
  "timeRange": "24h",
  "threatType": "deepfake_confirmed",
  "minSeverity": "medium"
}
```

### 3. Analyze Threat Patterns
Identify coordinated campaigns and patterns:

```json
{
  "operation": "analyze_threat_patterns",
  "timeRange": "7d",
  "analysisType": "coordinated_campaign"
}
```

### 4. Share Threat Intelligence
Share intelligence with external systems:

```json
{
  "operation": "share_threat_intelligence",
  "reportId": "report-123",
  "format": "stix",
  "destination": "external_platform"
}
```

## Threat Classification

### Threat Types

| Type | Description | Triggers |
|------|-------------|----------|
| **DEEPFAKE_CONFIRMED** | Individual confirmed deepfake | High-confidence human confirmation |
| **COORDINATED_CAMPAIGN** | Multi-media coordinated attack | Pattern analysis indicates coordination |
| **SOURCE_MANIPULATION** | Source information manipulation | Suspicious source verification results |
| **METADATA_SPOOFING** | Metadata manipulation attack | Metadata inconsistencies detected |
| **EVASION_TECHNIQUE** | AI detection evasion | Novel techniques to bypass detection |
| **NOVEL_MANIPULATION** | New manipulation methods | Previously unseen techniques |
| **MASS_DISTRIBUTION** | Large-scale content distribution | High volume coordinated sharing |
| **TARGETED_ATTACK** | Specific target attacks | Personalized deepfake campaigns |

### Severity Levels

| Severity | Description | Response Time | Actions |
|----------|-------------|---------------|---------|
| **CRITICAL** | Coordinated campaigns, novel techniques | < 15 minutes | Immediate alerts, external sharing |
| **HIGH** | High-confidence confirmed deepfakes | < 1 hour | Priority alerts, enhanced monitoring |
| **MEDIUM** | Suspicious patterns, medium confidence | < 4 hours | Standard alerts, investigation |
| **LOW** | Low-confidence indicators | < 24 hours | Logging, trend analysis |

## Integration Points

### Human Review Workflow Integration

The threat intelligence processor is automatically triggered when human moderators complete reviews:

```python
# In review_completion_validator/index.py
def process_threat_intelligence(review, decision_data, moderator_id):
    """Process human review decision for threat intelligence generation."""
    
    # Only process confirmed deepfakes or suspicious content
    if decision_data.get('decisionType') in ['confirm', 'suspicious']:
        # Invoke threat intelligence processor
        lambda_client.invoke(
            FunctionName=threat_intel_function_name,
            InvocationType='Event',  # Asynchronous
            Payload=json.dumps(threat_intel_payload)
        )
```

### External Intelligence Sharing

The system supports multiple intelligence sharing formats:

- **STIX/TAXII**: Industry standard threat intelligence format
- **JSON**: Custom structured format for API integration
- **CSV**: Bulk export format for analysis tools
- **IOC Lists**: Simple indicator lists for security tools

## Configuration

### Environment Variables

```bash
# Required
REVIEW_DECISION_TABLE_NAME=hlekkr-review-decision-table
AUDIT_TABLE_NAME=hlekkr-audit-table
THREAT_INTELLIGENCE_TABLE_NAME=hlekkr-threat-intelligence-table
THREAT_REPORTS_BUCKET_NAME=hlekkr-threat-reports-bucket
THREAT_ALERTS_TOPIC_ARN=arn:aws:sns:region:account:threat-alerts

# Optional
EXTERNAL_SHARING_TOPIC_ARN=arn:aws:sns:region:account:external-sharing
LOG_LEVEL=INFO
PATTERN_ANALYSIS_WINDOW_HOURS=24
MIN_CONFIDENCE_THRESHOLD=0.7
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
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
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
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::hlekkr-threat-reports-*/*"
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
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

## Deployment

### Using AWS CDK

The threat intelligence processor is automatically deployed as part of the Hlekkr CDK stack:

```typescript
// Threat Intelligence Processor Lambda Function
const threatIntelligenceProcessor = new lambda.Function(this, 'HlekkrThreatIntelligenceProcessor', {
  functionName: `hlekkr-threat-intelligence-processor-${this.account}-${this.region}`,
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('../lambda/threat_intelligence_processor'),
  timeout: cdk.Duration.minutes(15),
  memorySize: 1024,
  environment: {
    // Environment variables
  }
});
```

### Database Schema

#### Threat Intelligence Table

```
Partition Key: recordId (String)
Sort Key: recordType (String)

GSI 1: ThreatTypeIndex
- Partition Key: threatType (String)
- Sort Key: createdAt (String)

GSI 2: SeverityIndex
- Partition Key: severity (String)
- Sort Key: createdAt (String)

GSI 3: IndicatorTypeIndex
- Partition Key: indicatorType (String)
- Sort Key: indicatorValue (String)
```

## Testing

### Running Tests

```bash
# Install dependencies
pip install -r requirements.txt

# Run all tests
python -m pytest test_threat_intelligence.py -v

# Run specific test categories
python -m pytest test_threat_intelligence.py::TestThreatIntelligenceProcessor::test_extract_threat_indicators_comprehensive -v
```

### Test Coverage

The test suite covers:
- ✅ Threat indicator extraction (all types)
- ✅ Pattern analysis and scoring
- ✅ Threat report generation
- ✅ Classification algorithms
- ✅ Alert generation and SNS integration
- ✅ Storage operations (DynamoDB and S3)
- ✅ Error handling and edge cases
- ✅ API operation validation

## Monitoring and Observability

### CloudWatch Metrics

- `DecisionProcessed`: Human decisions processed for threat intelligence
- `ThreatIndicatorsExtracted`: Number of threat indicators extracted
- `ThreatReportGenerated`: Threat reports created
- `ThreatAlertsGenerated`: Alerts sent for critical threats
- `PatternAnalysisExecuted`: Pattern analysis operations
- `ExternalSharingEvents`: Intelligence shared externally

### CloudWatch Dashboards

Pre-built dashboards provide:
- Real-time threat intelligence generation metrics
- Threat type and severity distribution
- Pattern analysis results and trends
- Alert generation and response times
- External sharing activity

### Logging

Structured logging with correlation IDs:
```python
logger.info("Threat report generated", extra={
    "report_id": report_id,
    "threat_type": threat_type.value,
    "severity": severity.value,
    "indicators_count": len(indicators),
    "media_id": media_id
})
```

## Security Considerations

### Data Protection
- All threat intelligence data encrypted at rest and in transit
- Access controlled via IAM roles and policies
- Audit logging for all intelligence operations
- Secure external sharing with authentication

### Intelligence Sanitization
- PII removal from shared intelligence
- Source protection for sensitive indicators
- Anonymization of human reviewer information
- Controlled distribution based on classification levels

## Performance Optimization

### Scalability Features

1. **Asynchronous Processing**: Non-blocking threat intelligence generation
2. **Batch Operations**: Efficient processing of multiple decisions
3. **Caching**: Frequently accessed indicators cached for performance
4. **Partitioning**: Time-based partitioning for large datasets

### Performance Metrics

- **Processing Latency**: < 5 seconds for indicator extraction
- **Report Generation**: < 30 seconds for comprehensive reports
- **Pattern Analysis**: < 2 minutes for 24-hour windows
- **Alert Delivery**: < 1 minute for critical threats

## Use Cases

### 1. Coordinated Campaign Detection
```
Scenario: Multiple deepfakes from same source domain detected
Process: Pattern analysis identifies temporal clustering
Result: Critical alert generated, campaign report created
Action: External intelligence sharing, enhanced monitoring
```

### 2. Novel Technique Identification
```
Scenario: Human moderator identifies new manipulation method
Process: Novel technique indicators extracted and cataloged
Result: High-priority threat report with technical analysis
Action: AI model updates, research community notification
```

### 3. Threat Intelligence Sharing
```
Scenario: Confirmed deepfake campaign targeting elections
Process: Comprehensive threat report generated
Result: STIX-formatted intelligence package created
Action: Shared with government agencies and security partners
```

## Troubleshooting

### Common Issues

1. **Missing Threat Reports**
   - Check decision confidence thresholds
   - Verify pattern analysis scoring
   - Review threat report generation criteria

2. **Low Pattern Detection**
   - Increase analysis time window
   - Adjust clustering sensitivity parameters
   - Verify sufficient decision volume

3. **Alert Delivery Issues**
   - Check SNS topic configuration
   - Verify IAM permissions
   - Review alert severity thresholds

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

### Adding New Indicator Types

1. Define new indicator type in `ThreatIndicator` class
2. Add extraction logic in `extract_threat_indicators()`
3. Update classification algorithms
4. Add comprehensive tests
5. Update documentation

## License

This project is licensed under the MIT License - see the LICENSE file for details.