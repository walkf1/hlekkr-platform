# Hlekkr Project Agent Hooks

This directory contains Agent Hooks that automate repetitive development tasks for the Hlekkr media analysis platform rebuild.

## 🚀 Available Hooks

### 1. **Lambda Function Generator** (`lambda-function-generator.json`)
**Trigger**: Creating new `.ts` files in Lambda directories
**Purpose**: Auto-generates production-ready Lambda functions with:
- TypeScript interfaces and error handling
- AWS SDK setup and connection reuse
- Environment variable validation
- Structured logging with correlation IDs
- Proper API Gateway response formatting

### 2. **API Endpoint Builder** (`api-endpoint-builder.json`)
**Trigger**: Modifying API Gateway configuration files
**Purpose**: Creates complete API endpoint implementations:
- Lambda handler functions
- Input validation schemas
- TypeScript interfaces
- Integration tests
- OpenAPI documentation updates

### 3. **CDK Auto Deploy** (`cdk-auto-deploy.json`)
**Trigger**: Saving CDK infrastructure files
**Purpose**: Automatically deploys to dev environment:
- Shows CDK diff before deployment
- Deploys to development environment
- Runs smoke tests
- Updates deployment logs

### 4. **Test Generator** (`test-generator.json`)
**Trigger**: Creating new Lambda functions or services
**Purpose**: Generates comprehensive test suites:
- Unit tests with AWS service mocks
- Integration tests for workflows
- Test fixtures and sample data
- Performance and security tests

### 5. **Frontend Component Generator** (`frontend-component-generator.json`)
**Trigger**: Creating new React component files
**Purpose**: Generates complete React components:
- TypeScript component with props interface
- Styled-components with theme integration
- Unit tests with React Testing Library
- Storybook stories with controls

### 6. **Monitoring Dashboard Creator** (`monitoring-dashboard-creator.json`)
**Trigger**: Successful deployment of new resources
**Purpose**: Creates monitoring infrastructure:
- CloudWatch dashboards with key metrics
- Alarms for error rates and performance
- SNS notifications for alerts
- Log Insights queries for troubleshooting

### 7. **Database Schema Sync** (`database-schema-sync.json`)
**Trigger**: Modifying DynamoDB table definitions
**Purpose**: Synchronizes schema-dependent code:
- Updates TypeScript interfaces
- Modifies data access layer functions
- Updates validation schemas
- Creates migration scripts

### 8. **Documentation Sync** (`documentation-sync.json`)
**Trigger**: Modifying API endpoints or Lambda functions
**Purpose**: Keeps documentation current:
- Updates API documentation
- Refreshes architecture diagrams
- Modifies developer guides
- Updates README files

## 📋 Setup Instructions

### 1. **Enable Hooks in Kiro**
```bash
# Open Kiro Command Palette (Cmd/Ctrl + Shift + P)
# Search for "Open Kiro Hook UI"
# Or navigate to the Agent Hooks section in the Explorer
```

### 2. **Configure Hook Settings**
Each hook can be customized with these settings:
- `auto_approve`: Whether to run without confirmation
- `run_tests`: Execute tests after code generation
- `notify_on_completion`: Show notifications when complete
- `deploy_to_dev`: Auto-deploy to development environment

### 3. **Required Dependencies**
Ensure these are installed in your project:
```bash
# Infrastructure
npm install -g aws-cdk
npm install @aws-cdk/core @aws-cdk/aws-lambda

# Testing
npm install --save-dev jest @types/jest aws-sdk-mock

# Frontend (if using React hooks)
npm install react @types/react styled-components
npm install --save-dev @testing-library/react @storybook/react
```

### 4. **Environment Variables**
Set these environment variables for proper hook operation:
```bash
export AWS_REGION=us-east-1
export AWS_PROFILE=hlekkr-dev
export NODE_ENV=development
```

## 🎯 Usage Examples

### **Creating a New Lambda Function**
1. Create a new file: `infrastructure/lambda/media-analysis/deepfake-detector.ts`
2. The Lambda Function Generator hook will trigger automatically
3. Review the generated code and approve/modify as needed
4. Tests will be generated automatically by the Test Generator hook

### **Adding a New API Endpoint**
1. Modify `infrastructure/lib/api-gateway-stack.ts` to add a new route
2. The API Endpoint Builder hook will create the handler function
3. The CDK Auto Deploy hook will deploy to dev environment
4. The Documentation Sync hook will update API docs

### **Creating a React Component**
1. Create a new file: `frontend/src/components/MediaPlayer/VideoPlayer.tsx`
2. The Frontend Component Generator will create the complete component
3. Tests and Storybook stories will be generated automatically

## ⚙️ Hook Configuration

### **Customizing Triggers**
You can modify trigger conditions in each hook's JSON file:
```json
{
  "trigger": {
    "type": "file_created",
    "patterns": ["your/custom/pattern/**/*.ts"],
    "conditions": {
      "file_size_less_than": 500,
      "contains_keywords": ["your", "keywords"]
    }
  }
}
```

### **Modifying Prompts**
Update the agent prompt to customize code generation:
```json
{
  "execution": {
    "type": "agent",
    "prompt": "Your custom prompt for code generation..."
  }
}
```

### **Adding Context Files**
Include additional files for better code generation context:
```json
{
  "execution": {
    "context_files": [
      "your/additional/context/**/*.ts",
      "config/files/*.json"
    ]
  }
}
```

## 🔧 Troubleshooting

### **Hook Not Triggering**
1. Check file patterns match your directory structure
2. Verify trigger conditions are met
3. Ensure the hook is enabled in Kiro settings

### **Code Generation Issues**
1. Review the context files being provided
2. Check if required dependencies are installed
3. Verify environment variables are set correctly

### **Deployment Failures**
1. Ensure AWS credentials are configured
2. Check CDK bootstrap is complete
3. Verify IAM permissions for deployment

## 📊 Expected Time Savings

| Hook | Estimated Time Saved | Tasks Affected |
|------|---------------------|----------------|
| Lambda Generator | 20 min/function | 15+ functions |
| API Builder | 30 min/endpoint | 10+ endpoints |
| Test Generator | 25 min/component | All new code |
| Component Generator | 15 min/component | 5+ components |
| **Total** | **22+ hours** | **Entire rebuild** |

## 🤝 Contributing

To add new hooks or modify existing ones:
1. Create a new JSON configuration file
2. Define appropriate triggers and conditions
3. Write clear, specific prompts for code generation
4. Test the hook with sample files
5. Update this README with documentation

## 📞 Support

If you encounter issues with any hooks:
1. Check the Kiro notification center for error messages
2. Review the hook execution logs
3. Verify your project structure matches the expected patterns
4. Consult the Kiro documentation for Agent Hooks