# Source Verification and Capture System

## Overview

The Source Verification and Capture System provides comprehensive functionality for capturing, validating, and verifying the authenticity of media source information in the Hlekkr platform. This system implements multi-layered verification using domain reputation, content consistency, external cross-referencing, and metadata validation.

## Features

### ✅ **Core Verification Capabilities**

#### 1. **Source Information Capture**
- **Comprehensive data capture** during media upload
- **Structured source information** with validation
- **Metadata extraction** and consistency checking
- **User context preservation** (IP, user agent, referrer)
- **Secure storage** with encryption and TTL management

#### 2. **Domain Reputation Analysis**
- **Trusted domain database** with verified news sources
- **Suspicious domain detection** with threat intelligence
- **Historical reputation tracking** with trend analysis
- **SSL certificate validation** for security assessment
- **Domain age and registration analysis**

#### 3. **Multi-Method Verification**
- **URL accessibility verification** with HTTP status checking
- **Content consistency validation** comparing provided vs actual content
- **External source cross-referencing** with fact-checking databases
- **Social media mention analysis** for credibility assessment
- **Metadata completeness and format validation**

#### 4. **Composite Scoring Algorithm**
- **Weighted scoring system** with configurable weights:
  - Domain Reputation (30%)
  - URL Accessibility (20%)
  - Content Consistency (25%)
  - External Verification (15%)
  - Metadata Validation (10%)
- **Dynamic confidence calculation** based on data availability
- **Discrepancy detection** and reporting
- **Status determination** with clear categories

### ✅ **Verification Status Categories**

- **🟢 Verified (80-100)**: High confidence, trusted source
- **🟡 Likely Verified (60-79)**: Good confidence, minor concerns
- **⚪ Unverified (40-59)**: Neutral, insufficient data
- **🟠 Suspicious (20-39)**: Low confidence, potential issues
- **🔴 Likely Fake (0-19)**: Very low confidence, high risk

### ✅ **Integration Features**

- **REST API endpoints** for verification operations
- **Real-time verification** during media upload
- **Audit trail integration** with comprehensive logging
- **Trust score integration** feeding into composite calculations
- **External service integration** for enhanced verification

## Architecture

### Data Models

#### Source Information Structure
```python
@dataclass
class SourceInfo:
    url: Optional[str] = None
    domain: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    publication_date: Optional[str] = None
    description: Optional[str] = None
    content_type: Optional[str] = None
    referrer: Optional[str] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
```

#### Verification Result Structure
```python
@dataclass
class VerificationResult:
    status: str  # 'verified', 'likely_verified', 'unverified', 'suspicious', 'likely_fake'
    confidence: float  # 0.0 to 1.0
    reputation_score: float  # 0.0 to 100.0
    verification_methods: List[str]
    external_sources: List[Dict[str, Any]]
    discrepancies: List[str]
    metadata: Dict[str, Any]
```

### Database Schema

#### Source Verification Table
```
Primary Key: mediaId (String), timestamp (String)
Attributes:
- sourceInfo (Map): Complete source information
- verificationResult (Map): Verification results and metadata
- ttl (Number): Time-to-live for automatic cleanup
```

#### Global Secondary Indexes
1. **DomainIndex**: `sourceDomain` + `timestamp`
2. **StatusIndex**: `verificationStatus` + `timestamp`
3. **ReputationIndex**: `reputationRange` + `reputationScore`

## Verification Methods

### 1. Domain Reputation Analysis

#### Trusted Domains Database
- **Major news outlets**: Reuters, AP, BBC, CNN, NYTimes, etc.
- **Verified publishers**: WSJ, Bloomberg, Economist, etc.
- **Government sources**: Official agency websites
- **Academic institutions**: University and research publications

#### Reputation Scoring
```python
def check_domain_reputation(domain: str) -> Dict[str, Any]:
    # Check against trusted domain list (score: 90+)
    # Check against suspicious domain list (score: <20)
    # Analyze domain age and registration info
    # Validate SSL certificates
    # Calculate composite reputation score
```

### 2. URL Accessibility Verification

#### Accessibility Checks
- **HTTP status validation** (200 OK expected)
- **Content-Type verification** for media consistency
- **Redirect analysis** for potential manipulation
- **Server response validation** for authenticity indicators
- **Performance metrics** for reliability assessment

### 3. Content Consistency Validation

#### Consistency Analysis
- **Title matching** between provided and actual content
- **Author verification** using meta tags and bylines
- **Publication date validation** against HTML metadata
- **Description consistency** with actual content
- **Text similarity algorithms** for accuracy measurement

### 4. External Source Cross-Referencing

#### Verification Sources
- **Fact-checking databases** (Snopes, PolitiFact, FactCheck.org)
- **News aggregators** (Google News, AllSides, Ground News)
- **Social media platforms** for mention analysis
- **Academic databases** for scholarly verification
- **Government databases** for official source validation

### 5. Metadata Validation

#### Validation Checks
- **Required field completeness** (URL, domain)
- **Format consistency** (URL structure, date formats)
- **Cross-field validation** (URL-domain consistency)
- **Timestamp validation** for publication dates
- **Content-Type matching** with actual media

## API Usage

### Verify Source Information

```bash
POST /source-verification/{mediaId}
Content-Type: application/json

{
  "sourceInfo": {
    "url": "https://www.reuters.com/world/breaking-news-2024",
    "title": "Breaking News: Important Story",
    "author": "John Doe",
    "publicationDate": "2024-01-15T10:30:00Z",
    "description": "This is an important news story",
    "contentType": "article",
    "referrer": "https://google.com",
    "userAgent": "Mozilla/5.0 (compatible)",
    "ipAddress": "192.168.1.1"
  }
}
```

#### Response
```json
{
  "mediaId": "media-123",
  "sourceInfo": {
    "url": "https://www.reuters.com/world/breaking-news-2024",
    "domain": "reuters.com",
    "title": "Breaking News: Important Story",
    "author": "John Doe"
  },
  "verificationResult": {
    "status": "verified",
    "confidence": 0.92,
    "reputationScore": 88.5,
    "verificationMethods": [
      "domain_reputation",
      "url_accessibility", 
      "content_consistency",
      "metadata_validation"
    ],
    "discrepancies": []
  },
  "stored": true,
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### Retrieve Verification Results

```bash
GET /source-verification/{mediaId}
```

#### Response
```json
{
  "mediaId": "media-123",
  "timestamp": "2024-01-15T10:35:00Z",
  "sourceInfo": { ... },
  "verificationResult": { ... }
}
```

## Configuration

### Environment Variables
```bash
AUDIT_TABLE_NAME=hlekkr-audit-table
SOURCE_VERIFICATION_TABLE_NAME=hlekkr-source-verification-table
MEDIA_BUCKET_NAME=hlekkr-media-uploads
```

### Trusted Domains Configuration
```python
TRUSTED_DOMAINS = {
    'reuters.com', 'ap.org', 'bbc.com', 'cnn.com', 
    'nytimes.com', 'washingtonpost.com', 'theguardian.com',
    'npr.org', 'pbs.org', 'wsj.com', 'bloomberg.com'
}
```

### Verification Weights
```python
VERIFICATION_WEIGHTS = {
    'domain_reputation': 0.30,    # 30% - Most important
    'url_accessibility': 0.20,    # 20% - Basic validation
    'content_consistency': 0.25,  # 25% - Content accuracy
    'external_verification': 0.15, # 15% - Third-party validation
    'metadata_validation': 0.10   # 10% - Technical validation
}
```

## Integration Points

### Trust Score Calculator Integration
```python
# Source verification feeds into trust score calculation
source_reliability_score = get_source_verification_score(media_id)

# Weighted as 25% of composite trust score
composite_score = calculate_weighted_score({
    'deepfake': deepfake_score,
    'source_reliability': source_reliability_score,  # From verification
    'metadata_consistency': metadata_score,
    'technical_integrity': technical_score,
    'historical_pattern': historical_score
})
```

### Media Upload Workflow Integration
```python
# Triggered during media upload process
def process_media_upload(media_id, source_info):
    # 1. Security scanning
    security_result = scan_for_threats(media_id)
    
    # 2. Source verification (this system)
    verification_result = verify_source(media_id, source_info)
    
    # 3. Metadata extraction
    metadata = extract_metadata(media_id)
    
    # 4. Trust score calculation
    trust_score = calculate_trust_score(media_id)
```

## Error Handling

### Common Error Scenarios
- **Invalid URL format**: Returns validation error with suggestions
- **Inaccessible source**: Marks as unverified with accessibility flag
- **Network timeouts**: Implements retry logic with exponential backoff
- **External service failures**: Graceful degradation with reduced confidence
- **Malformed source data**: Sanitization and partial verification

### Error Response Format
```json
{
  "statusCode": 400,
  "body": {
    "error": "Invalid source information",
    "message": "URL format is invalid",
    "details": {
      "field": "url",
      "provided": "not-a-valid-url",
      "expected": "Valid HTTP/HTTPS URL"
    }
  }
}
```

## Security Considerations

### Data Protection
- **PII sanitization** for IP addresses and user agents
- **URL validation** to prevent injection attacks
- **Input sanitization** for all source fields
- **Encrypted storage** with AWS managed keys
- **Access logging** for audit compliance

### External Service Security
- **API key management** via AWS Parameter Store
- **Rate limiting** to prevent abuse
- **Request validation** before external calls
- **Response sanitization** from external sources
- **Timeout controls** to prevent hanging requests

## Performance Optimization

### Caching Strategies
- **Domain reputation caching** (1 hour TTL)
- **URL accessibility caching** (30 minutes TTL)
- **External verification caching** (24 hours TTL)
- **Trusted domain list caching** (daily refresh)

### Async Processing
- **Parallel verification methods** for faster processing
- **Background external verification** for non-critical checks
- **Queue-based processing** for high-volume scenarios
- **Batch verification** for multiple sources

## Monitoring and Alerting

### Key Metrics
- **Verification success rate** by method
- **Average verification time** per source
- **Domain reputation distribution** over time
- **External service availability** and response times
- **Discrepancy detection rate** and patterns

### Alerting Thresholds
- **High suspicious source rate** (>10% in 1 hour)
- **External service failures** (>5% error rate)
- **Verification processing delays** (>30 seconds average)
- **Unusual domain patterns** (new suspicious domains)

## Testing and Validation

### Test Coverage
- **Unit tests** for all verification methods
- **Integration tests** with external services
- **Performance tests** under load
- **Security tests** for input validation
- **End-to-end tests** with real source data

### Validation Script
```bash
# Run comprehensive validation
python3 validate_implementation.py

# Expected output: All validations passed
# Tests: Domain extraction, reputation checking, scoring, etc.
```

## Future Enhancements

### Planned Features
- **Machine learning integration** for pattern detection
- **Real-time threat intelligence** feeds
- **Blockchain verification** for immutable provenance
- **Advanced NLP analysis** for content authenticity
- **Collaborative verification** with other platforms

### External Service Integrations
- **NewsGuard** for news source ratings
- **Media Bias/Fact Check** for bias analysis
- **Wayback Machine** for historical verification
- **Certificate Transparency** logs for SSL validation
- **WHOIS databases** for domain registration data

---

## Requirements Satisfied

This implementation satisfies the following requirements:

- ✅ **5.1**: Capture original source information during upload
- ✅ **5.1**: Integrate with external verification services
- ✅ **5.1**: Validate source authenticity and reliability
- ✅ **5.1**: Store verified source data securely
- ✅ **5.4**: External validation services integration

The source verification system is now fully implemented and ready for integration with the Hlekkr media processing pipeline. It provides comprehensive source validation with multi-layered verification methods and secure storage capabilities.