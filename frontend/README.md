# Hlekkr Trust Score Visualization Frontend

## Overview

This React frontend provides comprehensive visualization components for Hlekkr's trust score system. The components implement color-coded displays, detailed breakdowns, historical trend analysis, and interactive exploration tools as specified in the requirements.

## Features

### ✅ **Core Visualization Components**

#### 1. **TrustScoreDisplay**
- **Color-coded score display** with automatic color mapping:
  - 🟢 **Green (80-100)**: High Trust
  - 🟡 **Yellow (60-79)**: Medium Trust  
  - 🔴 **Red (40-59)**: Low Trust
  - 🔴 **Dark Red (0-39)**: Very Low Trust
- **Multiple sizes**: Small, Medium, Large
- **Confidence indicators**: High, Medium, Low badges
- **Interactive hover effects** with scaling and shadows
- **Customizable icons** and labels

#### 2. **TrustScoreBreakdown**
- **Detailed component analysis** with weighted scoring:
  - Deepfake Detection (35% weight)
  - Source Reliability (25% weight)
  - Metadata Consistency (20% weight)
  - Technical Integrity (15% weight)
  - Historical Patterns (5% weight)
- **Expandable sections** with factor details
- **Progress bars** for visual score representation
- **Factor impact indicators** (positive/negative/neutral)
- **Interactive exploration** with click-to-expand

#### 3. **TrustScoreHistoryChart**
- **Time-series visualization** using Recharts
- **Dual view modes**:
  - Line chart for composite scores
  - Stacked area chart for component breakdown
- **Reference lines** for score thresholds (80, 60, 40)
- **Interactive tooltips** with detailed information
- **Time range selection** (24h, 7d, 30d, 90d, all)
- **Statistical summaries** with trend indicators

#### 4. **TrustScoreExplorer**
- **Comprehensive media browser** with filtering and search
- **Dual layout modes**: Grid and List views
- **Advanced filtering**:
  - Score range filtering
  - Confidence level filtering
  - Date range filtering
  - Text search
- **Real-time statistics** and summary metrics
- **Export functionality** with CSV generation
- **Interactive media selection** with detailed views

#### 5. **TrustScoreDashboard**
- **Complete dashboard** combining all components
- **Statistics overview** with key metrics
- **Real-time data fetching** from API endpoints
- **Error handling** and loading states
- **Responsive design** for different screen sizes
- **Export and refresh capabilities**

### ✅ **Interactive Features**

- **Click-to-expand** detailed breakdowns
- **Hover effects** with enhanced visual feedback
- **Real-time score updates** with smooth animations
- **Responsive design** adapting to screen sizes
- **Keyboard navigation** support
- **Accessibility compliance** with ARIA labels

### ✅ **Data Integration**

- **REST API integration** with configurable endpoints
- **Real-time data fetching** with error handling
- **Automatic refresh** capabilities
- **Export functionality** (CSV, JSON)
- **Caching and optimization** for performance

## Installation

```bash
# Navigate to frontend directory
cd GRACE-1-recovered/frontend

# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

## Usage

### Basic Implementation

```tsx
import React from 'react';
import { TrustScoreDashboard } from './components/TrustScore';

const App = () => {
  return (
    <TrustScoreDashboard
      apiBaseUrl="https://api.hlekkr.com"
      mediaId="optional-media-id"
    />
  );
};
```

### Individual Components

```tsx
import {
  TrustScoreDisplay,
  TrustScoreBreakdown,
  TrustScoreHistoryChart,
  TrustScoreExplorer
} from './components/TrustScore';

// Color-coded score display
<TrustScoreDisplay
  score={85.5}
  confidence="high"
  size="large"
  showIcon={true}
  showLabel={true}
/>

// Detailed breakdown
<TrustScoreBreakdown
  breakdown={{
    deepfakeScore: 90.0,
    sourceReliabilityScore: 80.5,
    metadataConsistencyScore: 85.0,
    historicalPatternScore: 88.0,
    technicalIntegrityScore: 83.5
  }}
  factors={[...]}
  compositeScore={85.5}
/>

// Historical chart
<TrustScoreHistoryChart
  data={historyData}
  mediaId="media-123"
  showBreakdown={false}
/>

// Interactive explorer
<TrustScoreExplorer
  data={mediaData}
  onMediaSelect={(mediaId) => console.log('Selected:', mediaId)}
  onScoreRefresh={(mediaId) => refreshScore(mediaId)}
  onExport={(filters) => exportData(filters)}
/>
```

## Component API

### TrustScoreDisplay Props

```typescript
interface TrustScoreDisplayProps {
  score: number;                    // 0-100 trust score
  confidence: 'low' | 'medium' | 'high' | 'error';
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;               // Show trust level icon
  showLabel?: boolean;              // Show trust level label
  className?: string;
}
```

### TrustScoreBreakdown Props

```typescript
interface TrustScoreBreakdownProps {
  breakdown: {
    deepfakeScore: number;
    sourceReliabilityScore: number;
    metadataConsistencyScore: number;
    historicalPatternScore: number;
    technicalIntegrityScore: number;
  };
  factors?: Array<{
    category: string;
    impact: 'positive' | 'negative' | 'neutral';
    description: string;
    weight: 'high' | 'medium' | 'low';
  }>;
  compositeScore: number;
  className?: string;
}
```

### TrustScoreHistoryChart Props

```typescript
interface TrustScoreHistoryChartProps {
  data: TrustScoreHistoryData[];
  mediaId: string;
  showBreakdown?: boolean;          // Toggle between line and area chart
  timeRange?: '24h' | '7d' | '30d' | '90d' | 'all';
  className?: string;
}
```

## Styling and Theming

The components use **styled-components** for styling with a consistent design system:

### Color Palette
- **High Trust**: `#10B981` (Green)
- **Medium Trust**: `#F59E0B` (Amber)
- **Low Trust**: `#EF4444` (Red)
- **Very Low Trust**: `#DC2626` (Dark Red)
- **Background**: `#F9FAFB` (Light Gray)
- **Text**: `#111827` (Dark Gray)
- **Secondary**: `#6B7280` (Medium Gray)

### Typography
- **Font Family**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto'`
- **Headings**: `600-700` weight
- **Body**: `400-500` weight
- **Small Text**: `12-14px`
- **Regular Text**: `14-16px`
- **Headings**: `18-32px`

### Spacing
- **Small**: `4-8px`
- **Medium**: `12-16px`
- **Large**: `20-24px`
- **Extra Large**: `32-48px`

## Demo and Testing

### Interactive Demo

```bash
# Run the demo application
npm start

# Navigate to demo component
# The demo showcases all visualization features with mock data
```

### Component Features Demonstrated

1. **Score Display Variations**
   - Different sizes and confidence levels
   - Color-coded trust ranges
   - Interactive animations

2. **Breakdown Analysis**
   - Expandable component details
   - Factor impact visualization
   - Weighted scoring display

3. **Historical Trends**
   - Time-series charts
   - Breakdown view toggle
   - Statistical summaries

4. **Interactive Explorer**
   - Filtering and search
   - Grid/List view modes
   - Export capabilities

## API Integration

### Expected API Endpoints

```typescript
// Get trust score for specific media
GET /trust-scores/{mediaId}
Response: {
  mediaId: string;
  trustScore: TrustScoreData;
}

// Get trust score history
GET /trust-scores/{mediaId}?history=true&limit=20
Response: {
  mediaId: string;
  history: TrustScoreHistoryData[];
}

// Get trust scores with filters
GET /trust-scores?scoreRange=high&limit=50
Response: {
  trustScores: MediaTrustScore[];
  count: number;
}

// Get statistics
GET /trust-scores?statistics=true&days=30
Response: {
  statistics: {
    totalScores: number;
    averageScore: number;
    scoreDistribution: {
      high: number;
      medium: number;
      low: number;
      very_low: number;
    };
  };
}

// Calculate new trust score
POST /trust-scores/{mediaId}
Response: {
  mediaId: string;
  trustScore: TrustScoreData;
  stored: boolean;
}
```

## Performance Optimization

### Implemented Optimizations

- **React.memo** for component memoization
- **Lazy loading** for large datasets
- **Virtual scrolling** for media lists
- **Debounced search** to reduce API calls
- **Efficient re-renders** with proper key props
- **Image optimization** and lazy loading
- **Bundle splitting** for code optimization

### Best Practices

- **Responsive design** with mobile-first approach
- **Accessibility compliance** with ARIA labels
- **Error boundaries** for graceful error handling
- **Loading states** for better user experience
- **Caching strategies** for API responses
- **Progressive enhancement** for core functionality

## Browser Support

- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+
- **Mobile browsers**: iOS Safari 14+, Chrome Mobile 90+

## Dependencies

### Core Dependencies
- **React**: ^18.2.0
- **TypeScript**: ^4.9.4
- **styled-components**: ^6.1.1
- **recharts**: ^2.8.0 (for charts)
- **lucide-react**: ^0.294.0 (for icons)
- **axios**: ^1.6.2 (for API calls)
- **date-fns**: ^2.29.3 (for date formatting)

### Development Dependencies
- **@testing-library/react**: ^13.4.0
- **@types/react**: ^18.0.26
- **@types/styled-components**: ^5.1.26

## Requirements Satisfied

This implementation satisfies the following requirements:

- ✅ **4.3**: Color-coded score display (green: high trust, yellow: medium, red: low)
- ✅ **4.3**: Detailed breakdown views showing individual component scores
- ✅ **4.3**: Historical trend charts with interactive exploration
- ✅ **4.3**: Interactive score exploration with drill-down capabilities
- ✅ **8.3**: Interactive charts and visualization components
- ✅ **8.3**: Multiple export formats and customizable displays

## Future Enhancements

### Planned Features
- **Real-time updates** via WebSocket connections
- **Advanced filtering** with custom date ranges
- **Comparison views** for multiple media items
- **Annotation tools** for collaborative analysis
- **Custom dashboard** configuration
- **Mobile app** with native components
- **Accessibility improvements** with screen reader support
- **Internationalization** support for multiple languages

---

The trust score visualization system is now fully implemented and ready for integration with the Hlekkr platform. All components are responsive, accessible, and follow modern React best practices.