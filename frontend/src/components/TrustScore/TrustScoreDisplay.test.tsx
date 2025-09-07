import React from 'react';
import { render, screen } from '@testing-library/react';
import TrustScoreDisplay from './TrustScoreDisplay';

describe('TrustScoreDisplay', () => {
  test('renders trust score with correct value', () => {
    render(
      <TrustScoreDisplay 
        score={85.5} 
        confidence="high" 
        size="medium" 
        showIcon={true} 
      />
    );
    
    // Should display rounded score
    expect(screen.getByText('86')).toBeInTheDocument();
  });

  test('applies correct color for high trust score', () => {
    const { container } = render(
      <TrustScoreDisplay 
        score={90} 
        confidence="high" 
        size="medium" 
        showIcon={true} 
      />
    );
    
    // High trust scores should have green styling
    const scoreContainer = container.querySelector('div');
    expect(scoreContainer).toHaveStyle('border-color: #10B981');
  });

  test('applies correct color for medium trust score', () => {
    const { container } = render(
      <TrustScoreDisplay 
        score={70} 
        confidence="medium" 
        size="medium" 
        showIcon={true} 
      />
    );
    
    // Medium trust scores should have yellow/amber styling
    const scoreContainer = container.querySelector('div');
    expect(scoreContainer).toHaveStyle('border-color: #F59E0B');
  });

  test('applies correct color for low trust score', () => {
    const { container } = render(
      <TrustScoreDisplay 
        score={45} 
        confidence="low" 
        size="medium" 
        showIcon={true} 
      />
    );
    
    // Low trust scores should have red styling
    const scoreContainer = container.querySelector('div');
    expect(scoreContainer).toHaveStyle('border-color: #EF4444');
  });

  test('applies correct color for very low trust score', () => {
    const { container } = render(
      <TrustScoreDisplay 
        score={25} 
        confidence="low" 
        size="medium" 
        showIcon={true} 
      />
    );
    
    // Very low trust scores should have dark red styling
    const scoreContainer = container.querySelector('div');
    expect(scoreContainer).toHaveStyle('border-color: #DC2626');
  });

  test('displays confidence badge', () => {
    render(
      <TrustScoreDisplay 
        score={85} 
        confidence="high" 
        size="medium" 
        showIcon={true} 
      />
    );
    
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  test('shows label when requested', () => {
    render(
      <TrustScoreDisplay 
        score={85} 
        confidence="high" 
        size="medium" 
        showIcon={true} 
        showLabel={true}
      />
    );
    
    expect(screen.getByText('High Trust')).toBeInTheDocument();
  });

  test('applies correct size styling', () => {
    const { container } = render(
      <TrustScoreDisplay 
        score={85} 
        confidence="high" 
        size="large" 
        showIcon={true} 
      />
    );
    
    const scoreContainer = container.querySelector('div');
    expect(scoreContainer).toHaveStyle('width: 120px');
    expect(scoreContainer).toHaveStyle('height: 120px');
  });
});