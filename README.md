# 🛡️ Hlekkr - Next-Generation Media Integrity Platform

**🏆 Award-Winning Innovation in AI-Powered Deepfake Detection & Human-AI Collaboration**

Hlekkr revolutionizes media verification through cutting-edge AI analysis, intelligent human-in-the-loop workflows, and immutable audit trails. Our platform combines Amazon Bedrock's advanced foundation models with innovative human expertise integration to deliver unparalleled media authenticity verification.

About This Repository (Kiro Hackathon Submission)
This repository contains the source code for the Hlekkr platform, submitted for the 2025 Code with Kiro Hackathon.

The project's narrative involved the complete, spec-driven transformation of a legacy project called 'G.R.A.C.E.' into the modern Hlekkr platform, using Kiro as an AI development partner. This repository represents the final, A-grade MVP that was produced through this agentic workflow.

The original, pre-transformation 'G.R.A.C.E.' repository can be viewed for historical context here: https://github.com/walkf1/GRACE

## 🌟 **What Makes Hlekkr Unique**

### 🤖 **Human-AI Collaboration Engine** 
*Our Most Innovative Feature*
- **Intelligent Review Triggers**: AI automatically escalates uncertain cases to human moderators
- **Smart Assignment Algorithm**: 100-point scoring system matches content to the best-qualified moderator
- **Real-time Collaboration**: Seamless handoff between AI analysis and human expertise
- **Continuous Learning**: Human decisions improve AI accuracy through feedback loops

### ⚡ **Enhanced Authentication & Rate Limiting**
*Production-Ready Security*
- **JWT-Based Authentication**: Secure token verification with Amazon Cognito integration
- **Multi-Tier Rate Limiting**: Per-minute, per-hour, per-day limits with burst protection
- **Role-Based Access Control**: Granular permissions for users, moderators, and administrators
- **Real-time Monitoring**: Automated threat detection and suspicious activity alerts

## 🎯 Vision

In an era of sophisticated media manipulation, Hlekkr provides the tools and infrastructure needed to verify media authenticity, detect deepfakes, and maintain trust in digital content. Built on proven immutable audit trail technology, Hlekkr combines cutting-edge AI with robust verification mechanisms.

## ✨ Key Features & Capabilities
🤖 The Trust Engine: From Black Box to Verifiable Insight
AI-Powered Deepfake Detection: Integration with Amazon Bedrock for multi-factor analysis of visual media.

Trust Score Calculation Engine: A proprietary, weighted algorithm that synthesizes multiple components into a single, human-readable A+ to F grade.

Immutable Audit Trail: Use of S3 Object Lock to ensure all analysis and decision records are tamper-proof and verifiable.

Source Verification: Captures and verifies original source information, assessing source reliability over time.

🤝 Human-AI Collaboration & Governance
Intelligent Moderator Assignment: A sophisticated backend system that assigns reviews to human moderators based on a weighted score of their skills and workload.

Production-Ready Moderator Dashboard: A comprehensive, responsive React UI with Cognito authentication and role-based access controls.

Forensic Media Review Interface: An enterprise-grade interface with interactive canvas overlays and comparison tools to support informed decision-making.

🌍 The Community Moat: An Open Source Framework
Public Threat Intelligence System: An automated system that generates anonymized, PII-sanitized "threat reports" for confirmed deepfakes.

Open Source Media Risk Framework: A public GitHub repository, automatically populated by an agent hook, that provides a community-driven resource of deepfake indicators, creating network effects.

Public REST API: A public-facing API to allow researchers and third parties to access the threat intelligence data.

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway    │    │   Processing    │
│   Dashboard     │◄──►│   REST APIs      │◄──►│   Pipeline      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Authentication│    │   Media Storage  │    │   AI/ML Layer   │
│   & Authorization│    │   S3 Buckets     │    │   Amazon Bedrock│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Audit Trail    │    │   Trust Scoring │
                       │   DynamoDB       │    │   Algorithms    │
                       └──────────────────┘    └─────────────────┘
```

### Core Components

- **Media Processing Pipeline**: Enhanced S3 storage with automated processing triggers
- **AI Analysis Engine**: Amazon Bedrock integration for deepfake detection
- **Trust Score Calculator**: Multi-factor scoring algorithm with weighted components
- **Audit Trail System**: Immutable ledger with cryptographic verification
- **API Gateway**: RESTful endpoints with authentication and rate limiting
- **Monitoring & Alerting**: Real-time dashboards and automated notifications

## 🚀 Quick Start

### Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18+ and npm
- AWS CDK 2.70.0+
- Python 3.9+ (for Lambda functions)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hlekkr-platform
   ```

2. **Install dependencies**
   ```bash
   cd infrastructure
   npm install
   ```

3. **Configure AWS credentials**
   ```bash
   aws configure
   # or use AWS SSO, IAM roles, etc.
   ```

4. **Deploy infrastructure**
   ```bash
   npm run build
   cdk bootstrap  # First time only
   cdk deploy --all
   ```

### API Usage

```javascript
// Upload media for analysis
const response = await fetch('/api/media', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    mediaUrl: 'https://example.com/video.mp4',
    sourceInfo: {
      origin: 'news-outlet',
      timestamp: '2024-01-15T10:30:00Z'
    }
  })
});

// Get analysis results
const analysis = await fetch(`/api/media/${mediaId}/trust-score`, {
  headers: { 'Authorization': 'Bearer <token>' }
});

const trustScore = await analysis.json();
console.log(`Trust Score: ${trustScore.compositeScore}/100`);
```

## 📖 API Documentation

### Core Endpoints

#### Media Management
- `POST /media` - Upload media for analysis
- `GET /media/{mediaId}` - Get media information
- `DELETE /media/{mediaId}` - Remove media (admin only)

#### Analysis & Scoring
- `POST /media/{mediaId}/analyze` - Trigger deepfake analysis
- `GET /media/{mediaId}/trust-score` - Get trust score
- `GET /media/{mediaId}/analysis-history` - Get analysis history

#### Audit & Verification
- `GET /media/{mediaId}/audit-trail` - Get complete audit trail
- `POST /media/{mediaId}/verify-integrity` - Verify audit chain
- `GET /audit/verify/{auditId}` - Verify specific audit record

#### Batch Operations
- `POST /batch/analyze` - Batch analysis request
- `GET /batch/{batchId}/status` - Get batch processing status
- `GET /batch/{batchId}/results` - Get batch results

### Authentication

All API endpoints require authentication using AWS IAM or API keys:

```bash
curl -H "Authorization: AWS4-HMAC-SHA256 ..." \
     -H "Content-Type: application/json" \
     https://api.hlekkr.com/media
```

## 🧪 Testing

### Unit Tests
```bash
cd infrastructure/lambda/deepfake_detector
python -m pytest tests/
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## 📊 Monitoring

### CloudWatch Dashboards
- **System Health**: Lambda performance, API Gateway metrics
- **Business Metrics**: Analysis throughput, trust score distributions
- **Security Monitoring**: Authentication failures, suspicious patterns

### Key Metrics
- **Processing Time**: Average analysis completion time
- **Accuracy Metrics**: Deepfake detection accuracy rates
- **System Utilization**: Resource usage and scaling metrics
- **Trust Score Distribution**: Platform-wide trust score analytics

## 🔒 Security

### Data Protection
- **Encryption at Rest**: All data encrypted using AWS managed keys
- **Encryption in Transit**: TLS 1.2+ for all communications
- **Access Control**: IAM-based permissions with least privilege
- **Audit Logging**: Comprehensive logging of all system activities

### Privacy Compliance
- **Data Minimization**: Only necessary data is collected and stored
- **Retention Policies**: Automated data lifecycle management
- **User Rights**: Support for data access and deletion requests
- **Anonymization**: Privacy-preserving analytics and reporting

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Standards
- **TypeScript**: For infrastructure code
- **Python**: For Lambda functions
- **ESLint/Prettier**: Code formatting
- **Jest**: Testing framework

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs.hlekkr.com](https://docs.hlekkr.com)
- **Issues**: [GitHub Issues](https://github.com/hlekkr/platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hlekkr/platform/discussions)
- **Email**: support@hlekkr.com

## 🗺️ Roadmap

### Phase 1 (Current)
- ✅ Core deepfake detection
- ✅ Trust scoring system
- ✅ Immutable audit trails
- ✅ REST API

### Phase 2 (Q2 2024)
- 🔄 Advanced ML models
- 🔄 Real-time streaming analysis
- 🔄 Enhanced frontend dashboard
- 🔄 Mobile SDK

### Phase 3 (Q3 2024)
- 📋 Blockchain integration
- 📋 Advanced analytics
- 📋 Third-party integrations
- 📋 Enterprise features

---

**Built with ❤️ for media integrity and digital trust**
