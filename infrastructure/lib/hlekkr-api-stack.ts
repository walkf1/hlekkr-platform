import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface HlekkrApiStackProps extends cdk.StackProps {
  mediaUploadsBucket: s3.Bucket;
  auditTable: dynamodb.Table;
}

export class HlekkrApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: HlekkrApiStackProps) {
    super(scope, id, props);

    // Create the main REST API
    this.api = new apigateway.RestApi(this, 'HlekkrMediaAPI', {
      restApiName: 'Hlekkr Media Processing API',
      description: 'API for media upload, analysis, and deepfake detection',
      defaultCorsPreflightOptions: {
        allowOrigins: ['http://localhost:3000', 'https://*.hlekkr.com'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type', 
          'X-Amz-Date', 
          'Authorization', 
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent'
        ],
        allowCredentials: true
      },
      deployOptions: {
        stageName: 'prod',
        throttle: {
          rateLimit: 1000,
          burstLimit: 2000
        }
      }
    });

    // Deepfake detection Lambda function
    const deepfakeDetector = new lambda.Function(this, 'DeepfakeDetector', {
      functionName: `hlekkr-deepfake-detector-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/deepfake_detector'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 2048,
      environment: {
        AUDIT_TABLE_NAME: props.auditTable.tableName,
        MEDIA_BUCKET_NAME: props.mediaUploadsBucket.bucketName
      }
    });

    // Trust score calculator Lambda function
    const trustScoreCalculator = new lambda.Function(this, 'TrustScoreCalculator', {
      functionName: `hlekkr-trust-score-calculator-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/trust_score_calculator'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        AUDIT_TABLE_NAME: props.auditTable.tableName,
        MEDIA_BUCKET_NAME: props.mediaUploadsBucket.bucketName
      }
    });

    // Review workflow trigger Lambda function
    const reviewWorkflowTrigger = new lambda.Function(this, 'ReviewWorkflowTrigger', {
      functionName: `hlekkr-review-workflow-trigger-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/review_workflow_trigger'),
      timeout: cdk.Duration.minutes(3),
      memorySize: 512,
      environment: {
        AUDIT_TABLE_NAME: props.auditTable.tableName,
        MEDIA_BUCKET_NAME: props.mediaUploadsBucket.bucketName
      }
    });

    // Grant permissions to Lambda functions
    props.mediaUploadsBucket.grantReadWrite(deepfakeDetector);
    props.mediaUploadsBucket.grantReadWrite(trustScoreCalculator);
    props.mediaUploadsBucket.grantReadWrite(reviewWorkflowTrigger);
    
    props.auditTable.grantReadWriteData(deepfakeDetector);
    props.auditTable.grantReadWriteData(trustScoreCalculator);
    props.auditTable.grantReadWriteData(reviewWorkflowTrigger);

    // Add Bedrock permissions for deepfake detection
    deepfakeDetector.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: ['*']
    }));

    // Create API Key for authentication
    const apiKey = this.api.addApiKey('HlekkrApiKey', {
      apiKeyName: 'hlekkr-frontend-key',
      description: 'API key for Hlekkr frontend access'
    });

    // Create usage plan
    const usagePlan = this.api.addUsagePlan('HlekkrUsagePlan', {
      name: 'hlekkr-standard-plan',
      description: 'Standard usage plan for Hlekkr API',
      throttle: {
        rateLimit: 100,
        burstLimit: 200
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY
      }
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: this.api.deploymentStage
    });

    // API Gateway resources and methods
    const mediaResource = this.api.root.addResource('media');
    const mediaIdResource = mediaResource.addResource('{mediaId}');

    // POST /media - Upload media
    mediaResource.addMethod('POST', new apigateway.LambdaIntegration(reviewWorkflowTrigger), {
      apiKeyRequired: true
    });

    // GET /media/{mediaId} - Get media analysis results
    mediaIdResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      apiKeyRequired: true
    });

    // POST /media/{mediaId}/analyze - Trigger deepfake analysis
    const analyzeResource = mediaIdResource.addResource('analyze');
    analyzeResource.addMethod('POST', new apigateway.LambdaIntegration(deepfakeDetector), {
      apiKeyRequired: true
    });

    // GET /media/{mediaId}/status - Get analysis status
    const statusResource = mediaIdResource.addResource('status');
    statusResource.addMethod('GET', new apigateway.LambdaIntegration(reviewWorkflowTrigger), {
      apiKeyRequired: true
    });

    // GET /media/{mediaId}/analysis - Get analysis results
    const analysisResource = mediaIdResource.addResource('analysis');
    analysisResource.addMethod('GET', new apigateway.LambdaIntegration(deepfakeDetector), {
      apiKeyRequired: true
    });

    // Trust Score endpoints
    const trustScoresResource = this.api.root.addResource('trust-scores');
    const trustScoreIdResource = trustScoresResource.addResource('{mediaId}');

    // GET /trust-scores - List trust scores
    trustScoresResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      apiKeyRequired: true
    });

    // GET /trust-scores/{mediaId} - Get specific trust score
    trustScoreIdResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      apiKeyRequired: true
    });

    // POST /trust-scores/{mediaId} - Calculate/recalculate trust score
    trustScoreIdResource.addMethod('POST', new apigateway.LambdaIntegration(trustScoreCalculator), {
      apiKeyRequired: true
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'URL of the Hlekkr Media Processing API'
    });

    new cdk.CfnOutput(this, 'DeepfakeDetectorArn', {
      value: deepfakeDetector.functionArn,
      description: 'ARN of the deepfake detection Lambda function'
    });

    new cdk.CfnOutput(this, 'TrustScoreCalculatorArn', {
      value: trustScoreCalculator.functionArn,
      description: 'ARN of the trust score calculator Lambda function'
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID for frontend authentication'
    });

    new cdk.CfnOutput(this, 'ApiKeyValue', {
      value: apiKey.keyArn,
      description: 'API Key ARN (retrieve value from AWS Console)'
    });
  }
}