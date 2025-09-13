-----

# 🛡️ Hlekkr - Next-Generation Media Integrity Platform 
**© 2025 of Frthst. All rights reserved**
## 
**🏆 Code with Kiro Hackathon & Research Project - Open Source Media Verification**

⚠️ **IMPORTANT**: Deploying this platform to your own AWS account will incur costs. Please see the "Quick Start" section for details on running in the free, zero-cost **Demo Mode**.

Hlekkr revolutionizes media verification through cutting-edge AI analysis, intelligent human-in-the-loop workflows, and immutable audit trails. Our platform combines Amazon Bedrock's advanced foundation models with innovative human expertise integration to deliver unparalleled media authenticity verification.

## About This Repository (Code with Kiro Hackathon Submission)

This repository contains the source code for the "Hlekkr" platform, submitted for the 2025 Code with Kiro Hackathon.

The project's narrative involved the complete, spec-driven transformation of a legacy project called 'G.R.A.C.E.' into the modern Hlekkr platform, using Kiro as an AI development partner. This repository represents the final, A-grade MVP that was produced through this agentic workflow.

The original, pre-transformation 'G.R.A.C.E.' repository can be viewed for historical context here: `https://github.com/walkf1/GRACE`

## ✨ Key Features & Capabilities

### 🤖 The Trust Engine: From Black Box to Verifiable Insight

  * **Bedrock Integration:** Leverages an ensemble of state-of-the-art foundation models, including **Claude 3 Sonnet, Claude 3 Haiku, and Amazon Titan**, for deepfake detection.
  * **Trust Score Calculation Engine:** A proprietary, weighted algorithm that synthesizes multiple components into a single, human-readable 0-100 numerical score with descriptive confidence levels (high/medium/low).
  * **Immutable Audit Trail:** Use of S3 Object Lock to ensure all analysis and decision records are tamper-proof and verifiable.

### 🤝 Human-AI Collaboration & Governance

  * **Intelligent Moderator Assignment:** A sophisticated backend system that assigns reviews to human moderators based on their skills and workload.
  * **Forensic Media Review Interface:** 🔄 An enterprise-grade UI with interactive overlays and comparison tools to support informed decision-making (in development).
  * **Advanced QA Workflow:** A complete interface for moderators to make and justify decisions, featuring an integrated peer review system.

### 🌍 The Community Moat: An Open Source Framework

  * **Public Threat Intelligence System:** An automated system that generates anonymized "threat reports" for confirmed deepfakes.
  * **Open Source Media Risk Framework:** A public GitHub repository, automatically populated by an agent hook, that provides a community-driven resource of deepfake indicators. **[Explore the live framework here.](https://github.com/walkf1/hlekkr-framework)**
  * **Public REST API:** A public-facing API to allow researchers and third parties to access the threat intelligence data.

## 🚀 Quick Start

### Prerequisites

  * AWS CLI configured with appropriate permissions
  * Node.js 18+ and npm
  * AWS CDK 2.70.0+
  * Python 3.9+ (for Lambda functions)
  * **Enable Billing Alerts:** Before deploying in Production Mode, you must enable IAM access to your billing data. In your AWS account, navigate to the Billing console, select 'Billing preferences', and enable 'IAM User and Role Access to Billing Information'. This is required for the CDK to create the cost protection alarms.

### Demo Mode (Recommended for Evaluation)

```bash
# Clone the repository
git clone https://github.com/walkf1/hlekkr-platform.git
cd hlekkr-platform

# Start frontend demo (no AWS deployment needed)
cd frontend && npm install && npm start
# Visit http://localhost:3000
```

### Production Deployment (⚠️ Incurs AWS Costs)

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
