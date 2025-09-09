#!/bin/bash

# Deploy API Gateway with CORS and Authentication
# This script deploys the updated Hlekkr API infrastructure

set -e

echo "🚀 Deploying Hlekkr API Gateway with CORS and Authentication..."

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing CDK dependencies..."
    npm install
fi

# Bootstrap CDK if needed
echo "🔧 Bootstrapping CDK..."
npx cdk bootstrap

# Deploy the API stack
echo "🏗️  Deploying API Gateway stack..."
npx cdk deploy HlekkrOrgStack --require-approval never

# Get the API Gateway URL and API Key
echo "📋 Getting deployment outputs..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name HlekkrOrgStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text)

API_KEY_ID=$(aws cloudformation describe-stacks \
    --stack-name HlekkrOrgStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiKeyId`].OutputValue' \
    --output text)

# Get the actual API key value
API_KEY_VALUE=$(aws apigateway get-api-key \
    --api-key "$API_KEY_ID" \
    --include-value \
    --query 'value' \
    --output text)

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Deployment Information:"
echo "  API Gateway URL: $API_URL"
echo "  API Key ID: $API_KEY_ID"
echo "  API Key Value: $API_KEY_VALUE"
echo ""
echo "🔧 Frontend Configuration:"
echo "  Add to frontend/.env.local:"
echo "  REACT_APP_API_URL=$API_URL"
echo "  REACT_APP_API_KEY=$API_KEY_VALUE"
echo ""
echo "🧪 Test the API:"
echo "  curl -H \"X-API-Key: $API_KEY_VALUE\" \"${API_URL}media/test-media-id\""
echo ""