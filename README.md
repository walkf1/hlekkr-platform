# Hlekkr Platform

AI-powered deepfake detection and media trust scoring platform using AWS Bedrock.

## 🚀 Quick Demo

Run the demo locally without any setup:

```bash
git clone https://github.com/your-org/hlekkr-platform.git
cd hlekkr-platform/frontend
npm install
npm start
```

Demo runs at `http://localhost:3000` with:
- ✅ Mock AI analysis results
- ✅ Interactive trust score dashboards
- ✅ Full UI functionality
- ✅ No API keys required

## 🔧 Production Deployment

For real AWS Bedrock AI integration, contact the development team for API access and deployment instructions.

## 🛡️ Security Features

- **WAF Protection**: Rate limiting and DDoS protection
- **API Authentication**: Secure API key validation
- **Environment Isolation**: Separate demo/production configs
- **No Hardcoded Secrets**: All sensitive data in environment variables

## 📊 Features

- **Real-time AI Analysis**: AWS Bedrock Claude 3 Sonnet, Haiku, Titan
- **Trust Score Calculation**: Multi-model ensemble scoring
- **Interactive Dashboards**: Upload, analysis, and trust score views
- **Mobile Responsive**: Works on all devices
- **Demo Mode**: Full functionality without API access

## 🏗️ Architecture

```
Frontend (React) → API Gateway → Lambda → AWS Bedrock
                                      ↓
                              DynamoDB + S3
```

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

**Note**: This repository is currently under competition evaluation. Contributions will be welcomed after October 20, 2025.

For post-evaluation contributions:
1. Fork the repository
2. Create feature branch
3. Test in demo mode
4. Submit pull request

## 📞 Support

- **Demo Issues**: Check browser console for errors
- **Production Access**: Contact development team
- **Contributing**: See CONTRIBUTING.md for development setup