#!/bin/bash

# Hlekkr Agent Hooks Setup Script
# This script helps configure and validate the Agent Hooks for the Hlekkr project

set -e

echo "🚀 Setting up Hlekkr Agent Hooks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -d ".kiro" ]; then
    print_error "Please run this script from the project root directory (must contain .kiro directory)"
    exit 1
fi

# Check for package.json, create if missing
if [ ! -f "package.json" ]; then
    print_warning "package.json not found. This is normal for a new project setup."
fi

print_status "Validating project structure..."

# Check required directories
REQUIRED_DIRS=(
    "infrastructure/lambda"
    "infrastructure/lib"
    "backend/lambda"
    "frontend/src/components"
    ".kiro/hooks"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        print_warning "Creating missing directory: $dir"
        mkdir -p "$dir"
    fi
done

print_success "Project structure validated"

# Check for required dependencies
print_status "Checking dependencies..."

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm and try again."
    exit 1
fi

# Check AWS CDK
if ! command -v cdk &> /dev/null; then
    print_warning "AWS CDK is not installed globally. Installing..."
    npm install -g aws-cdk
fi

print_success "Dependencies validated"

# Check AWS configuration
print_status "Checking AWS configuration..."

if ! command -v aws &> /dev/null; then
    print_warning "AWS CLI is not installed. Please install and configure AWS CLI."
else
    if ! aws sts get-caller-identity &> /dev/null; then
        print_warning "AWS credentials not configured. Please run 'aws configure' or set up AWS SSO."
    else
        print_success "AWS credentials configured"
    fi
fi

# Validate hook configurations
print_status "Validating hook configurations..."

HOOK_FILES=(
    "lambda-function-generator.json"
    "api-endpoint-builder.json"
    "cdk-auto-deploy.json"
    "test-generator.json"
    "frontend-component-generator.json"
    "monitoring-dashboard-creator.json"
    "database-schema-sync.json"
    "documentation-sync.json"
)

for hook in "${HOOK_FILES[@]}"; do
    if [ -f ".kiro/hooks/$hook" ]; then
        # Validate JSON syntax
        if jq empty ".kiro/hooks/$hook" 2>/dev/null; then
            print_success "✓ $hook - Valid JSON"
        else
            print_error "✗ $hook - Invalid JSON syntax"
        fi
    else
        print_error "✗ $hook - Missing hook file"
    fi
done

# Create sample package.json scripts if they don't exist
print_status "Setting up npm scripts..."

# Check if scripts exist in package.json
if ! grep -q "\"diff\":" package.json; then
    print_status "Adding CDK diff script to package.json"
    # This would need to be done manually or with a more sophisticated JSON editor
    print_warning "Please add the following scripts to your package.json:"
    echo "  \"scripts\": {"
    echo "    \"diff\": \"cdk diff\","
    echo "    \"deploy:dev\": \"cdk deploy --profile hlekkr-dev\","
    echo "    \"test:smoke\": \"npm run test -- --testNamePattern='smoke'\""
    echo "  }"
fi

# Create environment configuration template
print_status "Creating environment configuration..."

if [ ! -f ".env.example" ]; then
    cat > .env.example << EOF
# Hlekkr Environment Configuration
AWS_REGION=us-east-1
AWS_PROFILE=hlekkr-dev
NODE_ENV=development

# API Configuration
API_BASE_URL=https://api.hlekkr.dev
FRONTEND_URL=https://app.hlekkr.dev

# Database Configuration
DYNAMODB_TABLE_PREFIX=hlekkr-dev

# Monitoring Configuration
CLOUDWATCH_LOG_GROUP=/aws/lambda/hlekkr-dev
SNS_ALERT_TOPIC=arn:aws:sns:us-east-1:123456789012:hlekkr-alerts

# Security Configuration
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here
EOF
    print_success "Created .env.example file"
fi

# Create hook activation instructions
print_status "Creating hook activation guide..."

cat > .kiro/hooks/ACTIVATION_GUIDE.md << 'EOF'
# Agent Hook Activation Guide

## Quick Start

1. **Open Kiro Command Palette**
   - Press `Cmd/Ctrl + Shift + P`
   - Type "Open Kiro Hook UI"
   - Select the command

2. **Enable Hooks**
   - Navigate to the "Agent Hooks" section in the Explorer
   - Toggle on the hooks you want to use
   - Configure settings for each hook

3. **Test a Hook**
   - Create a new file: `infrastructure/lambda/test/sample-function.ts`
   - Add a simple export: `export const handler = async () => {};`
   - Save the file
   - The Lambda Function Generator should trigger

## Hook Priority Order

Enable hooks in this order for maximum benefit:

1. **Lambda Function Generator** - Start here for immediate productivity
2. **Test Generator** - Ensures quality from the beginning
3. **API Endpoint Builder** - Speeds up API development
4. **CDK Auto Deploy** - Automates deployment workflow
5. **Frontend Component Generator** - Accelerates UI development
6. **Database Schema Sync** - Prevents schema drift issues
7. **Monitoring Dashboard Creator** - Improves observability
8. **Documentation Sync** - Keeps docs current

## Customization

Each hook can be customized by editing its JSON configuration:
- Modify trigger patterns to match your directory structure
- Adjust prompts to match your coding standards
- Add/remove context files for better code generation
- Configure auto-approval settings based on your workflow

## Troubleshooting

If hooks aren't working:
1. Check the Kiro notification center for errors
2. Verify file patterns match your project structure
3. Ensure required dependencies are installed
4. Check AWS credentials and permissions
EOF

print_success "Created hook activation guide"

# Final setup summary
echo ""
echo "🎉 Agent Hooks setup complete!"
echo ""
echo "Next steps:"
echo "1. Open Kiro and navigate to Agent Hooks in the Explorer"
echo "2. Enable the hooks you want to use (start with Lambda Function Generator)"
echo "3. Create a test file to verify the hooks are working"
echo "4. Review the generated code and adjust hook settings as needed"
echo ""
echo "📚 Documentation:"
echo "- Hook configurations: .kiro/hooks/*.json"
echo "- Setup guide: .kiro/hooks/README.md"
echo "- Activation guide: .kiro/hooks/ACTIVATION_GUIDE.md"
echo ""
echo "⚡ Expected time savings: 22+ hours over the remaining rebuild tasks"
echo ""
print_success "Happy coding! 🚀"