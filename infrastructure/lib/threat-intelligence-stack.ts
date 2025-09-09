import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface ThreatIntelligenceStackProps extends cdk.StackProps {
  environment: 'dev' | 'staging' | 'prod';
  threatIntelligenceTable: dynamodb.Table;
  mediaAnalysisTable: dynamodb.Table;
  reviewDecisionsTable: dynamodb.Table;
}

export class ThreatIntelligenceStack extends cdk.Stack {
  public readonly threatReportGenerator: lambda.Function;
  public readonly threatReportsBucket: s3.Bucket;
  public readonly threatAlertsQueue: sqs.Queue;
  public readonly threatAlertsTopic: sns.Topic;
  public readonly threatIntelligenceApi: apigateway.RestApi;
  private readonly threatIntelligenceTable: dynamodb.Table;
  private readonly mediaAnalysisTable: dynamodb.Table;
  private readonly reviewDecisionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ThreatIntelligenceStackProps) {
    super(scope, id, props);
    
    // Store table references
    this.threatIntelligenceTable = props.threatIntelligenceTable;
    this.mediaAnalysisTable = props.mediaAnalysisTable;
    this.reviewDecisionsTable = props.reviewDecisionsTable;

    // S3 bucket for storing detailed threat reports
    this.threatReportsBucket = new s3.Bucket(this, 'ThreatReportsBucket', {
      bucketName: `hlekkr-${props.environment}-threat-reports`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldReports',
          enabled: true,
          expiration: cdk.Duration.days(props.environment === 'prod' ? 2555 : 365), // 7 years for prod, 1 year for dev/staging
        },
      ],
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // SNS topic for threat alerts
    this.threatAlertsTopic = new sns.Topic(this, 'ThreatAlertsTopic', {
      topicName: `hlekkr-${props.environment}-threat-alerts`,
      displayName: 'Hlekkr Threat Intelligence Alerts',
    });

    // SQS queue for processing threat intelligence
    this.threatAlertsQueue = new sqs.Queue(this, 'ThreatAlertsQueue', {
      queueName: `hlekkr-${props.environment}-threat-alerts`,
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'ThreatAlertsDLQ', {
          queueName: `hlekkr-${props.environment}-threat-alerts-dlq`,
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    // Lambda function for threat report generation
    this.threatReportGenerator = new lambda.Function(this, 'ThreatReportGenerator', {
      functionName: `hlekkr-${props.environment}-threat-report-generator`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/threat-report-generator'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        ENVIRONMENT: props.environment,
        THREAT_INTELLIGENCE_TABLE: props.threatIntelligenceTable.tableName,
        MEDIA_ANALYSIS_TABLE: props.mediaAnalysisTable.tableName,
        REVIEW_DECISIONS_TABLE: props.reviewDecisionsTable.tableName,
        THREAT_REPORTS_BUCKET: this.threatReportsBucket.bucketName,
        SNS_TOPIC_ARN: this.threatAlertsTopic.topicArn,
        GITHUB_OWNER: 'hlekkr',
        GITHUB_REPO: 'hlekkr-framework',
        GITHUB_TOKEN: this.getGitHubToken(props.environment),
      },
      deadLetterQueue: this.threatAlertsQueue,
    });

    // Add SQS event source to Lambda
    this.threatReportGenerator.addEventSource(new SqsEventSource(this.threatAlertsQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(30),
    }));

    // Grant permissions to Lambda function
    this.grantLambdaPermissions();

    // Create API Gateway for threat intelligence management
    this.threatIntelligenceApi = new apigateway.RestApi(this, 'ThreatIntelligenceApi', {
      restApiName: `hlekkr-${props.environment}-threat-intelligence`,
      description: 'Hlekkr Threat Intelligence Management API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    // Create API resources and methods
    this.createApiResources();

    // Create EventBridge rules for automated threat processing
    this.createEventBridgeRules();

    // Store configuration in SSM
    this.storeConfiguration(props.environment);

    // Add tags
    this.addResourceTags(props.environment);

    // Outputs
    new cdk.CfnOutput(this, 'ThreatReportsBucketName', {
      value: this.threatReportsBucket.bucketName,
      description: 'S3 bucket for threat reports',
      exportName: `hlekkr-${props.environment}-threat-reports-bucket`,
    });

    new cdk.CfnOutput(this, 'ThreatAlertsTopicArn', {
      value: this.threatAlertsTopic.topicArn,
      description: 'SNS topic for threat alerts',
      exportName: `hlekkr-${props.environment}-threat-alerts-topic`,
    });

    new cdk.CfnOutput(this, 'ThreatIntelligenceApiUrl', {
      value: this.threatIntelligenceApi.url,
      description: 'Threat Intelligence API URL',
      exportName: `hlekkr-${props.environment}-threat-intelligence-api-url`,
    });
  }

  private grantLambdaPermissions(): void {
    // DynamoDB permissions
    this.threatIntelligenceTable.grantReadWriteData(this.threatReportGenerator);
    this.mediaAnalysisTable.grantReadData(this.threatReportGenerator);
    this.reviewDecisionsTable.grantReadData(this.threatReportGenerator);

    // S3 permissions
    this.threatReportsBucket.grantReadWrite(this.threatReportGenerator);

    // SNS permissions
    this.threatAlertsTopic.grantPublish(this.threatReportGenerator);

    // SQS permissions
    this.threatAlertsQueue.grantConsumeMessages(this.threatReportGenerator);

    // Additional IAM permissions for GitHub integration
    this.threatReportGenerator.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/hlekkr/prod/github/*`,
      ],
    }));

    // CloudWatch permissions for metrics and logging
    this.threatReportGenerator.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));
  }

  private createApiResources(): void {
    // Reports resource
    const reportsResource = this.threatIntelligenceApi.root.addResource('reports');
    
    // GET /reports - List threat reports
    reportsResource.addMethod('GET', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // POST /reports/generate - Generate new threat report
    const generateResource = reportsResource.addResource('generate');
    generateResource.addMethod('POST', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // Individual report resource
    const reportResource = reportsResource.addResource('{reportId}');
    
    // GET /reports/{reportId} - Get specific report
    reportResource.addMethod('GET', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // PUT /reports/{reportId}/publish - Publish report to GitHub
    const publishResource = reportResource.addResource('publish');
    publishResource.addMethod('PUT', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // Indicators resource
    const indicatorsResource = this.threatIntelligenceApi.root.addResource('indicators');
    
    // GET /indicators - List threat indicators
    indicatorsResource.addMethod('GET', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // POST /indicators - Add new indicator
    indicatorsResource.addMethod('POST', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // Statistics resource
    const statsResource = this.threatIntelligenceApi.root.addResource('stats');
    statsResource.addMethod('GET', new apigateway.LambdaIntegration(this.threatReportGenerator), {
      authorizationType: apigateway.AuthorizationType.IAM,
    });
  }

  private createEventBridgeRules(): void {
    // Rule for processing human review decisions
    const reviewDecisionRule = new events.Rule(this, 'ReviewDecisionRule', {
      ruleName: `hlekkr-prod-review-decision-processing`,
      description: 'Process human review decisions for threat intelligence',
      eventPattern: {
        source: ['hlekkr.review'],
        detailType: ['Review Decision Completed'],
        detail: {
          decision: ['confirm', 'suspicious'],
        },
      },
    });

    reviewDecisionRule.addTarget(new targets.SqsQueue(this.threatAlertsQueue, {
      message: events.RuleTargetInput.fromEventPath('$.detail'),
    }));

    // Rule for processing high-confidence AI detections
    const aiDetectionRule = new events.Rule(this, 'AIDetectionRule', {
      ruleName: `hlekkr-prod-ai-detection-processing`,
      description: 'Process high-confidence AI detections for threat intelligence',
      eventPattern: {
        source: ['hlekkr.analysis'],
        detailType: ['Analysis Completed'],
        detail: {
          trustScore: {
            composite: [{ numeric: ['<', 40] }],
          },
          deepfakeAnalysis: {
            probability: [{ numeric: ['>', 0.8] }],
          },
        },
      },
    });

    aiDetectionRule.addTarget(new targets.SqsQueue(this.threatAlertsQueue, {
      message: events.RuleTargetInput.fromEventPath('$.detail'),
    }));

    // Scheduled rule for periodic threat analysis
    const periodicAnalysisRule = new events.Rule(this, 'PeriodicAnalysisRule', {
      ruleName: `hlekkr-prod-periodic-threat-analysis`,
      description: 'Periodic threat pattern analysis',
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
    });

    periodicAnalysisRule.addTarget(new targets.LambdaFunction(this.threatReportGenerator, {
      event: events.RuleTargetInput.fromObject({
        operation: 'analyze_threat_patterns',
        source: 'scheduled',
      }),
    }));
  }

  private getGitHubToken(environment: string): string {
    // In production, this would reference an SSM parameter
    // For now, return a placeholder that will be replaced with actual token
    return `{{resolve:ssm:/hlekkr/${environment}/github/token}}`;
  }

  private storeConfiguration(environment: string): void {
    // Store threat intelligence configuration in SSM
    new ssm.StringParameter(this, 'ThreatReportsBucketParameter', {
      parameterName: `/hlekkr/${environment}/threat-intelligence/reports-bucket`,
      stringValue: this.threatReportsBucket.bucketName,
      description: 'S3 bucket for threat reports',
    });

    new ssm.StringParameter(this, 'ThreatAlertsTopicParameter', {
      parameterName: `/hlekkr/${environment}/threat-intelligence/alerts-topic`,
      stringValue: this.threatAlertsTopic.topicArn,
      description: 'SNS topic for threat alerts',
    });

    new ssm.StringParameter(this, 'ThreatIntelligenceApiParameter', {
      parameterName: `/hlekkr/${environment}/threat-intelligence/api-url`,
      stringValue: this.threatIntelligenceApi.url,
      description: 'Threat Intelligence API URL',
    });

    // GitHub configuration
    new ssm.StringParameter(this, 'GitHubOwnerParameter', {
      parameterName: `/hlekkr/${environment}/github/owner`,
      stringValue: 'hlekkr',
      description: 'GitHub organization/owner for threat reports',
    });

    new ssm.StringParameter(this, 'GitHubRepoParameter', {
      parameterName: `/hlekkr/${environment}/github/repo`,
      stringValue: 'hlekkr-framework',
      description: 'GitHub repository for threat reports',
    });

    // Threat intelligence settings
    new ssm.StringParameter(this, 'ThreatReportRetentionParameter', {
      parameterName: `/hlekkr/${environment}/threat-intelligence/report-retention-days`,
      stringValue: environment === 'prod' ? '2555' : '365',
      description: 'Threat report retention period in days',
    });

    new ssm.StringParameter(this, 'AutoPublishThresholdParameter', {
      parameterName: `/hlekkr/${environment}/threat-intelligence/auto-publish-threshold`,
      stringValue: '0.8',
      description: 'Confidence threshold for auto-publishing threat reports',
    });
  }

  private addResourceTags(environment: string): void {
    const tags = {
      Environment: environment,
      Service: 'hlekkr-threat-intelligence',
      Component: 'threat-report-generation',
      ManagedBy: 'cdk',
    };

    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}

// Additional construct for GitHub webhook integration
export class GitHubWebhookConstruct extends Construct {
  public readonly webhookFunction: lambda.Function;
  public readonly webhookApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: { environment: string }) {
    super(scope, id);

    // Lambda function for handling GitHub webhooks
    this.webhookFunction = new lambda.Function(this, 'GitHubWebhookHandler', {
      functionName: `hlekkr-${props.environment}-github-webhook`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'webhook.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('GitHub webhook received:', JSON.stringify(event, null, 2));
          
          // Verify webhook signature
          const signature = event.headers['X-Hub-Signature-256'];
          const payload = event.body;
          
          // Process webhook event
          const webhookEvent = JSON.parse(payload);
          
          if (webhookEvent.action === 'opened' || webhookEvent.action === 'synchronize') {
            // Handle pull request events for threat report reviews
            console.log('Processing PR event for threat report review');
          }
          
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Webhook processed successfully' }),
          };
        };
      `),
      timeout: cdk.Duration.minutes(5),
      environment: {
        ENVIRONMENT: props.environment,
      },
    });

    // API Gateway for webhook endpoint
    this.webhookApi = new apigateway.RestApi(this, 'GitHubWebhookApi', {
      restApiName: `hlekkr-${props.environment}-github-webhook`,
      description: 'GitHub webhook endpoint for threat report management',
    });

    const webhookResource = this.webhookApi.root.addResource('webhook');
    webhookResource.addMethod('POST', new apigateway.LambdaIntegration(this.webhookFunction));

    // Output webhook URL
    new cdk.CfnOutput(this, 'GitHubWebhookUrl', {
      value: `${this.webhookApi.url}webhook`,
      description: 'GitHub webhook URL',
      exportName: `hlekkr-${props.environment}-github-webhook-url`,
    });
  }
}