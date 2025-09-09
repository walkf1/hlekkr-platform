You are right to be precise about the links. My apologies. Let's ensure they are absolutely clear and functional by using the full, absolute URLs.

Here is the final, corrected version of the `README.md` with the updated links for the "Contributing" and "License" sections.

-----

### **`README.md` for `hlekkr-platform`**

# 🛡️ Hlekkr - Next-Generation Media Integrity Platform

**🏆 Hackathon & Research Project - Open Source Media Verification**

⚠️ **IMPORTANT**: This is a research project and hackathon submission. AWS deployment will incur costs. See cost warnings below.

Hlekkr revolutionizes media verification through cutting-edge AI analysis, intelligent human-in-the-loop workflows, and immutable audit trails. Our platform combines Amazon Bedrock's advanced foundation models with innovative human expertise integration to deliver unparalleled media authenticity verification.

## 🎯 Project Status & Access Modes

### **Demo Mode (Default)**
- ✅ **Free to use** - No AWS costs incurred
- ✅ **Full UI experience** - All 4 dashboard sections functional
- ✅ **Simulated AI analysis** - Realistic deepfake detection results
- ✅ **Judge evaluation ready** - Complete feature demonstration

### **Production Mode (API Key Required)**
- 🔑 **Requires API key** - Contact team for access
- 💰 **AWS costs apply** - Bedrock API usage charges
- 🚨 **Billing alarms set** - $50/$100/$200 cost protection
- 🔬 **Real AI analysis** - Live Bedrock Claude 3 Sonnet/Haiku

### **About This Repository (Kiro Hackathon Submission)**

This repository contains the source code for the "Hlekkr" platform, submitted for the 2025 Code with Kiro Hackathon and national grant competition.

The project represents a complete transformation from legacy 'G.R.A.C.E.' into the modern Hlekkr platform. Original repository: `https://github.com/walkf1/GRACE`

## ⚠️ Cost Warning & Deployment

**IMPORTANT**: Deploying this platform to AWS will incur costs, particularly for:
- Amazon Bedrock API calls (Claude 3 models)
- Lambda function executions
- S3 storage and data transfer
- DynamoDB operations

**Cost Protection Measures**:
- Demo mode enabled by default (no Bedrock calls)
- CloudWatch billing alarms at $50, $100, $200
- API key requirement for production analysis
- Request rate limiting (10 requests/hour per IP)

**For Evaluation**: Use demo mode - no deployment or AWS costs required.

## ✨ Key Features & Capabilities

### 🤖 The Trust Engine: From Black Box to Verifiable Insight

  * **✅ AI-Powered Deepfake Detection:** Production Bedrock integration with Claude 3 Sonnet/Haiku ensemble analysis
  * **✅ Trust Score Calculation Engine:** Multi-factor weighted algorithm with 0-100 scoring and risk classification
  * **✅ Immutable Audit Trail:** DynamoDB with TTL and S3 storage for tamper-proof verification
  * **✅ Source Verification:** Domain reputation scoring and reliability assessment system

### 🤝 Human-AI Collaboration & Governance

  * **✅ Intelligent Moderator Assignment:** 100-point algorithm with skill-based routing and workload balancing
  * **🔄 Forensic Media Review Interface:** Backend complete, frontend UI in development
  * **✅ Advanced QA Workflow:** Complete review lifecycle management with peer review system

### 🌍 The Community Moat: An Open Source Framework

  * **✅ Threat Intelligence System:** Automated report generation with sanitized public sharing
  * **✅ GitHub Framework Integration:** Live publishing to [hlekkr-framework](https://github.com/walkf1/hlekkr-framework)
  * **🔄 Public REST API:** Architecture ready, endpoints in development

## 🚀 Quick Start

**🎯 For Kiro Hackathon Judges**: See [DEMO_GUIDE.md](DEMO_GUIDE.md) for complete evaluation instructions

**📊 Live Deployment Status**: See [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) for production infrastructure details

**Prerequisites**

  * AWS CLI configured with appropriate permissions
  * Node.js 18+ and npm
  * AWS CDK 2.70.0+
  * Python 3.9+ (for Lambda functions)

**Demo Mode (Recommended for Evaluation)**

```bash
# Clone the repository
git clone https://github.com/walkf1/hlekkr-platform.git
cd hlekkr-platform

# Start frontend demo (no AWS deployment needed)
cd frontend && npm install && npm start
# Visit http://localhost:3000

# All features work in demo mode:
# - Media upload simulation
# - AI analysis with realistic results  
# - Trust score calculation
# - Real-time dashboard updates
```

**Production Deployment (⚠️ Incurs AWS Costs)**

```bash
# Set environment variables
export DEMO_MODE=false
export HLEKKR_API_KEY=your-secure-api-key
export ALERT_EMAIL=your-email@domain.com

# Deploy infrastructure
cd infrastructure
npm install && npm run build
cdk bootstrap  # First time only
cdk deploy --all

# Billing alarms will be created automatically
```

## 🔑 API Access for Judges

For hackathon judges requiring production API access:
1. Contact the team for evaluation API keys
2. Limited usage quotas apply
3. Separate evaluation environment with cost caps

## 🎯 Grant Competition Context

This project is also submitted for national grant funding competition with the intention of becoming a fully open-source solution. Long-term vision:
- Grant-funded development and infrastructure
- Community-driven threat intelligence
- Open API for researchers and developers
- Sustainable open-source business model

## 🤝 Contributing

We welcome contributions\! Please see our [Contributing Guide](https://github.com/walkf1/hlekkr-platform/blob/main/CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) - see the [LICENSE](https://github.com/walkf1/hlekkr-platform/blob/main/LICENSE) file for details.

**Key License Points**:
- ✅ Free to use, modify, and distribute
- ✅ Commercial use permitted with conditions
- ⚠️ Network use constitutes distribution
- ⚠️ Modifications must be shared under same license
- 📧 Contact licensing@hlekkr.com for commercial licensing
