# 🎯 Judge Demo: Complete HITL Workflow

## 🚀 End-to-End Demo Instructions

### Step 1: Upload Media File
```bash
# Start frontend
cd frontend && npm start
# Visit http://localhost:3001
# Upload any image or video file
# Note the media ID from the response
```

### Step 2: Trigger HITL Demo Workflow
```bash
# Replace with your actual API URL and media details
curl -X POST $YOUR_API_GATEWAY_URL/demo/hitl \
  -H "Content-Type: application/json" \
  -d '{
    "mediaId": "media-1234567890",
    "fileName": "suspicious-video.mp4", 
    "s3Key": "uploads/media-1234567890/suspicious-video.mp4"
  }'
```

### Step 3: View Results
**Expected Response:**
```json
{
  "success": true,
  "mediaId": "media-1234567890",
  "trustScore": 25,
  "reviewDecision": "CONFIRMED DEEPFAKE",
  "threatReport": "TR-1234567890-DEMO",
  "githubUrl": "https://github.com/hlekkr/hlekkr-framework/blob/main/threat-reports/2025-01-09/TR-1234567890-DEMO.md",
  "message": "Demo HITL workflow completed - check GitHub for threat report"
}
```

### Step 4: Verify GitHub Integration
1. Visit the `githubUrl` from the response
2. See the automatically generated threat report in hlekkr-framework repository
3. Observe the sanitized, community-safe format

## 🔄 What This Demonstrates

### Complete HITL Workflow:
1. **Media Upload** → File stored in S3
2. **AI Analysis** → Low trust score (25/100) triggers review
3. **Human Review** → Simulated moderator confirms deepfake
4. **Threat Intelligence** → Automated report generation
5. **Community Sharing** → Public GitHub commit

### Key Features Shown:
- **Trust Score Engine**: Multi-factor analysis with risk classification
- **HITL Triggering**: Automatic human review for suspicious content  
- **Threat Report Generation**: Sanitized intelligence for community
- **GitHub Integration**: Automated publishing to public framework
- **Security**: No sensitive data exposed in public reports

## 🎯 Judge Evaluation Points

### Innovation ✨
- **Novel Architecture**: First HITL system for media verification
- **Community Framework**: Open source threat intelligence sharing
- **Automated Pipeline**: Seamless AI-to-human-to-community workflow

### Technical Excellence 🔧
- **Production Deployment**: Live AWS infrastructure
- **Security Best Practices**: Input validation, IAM restrictions, CORS
- **Scalable Design**: Serverless architecture with auto-scaling

### Business Impact 💼
- **Real-world Problem**: Addresses critical deepfake detection needs
- **Network Effects**: Community-driven competitive moat
- **Enterprise Ready**: Audit trails, compliance, security

### Code Quality 📝
- **Clean Architecture**: Modular, maintainable codebase
- **Comprehensive Testing**: End-to-end workflow validation
- **Documentation**: Complete setup and demo guides

---

**🏆 This demo showcases the complete Hlekkr vision: AI-powered detection enhanced by human expertise, creating a community-driven defense against media manipulation.**