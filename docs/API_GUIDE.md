# 📚 Hlekkr API Documentation

## 🚀 **Quick Start Guide**

### Authentication
All API requests require authentication using JWT tokens:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     https://api.hlekkr.com/media
```

### Base URL
```
Production: https://api.hlekkr.com
Staging: https://staging-api.hlekkr.com
```

## 📋 **Core API Endpoints**

### 1. **Media Upload & Processing**

#### Upload Media for Analysis
```http
POST /media
Content-Type: application/json
Authorization: Bearer {token}

{
  "fileName": "suspicious-video.mp4",
  "fileType": "video/mp4",
  "fileSize": 52428800,
  "metadata": {
    "description": "User-generated content from social media",
    "source": "twitter",
    "originalUrl": "https://twitter.com/user/status/123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mediaId": "media-1704123456789-abc123def456",
    "uploadUrl": "https://presigned-s3-url.com",
    "status": "uploading"
  },
  "correlationId": "req-789xyz"
}
```

#### Get Upload Status
```http
GET /media/{mediaId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mediaId": "media-1704123456789-abc123def456",
    "status": "analyzed",
    "fileName": "suspicious-video.mp4",
    "uploadedAt": "2024-01-01T12:00:00Z",
    "analyzedAt": "2024-01-01T12:05:30Z",
    "trustScore": {
      "composite": 25.5,
      "confidence": "high"
    }
  }
}
```

### 2. **Analysis Results**

#### Get Detailed Analysis
```http
GET /analysis/{mediaId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mediaId": "media-1704123456789-abc123def456",
    "trustScore": {
      "composite": 25.5,
      "breakdown": {
        "deepfakeScore": 15.2,
        "sourceReliabilityScore": 45.0,
        "metadataConsistencyScore": 30.8,
        "technicalQualityScore": 85.5
      },
      "confidence": "high",
      "version": "2.1.0"
    },
    "deepfakeAnalysis": {
      "probability": 0.847,
      "confidence": 0.92,
      "techniques": ["face_swap", "voice_clone"],
      "modelVersion": "deepfake-detector-v3.2"
    },
    "reviewStatus": {
      "status": "completed",
      "moderatorDecision": {
        "decision": "confirm",
        "confidence": 0.95,
        "notes": "Clear evidence of facial manipulation"
      }
    }
  }
}
```

### 3. **Human Review Workflow**

#### Get Review Queue (Moderators Only)
```http
GET /review/queue?priority=high&assignedOnly=false&limit=20
Authorization: Bearer {moderator_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "queue": [
      {
        "mediaId": "media-1704123456789-abc123def456",
        "fileName": "suspicious-content.mp4",
        "trustScore": 35.2,
        "deepfakeProbability": 0.78,
        "priority": "high",
        "queuedAt": "2024-01-01T12:00:00Z",
        "estimatedReviewTime": 15
      }
    ],
    "totalPending": 47,
    "assignedToMe": 12,
    "estimatedWorkload": 180
  }
}
```

#### Submit Review Decision
```http
POST /review/decisions
Authorization: Bearer {moderator_token}
Content-Type: application/json

{
  "mediaId": "media-1704123456789-abc123def456",
  "decision": "confirm",
  "confidence": 0.95,
  "notes": "Clear evidence of deepfake manipulation in facial features and audio synchronization",
  "tags": ["deepfake", "face-manipulation", "high-confidence"],
  "findings": {
    "manipulationTechniques": ["face_swap", "expression_transfer"],
    "suspiciousPatterns": ["temporal_inconsistency", "lighting_mismatch"],
    "technicalDetails": {
      "artifactScore": 0.87,
      "temporalConsistency": 0.23
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reviewId": "review-1704123456789-def456ghi789",
    "status": "completed",
    "decision": "confirm",
    "confidence": 0.95,
    "threatIntelligenceTriggered": true,
    "message": "Review decision submitted successfully"
  }
}
```

### 4. **Batch Operations**

#### Batch Analysis Request
```http
POST /batch/analyze
Authorization: Bearer {token}
Content-Type: application/json

{
  "mediaItems": [
    {
      "mediaId": "media-1",
      "priority": "normal"
    },
    {
      "mediaId": "media-2", 
      "priority": "high"
    }
  ],
  "options": {
    "includeDetailedAnalysis": true,
    "notificationWebhook": "https://your-app.com/webhook"
  }
}
```

## 🔒 **Authentication & Security**

### JWT Token Structure
```json
{
  "sub": "user-123456789",
  "email": "user@example.com",
  "role": "moderator",
  "permissions": {
    "canUploadMedia": true,
    "canViewAnalysis": true,
    "canModerateContent": true
  },
  "exp": 1704209999,
  "iat": 1704123599
}
```

### Rate Limits by Role
| Role | Requests/Min | Requests/Hour | Requests/Day |
|------|--------------|---------------|--------------|
| User | 60 | 1,000 | 10,000 |
| Moderator | 120 | 2,000 | 20,000 |
| Admin | 300 | 5,000 | 50,000 |
| Super Admin | 600 | 10,000 | 100,000 |

### Error Responses
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded. Please try again later.",
    "code": 429,
    "type": "RATE_LIMIT_EXCEEDED"
  },
  "correlationId": "req-789xyz"
}
```

## 🔔 **Webhooks**

### Webhook Events
- `media.uploaded` - Media file successfully uploaded
- `analysis.completed` - AI analysis finished
- `review.assigned` - Media assigned to moderator
- `review.completed` - Human review decision made
- `threat.detected` - High-confidence threat identified

### Webhook Payload Example
```json
{
  "event": "analysis.completed",
  "timestamp": "2024-01-01T12:05:30Z",
  "data": {
    "mediaId": "media-1704123456789-abc123def456",
    "trustScore": 25.5,
    "deepfakeProbability": 0.847,
    "requiresHumanReview": true
  },
  "correlationId": "webhook-789xyz"
}
```

## 📊 **Response Codes**

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Request completed successfully |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Rate Limited | Too many requests |
| 500 | Server Error | Internal server error |

## 🛠️ **SDK Examples**

### JavaScript/TypeScript
```typescript
import { HlekkrClient } from '@hlekkr/sdk';

const client = new HlekkrClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.hlekkr.com'
});

// Upload and analyze media
const result = await client.media.upload({
  fileName: 'video.mp4',
  fileType: 'video/mp4',
  fileBuffer: videoBuffer
});

// Get analysis results
const analysis = await client.analysis.get(result.mediaId);
console.log(`Trust Score: ${analysis.trustScore.composite}/100`);
```

### Python
```python
from hlekkr import HlekkrClient

client = HlekkrClient(
    api_key='your-api-key',
    base_url='https://api.hlekkr.com'
)

# Upload and analyze media
result = client.media.upload(
    file_name='video.mp4',
    file_type='video/mp4',
    file_data=video_bytes
)

# Get analysis results
analysis = client.analysis.get(result['mediaId'])
print(f"Trust Score: {analysis['trustScore']['composite']}/100")
```

## 🔍 **Testing & Development**

### Sandbox Environment
```
Base URL: https://sandbox-api.hlekkr.com
API Key: sandbox_key_123456789
```

### Test Media Files
We provide sample media files for testing:
- `test-authentic-video.mp4` - Clean, unmanipulated content
- `test-deepfake-video.mp4` - Known deepfake for testing detection
- `test-uncertain-video.mp4` - Borderline case requiring human review

---

## 📞 **Support & Resources**

- **API Status**: [status.hlekkr.com](https://status.hlekkr.com)
- **Interactive Docs**: [docs.hlekkr.com](https://docs.hlekkr.com)
- **GitHub Issues**: [github.com/hlekkr/platform/issues](https://github.com/hlekkr/platform/issues)
- **Developer Discord**: [discord.gg/hlekkr](https://discord.gg/hlekkr)
- **Email Support**: [developers@hlekkr.com](mailto:developers@hlekkr.com)