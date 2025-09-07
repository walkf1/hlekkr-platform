#!/usr/bin/env node

/**
 * Test script for the API Endpoint Builder
 * Creates a sample API configuration and tests the builder
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./run-api-builder.js');

async function createTestApiFile() {
  const testApiContent = `
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class TestApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create API
    const api = new apigateway.RestApi(this, 'TestApi', {
      restApiName: 'Test API'
    });

    // Create Lambda functions
    const userHandler = new lambda.Function(this, 'UserHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInlineCode('exports.handler = async () => ({ statusCode: 200 });')
    });

    const mediaAnalysisHandler = new lambda.Function(this, 'MediaAnalysisHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInlineCode('exports.handler = async () => ({ statusCode: 200 });')
    });

    // API Resources
    const usersResource = api.root.addResource('users');
    const userIdResource = usersResource.addResource('{userId}');
    
    const mediaResource = api.root.addResource('media');
    const mediaIdResource = mediaResource.addResource('{mediaId}');
    const analysisResource = mediaIdResource.addResource('analysis');

    // API Methods
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(userHandler), {
      authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS,
      requestParameters: {
        'method.request.querystring.limit': false,
        'method.request.querystring.offset': false
      }
    });

    usersResource.addMethod('POST', new apigateway.LambdaIntegration(userHandler), {
      authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS
    });

    userIdResource.addMethod('GET', new apigateway.LambdaIntegration(userHandler), {
      authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS,
      requestParameters: {
        'method.request.path.userId': true
      }
    });

    mediaResource.addMethod('POST', new apigateway.LambdaIntegration(mediaAnalysisHandler), {
      authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS
    });

    analysisResource.addMethod('POST', new apigateway.LambdaIntegration(mediaAnalysisHandler), {
      authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS,
      requestParameters: {
        'method.request.path.mediaId': true
      }
    });

    analysisResource.addMethod('GET', new apigateway.LambdaIntegration(mediaAnalysisHandler), {
      authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS,
      requestParameters: {
        'method.request.path.mediaId': true,
        'method.request.querystring.includeDetails': false
      }
    });
  }
}
`;

  const testDir = path.join(process.cwd(), 'GRACE-1-recovered', 'test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFile = path.join(testDir, 'test-api-stack.ts');
  fs.writeFileSync(testFile, testApiContent);
  
  return testFile;
}

async function runTest() {
  console.log('🧪 Starting API Endpoint Builder Test');
  
  try {
    // Create test API file
    console.log('📝 Creating test API configuration...');
    const testFile = await createTestApiFile();
    console.log(`✅ Created test file: ${testFile}`);
    
    // Run the API builder on the test file
    console.log('🔧 Running API Endpoint Builder...');
    process.argv = ['node', 'test-api-builder.js', testFile];
    await main();
    
    // Check generated files
    console.log('🔍 Checking generated files...');
    const lambdaDir = path.join(process.cwd(), 'GRACE-1-recovered', 'infrastructure', 'lambda');
    
    const expectedFiles = [
      'api/user-handler.ts',
      'api/user-handler.schema.ts',
      'media/media-analysis-handler.ts',
      'media/media-analysis-handler.schema.ts'
    ];
    
    let generatedCount = 0;
    for (const expectedFile of expectedFiles) {
      const filePath = path.join(lambdaDir, expectedFile);
      if (fs.existsSync(filePath)) {
        console.log(`✅ Generated: ${expectedFile}`);
        generatedCount++;
      } else {
        console.log(`❌ Missing: ${expectedFile}`);
      }
    }
    
    // Check OpenAPI documentation
    const openApiFile = path.join(process.cwd(), 'GRACE-1-recovered', 'docs', 'api', 'openapi.json');
    if (fs.existsSync(openApiFile)) {
      console.log('✅ Generated: OpenAPI documentation');
      generatedCount++;
    } else {
      console.log('❌ Missing: OpenAPI documentation');
    }
    
    console.log(`\\n📊 Test Results: ${generatedCount}/${expectedFiles.length + 1} files generated`);
    
    if (generatedCount === expectedFiles.length + 1) {
      console.log('🎉 All tests passed! API Endpoint Builder is working correctly.');
    } else {
      console.log('⚠️  Some files were not generated. Check the logs above for details.');
    }
    
    // Clean up test file
    fs.unlinkSync(testFile);
    console.log('🧹 Cleaned up test files');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test if called directly
if (require.main === module) {
  runTest().catch(error => {
    console.error('❌ Unexpected test error:', error);
    process.exit(1);
  });
}

module.exports = { runTest };