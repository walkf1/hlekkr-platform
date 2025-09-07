# 🔧 Hlekkr Administrator Guide

## 🎯 **Overview**

This guide provides comprehensive instructions for administrators managing Hlekkr deployments, monitoring system health, and maintaining optimal performance.

## 🚀 **Deployment & Setup**

### Prerequisites
- AWS Account with appropriate permissions
- AWS CLI configured
- Node.js 18+ and npm
- AWS CDK 2.70.0+
- Python 3.9+ (for Lambda functions)

### Initial Deployment

1. **Clone and Setup**
   ```bash
   git clone https://github.com/hlekkr/platform.git
   cd hlekkr-platform/infrastructure
   npm install
   ```

2. **Configure Environment**
   ```bash
   # Set environment variables
   export ENVIRONMENT=prod
   export AWS_REGION=us-east-1
   export DOMAIN_NAME=api.hlekkr.com
   ```

3. **Deploy Infrastructure**
   ```bash
   # Bootstrap CDK (first time only)
   cdk bootstrap

   # Deploy all stacks
   cdk deploy --all --require-approval never

   # Verify deployment
   aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE
   ```

### Environment Configuration

#### Production Environment
```typescript
// infrastructure/config/prod.ts
export const prodConfig = {
  environment: 'prod',
  region: 'us-east-1',
  domainName: 'api.hlekkr.com',
  certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc123',
  rateLimits: {
    user: { requestsPerMinute: 60, requestsPerHour: 1000 },
    moderator: { requestsPerMinute: 120, requestsPerHour: 2000 },
    admin: { requestsPerMinute: 300, requestsPerHour: 5000 }
  },
  monitoring: {
    alertEmail: 'alerts@hlekkr.com',
    slackWebhook: 'https://hooks.slack.com/services/...'
  }
};
```

## 📊 **Monitoring & Observability**

### CloudWatch Dashboards

#### System Health Dashboard
- **Lambda Performance**: Execution duration, error rates, concurrent executions
- **API Gateway Metrics**: Request count, latency, 4xx/5xx errors
- **DynamoDB Performance**: Read/write capacity, throttling, latency
- **S3 Metrics**: Upload success rate, storage utilization

#### Business Metrics Dashboard
- **Analysis Throughput**: Media processed per hour/day
- **Trust Score Distribution**: Histogram of trust scores
- **Review Queue Metrics**: Queue depth, processing times
- **User Activity**: Active users, API usage patterns

### Key Performance Indicators (KPIs)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time | <200ms | >500ms |
| Lambda Error Rate | <0.1% | >1% |
| Analysis Completion Time | <5 minutes | >10 minutes |
| Review Queue Depth | <50 items | >100 items |
| System Uptime | 99.9% | <99.5% |

### Alerting Configuration

#### Critical Alerts
```yaml
# CloudWatch Alarms
LambdaErrorRate:
  MetricName: Errors
  Threshold: 10
  ComparisonOperator: GreaterThanThreshold
  EvaluationPeriods: 2
  Actions:
    - SNS: arn:aws:sns:us-east-1:123456789012:critical-alerts
    - Slack: #ops-alerts

APIGateway5xxErrors:
  MetricName: 5XXError
  Threshold: 5
  ComparisonOperator: GreaterThanThreshold
  EvaluationPeriods: 1
  Actions:
    - PagerDuty: high-priority
    - Email: ops-team@hlekkr.com
```

## 👥 **User Management**

### User Roles & Permissions

#### Role Hierarchy
```
Super Admin (Full System Access)
├── Admin (System Management)
├── Moderator (Content Review)
└── User (Basic Access)
```

#### Permission Matrix
| Permission | User | Moderator | Admin | Super Admin |
|------------|------|-----------|-------|-------------|
| Upload Media | ✅ | ✅ | ✅ | ✅ |
| View Analysis | ✅ | ✅ | ✅ | ✅ |
| Moderate Content | ❌ | ✅ | ✅ | ✅ |
| Manage Users | ❌ | ❌ | ✅ | ✅ |
| System Config | ❌ | ❌ | ❌ | ✅ |

### User Management Commands

#### Create Moderator Account
```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_ABC123DEF \
  --username moderator@hlekkr.com \
  --user-attributes Name=email,Value=moderator@hlekkr.com \
  --message-action SUPPRESS \
  --temporary-password TempPass123!

# Add to moderator group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_ABC123DEF \
  --username moderator@hlekkr.com \
  --group-name moderators
```

#### Update User Permissions
```bash
# Update user profile in DynamoDB
aws dynamodb update-item \
  --table-name hlekkr-prod-user-profiles \
  --key '{"userId": {"S": "user-123456789"}}' \
  --update-expression "SET permissions.canModerateContent = :val" \
  --expression-attribute-values '{":val": {"BOOL": true}}'
```

## 🔒 **Security Management**

### Security Best Practices

#### API Security
- **Rate Limiting**: Enforce per-user and per-endpoint limits
- **Input Validation**: Validate all incoming requests
- **Authentication**: Require JWT tokens for all endpoints
- **Authorization**: Check permissions for each operation

#### Data Protection
- **Encryption at Rest**: All DynamoDB tables and S3 buckets encrypted
- **Encryption in Transit**: TLS 1.2+ for all communications
- **Key Management**: AWS KMS for encryption key management
- **Access Logging**: Comprehensive audit trails

### Security Monitoring

#### Suspicious Activity Detection
```typescript
// Rate limit violation patterns
const suspiciousPatterns = {
  rapidFireRequests: 'More than 100 requests in 1 minute',
  geographicAnomalies: 'Requests from multiple countries simultaneously',
  unusualEndpoints: 'Access to admin endpoints by regular users',
  failedAuthentication: 'Multiple failed login attempts'
};
```

#### Security Incident Response
1. **Detection**: Automated alerts trigger investigation
2. **Assessment**: Determine scope and impact
3. **Containment**: Block malicious IPs, disable compromised accounts
4. **Recovery**: Restore normal operations
5. **Lessons Learned**: Update security measures

## 🔧 **System Maintenance**

### Regular Maintenance Tasks

#### Daily Tasks
- [ ] Check system health dashboards
- [ ] Review error logs and alerts
- [ ] Monitor review queue depth
- [ ] Verify backup completion

#### Weekly Tasks
- [ ] Analyze performance trends
- [ ] Review user activity reports
- [ ] Update security patches
- [ ] Clean up old logs and data

#### Monthly Tasks
- [ ] Capacity planning review
- [ ] Security audit
- [ ] Cost optimization analysis
- [ ] Disaster recovery testing

### Database Maintenance

#### DynamoDB Optimization
```bash
# Check table metrics
aws dynamodb describe-table --table-name hlekkr-prod-media-analysis

# Update auto-scaling settings
aws application-autoscaling put-scaling-policy \
  --policy-name hlekkr-read-scaling-policy \
  --service-namespace dynamodb \
  --resource-id table/hlekkr-prod-media-analysis \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

#### Data Lifecycle Management
```typescript
// Automated cleanup of old data
const cleanupPolicy = {
  auditRecords: '7 years retention',
  mediaFiles: '1 year retention (configurable)',
  analysisResults: '2 years retention',
  userSessions: '30 days retention'
};
```

## 📈 **Performance Optimization**

### Lambda Function Optimization

#### Memory and Timeout Configuration
```typescript
const lambdaConfig = {
  mediaUpload: { memory: 1024, timeout: 300 }, // 5 minutes
  deepfakeAnalysis: { memory: 3008, timeout: 900 }, // 15 minutes
  reviewWorkflow: { memory: 512, timeout: 60 }, // 1 minute
  rateLimitMonitor: { memory: 256, timeout: 300 } // 5 minutes
};
```

#### Cold Start Optimization
- **Provisioned Concurrency**: For critical functions
- **Connection Pooling**: Reuse database connections
- **Dependency Optimization**: Minimize package sizes
- **Warm-up Scheduling**: Regular invocation to keep functions warm

### API Gateway Optimization

#### Caching Configuration
```yaml
CachingPolicy:
  CachingEnabled: true
  CacheTtlInSeconds: 300
  CacheKeyParameters:
    - method.request.path.mediaId
    - method.request.querystring.includeDetails
```

## 🚨 **Troubleshooting Guide**

### Common Issues

#### High Lambda Error Rates
**Symptoms**: Increased 5xx errors, timeout alerts
**Diagnosis**:
```bash
# Check CloudWatch logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/hlekkr-deepfake-analyzer \
  --start-time 1704067200000 \
  --filter-pattern "ERROR"
```
**Resolution**:
- Increase memory allocation
- Optimize database queries
- Add retry logic with exponential backoff

#### DynamoDB Throttling
**Symptoms**: ProvisionedThroughputExceededException errors
**Diagnosis**:
```bash
# Check consumed capacity
aws dynamodb describe-table \
  --table-name hlekkr-prod-media-analysis \
  --query 'Table.ProvisionedThroughput'
```
**Resolution**:
- Enable auto-scaling
- Increase provisioned capacity
- Optimize query patterns

#### Review Queue Backlog
**Symptoms**: Queue depth > 100, increased processing times
**Diagnosis**: Check moderator availability and workload distribution
**Resolution**:
- Add more moderators
- Adjust priority algorithms
- Implement overflow handling

### Emergency Procedures

#### System Outage Response
1. **Immediate Actions**:
   - Check AWS Service Health Dashboard
   - Verify DNS resolution
   - Test API endpoints manually

2. **Escalation**:
   - Notify stakeholders via status page
   - Engage on-call engineer
   - Activate incident response team

3. **Recovery**:
   - Implement temporary workarounds
   - Deploy fixes to production
   - Verify system restoration

## 📞 **Support & Escalation**

### Contact Information
- **On-Call Engineer**: +1-555-HLEKKR-1 (24/7)
- **DevOps Team**: devops@hlekkr.com
- **Security Team**: security@hlekkr.com
- **Executive Escalation**: cto@hlekkr.com

### Escalation Matrix
| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical | 15 minutes | Immediate |
| High | 1 hour | 2 hours |
| Medium | 4 hours | 1 day |
| Low | 1 day | 3 days |

---

## 📚 **Additional Resources**

- **Runbooks**: [runbooks.hlekkr.com](https://runbooks.hlekkr.com)
- **Architecture Docs**: [architecture.hlekkr.com](https://architecture.hlekkr.com)
- **Security Policies**: [security.hlekkr.com](https://security.hlekkr.com)
- **Change Management**: [changes.hlekkr.com](https://changes.hlekkr.com)