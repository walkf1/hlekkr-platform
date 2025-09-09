#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HlekkrOrgStack } from '../lib/hlekkr-org-stack';
import { HlekkrMvpStack } from '../lib/hlekkr-mvp-stack';
import { ThreatIntelligenceStack } from '../lib/threat-intelligence-stack';
// import { HlekkrApiStack } from '../lib/hlekkr-api-stack';

const app = new cdk.App();

// Create the organization stack
const orgStack = new HlekkrOrgStack(app, 'HlekkrOrgStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  organizationId: 'o-uzpilj07pa'
});

// // Create the MVP stack with core infrastructure
// const mvpStack = new HlekkrMvpStack(app, 'HlekkrMvpStack', {
//   env: { 
//     account: process.env.CDK_DEFAULT_ACCOUNT, 
//     region: process.env.CDK_DEFAULT_REGION 
//   },
//   description: 'Hlekkr MVP Stack - Core infrastructure for deepfake detection and media verification platform',
//   tags: {
//     Project: 'Hlekkr',
//     Environment: 'MVP',
//     Purpose: 'DeepfakeDetection'
//   }
// });

// // Create the Threat Intelligence stack for GitHub integration
// const threatIntelStack = new ThreatIntelligenceStack(app, 'HlekkrThreatIntelligenceStack', {
//   env: { 
//     account: process.env.CDK_DEFAULT_ACCOUNT, 
//     region: process.env.CDK_DEFAULT_REGION 
//   },
//   environment: 'prod',
//   threatIntelligenceTable: mvpStack.auditTable,
//   mediaAnalysisTable: mvpStack.auditTable,
//   reviewDecisionsTable: mvpStack.auditTable
// });

// // Add dependency
// threatIntelStack.addDependency(mvpStack);



// // Create the API stack that depends on MVP stack resources
// const apiStack = new HlekkrApiStack(app, 'HlekkrApiStack', {
//   env: { 
//     account: process.env.CDK_DEFAULT_ACCOUNT, 
//     region: process.env.CDK_DEFAULT_REGION 
//   },
//   description: 'Hlekkr API Stack - REST API and Lambda functions for media processing and analysis',
//   tags: {
//     Project: 'Hlekkr',
//     Environment: 'MVP',
//     Purpose: 'MediaProcessingAPI'
//   },
//   // Pass references from MVP stack
//   mediaUploadsBucket: mvpStack.mediaUploadsBucket,
//   auditTable: mvpStack.auditTable
// });

// // Add dependency to ensure proper deployment order
// apiStack.addDependency(mvpStack);