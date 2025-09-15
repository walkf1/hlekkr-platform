#!/bin/bash

# Python Runtime Monitoring Script
# Run monthly to check for Python 3.12 availability

echo "🔍 Checking Python runtime status..."

cd infrastructure

# Check CDK version
CDK_VERSION=$(npx cdk --version 2>/dev/null | cut -d' ' -f1)
echo "CDK Version: $CDK_VERSION"

# Check available Python runtimes
echo "Available Python runtimes:"
node -e "
const cdk = require('aws-cdk-lib');
const pythonRuntimes = Object.keys(cdk.aws_lambda.Runtime)
  .filter(k => k.includes('PYTHON'))
  .sort();
console.log(pythonRuntimes.join('\n'));

if (pythonRuntimes.includes('PYTHON_3_12')) {
  console.log('\n🚨 PYTHON_3_12 AVAILABLE - UPGRADE NOW!');
} else {
  console.log('\n⏳ PYTHON_3_12 not yet available');
}
"

# Check deployed Lambda functions
echo -e "\n📊 Checking deployed Lambda functions..."
aws lambda list-functions --region eu-central-1 --query "Functions[?Runtime=='python3.9'].{Name:FunctionName,Runtime:Runtime}" --output table 2>/dev/null || echo "AWS CLI not configured"

echo -e "\n⏰ Next check: $(date -d '+1 month' '+%Y-%m-%d')"
echo "📅 Python 3.9 EOL: December 15, 2025"