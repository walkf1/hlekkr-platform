import React, { useState } from 'react';
import styled from 'styled-components';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Area,
  AreaChart
} from 'recharts';
import { Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface TrustScoreHistoryData {
  mediaId: string;
  version: string;
  calculationTimestamp: string;
  compositeScore: number;
  confidence: string;
  breakdown: {
    deepfakeScore: number;
    sourceReliabilityScore: number;
    metadataConsistencyScore: number;
    historicalPatternScore: number;
    technicalIntegrityScore: number;
  };
}

interface TrustScoreHistoryChartProps {
  data: TrustScoreHistoryData[];
  mediaId: string;
  showBreakdown?: boolean;
  timeRange?: '24h' | '7d' | '30d' | '90d' | 'all';
  className?: string;
}

const Container = styled.div`
  background: white;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #E5E7EB;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TimeRangeSelector = styled.div`
  display: flex;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  overflow: hidden;
`;

const TimeRangeButton = styled.button<{ active: boolean }>`
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  background: ${props => props.active ? '#3B82F6' : 'white'};
  color: ${props => props.active ? 'white' : '#6B7280'};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.active ? '#2563EB' : '#F9FAFB'};
  }
`;

const ViewToggle = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  background: ${props => props.active ? '#3B82F6' : 'white'};
  color: ${props => props.active ? 'white' : '#6B7280'};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.active ? '#2563EB' : '#F9FAFB'};
  }
`;

const ChartContainer = styled.div`
  height: 400px;
  margin-top: 20px;
`;

const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #F9FAFB;
`;

const StatValue = styled.div<{ trend?: 'up' | 'down' | 'stable' }>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => {
    switch (props.trend) {
      case 'up': return '#10B981';
      case 'down': return '#EF4444';
      default: return '#111827';
    }
  }};
  display: flex;
  align-items: center;
  gap: 4px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: #6B7280;
  margin-top: 4px;
`;

const NoDataMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #6B7280;
  font-size: 14px;
`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#111827' }}>
          {format(parseISO(label), 'MMM dd, yyyy HH:mm')}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ 
            margin: '4px 0', 
            color: entry.color,
            fontSize: '13px'
          }}>
            {entry.name}: {Math.round(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const TrustScoreHistoryChart: React.FC<TrustScoreHistoryChartProps> = ({
  data,
  mediaId,
  showBreakdown = false,
  timeRange = '30d',
  className
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [showBreakdownView, setShowBreakdownView] = useState(showBreakdown);

  // Process and sort data
  const processedData = data
    .map(item => ({
      ...item,
      timestamp: parseISO(item.calculationTimestamp),
      formattedTime: format(parseISO(item.calculationTimestamp), 'MMM dd HH:mm')
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calculate statistics
  const calculateStats = () => {
    if (processedData.length === 0) return null;

    const scores = processedData.map(d => d.compositeScore);
    const latest = scores[scores.length - 1];
    const previous = scores.length > 1 ? scores[scores.length - 2] : latest;
    const change = latest - previous;
    
    const trend = change > 2 ? 'up' : change < -2 ? 'down' : 'stable';
    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

    return {
      current: latest,
      change: Math.abs(change),
      trend,
      TrendIcon,
      min: Math.min(...scores),
      max: Math.max(...scores),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length
    };
  };

  const stats = calculateStats();

  if (processedData.length === 0) {
    return (
      <Container className={className}>
        <Header>
          <Title>
            <Calendar size={18} />
            Trust Score History
          </Title>
        </Header>
        <NoDataMessage>
          <Calendar size={48} color="#D1D5DB" />
          <p>No historical data available for this media</p>
        </NoDataMessage>
      </Container>
    );
  }

  return (
    <Container className={className}>
      <Header>
        <Title>
          <Calendar size={18} />
          Trust Score History
        </Title>
        <Controls>
          <TimeRangeSelector>
            {['24h', '7d', '30d', '90d', 'all'].map(range => (
              <TimeRangeButton
                key={range}
                active={selectedTimeRange === range}
                onClick={() => setSelectedTimeRange(range as any)}
              >
                {range.toUpperCase()}
              </TimeRangeButton>
            ))}
          </TimeRangeSelector>
          
          <ViewToggle
            active={showBreakdownView}
            onClick={() => setShowBreakdownView(!showBreakdownView)}
          >
            Breakdown View
          </ViewToggle>
        </Controls>
      </Header>

      {stats && (
        <StatsContainer>
          <StatItem>
            <StatValue trend={stats.trend}>
              {Math.round(stats.current)}
              <stats.TrendIcon size={16} />
            </StatValue>
            <StatLabel>Current Score</StatLabel>
          </StatItem>
          
          <StatItem>
            <StatValue trend={stats.trend}>
              {stats.change > 0 ? '+' : ''}{Math.round(stats.change)}
            </StatValue>
            <StatLabel>Recent Change</StatLabel>
          </StatItem>
          
          <StatItem>
            <StatValue>
              {Math.round(stats.avg)}
            </StatValue>
            <StatLabel>Average</StatLabel>
          </StatItem>
          
          <StatItem>
            <StatValue>
              {Math.round(stats.min)} - {Math.round(stats.max)}
            </StatValue>
            <StatLabel>Range</StatLabel>
          </StatItem>
        </StatsContainer>
      )}

      <ChartContainer>
        <ResponsiveContainer width="100%" height="100%">
          {showBreakdownView ? (
            <AreaChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="formattedTime"
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                domain={[0, 100]}
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              <Area
                type="monotone"
                dataKey="breakdown.deepfakeScore"
                stackId="1"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.6}
                name="Deepfake Detection"
              />
              <Area
                type="monotone"
                dataKey="breakdown.sourceReliabilityScore"
                stackId="1"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.6}
                name="Source Reliability"
              />
              <Area
                type="monotone"
                dataKey="breakdown.metadataConsistencyScore"
                stackId="1"
                stroke="#F59E0B"
                fill="#F59E0B"
                fillOpacity={0.6}
                name="Metadata Consistency"
              />
              <Area
                type="monotone"
                dataKey="breakdown.technicalIntegrityScore"
                stackId="1"
                stroke="#8B5CF6"
                fill="#8B5CF6"
                fillOpacity={0.6}
                name="Technical Integrity"
              />
              <Area
                type="monotone"
                dataKey="breakdown.historicalPatternScore"
                stackId="1"
                stroke="#EF4444"
                fill="#EF4444"
                fillOpacity={0.6}
                name="Historical Patterns"
              />
            </AreaChart>
          ) : (
            <LineChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="formattedTime"
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                domain={[0, 100]}
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Reference lines for score ranges */}
              <ReferenceLine y={80} stroke="#10B981" strokeDasharray="2 2" opacity={0.5} />
              <ReferenceLine y={60} stroke="#F59E0B" strokeDasharray="2 2" opacity={0.5} />
              <ReferenceLine y={40} stroke="#EF4444" strokeDasharray="2 2" opacity={0.5} />
              
              <Line
                type="monotone"
                dataKey="compositeScore"
                stroke="#3B82F6"
                strokeWidth={3}
                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                name="Trust Score"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </ChartContainer>
    </Container>
  );
};

export default TrustScoreHistoryChart;