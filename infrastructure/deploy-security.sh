#!/bin/bash

# Deployment script for Hlekkr security scanning infrastructure
set -e

echo "🛡️  Deploying Hlekkr Security Scanning Infrastructure..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the infrastructure directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Install Python dependencies for Lambda functions
echo "🐍 Installing Python dependencies..."

# Security scanner dependencies
if [ -d "lambda/security_scanner" ]; then
    echo "  - Installing security scanner dependencies..."
    cd lambda/security_scanner
    pip install -r requirements.txt -t .
    cd ../..
fi

# Metadata extractor dependencies (if needed)
if [ -d "lambda/media_metadata_extractor" ] && [ -f "lambda/media_metadata_extractor/requirements.txt" ]; then
    echo "  - Installing metadata extractor dependencies..."
    cd lambda/media_metadata_extractor
    pip install -r requirements.txt -t .
    cd ../..
fi

# Deploy CDK stack
echo "🚀 Deploying CDK stack..."
npx cdk deploy HlekkrMvpStack --require-approval never

echo "✅ Security scanning infrastructure deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Configure VirusTotal API key in Lambda environment variables"
echo "2. Set up SNS topic subscriptions for security alerts"
echo "3. Test the security scanning workflow"
echo ""
echo "🔗 Useful commands:"
echo "  - View stack outputs: npx cdk list"
echo "  - Check Lambda logs: aws logs tail /aws/lambda/hlekkr-security-scanner-* --follow"
echo "  - Test security scanner: aws lambda invoke --function-name hlekkr-security-scanner-* test-output.json"