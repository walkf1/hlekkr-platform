import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { RateLimitTable } from './constructs/rate-limit-table';

export class HlekkrMvpStack extends cdk.Stack {
  public readonly mediaUploadsBucket: s3.Bucket;
  public readonly quarantineBucket: s3.Bucket;
  public readonly auditTable: dynamodb.Table;
  public readonly trustScoreTable: dynamodb.Table;
  public readonly metadataExtractor: lambda.Function;
  public readonly securityScanner: lambda.Function;
  public readonly securityAlertsTopic: sns.Topic;
  
  // HITL Review Workflow Resources
  public readonly reviewQueueTable: dynamodb.Table;
  public readonly moderatorProfileTable: dynamodb.Table;
  public readonly reviewDecisionTable: dynamodb.Table;
  public readonly moderatorUserPool: cognito.UserPool;
  public readonly moderatorUserPoolClient: cognito.UserPoolClient;
  public readonly moderatorAlertsTopic: sns.Topic;
  public readonly reviewLifecycleManager: lambda.Function;
  public readonly reviewCompletionValidator: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Enhanced S3 bucket for media uploads with comprehensive configuration
    // Supports multipart uploads for large files (>5GB), with automatic cleanup of incomplete uploads
    this.mediaUploadsBucket = new s3.Bucket(this, 'HlekkrMediaUploads', {
      bucketName: `hlekkr-media-uploads-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      transferAcceleration: true, // Enable transfer acceleration for large file uploads
      lifecycleRules: [
        {
          id: 'MediaLifecycleRule',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30)
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90)
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(365)
            }
          ]
        },
        {
          id: 'MultipartUploadCleanup',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7)
        }
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD
          ],
          allowedOrigins: ['*'], // Configure appropriately for production
          allowedHeaders: [
            'Content-Type',
            'Content-Length',
            'Authorization',
            'X-Amz-Date',
            'X-Api-Key',
            'X-Amz-Security-Token',
            'x-amz-content-sha256',
            'x-amz-user-agent'
          ],
          exposedHeaders: [
            'ETag',
            'x-amz-version-id',
            'x-amz-delete-marker'
          ],
          maxAge: 3000
        }
      ],

    });

    // Quarantine S3 bucket for suspicious/malicious files
    this.quarantineBucket = new s3.Bucket(this, 'HlekkrQuarantine', {
      bucketName: `hlekkr-quarantine-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'QuarantineLifecycleRule',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(30)
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(90)
            }
          ],
          expiration: cdk.Duration.days(2555) // 7 years retention for compliance
        }
      ]
    });

    // DynamoDB table for audit trail and metadata
    this.auditTable = new dynamodb.Table(this, 'HlekkrAuditTable', {
      tableName: `hlekkr-audit-${this.account}-${this.region}`,
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSI for querying by event type
    this.auditTable.addGlobalSecondaryIndex({
      indexName: 'EventTypeIndex',
      partitionKey: { name: 'eventType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    // DynamoDB table for trust scores with versioning and historical tracking
    this.trustScoreTable = new dynamodb.Table(this, 'HlekkrTrustScoreTable', {
      tableName: `hlekkr-trust-scores-${this.account}-${this.region}`,
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSI for querying by score range
    this.trustScoreTable.addGlobalSecondaryIndex({
      indexName: 'ScoreRangeIndex',
      partitionKey: { name: 'scoreRange', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'calculationTimestamp', type: dynamodb.AttributeType.STRING }
    });

    // Add GSI for querying by calculation timestamp
    this.trustScoreTable.addGlobalSecondaryIndex({
      indexName: 'TimestampIndex',
      partitionKey: { name: 'calculationDate', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'calculationTimestamp', type: dynamodb.AttributeType.STRING }
    });

    // Add GSI for querying latest scores
    this.trustScoreTable.addGlobalSecondaryIndex({
      indexName: 'LatestScoreIndex',
      partitionKey: { name: 'isLatest', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'compositeScore', type: dynamodb.AttributeType.NUMBER }
    });

    // DynamoDB table for source verification with comprehensive tracking
    const sourceVerificationTable = new dynamodb.Table(this, 'HlekkrSourceVerificationTable', {
      tableName: `hlekkr-source-verification-${this.account}-${this.region}`,
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSI for querying by domain
    sourceVerificationTable.addGlobalSecondaryIndex({
      indexName: 'DomainIndex',
      partitionKey: { name: 'sourceDomain', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    // Add GSI for querying by verification status
    sourceVerificationTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'verificationStatus', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    // Add GSI for querying by reputation score
    sourceVerificationTable.addGlobalSecondaryIndex({
      indexName: 'ReputationIndex',
      partitionKey: { name: 'reputationRange', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'reputationScore', type: dynamodb.AttributeType.NUMBER }
    });

    // DynamoDB table for chain of custody tracking with immutable ledger
    const chainOfCustodyTable = new dynamodb.Table(this, 'HlekkrChainOfCustodyTable', {
      tableName: `hlekkr-chain-of-custody-${this.account}-${this.region}`,
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSI for querying by processing stage
    chainOfCustodyTable.addGlobalSecondaryIndex({
      indexName: 'StageIndex',
      partitionKey: { name: 'stage', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    // Add GSI for querying by actor
    chainOfCustodyTable.addGlobalSecondaryIndex({
      indexName: 'ActorIndex',
      partitionKey: { name: 'actor', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    // Add GSI for querying by event ID
    chainOfCustodyTable.addGlobalSecondaryIndex({
      indexName: 'EventIndex',
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING }
    });

    // SNS topic for security alerts
    this.securityAlertsTopic = new sns.Topic(this, 'HlekkrSecurityAlerts', {
      topicName: `hlekkr-security-alerts-${this.account}-${this.region}`,
      displayName: 'Hlekkr Security Alerts',
      fifo: false
    });

    // Security scanner Lambda function
    this.securityScanner = new lambda.Function(this, 'HlekkrSecurityScanner', {
      functionName: `hlekkr-security-scanner-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/security_scanner'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 2048,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName,
        QUARANTINE_BUCKET_NAME: this.quarantineBucket.bucketName,
        SECURITY_ALERTS_TOPIC_ARN: this.securityAlertsTopic.topicArn,
        VIRUSTOTAL_API_KEY: '' // Set this via environment variable or parameter store
      },
      layers: [
        // Add layer for ClamAV if needed
        new lambda.LayerVersion(this, 'ClamAVLayer', {
          layerVersionName: `hlekkr-clamav-layer-${this.account}-${this.region}`,
          code: lambda.Code.fromAsset('../lambda/layers/clamav'),
          compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
          description: 'ClamAV antivirus scanner layer'
        })
      ]
    });

    // Media metadata extraction Lambda function
    this.metadataExtractor = new lambda.Function(this, 'MediaMetadataExtractor', {
      functionName: `hlekkr-metadata-extractor-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/media_metadata_extractor'),
      timeout: cdk.Duration.minutes(10), // Increased for media processing
      memorySize: 2048, // Increased for media processing libraries
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName,
        SECURITY_SCANNER_FUNCTION_NAME: this.securityScanner.functionName
      }
    });

    // Grant permissions to security scanner
    this.mediaUploadsBucket.grantReadWrite(this.securityScanner);
    this.quarantineBucket.grantReadWrite(this.securityScanner);
    this.auditTable.grantWriteData(this.securityScanner);
    this.securityAlertsTopic.grantPublish(this.securityScanner);

    // Grant permissions to metadata extractor
    this.mediaUploadsBucket.grantRead(this.metadataExtractor);
    this.auditTable.grantWriteData(this.metadataExtractor);
    this.securityScanner.grantInvoke(this.metadataExtractor);

    // Enhanced audit handler Lambda function
    const auditHandler = new lambda.Function(this, 'HlekkrAuditHandler', {
      functionName: `hlekkr-audit-handler-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/audit_handler'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName,
        SECURITY_SCANNER_FUNCTION_NAME: this.securityScanner.functionName
      }
    });

    // Grant permissions to audit handler
    this.mediaUploadsBucket.grantRead(auditHandler);
    this.auditTable.grantWriteData(auditHandler);
    this.securityScanner.grantInvoke(auditHandler);

    // Trust Score Calculator Lambda Function
    const trustScoreCalculator = new lambda.Function(this, 'HlekkrTrustScoreCalculator', {
      functionName: `hlekkr-trust-score-calculator-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/trust_score_calculator'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        TRUST_SCORE_TABLE_NAME: this.trustScoreTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName
      }
    });

    // Grant permissions to trust score calculator
    this.auditTable.grantReadData(trustScoreCalculator);
    this.trustScoreTable.grantReadWriteData(trustScoreCalculator);
    this.mediaUploadsBucket.grantRead(trustScoreCalculator);

    // Source Verifier Lambda Function
    const sourceVerifier = new lambda.Function(this, 'HlekkrSourceVerifier', {
      functionName: `hlekkr-source-verifier-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/source_verifier'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        SOURCE_VERIFICATION_TABLE_NAME: sourceVerificationTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName
      }
    });

    // Grant permissions to source verifier
    this.auditTable.grantWriteData(sourceVerifier);
    sourceVerificationTable.grantReadWriteData(sourceVerifier);
    this.mediaUploadsBucket.grantRead(sourceVerifier);

    // Grant SSM permissions for configuration parameters
    sourceVerifier.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath'
      ],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/hlekkr/*`]
    }));

    // KMS Key for chain of custody cryptographic integrity
    const chainOfCustodyKmsKey = new kms.Key(this, 'HlekkrChainOfCustodyKey', {
      description: 'KMS key for Hlekkr chain of custody cryptographic integrity',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Chain of Custody Tracker Lambda Function
    const chainOfCustodyTracker = new lambda.Function(this, 'HlekkrChainOfCustodyTracker', {
      functionName: `hlekkr-chain-of-custody-tracker-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/chain_of_custody'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        CHAIN_OF_CUSTODY_TABLE_NAME: chainOfCustodyTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName,
        KMS_KEY_ID: chainOfCustodyKmsKey.keyId
      }
    });

    // Grant permissions to chain of custody tracker
    this.auditTable.grantWriteData(chainOfCustodyTracker);
    chainOfCustodyTable.grantReadWriteData(chainOfCustodyTracker);
    this.mediaUploadsBucket.grantRead(chainOfCustodyTracker);
    chainOfCustodyKmsKey.grantEncryptDecrypt(chainOfCustodyTracker);

    // Grant KMS permissions for cryptographic operations
    chainOfCustodyTracker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'kms:GenerateDataKey',
        'kms:Decrypt',
        'kms:DescribeKey'
      ],
      resources: [chainOfCustodyKmsKey.keyArn]
    }));

    // SNS topic for discrepancy alerts
    const discrepancyAlertsTopic = new sns.Topic(this, 'HlekkrDiscrepancyAlerts', {
      topicName: `hlekkr-discrepancy-alerts-${this.account}-${this.region}`,
      displayName: 'Hlekkr Discrepancy Detection Alerts',
      fifo: false
    });

    // Discrepancy Detection Lambda Function
    const discrepancyDetector = new lambda.Function(this, 'HlekkrDiscrepancyDetector', {
      functionName: `hlekkr-discrepancy-detector-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/discrepancy_detector'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        SOURCE_VERIFICATION_TABLE_NAME: sourceVerificationTable.tableName,
        CHAIN_OF_CUSTODY_TABLE_NAME: chainOfCustodyTable.tableName,
        TRUST_SCORE_TABLE_NAME: this.trustScoreTable.tableName,
        DISCREPANCY_ALERTS_TOPIC_ARN: discrepancyAlertsTopic.topicArn
      }
    });

    // Grant permissions to discrepancy detector
    this.auditTable.grantReadData(discrepancyDetector);
    sourceVerificationTable.grantReadData(discrepancyDetector);
    chainOfCustodyTable.grantReadData(discrepancyDetector);
    this.trustScoreTable.grantReadData(discrepancyDetector);
    discrepancyAlertsTopic.grantPublish(discrepancyDetector);

    // Grant CloudWatch metrics permissions for monitoring integration
    discrepancyDetector.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics'
      ],
      resources: ['*']
    }));

    // S3 bucket for threat intelligence reports
    const threatReportsBucket = new s3.Bucket(this, 'HlekkrThreatReports', {
      bucketName: `hlekkr-threat-reports-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'ThreatReportsLifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90)
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365)
            }
          ]
        }
      ]
    });

    // SNS topic for threat intelligence alerts
    const threatAlertsTopic = new sns.Topic(this, 'HlekkrThreatAlerts', {
      topicName: `hlekkr-threat-alerts-${this.account}-${this.region}`,
      displayName: 'Hlekkr Threat Intelligence Alerts',
      fifo: false
    });

    // DynamoDB table for threat intelligence data
    const threatIntelligenceTable = new dynamodb.Table(this, 'HlekkrThreatIntelligenceTable', {
      tableName: `hlekkr-threat-intelligence-${this.account}-${this.region}`,
      partitionKey: { name: 'recordId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSIs for threat intelligence queries
    threatIntelligenceTable.addGlobalSecondaryIndex({
      indexName: 'ThreatTypeIndex',
      partitionKey: { name: 'threatType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING }
    });

    threatIntelligenceTable.addGlobalSecondaryIndex({
      indexName: 'SeverityIndex',
      partitionKey: { name: 'severity', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING }
    });

    threatIntelligenceTable.addGlobalSecondaryIndex({
      indexName: 'IndicatorTypeIndex',
      partitionKey: { name: 'indicatorType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'indicatorValue', type: dynamodb.AttributeType.STRING }
    });

    // Threat Intelligence Processor Lambda Function
    const threatIntelligenceProcessor = new lambda.Function(this, 'HlekkrThreatIntelligenceProcessor', {
      functionName: `hlekkr-threat-intelligence-processor-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/threat_intelligence_processor'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        REVIEW_DECISION_TABLE_NAME: this.reviewDecisionTable.tableName,
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        THREAT_INTELLIGENCE_TABLE_NAME: threatIntelligenceTable.tableName,
        THREAT_REPORTS_BUCKET_NAME: threatReportsBucket.bucketName,
        THREAT_ALERTS_TOPIC_ARN: threatAlertsTopic.topicArn
      }
    });

    // Grant permissions to threat intelligence processor
    this.reviewDecisionTable.grantReadData(threatIntelligenceProcessor);
    this.auditTable.grantReadData(threatIntelligenceProcessor);
    threatIntelligenceTable.grantReadWriteData(threatIntelligenceProcessor);
    threatReportsBucket.grantReadWrite(threatIntelligenceProcessor);
    threatAlertsTopic.grantPublish(threatIntelligenceProcessor);

    // Grant CloudWatch metrics permissions
    threatIntelligenceProcessor.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics'
      ],
      resources: ['*']
    }));

    // API Gateway for Trust Score endpoints
    const trustScoreApi = new apigateway.RestApi(this, 'HlekkrTrustScoreApi', {
      restApiName: `hlekkr-trust-score-api-${this.account}-${this.region}`,
      description: 'API for trust score retrieval and management',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token']
      }
    });

    // Trust scores resource
    const trustScoresResource = trustScoreApi.root.addResource('trust-scores');
    
    // GET /trust-scores - Get trust scores with filters
    trustScoresResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      requestParameters: {
        'method.request.querystring.scoreRange': false,
        'method.request.querystring.startDate': false,
        'method.request.querystring.endDate': false,
        'method.request.querystring.minScore': false,
        'method.request.querystring.maxScore': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.statistics': false,
        'method.request.querystring.days': false
      }
    });

    // Media-specific trust score resource
    const mediaResource = trustScoresResource.addResource('{mediaId}');
    
    // GET /trust-scores/{mediaId} - Get trust score for specific media
    mediaResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      requestParameters: {
        'method.request.path.mediaId': true,
        'method.request.querystring.history': false,
        'method.request.querystring.limit': false
      }
    });

    // POST /trust-scores/{mediaId} - Calculate new trust score
    mediaResource.addMethod('POST', new apigateway.LambdaIntegration(trustScoreCalculator), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // Source verification endpoints
    const sourceVerificationResource = trustScoreApi.root.addResource('source-verification');
    
    // POST /source-verification/{mediaId} - Verify source for media
    const sourceMediaResource = sourceVerificationResource.addResource('{mediaId}');
    sourceMediaResource.addMethod('POST', new apigateway.LambdaIntegration(sourceVerifier), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // GET /source-verification/{mediaId} - Get source verification results
    sourceMediaResource.addMethod('GET', new apigateway.LambdaIntegration(sourceVerifier), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // Chain of custody endpoints
    const chainOfCustodyResource = trustScoreApi.root.addResource('chain-of-custody');
    
    // POST /chain-of-custody - Record custody event
    chainOfCustodyResource.addMethod('POST', new apigateway.LambdaIntegration(chainOfCustodyTracker));

    // Chain of custody media-specific endpoints
    const custodyMediaResource = chainOfCustodyResource.addResource('{mediaId}');
    
    // GET /chain-of-custody/{mediaId} - Get custody chain
    custodyMediaResource.addMethod('GET', new apigateway.LambdaIntegration(chainOfCustodyTracker), {
      requestParameters: {
        'method.request.path.mediaId': true,
        'method.request.querystring.operation': false
      }
    });

    // GET /chain-of-custody/{mediaId}/provenance - Get provenance visualization data
    const provenanceResource = custodyMediaResource.addResource('provenance');
    provenanceResource.addMethod('GET', new apigateway.LambdaIntegration(chainOfCustodyTracker), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // GET /chain-of-custody/{mediaId}/verify - Verify chain integrity
    const verifyResource = custodyMediaResource.addResource('verify');
    verifyResource.addMethod('GET', new apigateway.LambdaIntegration(chainOfCustodyTracker), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // Discrepancy detection endpoints
    const discrepancyResource = trustScoreApi.root.addResource('discrepancies');
    
    // POST /discrepancies - Detect discrepancies across all media or with filters
    discrepancyResource.addMethod('POST', new apigateway.LambdaIntegration(discrepancyDetector), {
      requestParameters: {
        'method.request.querystring.timeRangeHours': false,
        'method.request.querystring.severityThreshold': false
      }
    });

    // GET /discrepancies - Get recent discrepancies with filters
    discrepancyResource.addMethod('GET', new apigateway.LambdaIntegration(discrepancyDetector), {
      requestParameters: {
        'method.request.querystring.timeRangeHours': false,
        'method.request.querystring.severityThreshold': false,
        'method.request.querystring.limit': false
      }
    });

    // Discrepancy detection media-specific endpoints
    const discrepancyMediaResource = discrepancyResource.addResource('{mediaId}');
    
    // POST /discrepancies/{mediaId} - Analyze specific media for discrepancies
    discrepancyMediaResource.addMethod('POST', new apigateway.LambdaIntegration(discrepancyDetector), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // GET /discrepancies/{mediaId} - Get discrepancies for specific media
    discrepancyMediaResource.addMethod('GET', new apigateway.LambdaIntegration(discrepancyDetector), {
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    // POST /discrepancies/patterns - Analyze suspicious patterns across media
    const patternsResource = discrepancyResource.addResource('patterns');
    patternsResource.addMethod('POST', new apigateway.LambdaIntegration(discrepancyDetector), {
      requestParameters: {
        'method.request.querystring.timeRangeHours': false,
        'method.request.querystring.minSeverity': false
      }
    });

    // Threat intelligence endpoints
    const threatIntelResource = trustScoreApi.root.addResource('threat-intelligence');
    
    // POST /threat-intelligence - Process review decision for threat intelligence
    threatIntelResource.addMethod('POST', new apigateway.LambdaIntegration(threatIntelligenceProcessor), {
      requestParameters: {
        'method.request.querystring.operation': false
      }
    });

    // GET /threat-intelligence - Get threat reports with filters
    threatIntelResource.addMethod('GET', new apigateway.LambdaIntegration(threatIntelligenceProcessor), {
      requestParameters: {
        'method.request.querystring.threatType': false,
        'method.request.querystring.severity': false,
        'method.request.querystring.startDate': false,
        'method.request.querystring.endDate': false,
        'method.request.querystring.limit': false
      }
    });

    // Threat reports resource
    const threatReportsResource = threatIntelResource.addResource('reports');
    
    // GET /threat-intelligence/reports/{reportId} - Get specific threat report
    const threatReportResource = threatReportsResource.addResource('{reportId}');
    threatReportResource.addMethod('GET', new apigateway.LambdaIntegration(threatIntelligenceProcessor), {
      requestParameters: {
        'method.request.path.reportId': true
      }
    });

    // POST /threat-intelligence/reports - Generate new threat report
    threatReportsResource.addMethod('POST', new apigateway.LambdaIntegration(threatIntelligenceProcessor), {
      requestParameters: {
        'method.request.querystring.operation': false
      }
    });

    // Threat indicators resource
    const threatIndicatorsResource = threatIntelResource.addResource('indicators');
    
    // GET /threat-intelligence/indicators - Get threat indicators
    threatIndicatorsResource.addMethod('GET', new apigateway.LambdaIntegration(threatIntelligenceProcessor), {
      requestParameters: {
        'method.request.querystring.indicatorType': false,
        'method.request.querystring.confidence': false,
        'method.request.querystring.limit': false
      }
    });

    // POST /threat-intelligence/share - Share threat intelligence externally
    const shareResource = threatIntelResource.addResource('share');
    shareResource.addMethod('POST', new apigateway.LambdaIntegration(threatIntelligenceProcessor), {
      requestParameters: {
        'method.request.querystring.format': false,
        'method.request.querystring.destination': false
      }
    });

    // ========================================
    // Media Processing Workflow with Step Functions
    // ========================================

    // Dead Letter Queue for failed processing
    const mediaProcessingDLQ = new sqs.Queue(this, 'HlekkrMediaProcessingDLQ', {
      queueName: `hlekkr-media-processing-dlq-${this.account}-${this.region}`,
      retentionPeriod: cdk.Duration.days(14), // Keep failed messages for 14 days
      encryption: sqs.QueueEncryption.SQS_MANAGED
    });

    // Main processing queue with DLQ
    const mediaProcessingQueue = new sqs.Queue(this, 'HlekkrMediaProcessingQueue', {
      queueName: `hlekkr-media-processing-queue-${this.account}-${this.region}`,
      visibilityTimeout: cdk.Duration.minutes(15), // Allow time for processing
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: mediaProcessingDLQ,
        maxReceiveCount: 3 // Retry 3 times before sending to DLQ
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED
    });

    // Workflow orchestrator Lambda function
    const workflowOrchestrator = new lambda.Function(this, 'HlekkrWorkflowOrchestrator', {
      functionName: `hlekkr-workflow-orchestrator-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/workflow_orchestrator'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        MEDIA_BUCKET_NAME: this.mediaUploadsBucket.bucketName,
        PROCESSING_QUEUE_URL: mediaProcessingQueue.queueUrl,
        DLQ_URL: mediaProcessingDLQ.queueUrl
      },
      deadLetterQueue: mediaProcessingDLQ
    });

    // Grant permissions to workflow orchestrator
    this.mediaUploadsBucket.grantRead(workflowOrchestrator);
    this.auditTable.grantReadWriteData(workflowOrchestrator);
    mediaProcessingQueue.grantSendMessages(workflowOrchestrator);
    mediaProcessingDLQ.grantSendMessages(workflowOrchestrator);

    // Step Functions State Machine for Media Processing Workflow
    const securityScanTask = new stepfunctionsTasks.LambdaInvoke(this, 'SecurityScanTask', {
      lambdaFunction: this.securityScanner,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      timeout: cdk.Duration.minutes(10)
    });

    const metadataExtractionTask = new stepfunctionsTasks.LambdaInvoke(this, 'MetadataExtractionTask', {
      lambdaFunction: this.metadataExtractor,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      timeout: cdk.Duration.minutes(10)
    });

    const auditRecordTask = new stepfunctionsTasks.LambdaInvoke(this, 'AuditRecordTask', {
      lambdaFunction: auditHandler,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      timeout: cdk.Duration.minutes(2)
    });

    // Define workflow with error handling
    const quarantineChoice = new stepfunctions.Choice(this, 'QuarantineChoice')
      .when(
        stepfunctions.Condition.stringEquals('$.actionTaken', 'quarantined'),
        new stepfunctions.Succeed(this, 'FileQuarantined', {
          comment: 'File was quarantined due to security concerns'
        })
      )
      .otherwise(metadataExtractionTask);

    const workflowDefinition = securityScanTask
      .addCatch(new stepfunctions.Fail(this, 'SecurityScanFailed', {
        comment: 'Security scan failed',
        cause: 'Security scanning encountered an error'
      }), {
        errors: ['States.ALL'],
        resultPath: '$.error'
      })
      .next(quarantineChoice);

    metadataExtractionTask
      .addCatch(new stepfunctions.Fail(this, 'MetadataExtractionFailed', {
        comment: 'Metadata extraction failed',
        cause: 'Metadata extraction encountered an error'
      }), {
        errors: ['States.ALL'],
        resultPath: '$.error'
      })
      .next(auditRecordTask);

    auditRecordTask
      .addCatch(new stepfunctions.Fail(this, 'AuditRecordFailed', {
        comment: 'Audit record creation failed',
        cause: 'Audit trail update encountered an error'
      }), {
        errors: ['States.ALL'],
        resultPath: '$.error'
      })
      .next(new stepfunctions.Succeed(this, 'ProcessingComplete', {
        comment: 'Media processing completed successfully'
      }));

    // Create the Step Functions State Machine
    const mediaProcessingStateMachine = new stepfunctions.StateMachine(this, 'HlekkrMediaProcessingWorkflow', {
      stateMachineName: `hlekkr-media-processing-workflow-${this.account}-${this.region}`,
      definition: workflowDefinition,
      timeout: cdk.Duration.minutes(30),
      tracingEnabled: true
    });

    // Grant Step Functions permissions to invoke Lambda functions
    this.securityScanner.grantInvoke(mediaProcessingStateMachine);
    this.metadataExtractor.grantInvoke(mediaProcessingStateMachine);
    auditHandler.grantInvoke(mediaProcessingStateMachine);

    // Update workflow orchestrator to start Step Functions
    workflowOrchestrator.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['states:StartExecution'],
      resources: [mediaProcessingStateMachine.stateMachineArn]
    }));

    workflowOrchestrator.addEnvironment('STATE_MACHINE_ARN', mediaProcessingStateMachine.stateMachineArn);

    // CloudWatch Events rule to monitor Step Functions execution completion
    const workflowCompletionRule = new events.Rule(this, 'HlekkrWorkflowCompletionRule', {
      ruleName: `hlekkr-workflow-completion-${this.account}-${this.region}`,
      description: 'Monitor Step Functions workflow completion events',
      eventPattern: {
        source: ['aws.states'],
        detailType: ['Step Functions Execution Status Change'],
        detail: {
          stateMachineArn: [mediaProcessingStateMachine.stateMachineArn],
          status: ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED']
        }
      }
    });

    // Add workflow orchestrator as target for completion events
    workflowCompletionRule.addTarget(new eventsTargets.LambdaFunction(workflowOrchestrator, {
      event: events.RuleTargetInput.fromObject({
        source: 'cloudwatch-events',
        eventType: 'workflow-completion',
        detail: events.EventField.fromPath('$.detail')
      })
    }));

    // Grant CloudWatch Events permission to invoke the orchestrator
    workflowOrchestrator.addPermission('AllowCloudWatchEvents', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: workflowCompletionRule.ruleArn
    });

    // CloudWatch Events rule for periodic discrepancy detection
    const discrepancyDetectionRule = new events.Rule(this, 'HlekkrDiscrepancyDetectionRule', {
      ruleName: `hlekkr-discrepancy-detection-${this.account}-${this.region}`,
      description: 'Periodic discrepancy detection across all media',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)) // Run every hour
    });

    // Add discrepancy detector as target for periodic execution
    discrepancyDetectionRule.addTarget(new eventsTargets.LambdaFunction(discrepancyDetector, {
      event: events.RuleTargetInput.fromObject({
        operation: 'detect_discrepancies',
        timeRangeHours: 2, // Check last 2 hours with overlap
        severityThreshold: 'medium',
        source: 'periodic-scan'
      })
    }));

    // Grant CloudWatch Events permission to invoke the discrepancy detector
    discrepancyDetector.addPermission('AllowCloudWatchEventsDiscrepancy', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: discrepancyDetectionRule.ruleArn
    });

    // S3 event notifications for security scanning first, then media processing
    // Security scanning is triggered first for all uploaded media files
    // Supports both regular uploads and multipart upload completion
    const supportedFormats = ['.mp4', '.avi', '.mov', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.wav'];
    
    supportedFormats.forEach(format => {
      // Trigger workflow orchestrator on object creation (includes multipart upload completion)
      this.mediaUploadsBucket.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.LambdaDestination(workflowOrchestrator),
        {
          prefix: 'uploads/',
          suffix: format
        }
      );
    });

    // ========================================
    // HITL Review Workflow Infrastructure
    // ========================================

    // Review Queue DynamoDB Table
    this.reviewQueueTable = new dynamodb.Table(this, 'HlekkrReviewQueue', {
      tableName: `hlekkr-review-queue-${this.account}-${this.region}`,
      partitionKey: { name: 'reviewId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSIs for efficient querying
    this.reviewQueueTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING }
    });

    this.reviewQueueTable.addGlobalSecondaryIndex({
      indexName: 'ModeratorIndex',
      partitionKey: { name: 'assignedModerator', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING }
    });

    this.reviewQueueTable.addGlobalSecondaryIndex({
      indexName: 'PriorityIndex',
      partitionKey: { name: 'priority', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING }
    });

    // Moderator Profile DynamoDB Table
    this.moderatorProfileTable = new dynamodb.Table(this, 'HlekkrModeratorProfile', {
      tableName: `hlekkr-moderator-profile-${this.account}-${this.region}`,
      partitionKey: { name: 'moderatorId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSIs for moderator queries
    this.moderatorProfileTable.addGlobalSecondaryIndex({
      indexName: 'RoleIndex',
      partitionKey: { name: 'role', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastActive', type: dynamodb.AttributeType.STRING }
    });

    this.moderatorProfileTable.addGlobalSecondaryIndex({
      indexName: 'CertificationIndex',
      partitionKey: { name: 'certificationLevel', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'accuracyScore', type: dynamodb.AttributeType.NUMBER }
    });

    // Review Decision DynamoDB Table (Audit Trail)
    this.reviewDecisionTable = new dynamodb.Table(this, 'HlekkrReviewDecision', {
      tableName: `hlekkr-review-decision-${this.account}-${this.region}`,
      partitionKey: { name: 'reviewId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Add GSIs for decision queries
    this.reviewDecisionTable.addGlobalSecondaryIndex({
      indexName: 'ModeratorDecisionIndex',
      partitionKey: { name: 'moderatorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    this.reviewDecisionTable.addGlobalSecondaryIndex({
      indexName: 'MediaDecisionIndex',
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });

    // Rate Limiting Table for API authentication and rate limiting
    const rateLimitTable = new RateLimitTable(this, 'RateLimitTable', {
      environment: 'dev', // This should be parameterized based on environment
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
    });

    // User Profiles Table for enhanced authentication
    const userProfilesTable = new dynamodb.Table(this, 'HlekkrUserProfiles', {
      tableName: `hlekkr-user-profiles-${this.account}-${this.region}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
    });

    // Add GSI for email lookups
    userProfilesTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for role-based queries
    userProfilesTable.addGlobalSecondaryIndex({
      indexName: 'RoleIndex',
      partitionKey: { name: 'role', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastActivityAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // SNS Topic for Moderator Alerts
    this.moderatorAlertsTopic = new sns.Topic(this, 'HlekkrModeratorAlerts', {
      topicName: `hlekkr-moderator-alerts-${this.account}-${this.region}`,
      displayName: 'Hlekkr Moderator Alerts',
      fifo: false
    });

    // Cognito User Pool for Moderator Authentication
    this.moderatorUserPool = new cognito.UserPool(this, 'HlekkrModeratorUserPool', {
      userPoolName: `hlekkr-moderators-${this.account}-${this.region}`,
      selfSignUpEnabled: false, // Admin-only registration
      signInAliases: {
        email: true,
        username: true
      },
      autoVerify: {
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        },
        givenName: {
          required: true,
          mutable: true
        },
        familyName: {
          required: true,
          mutable: true
        }
      },
      customAttributes: {
        'moderator_role': new cognito.StringAttribute({ minLen: 1, maxLen: 20, mutable: true }),
        'certification_level': new cognito.StringAttribute({ minLen: 1, maxLen: 20, mutable: true }),
        'specializations': new cognito.StringAttribute({ minLen: 0, maxLen: 500, mutable: true })
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: true,
        otp: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Cognito User Pool Client for Moderator Dashboard
    this.moderatorUserPoolClient = new cognito.UserPoolClient(this, 'HlekkrModeratorUserPoolClient', {
      userPool: this.moderatorUserPool,
      userPoolClientName: `hlekkr-moderator-client-${this.account}-${this.region}`,
      generateSecret: false, // For web applications
      authFlows: {
        userSrp: true,
        userPassword: false, // Disable less secure flows
        adminUserPassword: true // For admin operations
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          'http://localhost:3000/callback', // Development
          `https://moderator.hlekkr.${this.account}.${this.region}.amazonaws.com/callback` // Production
        ],
        logoutUrls: [
          'http://localhost:3000/logout',
          `https://moderator.hlekkr.${this.account}.${this.region}.amazonaws.com/logout`
        ]
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1)
    });

    // Moderator Account Management Lambda Function
    const moderatorAccountManager = new lambda.Function(this, 'HlekkrModeratorAccountManager', {
      functionName: `hlekkr-moderator-account-manager-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/moderator_account_manager'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        MODERATOR_USER_POOL_ID: this.moderatorUserPool.userPoolId,
        MODERATOR_PROFILE_TABLE_NAME: this.moderatorProfileTable.tableName,
        REVIEW_QUEUE_TABLE_NAME: this.reviewQueueTable.tableName,
        MODERATOR_ALERTS_TOPIC_ARN: this.moderatorAlertsTopic.topicArn
      }
    });

    // Grant permissions to moderator account manager
    this.moderatorUserPool.grant(moderatorAccountManager, 'cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminUpdateUserAttributes', 'cognito-idp:AdminDeleteUser', 'cognito-idp:AdminGetUser', 'cognito-idp:ListUsers');
    this.moderatorProfileTable.grantReadWriteData(moderatorAccountManager);
    this.reviewQueueTable.grantReadData(moderatorAccountManager);
    this.moderatorAlertsTopic.grantPublish(moderatorAccountManager);

    // Review Lifecycle Management Lambda Function
    this.reviewLifecycleManager = new lambda.Function(this, 'HlekkrReviewLifecycleManager', {
      functionName: `hlekkr-review-lifecycle-manager-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/review_lifecycle_manager'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        REVIEW_QUEUE_TABLE_NAME: this.reviewQueueTable.tableName,
        MODERATOR_PROFILE_TABLE_NAME: this.moderatorProfileTable.tableName,
        REVIEW_DECISION_TABLE_NAME: this.reviewDecisionTable.tableName,
        MODERATOR_ALERTS_TOPIC_ARN: this.moderatorAlertsTopic.topicArn
      }
    });

    // Grant permissions to review lifecycle manager
    this.reviewQueueTable.grantReadWriteData(this.reviewLifecycleManager);
    this.moderatorProfileTable.grantReadWriteData(this.reviewLifecycleManager);
    this.reviewDecisionTable.grantReadWriteData(this.reviewLifecycleManager);
    this.moderatorAlertsTopic.grantPublish(this.reviewLifecycleManager);

    // Grant EventBridge permissions for scheduling
    this.reviewLifecycleManager.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'events:PutRule',
        'events:PutTargets',
        'events:DeleteRule',
        'events:RemoveTargets'
      ],
      resources: ['*']
    }));

    // Review Completion Validator Lambda Function
    this.reviewCompletionValidator = new lambda.Function(this, 'HlekkrReviewCompletionValidator', {
      functionName: `hlekkr-review-completion-validator-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/review_completion_validator'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        REVIEW_QUEUE_TABLE_NAME: this.reviewQueueTable.tableName,
        MODERATOR_PROFILE_TABLE_NAME: this.moderatorProfileTable.tableName,
        REVIEW_DECISION_TABLE_NAME: this.reviewDecisionTable.tableName,
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        MODERATOR_ALERTS_TOPIC_ARN: this.moderatorAlertsTopic.topicArn,
        TRUST_SCORE_CALCULATOR_FUNCTION_NAME: `hlekkr-trust-score-calculator-${this.account}-${this.region}`,
        THREAT_INTELLIGENCE_PROCESSOR_FUNCTION_NAME: threatIntelligenceProcessor.functionName
      }
    });

    // Grant permissions to review completion validator
    this.reviewQueueTable.grantReadWriteData(this.reviewCompletionValidator);
    this.moderatorProfileTable.grantReadWriteData(this.reviewCompletionValidator);
    this.reviewDecisionTable.grantReadWriteData(this.reviewCompletionValidator);
    this.auditTable.grantReadWriteData(this.reviewCompletionValidator);
    this.moderatorAlertsTopic.grantPublish(this.reviewCompletionValidator);

    // Grant Lambda invoke permissions for trust score calculator
    this.reviewCompletionValidator.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:hlekkr-trust-score-calculator-*`]
    }));

    // Grant Lambda invoke permissions for threat intelligence processor
    this.reviewCompletionValidator.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [threatIntelligenceProcessor.functionArn]
    }));

    // Rate Limiting Monitor Lambda Function
    const rateLimitMonitor = new lambda.Function(this, 'HlekkrRateLimitMonitor', {
      functionName: `hlekkr-rate-limit-monitor-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'rate-limit-monitor.handler',
      code: lambda.Code.fromAsset('../lambda/monitoring'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        RATE_LIMIT_TABLE: rateLimitTable.table.tableName,
        USER_PROFILES_TABLE: userProfilesTable.tableName,
        ALERTS_TOPIC_ARN: this.securityAlertsTopic.topicArn,
        ENVIRONMENT: 'dev', // This should be parameterized
      },
    });

    // Grant permissions to rate limit monitor
    rateLimitTable.table.grantReadData(rateLimitMonitor);
    userProfilesTable.grantReadData(rateLimitMonitor);
    this.securityAlertsTopic.grantPublish(rateLimitMonitor);

    // Grant CloudWatch metrics permissions
    rateLimitMonitor.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
      ],
      resources: ['*'],
    }));

    // Schedule rate limit monitoring to run every 5 minutes
    const rateLimitMonitorRule = new events.Rule(this, 'RateLimitMonitorSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      description: 'Trigger rate limit monitoring every 5 minutes',
    });

    rateLimitMonitorRule.addTarget(new eventsTargets.LambdaFunction(rateLimitMonitor));

    // Grant Bedrock permissions for AI feedback processing
    this.reviewCompletionValidator.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: ['*']
    }));

    // Outputs for other stacks to reference
    new cdk.CfnOutput(this, 'MediaUploadsBucketName', {
      value: this.mediaUploadsBucket.bucketName,
      description: 'Name of the S3 bucket for media uploads'
    });

    new cdk.CfnOutput(this, 'QuarantineBucketName', {
      value: this.quarantineBucket.bucketName,
      description: 'Name of the S3 bucket for quarantined files'
    });

    new cdk.CfnOutput(this, 'AuditTableName', {
      value: this.auditTable.tableName,
      description: 'Name of the DynamoDB table for audit trail'
    });

    new cdk.CfnOutput(this, 'TrustScoreTableName', {
      value: this.trustScoreTable.tableName,
      description: 'Name of the DynamoDB table for trust scores with versioning'
    });

    new cdk.CfnOutput(this, 'SecurityScannerArn', {
      value: this.securityScanner.functionArn,
      description: 'ARN of the security scanner Lambda function'
    });

    new cdk.CfnOutput(this, 'MetadataExtractorArn', {
      value: this.metadataExtractor.functionArn,
      description: 'ARN of the metadata extraction Lambda function'
    });

    new cdk.CfnOutput(this, 'SecurityAlertsTopicArn', {
      value: this.securityAlertsTopic.topicArn,
      description: 'ARN of the SNS topic for security alerts'
    });

    new cdk.CfnOutput(this, 'TrustScoreCalculatorArn', {
      value: trustScoreCalculator.functionArn,
      description: 'ARN of the trust score calculator Lambda function'
    });

    new cdk.CfnOutput(this, 'TrustScoreApiUrl', {
      value: trustScoreApi.url,
      description: 'URL of the Trust Score API Gateway'
    });

    new cdk.CfnOutput(this, 'SourceVerifierArn', {
      value: sourceVerifier.functionArn,
      description: 'ARN of the source verifier Lambda function'
    });

    new cdk.CfnOutput(this, 'SourceVerificationTableName', {
      value: sourceVerificationTable.tableName,
      description: 'Name of the DynamoDB table for source verification'
    });

    new cdk.CfnOutput(this, 'ChainOfCustodyTrackerArn', {
      value: chainOfCustodyTracker.functionArn,
      description: 'ARN of the chain of custody tracker Lambda function'
    });

    new cdk.CfnOutput(this, 'ChainOfCustodyTableName', {
      value: chainOfCustodyTable.tableName,
      description: 'Name of the DynamoDB table for chain of custody tracking'
    });

    new cdk.CfnOutput(this, 'ChainOfCustodyKmsKeyId', {
      value: chainOfCustodyKmsKey.keyId,
      description: 'KMS Key ID for chain of custody cryptographic integrity'
    });

    new cdk.CfnOutput(this, 'DiscrepancyDetectorArn', {
      value: discrepancyDetector.functionArn,
      description: 'ARN of the discrepancy detection Lambda function'
    });

    new cdk.CfnOutput(this, 'DiscrepancyAlertsTopicArn', {
      value: discrepancyAlertsTopic.topicArn,
      description: 'ARN of the SNS topic for discrepancy alerts'
    });

    new cdk.CfnOutput(this, 'ThreatIntelligenceProcessorArn', {
      value: threatIntelligenceProcessor.functionArn,
      description: 'ARN of the threat intelligence processor Lambda function'
    });

    new cdk.CfnOutput(this, 'ThreatIntelligenceTableName', {
      value: threatIntelligenceTable.tableName,
      description: 'Name of the DynamoDB table for threat intelligence data'
    });

    new cdk.CfnOutput(this, 'ThreatReportsBucketName', {
      value: threatReportsBucket.bucketName,
      description: 'Name of the S3 bucket for threat intelligence reports'
    });

    new cdk.CfnOutput(this, 'ThreatAlertsTopicArn', {
      value: threatAlertsTopic.topicArn,
      description: 'ARN of the SNS topic for threat intelligence alerts'
    });

    // HITL Review Workflow Outputs
    new cdk.CfnOutput(this, 'ReviewQueueTableName', {
      value: this.reviewQueueTable.tableName,
      description: 'Name of the DynamoDB table for review queue'
    });

    new cdk.CfnOutput(this, 'ModeratorProfileTableName', {
      value: this.moderatorProfileTable.tableName,
      description: 'Name of the DynamoDB table for moderator profiles'
    });

    new cdk.CfnOutput(this, 'ReviewDecisionTableName', {
      value: this.reviewDecisionTable.tableName,
      description: 'Name of the DynamoDB table for review decisions'
    });

    new cdk.CfnOutput(this, 'ModeratorUserPoolId', {
      value: this.moderatorUserPool.userPoolId,
      description: 'ID of the Cognito User Pool for moderators'
    });

    new cdk.CfnOutput(this, 'ModeratorUserPoolClientId', {
      value: this.moderatorUserPoolClient.userPoolClientId,
      description: 'ID of the Cognito User Pool Client for moderators'
    });

    new cdk.CfnOutput(this, 'ModeratorAlertsTopicArn', {
      value: this.moderatorAlertsTopic.topicArn,
      description: 'ARN of the SNS topic for moderator alerts'
    });

    new cdk.CfnOutput(this, 'ModeratorAccountManagerArn', {
      value: moderatorAccountManager.functionArn,
      description: 'ARN of the moderator account management Lambda function'
    });

    new cdk.CfnOutput(this, 'ReviewLifecycleManagerArn', {
      value: this.reviewLifecycleManager.functionArn,
      description: 'ARN of the review lifecycle management Lambda function'
    });

    new cdk.CfnOutput(this, 'ReviewCompletionValidatorArn', {
      value: this.reviewCompletionValidator.functionArn,
      description: 'ARN of the review completion validator Lambda function'
    });

    // Media Processing Workflow Outputs
    new cdk.CfnOutput(this, 'MediaProcessingStateMachineArn', {
      value: mediaProcessingStateMachine.stateMachineArn,
      description: 'ARN of the Step Functions state machine for media processing'
    });

    new cdk.CfnOutput(this, 'WorkflowOrchestratorArn', {
      value: workflowOrchestrator.functionArn,
      description: 'ARN of the workflow orchestrator Lambda function'
    });

    new cdk.CfnOutput(this, 'MediaProcessingQueueUrl', {
      value: mediaProcessingQueue.queueUrl,
      description: 'URL of the SQS queue for media processing'
    });

    new cdk.CfnOutput(this, 'MediaProcessingDLQUrl', {
      value: mediaProcessingDLQ.queueUrl,
      description: 'URL of the dead letter queue for failed media processing'
    });
  }
}