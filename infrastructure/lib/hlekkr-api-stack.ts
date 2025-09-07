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
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
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

    // API Gateway resources and methods
    const mediaResource = this.api.root.addResource('media');
    const mediaIdResource = mediaResource.addResource('{mediaId}');

    // POST /media - Upload media
    mediaResource.addMethod('POST', new apigateway.LambdaIntegration(reviewWorkflowTrigger), {
      authorizationType: apigateway.AuthorizationType.IAM
    });

    // GET /media/{mediaId} - Get media analysis results
    mediaIdResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      authorizationType: apigateway.AuthorizationType.IAM
    });

    // POST /media/{mediaId}/analyze - Trigger deepfake analysis
    const analyzeResource = mediaIdResource.addResource('analyze');
    analyzeResource.addMethod('POST', new apigateway.LambdaIntegration(deepfakeDetector), {
      authorizationType: apigateway.AuthorizationType.IAM
    });

    // GET /media/{mediaId}/trust-score - Get trust score
    const trustScoreResource = mediaIdResource.addResource('trust-score');
    trustScoreResource.addMethod('GET', new apigateway.LambdaIntegration(trustScoreCalculator), {
      authorizationType: apigateway.AuthorizationType.IAM
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
  }
}