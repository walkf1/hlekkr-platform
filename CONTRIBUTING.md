# Contributing to Hlekkr

Thank you for your interest in contributing to Hlekkr! This document provides guidelines and information for contributors.

## 🎯 Project Vision

Hlekkr is dedicated to combating misinformation through advanced deepfake detection and media verification. We welcome contributions that advance this mission while maintaining high standards of code quality, security, and user experience.

## 🤝 How to Contribute

Please Note: Kiro Hackathon Judging Period

This project is currently under review for the 2025 Code with Kiro Hackathon.

To ensure the integrity of our submission and to provide a stable codebase for the judges, we will be temporarily pausing the merge of any external pull requests until the judging period is complete (late September 2025).

We still encourage you to open issues, report bugs, and suggest features. We will actively review them and will resume merging community contributions after the hackathon. Thank you for your understanding.
### Types of Contributions

We welcome various types of contributions:

- **Bug Reports**: Help us identify and fix issues
- **Feature Requests**: Suggest new capabilities or improvements
- **Code Contributions**: Submit bug fixes, new features, or optimizations
- **Documentation**: Improve guides, API docs, or code comments
- **Testing**: Add test cases or improve test coverage
- **Security**: Report vulnerabilities or improve security measures

### Getting Started

1. **Fork the Repository**
   ```bash
   git clone https://github.com/your-username/hlekkr-platform.git
   cd hlekkr-platform
   ```

2. **Set Up Development Environment**
   ```bash
   # Install dependencies
   cd infrastructure
   npm install
   
   # Set up Python environment for Lambda functions
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements-dev.txt
   ```

3. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-description
   ```

## 📋 Development Guidelines

### Code Standards

#### TypeScript/JavaScript
- Use TypeScript for all infrastructure code
- Follow ESLint and Prettier configurations
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

```typescript
/**
 * Calculate trust score for media content
 * @param mediaId - Unique identifier for the media
 * @param analysisData - Analysis results from various detectors
 * @returns Promise resolving to trust score object
 */
async function calculateTrustScore(
  mediaId: string, 
  analysisData: AnalysisData
): Promise<TrustScore> {
  // Implementation
}
```

#### Python
- Follow PEP 8 style guidelines
- Use type hints where appropriate
- Add docstrings for all functions and classes
- Use meaningful variable names

```python
def analyze_deepfake(media_id: str, media_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze media for deepfake indicators.
    
    Args:
        media_id: Unique identifier for the media
        media_info: Metadata and location information
        
    Returns:
        Dictionary containing analysis results and confidence scores
    """
    # Implementation
```

### Testing Requirements

#### Unit Tests
- All new functions must have unit tests
- Aim for >80% code coverage
- Use descriptive test names
- Test both success and failure scenarios

```python
def test_calculate_trust_score_high_confidence():
    """Test trust score calculation with high confidence data."""
    # Test implementation
```

#### Integration Tests
- Test end-to-end workflows
- Verify AWS service integrations
- Test error handling and recovery

### Security Guidelines

#### Data Protection
- Never log sensitive information
- Use encryption for data at rest and in transit
- Implement proper access controls
- Follow principle of least privilege

#### Input Validation
- Validate all user inputs
- Sanitize data before processing
- Use parameterized queries
- Implement rate limiting

```python
def validate_media_id(media_id: str) -> bool:
    """Validate media ID format and safety."""
    if not media_id or len(media_id) > 100:
        return False
    
    # Check for valid characters only
    import re
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', media_id))
```

### Performance Guidelines

#### Lambda Functions
- Keep functions focused and lightweight
- Use connection pooling for database connections
- Implement proper error handling and retries
- Monitor memory usage and execution time

#### Infrastructure
- Use appropriate instance sizes
- Implement auto-scaling where needed
- Optimize database queries
- Use caching strategically

## 🔄 Pull Request Process

### Before Submitting

1. **Run Tests**
   ```bash
   # Run unit tests
   npm test
   python -m pytest
   
   # Run integration tests
   npm run test:integration
   
   # Check code formatting
   npm run lint
   black --check .
   ```

2. **Update Documentation**
   - Update README.md if needed
   - Add/update API documentation
   - Update CHANGELOG.md

3. **Security Check**
   - Run security scans
   - Review for sensitive data exposure
   - Check dependencies for vulnerabilities

### Pull Request Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Security
- [ ] No sensitive data exposed
- [ ] Input validation implemented
- [ ] Security scan passed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### Review Process

1. **Automated Checks**: All CI/CD checks must pass
2. **Code Review**: At least one maintainer review required
3. **Security Review**: Security-sensitive changes need security team review
4. **Testing**: Comprehensive testing in staging environment

## 🐛 Bug Reports

### Before Reporting
- Search existing issues to avoid duplicates
- Try to reproduce the issue
- Gather relevant information

### Bug Report Template

```markdown
**Bug Description**
Clear and concise description of the bug.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment**
- OS: [e.g. macOS, Windows, Linux]
- Browser: [e.g. Chrome, Safari]
- Version: [e.g. 1.0.0]

**Additional Context**
Any other context about the problem.
```

## 💡 Feature Requests

### Feature Request Template

```markdown
**Feature Description**
Clear and concise description of the feature.

**Problem Statement**
What problem does this feature solve?

**Proposed Solution**
Describe your proposed solution.

**Alternatives Considered**
Other solutions you've considered.

**Additional Context**
Any other context, mockups, or examples.
```

## 🏗️ Architecture Decisions

### Adding New Components

When adding new components, consider:

1. **Scalability**: Will it handle expected load?
2. **Security**: Does it introduce new attack vectors?
3. **Maintainability**: Is it easy to understand and modify?
4. **Cost**: What are the operational costs?
5. **Integration**: How does it fit with existing components?

### Technology Choices

- **AWS Services**: Prefer managed services when possible
- **Open Source**: Use established, well-maintained libraries
- **Security**: Choose security-first solutions
- **Performance**: Consider performance implications

## 📚 Documentation Standards

### Code Documentation
- Use clear, descriptive comments
- Document complex algorithms
- Explain business logic
- Include examples where helpful

### API Documentation
- Use OpenAPI/Swagger specifications
- Include request/response examples
- Document error codes and messages
- Provide usage examples

### User Documentation
- Write for your audience (developers, operators, end-users)
- Use clear, simple language
- Include step-by-step instructions
- Add screenshots and diagrams where helpful

## 🚀 Release Process

### Version Numbering
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist
- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Security review completed
- [ ] Performance testing completed
- [ ] Staging deployment successful

## 🆘 Getting Help

### Community Support
- **GitHub Discussions**: For general questions and discussions
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check our comprehensive docs first

### Maintainer Contact
- **Email**: maintainers@hlekkr.com
- **Security Issues**: security@hlekkr.com (for security vulnerabilities)

## 📜 Code of Conduct

### Our Pledge
We are committed to making participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards
Examples of behavior that contributes to creating a positive environment include:
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

### Enforcement
Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting the project team at conduct@hlekkr.com.

## 🙏 Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes for significant contributions
- Annual contributor highlights

Thank you for contributing to Hlekkr and helping make the internet a more trustworthy place! 🎉
