# 🎯 Hlekkr Demo Guide

## Quick Start (5 Minutes)

### 1. **Launch Demo Mode**
```bash
git clone https://github.com/walkf1/hlekkr-platform.git
cd hlekkr-platform/frontend
npm install && npm start
# Visit http://localhost:3000
```

### 2. **Test Core Features**
- **Media Upload**: Drag/drop any image/video file
- **Real-time Analysis**: Watch AI processing simulation
- **Trust Score**: See dynamic scoring (0-100 scale)
- **Dashboard Updates**: All 4 sections update in real-time

## 🔍 Evaluation Checklist

### **AI-Powered Analysis**
- ✅ Multi-model ensemble (Claude 3 Sonnet/Haiku simulation)
- ✅ Deepfake confidence scoring
- ✅ Technique detection (face_swap, lighting_consistency, etc.)
- ✅ Trust score calculation with risk classification

### **Human-in-the-Loop Workflow**
- ✅ Intelligent moderator assignment algorithm
- ✅ Skill-based routing and workload balancing
- ✅ Review status tracking and decision workflows

### **Real-time Dashboards**
- ✅ **Media Upload**: File processing with progress tracking
- ✅ **Your Upload**: Real-time analysis of current media
- ✅ **Analysis Dashboard**: Statistics and filtering
- ✅ **Trust Score Dashboard**: Detailed breakdowns and history

### **Production Architecture**
- ✅ 20+ Lambda functions deployed
- ✅ API Gateway live at: `https://17cxuv9v71.execute-api.eu-central-1.amazonaws.com/prod/`
- ✅ Cost protection with billing alarms
- ✅ Demo/production mode toggle

## 🚀 Advanced Testing

### **API Endpoints (Live)**
```bash
# Test status endpoint
curl "https://17cxuv9v71.execute-api.eu-central-1.amazonaws.com/prod/media/test-123/status"

# Test trust scores
curl "https://17cxuv9v71.execute-api.eu-central-1.amazonaws.com/prod/trust-scores"
```

### **Demo vs Production**
- **Demo Mode**: Full functionality, no AWS costs, realistic simulation
- **Production Mode**: Real Bedrock AI, requires API key, incurs costs

## 🏆 Key Innovation Points

1. **Trust Engine**: Multi-factor scoring with explainable AI
2. **HITL Integration**: Seamless human-AI collaboration
3. **Cost Protection**: Smart demo mode for evaluation
4. **Open Source**: AGPL-3.0 license for community development
5. **Scalable Architecture**: Production-ready AWS infrastructure

## 📊 Expected Demo Results

- **Trust Scores**: 70-95% for authentic content, 15-40% for suspicious
- **Processing Time**: 1-3 seconds simulation
- **Techniques Detected**: 5-15 indicators per analysis
- **Dashboard Updates**: Real-time across all 4 sections

## 🔧 Troubleshooting

**Port 3000 in use?**
```bash
npx kill-port 3000 && npm start
```

**Missing dependencies?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Demo not loading?**
- Check console for errors
- Ensure Node.js 18+ installed
- Try incognito/private browsing mode

---

**Total Evaluation Time**: 10-15 minutes for complete feature review