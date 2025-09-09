You are right to be precise about the links. My apologies. Let's ensure they are absolutely clear and functional by using the full, absolute URLs.

Here is the final, corrected version of the `README.md` with the updated links for the "Contributing" and "License" sections.

-----

### **`README.md` for `hlekkr-platform`**

# 🛡️ Hlekkr - Next-Generation Media Integrity Platform

**🏆 Award-Winning Innovation in AI-Powered Deepfake Detection & Human-AI Collaboration**

Hlekkr revolutionizes media verification through cutting-edge AI analysis, intelligent human-in-the-loop workflows, and immutable audit trails. Our platform combines Amazon Bedrock's advanced foundation models with innovative human expertise integration to deliver unparalleled media authenticity verification.

## About This Repository (Kiro Hackathon Submission)

This repository contains the source code for the "Hlekkr" platform, submitted for the 2025 Code with Kiro Hackathon.

The project's narrative involved the complete, spec-driven transformation of a legacy project called 'G.R.A.C.E.' into the modern Hlekkr platform, using Kiro as an AI development partner. This repository represents the final, A-grade MVP that was produced through this agentic workflow.

The original, pre-transformation 'G.R.A.C.E.' repository can be viewed for historical context here: `https://github.com/walkf1/GRACE`

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

**Test the Live System**

```bash
# Clone the repository
git clone https://github.com/walkf1/hlekkr-platform.git
cd hlekkr-platform

# Test HITL workflow (no deployment needed)
npm install
node test-hitl-workflow.js

# Start frontend demo
cd frontend && npm install && npm start
# Visit http://localhost:3001

# Test live API endpoints (replace with your deployed URL)
curl $YOUR_API_GATEWAY_URL/upload/presigned-url \
  -X POST -H "Content-Type: application/json" \
  -d '{"fileName":"test.jpg","fileType":"image/jpeg"}'
```

**Full Deployment (Optional)**

```bash
# Deploy your own instance
cd infrastructure
npm install && npm run build
cdk bootstrap  # First time only
cdk deploy --all
```

## 🤝 Contributing

We welcome contributions\! Please see our [Contributing Guide](https://github.com/walkf1/hlekkr-platform/blob/main/CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** - see the [LICENSE](https://github.com/walkf1/hlekkr-platform/blob/main/LICENSE) file for details.
