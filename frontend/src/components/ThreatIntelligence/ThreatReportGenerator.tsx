import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { 
  Shield, 
  AlertTriangle, 
  FileText, 
  Github, 
  Send, 
  CheckCircle, 
  Clock, 
  ExternalLink,
  Download,
  Eye,
  Settings
} from 'lucide-react';

interface ThreatReportGeneratorProps {
  mediaId?: string;
  reviewDecision?: {
    decision: 'confirm' | 'reject' | 'uncertain' | 'escalate';
    confidence: number;
    notes: string;
    tags: string[];
    findings: Record<string, any>;
  };
  onReportGenerated?: (reportId: string, githubUrl: string) => void;
  className?: string;
}

interface ThreatReport {
  reportId: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  threatType: string;
  description: string;
  indicators: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  mitigationRecommendations: string[];
  githubUrl?: string;
  createdAt: string;
}

// Styled Components
const Container = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const Header = styled.div`
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
  color: white;
`;

const HeaderTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const HeaderSubtitle = styled.p`
  font-size: 14px;
  margin: 0;
  opacity: 0.9;
`;

const Content = styled.div`
  padding: 24px;
`;

const Section = styled.div`
  margin-bottom: 24px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  transition: border-color 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #3b82f6;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid;
  
  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
          &:hover { background: #2563eb; border-color: #2563eb; }
          &:disabled { background: #9ca3af; border-color: #9ca3af; cursor: not-allowed; }
        `;
      case 'danger':
        return `
          background: #dc2626;
          color: white;
          border-color: #dc2626;
          &:hover { background: #b91c1c; border-color: #b91c1c; }
          &:disabled { background: #9ca3af; border-color: #9ca3af; cursor: not-allowed; }
        `;
      default:
        return `
          background: white;
          color: #374151;
          border-color: #d1d5db;
          &:hover { background: #f9fafb; border-color: #9ca3af; }
          &:disabled { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
        `;
    }
  }}
`;

const StatusCard = styled.div<{ status: 'generating' | 'success' | 'error' }>`
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  
  ${props => {
    switch (props.status) {
      case 'generating':
        return `
          background: #dbeafe;
          border: 1px solid #93c5fd;
          color: #1e40af;
        `;
      case 'success':
        return `
          background: #dcfce7;
          border: 1px solid #86efac;
          color: #166534;
        `;
      case 'error':
        return `
          background: #fecaca;
          border: 1px solid #fca5a5;
          color: #991b1b;
        `;
    }
  }}
`;

const ReportPreview = styled.div`
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
`;

const ReportTitle = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 12px;
`;

const ReportMeta = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #6b7280;
`;

const SeverityBadge = styled.span<{ severity: string }>`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  
  ${props => {
    switch (props.severity) {
      case 'critical':
        return 'background: #fecaca; color: #991b1b;';
      case 'high':
        return 'background: #fed7aa; color: #c2410c;';
      case 'medium':
        return 'background: #fef3c7; color: #92400e;';
      case 'low':
        return 'background: #dcfce7; color: #166534;';
      default:
        return 'background: #f3f4f6; color: #374151;';
    }
  }}
`;

const IndicatorsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 12px 0;
`;

const IndicatorItem = styled.li`
  padding: 8px 12px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ConfidenceBar = styled.div<{ confidence: number }>`
  width: 60px;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
  
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${props => props.confidence * 100}%;
    background: ${props => props.confidence > 0.8 ? '#dc2626' : props.confidence > 0.6 ? '#f59e0b' : '#10b981'};
    transition: width 0.3s ease;
  }
`;

export const ThreatReportGenerator: React.FC<ThreatReportGeneratorProps> = ({
  mediaId,
  reviewDecision,
  onReportGenerated,
  className
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<ThreatReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    severity: 'medium' as const,
    threatType: 'deepfake_confirmed' as const,
    description: '',
    includeIndicators: true,
    publishToGitHub: true,
    notifyTeam: true,
  });

  // Auto-populate form based on review decision
  React.useEffect(() => {
    if (reviewDecision && reviewDecision.decision === 'confirm') {
      const confidence = reviewDecision.confidence;
      const severity = confidence >= 0.9 ? 'critical' : confidence >= 0.7 ? 'high' : 'medium';
      
      setFormData(prev => ({
        ...prev,
        title: `Confirmed Deepfake Content - ${new Date().toISOString().split('T')[0]}`,
        severity,
        description: `Human moderator confirmed suspicious content with ${(confidence * 100).toFixed(1)}% confidence. ${reviewDecision.notes}`,
      }));
    }
  }, [reviewDecision]);

  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const generateReport = useCallback(async () => {
    if (!formData.title || !formData.description) {
      setError('Title and description are required');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Prepare request data
      const requestData = {
        mediaIds: mediaId ? [mediaId] : [],
        title: formData.title,
        severity: formData.severity,
        threatType: formData.threatType,
        description: formData.description,
        reviewDecision,
        options: {
          includeIndicators: formData.includeIndicators,
          publishToGitHub: formData.publishToGitHub,
          notifyTeam: formData.notifyTeam,
        },
      };

      // Call threat report generation API
      const response = await fetch('/api/threat-intelligence/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate report: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const report: ThreatReport = {
          reportId: result.data.reportId,
          title: formData.title,
          severity: formData.severity,
          threatType: formData.threatType,
          description: formData.description,
          indicators: result.data.indicators || [],
          mitigationRecommendations: result.data.mitigationRecommendations || [],
          githubUrl: result.data.githubUrl,
          createdAt: new Date().toISOString(),
        };

        setGeneratedReport(report);
        onReportGenerated?.(report.reportId, report.githubUrl || '');
      } else {
        throw new Error(result.error?.message || 'Failed to generate report');
      }
    } catch (err) {
      console.error('Error generating threat report:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate threat report');
    } finally {
      setIsGenerating(false);
    }
  }, [formData, mediaId, reviewDecision, onReportGenerated]);

  const downloadReport = useCallback(async () => {
    if (!generatedReport) return;

    try {
      const response = await fetch(`/api/threat-intelligence/reports/${generatedReport.reportId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `threat-report-${generatedReport.reportId}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  }, [generatedReport]);

  return (
    <Container className={className}>
      <Header>
        <HeaderTitle>
          <Shield size={24} />
          Threat Report Generator
        </HeaderTitle>
        <HeaderSubtitle>
          Generate comprehensive threat intelligence reports for confirmed threats
        </HeaderSubtitle>
      </Header>

      <Content>
        {/* Status Display */}
        {isGenerating && (
          <StatusCard status="generating">
            <Clock size={20} />
            <div>
              <strong>Generating Threat Report...</strong>
              <div>Analyzing threat data and creating comprehensive report</div>
            </div>
          </StatusCard>
        )}

        {generatedReport && (
          <StatusCard status="success">
            <CheckCircle size={20} />
            <div>
              <strong>Threat Report Generated Successfully</strong>
              <div>Report ID: {generatedReport.reportId}</div>
            </div>
          </StatusCard>
        )}

        {error && (
          <StatusCard status="error">
            <AlertTriangle size={20} />
            <div>
              <strong>Error Generating Report</strong>
              <div>{error}</div>
            </div>
          </StatusCard>
        )}

        {/* Report Form */}
        {!generatedReport && (
          <>
            <Section>
              <SectionTitle>
                <FileText size={18} />
                Report Details
              </SectionTitle>

              <FormGroup>
                <Label>Report Title</Label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Enter threat report title"
                />
              </FormGroup>

              <FormGroup>
                <Label>Threat Severity</Label>
                <Select
                  value={formData.severity}
                  onChange={(e) => handleInputChange('severity', e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Threat Type</Label>
                <Select
                  value={formData.threatType}
                  onChange={(e) => handleInputChange('threatType', e.target.value)}
                >
                  <option value="deepfake_confirmed">Confirmed Deepfake</option>
                  <option value="coordinated_campaign">Coordinated Campaign</option>
                  <option value="novel_technique">Novel Technique</option>
                  <option value="mass_distribution">Mass Distribution</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Description</Label>
                <TextArea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe the threat, its characteristics, and potential impact"
                />
              </FormGroup>
            </Section>

            <Section>
              <SectionTitle>
                <Settings size={18} />
                Generation Options
              </SectionTitle>

              <CheckboxGroup>
                <CheckboxItem>
                  <input
                    type="checkbox"
                    checked={formData.includeIndicators}
                    onChange={(e) => handleInputChange('includeIndicators', e.target.checked)}
                  />
                  Include threat indicators
                </CheckboxItem>

                <CheckboxItem>
                  <input
                    type="checkbox"
                    checked={formData.publishToGitHub}
                    onChange={(e) => handleInputChange('publishToGitHub', e.target.checked)}
                  />
                  Publish to GitHub repository
                </CheckboxItem>

                <CheckboxItem>
                  <input
                    type="checkbox"
                    checked={formData.notifyTeam}
                    onChange={(e) => handleInputChange('notifyTeam', e.target.checked)}
                  />
                  Notify security team
                </CheckboxItem>
              </CheckboxGroup>
            </Section>
          </>
        )}

        {/* Generated Report Preview */}
        {generatedReport && (
          <Section>
            <SectionTitle>
              <Eye size={18} />
              Report Preview
            </SectionTitle>

            <ReportPreview>
              <ReportTitle>{generatedReport.title}</ReportTitle>
              
              <ReportMeta>
                <span>Report ID: {generatedReport.reportId}</span>
                <span>Type: {generatedReport.threatType.replace('_', ' ')}</span>
                <SeverityBadge severity={generatedReport.severity}>
                  {generatedReport.severity}
                </SeverityBadge>
              </ReportMeta>

              <p>{generatedReport.description}</p>

              {generatedReport.indicators.length > 0 && (
                <>
                  <h5>Threat Indicators ({generatedReport.indicators.length})</h5>
                  <IndicatorsList>
                    {generatedReport.indicators.slice(0, 5).map((indicator, index) => (
                      <IndicatorItem key={index}>
                        <span>
                          <strong>{indicator.type}:</strong> {indicator.value}
                        </span>
                        <ConfidenceBar confidence={indicator.confidence} />
                      </IndicatorItem>
                    ))}
                    {generatedReport.indicators.length > 5 && (
                      <IndicatorItem>
                        <span>... and {generatedReport.indicators.length - 5} more indicators</span>
                      </IndicatorItem>
                    )}
                  </IndicatorsList>
                </>
              )}

              {generatedReport.mitigationRecommendations.length > 0 && (
                <>
                  <h5>Mitigation Recommendations</h5>
                  <ul>
                    {generatedReport.mitigationRecommendations.slice(0, 3).map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </>
              )}
            </ReportPreview>
          </Section>
        )}

        {/* Action Buttons */}
        <ButtonGroup>
          {!generatedReport ? (
            <>
              <Button onClick={() => setFormData({
                title: '',
                severity: 'medium',
                threatType: 'deepfake_confirmed',
                description: '',
                includeIndicators: true,
                publishToGitHub: true,
                notifyTeam: true,
              })}>
                Reset Form
              </Button>
              <Button 
                variant="primary" 
                onClick={generateReport}
                disabled={isGenerating || !formData.title || !formData.description}
              >
                <Send size={16} />
                {isGenerating ? 'Generating...' : 'Generate Report'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={downloadReport}>
                <Download size={16} />
                Download Report
              </Button>
              {generatedReport.githubUrl && (
                <Button onClick={() => window.open(generatedReport.githubUrl, '_blank')}>
                  <Github size={16} />
                  View on GitHub
                </Button>
              )}
              <Button 
                variant="primary" 
                onClick={() => {
                  setGeneratedReport(null);
                  setError(null);
                }}
              >
                Generate Another Report
              </Button>
            </>
          )}
        </ButtonGroup>
      </Content>
    </Container>
  );
};

export default ThreatReportGenerator;