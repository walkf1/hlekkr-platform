
-----

# 🛡️ Hlekkr - Next-Generation Media Integrity Platform

**🏆 Hackathon & Research Project - Open Source Media Verification**

Hlekkr revolutionizes media verification through cutting-edge AI analysis, intelligent human-in-the-loop workflows, and immutable audit trails. Our platform combines Amazon Bedrock's advanced foundation models with innovative human expertise integration to deliver unparalleled media authenticity verification.

## ✨ Key Features & Capabilities

### 🤖 The Trust Engine: From Black Box to Verifiable Insight

  * **AI-Powered Deepfake Detection:** Production Bedrock integration with Claude 3 Sonnet/Haiku ensemble analysis.
  * **Trust Score Calculation Engine:** Multi-factor weighted algorithm with 0-100 scoring and risk classification.
  * **Immutable Audit Trail:** DynamoDB with TTL and S3 storage for tamper-proof verification.
  * **Source Verification:** Domain reputation scoring and reliability assessment system.

### 🤝 Human-AI Collaboration & Governance

  * **Intelligent Moderator Assignment:** 100-point algorithm with skill-based routing and workload balancing.
  * **Forensic Media Review Interface:** Backend complete, frontend UI in development.
  * **Advanced QA Workflow:** Complete review lifecycle management with peer review system.

### 🌍 The Community Moat: An Open Source Framework

  * **Threat Intelligence System:** Automated report generation with sanitized public sharing.
  * **GitHub Framework Integration:** Live publishing to the **[hlekkr-framework](https://github.com/walkf1/hlekkr-framework)**.
  * **Public REST API:** Architecture ready, endpoints in development.

## About This Repository (Kiro Hackathon Submission)

This repository contains the source code for the "Hlekkr" platform, submitted for the 2025 Code with Kiro Hackathon and national grant competition.

The project represents a complete transformation from the legacy 'G.R.A.C.E.' project into the modern Hlekkr platform. The original repository can be viewed for historical context here: `https://github.com/walkf1/GRACE`.

## 🎯 Project Status & Access Modes

### **Demo Mode (Default)**

  * ✅ **Free to use** - No AWS costs incurred
  * ✅ **Full UI experience** - All 4 dashboard sections functional
  * ✅ **Simulated AI analysis** - Realistic deepfake detection results
  * ✅ **Judge evaluation ready** - Complete feature demonstration

### **Production Mode (API Key Required)**

  * 🔑 **Requires API key** - Contact team for access
  * 💰 **AWS costs apply** - Bedrock API usage charges
  * 🚨 **Billing alarms set** - $50/$100/$200 cost protection
  * 🔬 **Real AI analysis** - Live Bedrock Claude 3 Sonnet/Haiku

## ⚠️ Cost Warning & Deployment

**IMPORTANT**: Deploying this platform to AWS will incur costs, particularly for Amazon Bedrock, Lambda, S3, and DynamoDB. For evaluation, please use the default **Demo Mode** which incurs no AWS costs.

## 🚀 Quick Start

**🎯 For Kiro Hackathon Judges**: See **[DEMO\_GUIDE.md](https://www.google.com/search?q=https://github.com/walkf1/hlekkr-platform/blob/main/DEMO_GUIDE.md)** for complete evaluation instructions.

**Prerequisites**

  * AWS CLI configured with appropriate permissions
  * Node.js 18+ and npm
  * AWS CDK 2.70.0+
  * Python 3.9+ (for Lambda functions)
  * **Enable Billing Alerts:** Before deploying, you must enable IAM access to your billing data in your AWS account's billing preferences. This is required for the CDK to create the cost protection alarms.

**Demo Mode (Recommended for Evaluation)**

```bash
# Clone the repository
git clone https://github.com/walkf1/hlekkr-platform.git
cd hlekkr-platform

# Start frontend demo (no AWS deployment needed)
cd frontend && npm install && npm start
# Visit http://localhost:3000
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
```

## 🤝 Contributing

We welcome contributions\! Please see our **[Contributing Guide](https://github.com/walkf1/hlekkr-platform/blob/main/CONTRIBUTING.md)** for details.

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) - see the **[LICENSE](https://github.com/walkf1/hlekkr-platform/blob/main/LICENSE)** file for details.
