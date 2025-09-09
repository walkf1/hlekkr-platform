#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HlekkrOrgStack } from '../lib/hlekkr-org-stack';

const app = new cdk.App();

// Create the organization stack with basic infrastructure
new HlekkrOrgStack(app, 'HlekkrOrgStack', {
  organizationId: 'o-uzpilj07pa', // AWS Organization ID
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  description: 'Hlekkr Organization Stack - Basic infrastructure for media upload and processing',
  tags: {
    Project: 'Hlekkr',
    Environment: 'Production',
    Purpose: 'MediaProcessing'
  }
});