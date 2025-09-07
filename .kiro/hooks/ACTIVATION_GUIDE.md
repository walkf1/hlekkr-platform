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
