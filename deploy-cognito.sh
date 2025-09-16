#!/bin/bash
set -e

echo "Deploying Cognito authentication stack..."

cd infrastructure

# Deploy auth stack
npx cdk deploy HlekkrAuthStack --require-approval never

# Get outputs
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name HlekkrAuthStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name HlekkrAuthStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
IDENTITY_POOL_ID=$(aws cloudformation describe-stacks --stack-name HlekkrAuthStack --query 'Stacks[0].Outputs[?OutputKey==`IdentityPoolId`].OutputValue' --output text)

echo "Cognito deployed successfully!"
echo "USER_POOL_ID=$USER_POOL_ID"
echo "CLIENT_ID=$CLIENT_ID"
echo "IDENTITY_POOL_ID=$IDENTITY_POOL_ID"

# Update frontend env
cd ../frontend
cat > .env.local << EOF
REACT_APP_USER_POOL_ID=$USER_POOL_ID
REACT_APP_USER_POOL_CLIENT_ID=$CLIENT_ID
REACT_APP_IDENTITY_POOL_ID=$IDENTITY_POOL_ID
REACT_APP_AWS_REGION=us-east-1
EOF

echo "Frontend environment configured!"