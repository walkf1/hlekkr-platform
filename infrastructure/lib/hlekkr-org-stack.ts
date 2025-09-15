import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as organizations from 'aws-cdk-lib/aws-organizations';
import { Construct } from 'constructs';

export interface HlekkrOrgStackProps extends cdk.StackProps {
  organizationId: string;
  targetAccountId?: string;
}

export class HlekkrOrgStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HlekkrOrgStackProps) {
    super(scope, id, props);

    // Organization-aware resource naming
    const orgPrefix = `hlekkr-org-${props.organizationId.split('-')[1]}`;
    
    // S3 bucket with organization context
    const mediaUploadsBucket = new s3.Bucket(this, 'HlekkrOrgMediaUploads', {
      bucketName: `${orgPrefix}-media-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // DynamoDB with organization context
    const auditTable = new dynamodb.Table(this, 'HlekkrOrgAuditTable', {
      tableName: `${orgPrefix}-audit-${this.account}-${this.region}`,
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Lambda functions
    const healthCheckFunction = new lambda.Function(this, 'HlekkrOrgHealthCheck', {
      functionName: `${orgPrefix}-health-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              message: 'Hlekkr Platform (Organization Deployment)',
              organizationId: '${props.organizationId}',
              accountId: '${this.account}',
              region: '${this.region}',
              timestamp: new Date().toISOString(),
              version: '1.0.0-org'
            })
          };
        };
      `),
      environment: {
        ORGANIZATION_ID: props.organizationId,
        MEDIA_BUCKET_NAME: mediaUploadsBucket.bucketName,
        AUDIT_TABLE_NAME: auditTable.tableName
      }
    });

    const mediaUploadFunction = new lambda.Function(this, 'HlekkrOrgMediaUpload', {
      functionName: `${orgPrefix}-upload-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'simple-upload.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      timeout: cdk.Duration.minutes(5),
      environment: {
        ORGANIZATION_ID: props.organizationId,
        MEDIA_BUCKET_NAME: mediaUploadsBucket.bucketName,
        AUDIT_TABLE_NAME: auditTable.tableName
      }
    });

    const demoHitlFunction = new lambda.Function(this, 'HlekkrOrgDemoHitl', {
      functionName: `${orgPrefix}-demo-hitl-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'demo-hitl-handler.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      timeout: cdk.Duration.minutes(2),
      environment: {
        ORGANIZATION_ID: props.organizationId,
        AUDIT_TABLE_NAME: auditTable.tableName
      }
    });

    const deepfakeDetectorFunction = new lambda.Function(this, 'HlekkrOrgDeepfakeDetector', {
      functionName: `${orgPrefix}-deepfake-${this.account}-${this.region}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/deepfake_detector'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008,
      environment: {
        AUDIT_TABLE_NAME: auditTable.tableName,
        MEDIA_BUCKET_NAME: mediaUploadsBucket.bucketName
      }
    });

    // Grant minimal permissions (principle of least privilege)
    mediaUploadsBucket.grantRead(healthCheckFunction);
    auditTable.grantReadData(healthCheckFunction);
    
    // Upload function - S3 and DynamoDB permissions
    mediaUploadsBucket.grantPut(mediaUploadFunction);
    mediaUploadsBucket.grantPutAcl(mediaUploadFunction);
    auditTable.grantWriteData(mediaUploadFunction);
    
    // Add environment variable for audit table
    mediaUploadFunction.addEnvironment('AUDIT_TABLE_NAME', auditTable.tableName);
    
    // Demo HITL function permissions
    auditTable.grantWriteData(demoHitlFunction);
    demoHitlFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'lambda:InvokeFunction'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/hlekkr/prod/github/token`,
        `arn:aws:lambda:${this.region}:${this.account}:function:${orgPrefix}-deepfake-${this.account}-${this.region}`
      ]
    }));
    
    // Deepfake detector permissions
    auditTable.grantReadWriteData(deepfakeDetectorFunction);
    mediaUploadsBucket.grantRead(deepfakeDetectorFunction);
    deepfakeDetectorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-image-generator-v1`
      ]
    }));

    // API Gateway
    const api = new apigateway.RestApi(this, 'HlekkrOrgApi', {
      restApiName: `${orgPrefix}-api-${this.account}-${this.region}`,
      description: 'Hlekkr Platform API (Organization Deployment)',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
      defaultCorsPreflightOptions: {
        allowOrigins: process.env.NODE_ENV === 'production' 
          ? ['https://hlekkr.com', 'https://app.hlekkr.com']
          : ['http://localhost:3001', 'http://localhost:3000'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        allowCredentials: true
      }
    });

    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.LambdaIntegration(healthCheckFunction));

    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    const presignedUrlResource = uploadResource.addResource('presigned-url');
    presignedUrlResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    const completeUploadResource = uploadResource.addResource('complete');
    completeUploadResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    const multipartResource = uploadResource.addResource('multipart');
    const initializeResource = multipartResource.addResource('initialize');
    initializeResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    const urlsResource = multipartResource.addResource('urls');
    urlsResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    const completeResource = multipartResource.addResource('complete');
    completeResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    const abortResource = multipartResource.addResource('abort');
    abortResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));
    
    // Demo HITL endpoint
    const demoResource = api.root.addResource('demo');
    const hitlResource = demoResource.addResource('hitl');
    hitlResource.addMethod('POST', new apigateway.LambdaIntegration(demoHitlFunction));

    // Media analysis endpoints
    const mediaResource = api.root.addResource('media');
    const mediaIdResource = mediaResource.addResource('{mediaId}');
    
    // POST /media/{mediaId}/analyze - Trigger deepfake analysis
    const analyzeResource = mediaIdResource.addResource('analyze');
    analyzeResource.addMethod('POST', new apigateway.LambdaIntegration(deepfakeDetectorFunction));
    
    // GET /media/{mediaId}/status - Get analysis status
    const statusResource = mediaIdResource.addResource('status');
    statusResource.addMethod('GET', new apigateway.LambdaIntegration(demoHitlFunction));
    
    // GET /media/{mediaId}/analysis - Get analysis results
    const analysisResource = mediaIdResource.addResource('analysis');
    analysisResource.addMethod('GET', new apigateway.LambdaIntegration(deepfakeDetectorFunction));
    
    // Trust Score endpoints
    const trustScoresResource = api.root.addResource('trust-scores');
    const trustScoreIdResource = trustScoresResource.addResource('{mediaId}');
    
    // GET /trust-scores - List trust scores
    trustScoresResource.addMethod('GET', new apigateway.LambdaIntegration(demoHitlFunction));
    
    // GET /trust-scores/{mediaId} - Get specific trust score
    trustScoreIdResource.addMethod('GET', new apigateway.LambdaIntegration(demoHitlFunction));
    
    // POST /trust-scores/{mediaId} - Calculate/recalculate trust score
    trustScoreIdResource.addMethod('POST', new apigateway.LambdaIntegration(deepfakeDetectorFunction));

    // Note: Metadata extraction would be triggered by S3 events in full deployment
    // For demo, we'll use the existing sophisticated metadata system

    // Outputs
    new cdk.CfnOutput(this, 'OrganizationId', {
      value: props.organizationId,
      description: 'AWS Organization ID'
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Hlekkr Organization API Gateway URL'
    });

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: mediaUploadsBucket.bucketName,
      description: 'Organization media uploads S3 bucket'
    });
  }
}