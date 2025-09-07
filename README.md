# 🛡️ Hlekkr - Next-Generation Media Integrity Platform

🏆 **Award-Winning Innovation in AI-Powered Deepfake Detection & Human-AI Collaboration**

Hlekkr revolutionizes media verification through cutting-edge AI analysis, intelligent human-in-the-loop workflows, and immutable audit trails. Our platform combines Amazon Bedrock's advanced foundation models with innovative human expertise integration to deliver unparalleled media authenticity verification.

## About This Repository (Kiro Hackathon Submission)

This repository contains the source code for the "Hlekkr" platform, submitted for the 2025 Code with Kiro Hackathon.

The project's narrative involved the complete, spec-driven transformation of a legacy project called 'G.R.A.C.E.' into the modern Hlekkr platform, using Kiro as an AI development partner. This repository represents the final, A-grade MVP that was produced through this agentic workflow.

The original, pre-transformation 'G.R.A.C.E.' repository can be viewed for historical context here: `https://github.com/walkf1/GRACE`

## ✨ Key Features & Capabilities

### 🤖 The Trust Engine: From Black Box to Verifiable Insight

  * **AI-Powered Deepfake Detection:** Integration with Amazon Bedrock for multi-factor analysis of visual media.
  * **Trust Score Calculation Engine:** A proprietary, weighted algorithm that synthesizes multiple components into a single, human-readable A+ to F grade.
  * **Immutable Audit Trail:** Use of S3 Object Lock to ensure all analysis and decision records are tamper-proof and verifiable.
  * **Source Verification:** Captures and verifies original source information, assessing source reliability over time.

### 🤝 Human-AI Collaboration & Governance

  * **Intelligent Moderator Assignment:** A sophisticated backend system that assigns reviews to human moderators based on their skills and workload.
  * **Forensic Media Review Interface:** An enterprise-grade UI with interactive overlays and comparison tools to support informed decision-making.
  * **Advanced QA Workflow:** A complete interface for moderators to make and justify decisions, featuring an integrated peer review system.

### 🌍 The Community Moat: An Open Source Framework

  * **Public Threat Intelligence System:** An automated system that generates anonymized "threat reports" for confirmed deepfakes.
  * **Open Source Media Risk Framework:** A public GitHub repository, automatically populated by an agent hook, that provides a community-driven resource of deepfake indicators.  The repository can be viewed for historical context here: https://github.com/walkf1/hlekkr-framework
  * **Public REST API:** A public-facing API to allow researchers and third parties to access the threat intelligence data.

## 🚀 Quick Start

**Prerequisites**

  * AWS CLI configured with appropriate permissions
  * Node.js 18+ and npm
  * AWS CDK 2.70.0+
  * Python 3.9+ (for Lambda functions)

**Installation & Deployment**

```bash
# Clone the repository
git clone https://github.com/walkf1/hlekkr-platform.git
cd hlekkr-platform

# Install dependencies for CDK and frontend
cd infrastructure
npm install

# Deploy the full serverless infrastructure
npm run build
cdk bootstrap  # First time only
cdk deploy --all
```

## 🤝 Contributing

We welcome contributions\! Please see our **[CONTRIBUTING.md](https://www.google.com/search?q=CONTRIBUTING.md)** for details.

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** - see the **[LICENSE](https://www.google.com/search?q=LICENSE)** file for details.
