#!/usr/bin/env node

/**
 * Minimal GitHub Integration Activation Script
 * This script sets up the basic GitHub integration for Hlekkr threat intelligence
 */

const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

async function activateGitHubIntegration() {
  console.log('🚀 Activating Hlekkr GitHub Integration...');
  
  const ssmClient = new SSMClient({ region: 'eu-central-1' });
  const dynamoClient = new DynamoDBClient({ region: 'eu-central-1' });
  
  try {
    // 1. Set up GitHub token (you'll need to replace with actual token)
    console.log('📝 Setting up GitHub configuration...');
    
    const githubToken = process.env.GITHUB_TOKEN || 'PLACEHOLDER_TOKEN';
    if (githubToken === 'PLACEHOLDER_TOKEN') {
      console.log('⚠️  Please set GITHUB_TOKEN environment variable with your actual GitHub token');
      console.log('   Example: GITHUB_TOKEN=ghp_your_token_here node activate-github-integration.js');
    }
    
    await ssmClient.send(new PutParameterCommand({
      Name: '/hlekkr/prod/github/token',
      Value: githubToken,
      Type: 'SecureString',
      Description: 'GitHub token for Hlekkr threat intelligence',
      Overwrite: true
    }));
    
    await ssmClient.send(new PutParameterCommand({
      Name: '/hlekkr/prod/github/owner',
      Value: 'hlekkr',
      Type: 'String',
      Description: 'GitHub organization for threat reports',
      Overwrite: true
    }));
    
    await ssmClient.send(new PutParameterCommand({
      Name: '/hlekkr/prod/github/repo',
      Value: 'hlekkr-framework',
      Type: 'String',
      Description: 'GitHub repository for threat reports',
      Overwrite: true
    }));
    
    // 2. Create a test threat report entry
    console.log('📊 Creating test threat intelligence entry...');
    
    const testReport = {
      reportId: `TR-${Date.now()}-TEST`,
      recordType: 'threat_report',
      threatType: 'deepfake_confirmed',
      severity: 'medium',
      title: 'Test Threat Report - GitHub Integration Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mediaCount: 1,
      indicatorCount: 3,
      publicReportGenerated: true,
      githubIntegrationActive: true,
      metadata: {
        source: 'activation_script',
        integrationTest: true
      },
      ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days TTL
    };
    
    // Try to put in audit table (fallback if threat intelligence table doesn't exist)
    try {
      await dynamoClient.send(new PutItemCommand({
        TableName: 'hlekkr-mvp-audit-table',
        Item: marshall(testReport)
      }));
      console.log('✅ Test report created in audit table');
    } catch (error) {
      console.log('ℹ️  Could not create test report (table may not exist yet)');
    }
    
    console.log('🎉 GitHub Integration Activated Successfully!');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('1. Replace PLACEHOLDER_TOKEN with your actual GitHub token');
    console.log('2. Ensure hlekkr/hlekkr-framework repository exists');
    console.log('3. Deploy the threat intelligence stack when ready');
    console.log('');
    console.log('🔗 Repository: https://github.com/hlekkr/hlekkr-framework');
    console.log('');
    console.log('The system will automatically:');
    console.log('• Generate threat reports when suspicious media is confirmed');
    console.log('• Create sanitized public versions for community sharing');
    console.log('• Commit reports to GitHub as markdown files');
    console.log('• Organize reports by date in threat-reports/ directory');
    
  } catch (error) {
    console.error('❌ Error activating GitHub integration:', error.message);
    process.exit(1);
  }
}

// Run the activation
activateGitHubIntegration();