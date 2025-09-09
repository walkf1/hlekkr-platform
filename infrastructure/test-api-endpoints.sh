#!/bin/bash

# Test API Gateway endpoints
# Usage: ./test-api-endpoints.sh <API_URL> <API_KEY>

set -e

if [ $# -ne 2 ]; then
    echo "Usage: $0 <API_URL> <API_KEY>"
    echo "Example: $0 https://abc123.execute-api.us-east-1.amazonaws.com/prod your-api-key"
    exit 1
fi

API_URL="$1"
API_KEY="$2"

echo "🧪 Testing Hlekkr API endpoints..."
echo "API URL: $API_URL"
echo "API Key: ${API_KEY:0:8}..."
echo ""

# Test health check (if available)
echo "1️⃣  Testing health endpoint..."
curl -s -H "X-API-Key: $API_KEY" "$API_URL/health" || echo "Health endpoint not available"
echo ""

# Test media endpoint
echo "2️⃣  Testing media endpoint..."
curl -s -H "X-API-Key: $API_KEY" "$API_URL/media/test-media-id" || echo "Expected - media not found"
echo ""

# Test trust scores endpoint
echo "3️⃣  Testing trust scores endpoint..."
curl -s -H "X-API-Key: $API_KEY" "$API_URL/trust-scores" || echo "Expected - no trust scores yet"
echo ""

# Test analysis endpoint
echo "4️⃣  Testing analysis endpoint..."
curl -s -H "X-API-Key: $API_KEY" -X POST "$API_URL/media/test-media-id/analyze" || echo "Expected - media not found"
echo ""

echo "✅ API endpoint tests completed!"
echo "Note: 404 errors are expected for non-existent media IDs"