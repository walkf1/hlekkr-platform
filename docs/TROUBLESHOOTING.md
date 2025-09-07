# 🔧 Hlekkr Troubleshooting Guide

## 🚨 **Quick Diagnosis Checklist**

### System Health Check
```bash
# 1. Check API Gateway health
curl -I https://api.hlekkr.com/health

# 2. Verify Lambda functions
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `hlekkr`)].FunctionName'

# 3. Check DynamoDB tables
aws dynamodb list-tables --query 'TableNames[?starts_with(@, `hlekkr`)]'

# 4. Verify S3 buckets
aws s3 ls | grep hlekkr
```

## 🔍 **Common Issues & Solutions**

### 1. **Authentication Failures**

#### Issue: "Invalid JWT token" errors
**Symptoms:**
- 401 Unauthorized responses
- "Token expired" messages
- Authentication middleware failures

**Diagnosis:**
```bash
# Check Cognito User Pool status
aws cognito-idp describe-user-pool --user-pool-id us-east-1_ABC123DEF

# Verify JWT token structure
echo "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." | base64 -d
```

**Solutions:**
1. **Token Refresh**: Implement automatic token refresh
2. **Clock Sync**: Ensure system clocks are synchronized
3. **Key Rotation**: Update JWT verification keys

```typescript
// Fix: Implement token refresh
const refreshToken = async (refreshToken: string) => {
  const response = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  return response.json();
};
```

### 2. **Rate Limiting Issues**

#### Issue: "Rate limit exceeded" (429 errors)
**Symptoms:**
- Frequent 429 responses
- Users unable to make requests
- Rate limit monitor alerts

**Diagnosis:**
```bash
# Check rate limit table
aws dynamodb scan \
  --table-name hlekkr-prod-rate-limits \
  --filter-expression "minuteRequests > :limit" \
  --expression-attribute-values '{":limit": {"N": "60"}}'
```

**Solutions:**
1. **Increase Limits**: Adjust rate limits for legitimate users
2. **Implement Backoff**: Add exponential backoff in clients
3. **Optimize Requests**: Reduce unnecessary API calls

```typescript
// Fix: Implement exponential backoff
const apiCallWithBackoff = async (url: string, options: RequestInit, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status !== 429) return response;
      
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
};
```

### 3. **Media Upload Failures**

#### Issue: Upload timeouts or failures
**Symptoms:**
- S3 upload errors
- Presigned URL expiration
- Large file upload failures

**Diagnosis:**
```bash
# Check S3 bucket permissions
aws s3api get-bucket-policy --bucket hlekkr-prod-media-uploads

# Verify Lambda timeout settings
aws lambda get-function-configuration \
  --function-name hlekkr-prod-media-upload \
  --query 'Timeout'
```

**Solutions:**
1. **Multipart Upload**: Use multipart for large files
2. **Extend Timeouts**: Increase Lambda timeout limits
3. **Retry Logic**: Implement upload retry mechanisms

```typescript
// Fix: Implement multipart upload
const uploadLargeFile = async (file: File, mediaId: string) => {
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks
  const chunks = Math.ceil(file.size / chunkSize);
  
  // Initiate multipart upload
  const { uploadId, presignedUrls } = await initiateMultipartUpload(mediaId, file.name);
  
  // Upload chunks in parallel
  const uploadPromises = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    uploadPromises.push(uploadChunk(presignedUrls[i], chunk, i + 1));
  }
  
  const parts = await Promise.all(uploadPromises);
  
  // Complete multipart upload
  return completeMultipartUpload(mediaId, uploadId, parts);
};
```

### 4. **Analysis Pipeline Failures**

#### Issue: Deepfake analysis not completing
**Symptoms:**
- Analysis stuck in "processing" state
- Bedrock API errors
- Lambda timeout errors

**Diagnosis:**
```bash
# Check analysis Lambda logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/hlekkr-deepfake-analyzer \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"

# Verify Bedrock model access
aws bedrock list-foundation-models --region us-east-1
```

**Solutions:**
1. **Increase Memory**: Allocate more memory to analysis Lambda
2. **Batch Processing**: Process multiple files together
3. **Fallback Models**: Use alternative models if primary fails

```typescript
// Fix: Implement fallback analysis
const analyzeWithFallback = async (mediaId: string, mediaUrl: string) => {
  const models = ['anthropic.claude-v2', 'amazon.titan-image-generator-v1'];
  
  for (const model of models) {
    try {
      return await analyzeWithBedrock(mediaUrl, model);
    } catch (error) {
      console.warn(`Model ${model} failed, trying next:`, error);
      continue;
    }
  }
  
  throw new Error('All analysis models failed');
};
```

### 5. **Review Queue Backlog**

#### Issue: Review queue growing too large
**Symptoms:**
- Queue depth > 100 items
- Increased processing times
- Moderator complaints about workload

**Diagnosis:**
```bash
# Check queue depth
aws dynamodb scan \
  --table-name hlekkr-prod-review-queue \
  --select COUNT \
  --filter-expression "reviewStatus = :status" \
  --expression-attribute-values '{":status": {"S": "pending"}}'
```

**Solutions:**
1. **Auto-Assignment**: Improve moderator assignment algorithm
2. **Priority Queuing**: Prioritize high-risk content
3. **Capacity Planning**: Add more moderators during peak times

```typescript
// Fix: Implement intelligent queue management
const optimizeQueueAssignment = async () => {
  const moderators = await getAvailableModerators();
  const queueItems = await getPendingReviewItems();
  
  // Sort by priority and complexity
  queueItems.sort((a, b) => {
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityWeight[b.priority] - priorityWeight[a.priority];
  });
  
  // Assign based on moderator expertise and workload
  for (const item of queueItems) {
    const bestModerator = findBestModerator(moderators, item);
    await assignReview(item.mediaId, bestModerator.id);
  }
};
```

### 6. **Database Performance Issues**

#### Issue: DynamoDB throttling or high latency
**Symptoms:**
- ProvisionedThroughputExceededException
- High read/write latency
- Application timeouts

**Diagnosis:**
```bash
# Check table metrics
aws dynamodb describe-table \
  --table-name hlekkr-prod-media-analysis \
  --query 'Table.{ReadCapacity:ProvisionedThroughput.ReadCapacityUnits,WriteCapacity:ProvisionedThroughput.WriteCapacityUnits}'

# Check consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=hlekkr-prod-media-analysis \
  --start-time $(date -d '1 hour ago' --iso-8601) \
  --end-time $(date --iso-8601) \
  --period 300 \
  --statistics Average
```

**Solutions:**
1. **Auto-Scaling**: Enable DynamoDB auto-scaling
2. **Query Optimization**: Use efficient query patterns
3. **Caching**: Implement application-level caching

```typescript
// Fix: Implement query optimization
const getMediaAnalysisOptimized = async (mediaId: string) => {
  // Use specific attributes instead of full scan
  const params = {
    TableName: 'hlekkr-prod-media-analysis',
    Key: { mediaId },
    ProjectionExpression: 'mediaId, trustScore, analysisStatus, #ts',
    ExpressionAttributeNames: { '#ts': 'timestamp' }
  };
  
  return dynamoClient.send(new GetItemCommand(params));
};
```

## 🔧 **Performance Optimization**

### Lambda Function Optimization

#### Memory and Timeout Tuning
```bash
# Analyze Lambda performance
aws logs insights start-query \
  --log-group-name /aws/lambda/hlekkr-deepfake-analyzer \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @duration, @billedDuration, @memorySize, @maxMemoryUsed'
```

#### Cold Start Reduction
```typescript
// Implement connection pooling
let dynamoClient: DynamoDBClient;
let s3Client: S3Client;

export const handler = async (event: any, context: Context) => {
  // Initialize clients outside handler for reuse
  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
  }
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION });
  }
  
  // Handler logic here
};
```

### API Gateway Optimization

#### Enable Caching
```yaml
# CloudFormation template
ApiGatewayMethod:
  Type: AWS::ApiGateway::Method
  Properties:
    CachingEnabled: true
    CacheTtlInSeconds: 300
    CacheKeyParameters:
      - method.request.path.mediaId
      - method.request.querystring.includeDetails
```

## 🚨 **Emergency Procedures**

### System Outage Response

#### Immediate Actions (0-15 minutes)
1. **Verify Outage**: Confirm system is actually down
2. **Check Dependencies**: AWS service status, DNS, CDN
3. **Initial Communication**: Update status page
4. **Engage Team**: Alert on-call engineers

#### Investigation (15-60 minutes)
1. **Log Analysis**: Check CloudWatch logs for errors
2. **Metric Review**: Analyze performance metrics
3. **Component Testing**: Test individual services
4. **Root Cause**: Identify the source of the issue

#### Resolution (60+ minutes)
1. **Implement Fix**: Deploy hotfix or rollback
2. **Verify Recovery**: Test all critical paths
3. **Monitor Stability**: Watch for recurring issues
4. **Post-Mortem**: Schedule incident review

### Rollback Procedures

#### Application Rollback
```bash
# Rollback to previous version
aws lambda update-function-code \
  --function-name hlekkr-prod-media-upload \
  --s3-bucket hlekkr-deployments \
  --s3-key lambda/media-upload-v1.2.3.zip

# Verify rollback
aws lambda get-function \
  --function-name hlekkr-prod-media-upload \
  --query 'Configuration.Version'
```

#### Infrastructure Rollback
```bash
# Rollback CDK deployment
cdk deploy --rollback

# Or rollback specific stack
aws cloudformation cancel-update-stack \
  --stack-name HlekkrApiGatewayStack
```

## 📊 **Monitoring & Alerting**

### Key Metrics to Monitor

#### Application Metrics
- **API Response Time**: Target <200ms, Alert >500ms
- **Error Rate**: Target <0.1%, Alert >1%
- **Throughput**: Monitor requests per second
- **Queue Depth**: Target <50, Alert >100

#### Infrastructure Metrics
- **Lambda Duration**: Monitor execution times
- **DynamoDB Throttling**: Alert on any throttling
- **S3 Upload Success Rate**: Target >99.9%
- **Memory Utilization**: Monitor for optimization

### Custom Alerts

#### CloudWatch Alarms
```bash
# Create custom alarm for review queue depth
aws cloudwatch put-metric-alarm \
  --alarm-name "HlekkrReviewQueueDepth" \
  --alarm-description "Alert when review queue is too deep" \
  --metric-name "QueueDepth" \
  --namespace "Hlekkr/ReviewWorkflow" \
  --statistic "Average" \
  --period 300 \
  --threshold 100 \
  --comparison-operator "GreaterThanThreshold" \
  --evaluation-periods 2 \
  --alarm-actions "arn:aws:sns:us-east-1:123456789012:hlekkr-alerts"
```

## 📞 **Getting Help**

### Internal Support
- **Slack**: #hlekkr-support
- **On-Call**: +1-555-HLEKKR-1
- **Email**: support@hlekkr.com

### External Resources
- **AWS Support**: [AWS Console](https://console.aws.amazon.com/support/)
- **GitHub Issues**: [hlekkr/platform/issues](https://github.com/hlekkr/platform/issues)
- **Community Forum**: [community.hlekkr.com](https://community.hlekkr.com)

### Escalation Path
1. **Level 1**: Development team (response: 1 hour)
2. **Level 2**: Senior engineers (response: 30 minutes)
3. **Level 3**: Architecture team (response: 15 minutes)
4. **Level 4**: Executive team (immediate)

---

## 📚 **Additional Resources**

- **System Architecture**: [architecture.hlekkr.com](https://architecture.hlekkr.com)
- **API Documentation**: [docs.hlekkr.com](https://docs.hlekkr.com)
- **Status Page**: [status.hlekkr.com](https://status.hlekkr.com)
- **Runbooks**: [runbooks.hlekkr.com](https://runbooks.hlekkr.com)