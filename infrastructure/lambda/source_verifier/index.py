import json
import boto3
import os
import hashlib
import requests
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import logging
from urllib.parse import urlparse, parse_qs
import base64
from dataclasses import dataclass

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
ssm_client = boto3.client('ssm')

# Environment variables
AUDIT_TABLE_NAME = os.environ['AUDIT_TABLE_NAME']
SOURCE_VERIFICATION_TABLE_NAME = os.environ.get('SOURCE_VERIFICATION_TABLE_NAME', '')
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']

# DynamoDB tables
audit_table = dynamodb.Table(AUDIT_TABLE_NAME)
source_verification_table = dynamodb.Table(SOURCE_VERIFICATION_TABLE_NAME) if SOURCE_VERIFICATION_TABLE_NAME else None

@dataclass
class SourceInfo:
    """Data class for source information"""
    url: Optional[str] = None
    domain: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    publication_date: Optional[str] = None
    description: Optional[str] = None
    content_type: Optional[str] = None
    referrer: Optional[str] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None

@dataclass
class VerificationResult:
    """Data class for verification results"""
    status: str  # 'verified', 'unverified', 'suspicious', 'likely_fake'
    confidence: float  # 0.0 to 1.0
    reputation_score: float  # 0.0 to 100.0
    verification_methods: List[str]
    external_sources: List[Dict[str, Any]]
    discrepancies: List[str]
    metadata: Dict[str, Any]

def handler(event, context):
    """
    Lambda function to capture and verify media source information.
    Integrates with external verification services and validates source authenticity.
    """
    try:
        logger.info(f"Processing source verification: {json.dumps(event)}")
        
        # Extract media ID and source information from event
        media_id = event.get('mediaId') or event.get('pathParameters', {}).get('mediaId')
        source_info_data = event.get('sourceInfo', {})
        
        if not media_id:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing mediaId parameter'
                })
            }
        
        # Parse source information
        source_info = parse_source_info(source_info_data)
        
        # Perform source verification
        verification_result = verify_source(source_info, media_id)
        
        # Store verification results
        storage_success = store_verification_result(media_id, source_info, verification_result)
        
        # Create audit trail entry
        create_audit_entry(media_id, source_info, verification_result)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'mediaId': media_id,
                'sourceInfo': source_info.__dict__,
                'verificationResult': {
                    'status': verification_result.status,
                    'confidence': verification_result.confidence,
                    'reputationScore': verification_result.reputation_score,
                    'verificationMethods': verification_result.verification_methods,
                    'discrepancies': verification_result.discrepancies
                },
                'stored': storage_success,
                'timestamp': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error in source verification: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Source verification failed',
                'message': str(e)
            })
        }

def parse_source_info(source_data: Dict[str, Any]) -> SourceInfo:
    """Parse and validate source information from input data."""
    try:
        source_info = SourceInfo(
            url=source_data.get('url'),
            domain=extract_domain(source_data.get('url')),
            title=source_data.get('title'),
            author=source_data.get('author'),
            publication_date=source_data.get('publicationDate'),
            description=source_data.get('description'),
            content_type=source_data.get('contentType'),
            referrer=source_data.get('referrer'),
            user_agent=source_data.get('userAgent'),
            ip_address=source_data.get('ipAddress')
        )
        
        # Validate and sanitize URL
        if source_info.url:
            source_info.url = validate_and_sanitize_url(source_info.url)
            if not source_info.domain:
                source_info.domain = extract_domain(source_info.url)
        
        return source_info
        
    except Exception as e:
        logger.error(f"Error parsing source info: {str(e)}")
        return SourceInfo()

def extract_domain(url: Optional[str]) -> Optional[str]:
    """Extract domain from URL."""
    if not url:
        return None
    
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # Return None if no domain found
        if not domain:
            return None
        
        # Remove port number if present
        if ':' in domain:
            domain = domain.split(':')[0]
        
        # Remove www. prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        
        return domain if domain else None
    except Exception:
        return None

def validate_and_sanitize_url(url: str) -> str:
    """Validate and sanitize URL."""
    try:
        # Basic URL validation
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("Invalid URL format")
        
        # Ensure HTTPS for security
        if parsed.scheme not in ['http', 'https']:
            raise ValueError("Unsupported URL scheme")
        
        return url
    except Exception as e:
        logger.warning(f"URL validation failed: {str(e)}")
        return url

def verify_source(source_info: SourceInfo, media_id: str) -> VerificationResult:
    """Perform comprehensive source verification using multiple methods."""
    try:
        logger.info(f"Verifying source for media {media_id}: {source_info.domain}")
        
        verification_methods = []
        external_sources = []
        discrepancies = []
        
        # 1. Domain reputation check
        domain_reputation = check_domain_reputation(source_info.domain)
        verification_methods.append('domain_reputation')
        
        # 2. URL verification
        url_verification = verify_url_accessibility(source_info.url)
        verification_methods.append('url_accessibility')
        
        # 3. Content verification (if URL accessible)
        content_verification = None
        if url_verification.get('accessible', False):
            content_verification = verify_content_consistency(source_info)
            verification_methods.append('content_consistency')
        
        # 4. External source cross-reference
        external_verification = cross_reference_external_sources(source_info)
        verification_methods.append('external_cross_reference')
        external_sources.extend(external_verification.get('sources', []))
        
        # 5. Metadata validation
        metadata_validation = validate_source_metadata(source_info)
        verification_methods.append('metadata_validation')
        
        # 6. Historical reputation check
        historical_reputation = check_historical_reputation(source_info.domain)
        verification_methods.append('historical_reputation')
        
        # Calculate composite verification score
        verification_score = calculate_verification_score({
            'domain_reputation': domain_reputation,
            'url_verification': url_verification,
            'content_verification': content_verification,
            'external_verification': external_verification,
            'metadata_validation': metadata_validation,
            'historical_reputation': historical_reputation
        })
        
        # Determine verification status
        status = determine_verification_status(verification_score['composite_score'])
        
        # Collect discrepancies
        discrepancies.extend(verification_score.get('discrepancies', []))
        
        return VerificationResult(
            status=status,
            confidence=verification_score['confidence'],
            reputation_score=verification_score['composite_score'],
            verification_methods=verification_methods,
            external_sources=external_sources,
            discrepancies=discrepancies,
            metadata={
                'domain_reputation': domain_reputation,
                'url_verification': url_verification,
                'content_verification': content_verification,
                'external_verification': external_verification,
                'metadata_validation': metadata_validation,
                'historical_reputation': historical_reputation,
                'verification_timestamp': datetime.utcnow().isoformat()
            }
        )
        
    except Exception as e:
        logger.error(f"Error in source verification: {str(e)}")
        return VerificationResult(
            status='error',
            confidence=0.0,
            reputation_score=0.0,
            verification_methods=['error'],
            external_sources=[],
            discrepancies=[f'Verification error: {str(e)}'],
            metadata={'error': str(e)}
        )

def check_domain_reputation(domain: Optional[str]) -> Dict[str, Any]:
    """Check domain reputation using multiple sources."""
    if not domain:
        return {'score': 50.0, 'status': 'unknown', 'sources': []}
    
    try:
        reputation_data = {
            'domain': domain,
            'score': 50.0,  # Default neutral score
            'status': 'unknown',
            'sources': [],
            'categories': [],
            'risk_factors': []
        }
        
        # Check against known trusted domains
        trusted_domains = get_trusted_domains()
        if domain in trusted_domains:
            reputation_data.update({
                'score': 90.0,
                'status': 'trusted',
                'sources': ['trusted_domain_list'],
                'categories': ['news', 'verified_publisher']
            })
            return reputation_data
        
        # Check against known suspicious domains
        suspicious_domains = get_suspicious_domains()
        if domain in suspicious_domains:
            reputation_data.update({
                'score': 10.0,
                'status': 'suspicious',
                'sources': ['suspicious_domain_list'],
                'categories': ['misinformation', 'unverified'],
                'risk_factors': ['known_misinformation_source']
            })
            return reputation_data
        
        # Check domain age and registration info
        domain_info = get_domain_registration_info(domain)
        if domain_info:
            reputation_data['sources'].append('domain_registration')
            
            # Newer domains are slightly less trusted
            if domain_info.get('age_days', 0) < 30:
                reputation_data['score'] -= 10.0
                reputation_data['risk_factors'].append('very_new_domain')
            elif domain_info.get('age_days', 0) < 365:
                reputation_data['score'] -= 5.0
                reputation_data['risk_factors'].append('new_domain')
        
        # Check SSL certificate
        ssl_info = check_ssl_certificate(domain)
        if ssl_info:
            reputation_data['sources'].append('ssl_certificate')
            if ssl_info.get('valid', False):
                reputation_data['score'] += 5.0
            else:
                reputation_data['score'] -= 10.0
                reputation_data['risk_factors'].append('invalid_ssl')
        
        # Determine final status
        if reputation_data['score'] >= 80:
            reputation_data['status'] = 'trusted'
        elif reputation_data['score'] >= 60:
            reputation_data['status'] = 'likely_trusted'
        elif reputation_data['score'] >= 40:
            reputation_data['status'] = 'neutral'
        elif reputation_data['score'] >= 20:
            reputation_data['status'] = 'suspicious'
        else:
            reputation_data['status'] = 'untrusted'
        
        return reputation_data
        
    except Exception as e:
        logger.error(f"Error checking domain reputation: {str(e)}")
        return {
            'domain': domain,
            'score': 50.0,
            'status': 'error',
            'sources': [],
            'error': str(e)
        }

def get_trusted_domains() -> set:
    """Get list of trusted domains from configuration."""
    try:
        # In production, this would come from a parameter store or database
        trusted_domains = {
            'reuters.com', 'ap.org', 'bbc.com', 'cnn.com', 'nytimes.com',
            'washingtonpost.com', 'theguardian.com', 'npr.org', 'pbs.org',
            'abcnews.go.com', 'cbsnews.com', 'nbcnews.com', 'usatoday.com',
            'wsj.com', 'bloomberg.com', 'economist.com', 'time.com',
            'newsweek.com', 'politico.com', 'axios.com'
        }
        return trusted_domains
    except Exception:
        return set()

def get_suspicious_domains() -> set:
    """Get list of known suspicious domains."""
    try:
        # In production, this would come from threat intelligence feeds
        suspicious_domains = {
            'fakenews.com', 'clickbait.net', 'conspiracy.org',
            'misinformation.info', 'propaganda.news'
        }
        return suspicious_domains
    except Exception:
        return set()

def get_domain_registration_info(domain: str) -> Optional[Dict[str, Any]]:
    """Get domain registration information."""
    try:
        # This would integrate with WHOIS services in production
        # For now, return mock data
        return {
            'domain': domain,
            'age_days': 365,  # Mock: 1 year old
            'registrar': 'Unknown',
            'creation_date': '2023-01-01',
            'expiration_date': '2024-01-01'
        }
    except Exception as e:
        logger.error(f"Error getting domain registration info: {str(e)}")
        return None

def check_ssl_certificate(domain: str) -> Optional[Dict[str, Any]]:
    """Check SSL certificate validity."""
    try:
        # This would check actual SSL certificates in production
        # For now, return mock data
        return {
            'domain': domain,
            'valid': True,
            'issuer': 'Let\'s Encrypt',
            'expiration_date': '2024-12-31'
        }
    except Exception as e:
        logger.error(f"Error checking SSL certificate: {str(e)}")
        return None

def verify_url_accessibility(url: Optional[str]) -> Dict[str, Any]:
    """Verify URL accessibility and basic properties."""
    if not url:
        return {'accessible': False, 'reason': 'no_url_provided'}
    
    try:
        # Make a HEAD request to check accessibility
        response = requests.head(url, timeout=10, allow_redirects=True)
        
        return {
            'accessible': response.status_code == 200,
            'status_code': response.status_code,
            'content_type': response.headers.get('content-type', ''),
            'content_length': response.headers.get('content-length'),
            'last_modified': response.headers.get('last-modified'),
            'server': response.headers.get('server', ''),
            'redirects': len(response.history) > 0,
            'final_url': response.url
        }
        
    except requests.exceptions.RequestException as e:
        logger.warning(f"URL accessibility check failed: {str(e)}")
        return {
            'accessible': False,
            'reason': 'request_failed',
            'error': str(e)
        }

def verify_content_consistency(source_info: SourceInfo) -> Optional[Dict[str, Any]]:
    """Verify content consistency between source info and actual content."""
    if not source_info.url:
        return None
    
    try:
        # Fetch content for verification
        response = requests.get(source_info.url, timeout=15)
        if response.status_code != 200:
            return {'consistent': False, 'reason': 'content_not_accessible'}
        
        content = response.text
        consistency_checks = []
        
        # Check title consistency
        if source_info.title:
            title_found = extract_title_from_html(content)
            title_match = calculate_text_similarity(source_info.title, title_found)
            consistency_checks.append({
                'type': 'title',
                'provided': source_info.title,
                'found': title_found,
                'similarity': title_match,
                'consistent': title_match > 0.8
            })
        
        # Check author consistency
        if source_info.author:
            author_found = extract_author_from_html(content)
            if author_found:
                author_match = calculate_text_similarity(source_info.author, author_found)
                consistency_checks.append({
                    'type': 'author',
                    'provided': source_info.author,
                    'found': author_found,
                    'similarity': author_match,
                    'consistent': author_match > 0.8
                })
        
        # Calculate overall consistency
        consistent_checks = [check for check in consistency_checks if check['consistent']]
        overall_consistency = len(consistent_checks) / len(consistency_checks) if consistency_checks else 1.0
        
        return {
            'consistent': overall_consistency > 0.7,
            'consistency_score': overall_consistency,
            'checks': consistency_checks,
            'content_length': len(content)
        }
        
    except Exception as e:
        logger.error(f"Error verifying content consistency: {str(e)}")
        return {
            'consistent': False,
            'reason': 'verification_error',
            'error': str(e)
        }

def extract_title_from_html(html_content: str) -> Optional[str]:
    """Extract title from HTML content."""
    try:
        # Simple regex to extract title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', html_content, re.IGNORECASE)
        if title_match:
            return title_match.group(1).strip()
        return None
    except Exception:
        return None

def extract_author_from_html(html_content: str) -> Optional[str]:
    """Extract author from HTML content."""
    try:
        # Look for common author meta tags
        author_patterns = [
            r'<meta[^>]*name=["\']author["\'][^>]*content=["\']([^"\']+)["\']',
            r'<meta[^>]*property=["\']article:author["\'][^>]*content=["\']([^"\']+)["\']',
            r'<span[^>]*class=["\'][^"\']*author[^"\']*["\'][^>]*>([^<]+)</span>'
        ]
        
        for pattern in author_patterns:
            match = re.search(pattern, html_content, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    except Exception:
        return None

def calculate_text_similarity(text1: str, text2: str) -> float:
    """Calculate similarity between two text strings."""
    if not text1 or not text2:
        return 0.0
    
    try:
        # Simple similarity calculation using common words
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0.0
        
    except Exception:
        return 0.0

def cross_reference_external_sources(source_info: SourceInfo) -> Dict[str, Any]:
    """Cross-reference with external verification sources."""
    try:
        external_sources = []
        verification_score = 50.0  # Default neutral
        
        # Check fact-checking databases (mock implementation)
        fact_check_result = check_fact_checking_databases(source_info)
        if fact_check_result:
            external_sources.append(fact_check_result)
            if fact_check_result.get('verified', False):
                verification_score += 20.0
            elif fact_check_result.get('disputed', False):
                verification_score -= 30.0
        
        # Check news aggregators
        news_aggregator_result = check_news_aggregators(source_info)
        if news_aggregator_result:
            external_sources.append(news_aggregator_result)
            verification_score += news_aggregator_result.get('score_adjustment', 0)
        
        # Check social media mentions
        social_media_result = check_social_media_mentions(source_info)
        if social_media_result:
            external_sources.append(social_media_result)
            verification_score += social_media_result.get('score_adjustment', 0)
        
        return {
            'sources': external_sources,
            'verification_score': max(0, min(100, verification_score)),
            'cross_references_found': len(external_sources)
        }
        
    except Exception as e:
        logger.error(f"Error cross-referencing external sources: {str(e)}")
        return {
            'sources': [],
            'verification_score': 50.0,
            'cross_references_found': 0,
            'error': str(e)
        }

def check_fact_checking_databases(source_info: SourceInfo) -> Optional[Dict[str, Any]]:
    """Check against fact-checking databases."""
    try:
        # Mock implementation - would integrate with real fact-checking APIs
        return {
            'source': 'fact_checking_database',
            'verified': False,
            'disputed': False,
            'confidence': 0.5,
            'details': 'No specific fact-check found for this content'
        }
    except Exception:
        return None

def check_news_aggregators(source_info: SourceInfo) -> Optional[Dict[str, Any]]:
    """Check news aggregators for source mentions."""
    try:
        # Mock implementation - would integrate with news APIs
        return {
            'source': 'news_aggregator',
            'mentions_found': 0,
            'score_adjustment': 0,
            'details': 'No mentions found in major news aggregators'
        }
    except Exception:
        return None

def check_social_media_mentions(source_info: SourceInfo) -> Optional[Dict[str, Any]]:
    """Check social media for source mentions and sentiment."""
    try:
        # Mock implementation - would integrate with social media APIs
        return {
            'source': 'social_media',
            'mentions_count': 0,
            'sentiment': 'neutral',
            'score_adjustment': 0,
            'details': 'Limited social media activity detected'
        }
    except Exception:
        return None

def validate_source_metadata(source_info: SourceInfo) -> Dict[str, Any]:
    """Validate source metadata for consistency and completeness."""
    try:
        validation_results = {
            'complete': True,
            'consistent': True,
            'score': 100.0,
            'issues': []
        }
        
        # Check required fields
        required_fields = ['url', 'domain']
        missing_fields = [field for field in required_fields if not getattr(source_info, field)]
        
        if missing_fields:
            validation_results['complete'] = False
            validation_results['score'] -= len(missing_fields) * 20
            validation_results['issues'].extend([f'Missing {field}' for field in missing_fields])
        
        # Check URL format
        if source_info.url and not re.match(r'^https?://', source_info.url):
            validation_results['consistent'] = False
            validation_results['score'] -= 10
            validation_results['issues'].append('Invalid URL format')
        
        # Check domain consistency
        if source_info.url and source_info.domain:
            extracted_domain = extract_domain(source_info.url)
            if extracted_domain != source_info.domain:
                validation_results['consistent'] = False
                validation_results['score'] -= 15
                validation_results['issues'].append('Domain mismatch between URL and domain field')
        
        # Check publication date format
        if source_info.publication_date:
            try:
                datetime.fromisoformat(source_info.publication_date.replace('Z', '+00:00'))
            except ValueError:
                validation_results['consistent'] = False
                validation_results['score'] -= 5
                validation_results['issues'].append('Invalid publication date format')
        
        validation_results['score'] = max(0, validation_results['score'])
        
        return validation_results
        
    except Exception as e:
        logger.error(f"Error validating source metadata: {str(e)}")
        return {
            'complete': False,
            'consistent': False,
            'score': 0.0,
            'issues': [f'Validation error: {str(e)}']
        }

def check_historical_reputation(domain: Optional[str]) -> Dict[str, Any]:
    """Check historical reputation of the domain."""
    if not domain:
        return {'score': 50.0, 'history': 'unknown'}
    
    try:
        # Mock implementation - would check historical data
        return {
            'domain': domain,
            'score': 75.0,  # Mock score
            'history': 'good',
            'incidents': 0,
            'trust_trend': 'stable',
            'data_points': 10
        }
    except Exception as e:
        logger.error(f"Error checking historical reputation: {str(e)}")
        return {
            'domain': domain,
            'score': 50.0,
            'history': 'unknown',
            'error': str(e)
        }

def calculate_verification_score(verification_data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate composite verification score from all verification methods."""
    try:
        scores = []
        weights = []
        discrepancies = []
        
        # Domain reputation (30% weight)
        domain_rep = verification_data.get('domain_reputation', {})
        if domain_rep and 'score' in domain_rep:
            scores.append(domain_rep['score'])
            weights.append(0.30)
            if domain_rep.get('status') in ['suspicious', 'untrusted']:
                discrepancies.append(f"Domain reputation: {domain_rep.get('status')}")
        
        # URL verification (20% weight)
        url_ver = verification_data.get('url_verification', {})
        if url_ver:
            url_score = 80.0 if url_ver.get('accessible', False) else 20.0
            scores.append(url_score)
            weights.append(0.20)
            if not url_ver.get('accessible', False):
                discrepancies.append("URL not accessible")
        
        # Content verification (25% weight)
        content_ver = verification_data.get('content_verification')
        if content_ver:
            content_score = content_ver.get('consistency_score', 0.5) * 100
            scores.append(content_score)
            weights.append(0.25)
            if not content_ver.get('consistent', True):
                discrepancies.append("Content inconsistency detected")
        
        # External verification (15% weight)
        external_ver = verification_data.get('external_verification', {})
        if external_ver and 'verification_score' in external_ver:
            scores.append(external_ver['verification_score'])
            weights.append(0.15)
        
        # Metadata validation (10% weight)
        metadata_val = verification_data.get('metadata_validation', {})
        if metadata_val and 'score' in metadata_val:
            scores.append(metadata_val['score'])
            weights.append(0.10)
            if metadata_val.get('issues'):
                discrepancies.extend(metadata_val['issues'])
        
        # Calculate weighted average
        if scores and weights:
            # Normalize weights
            total_weight = sum(weights)
            normalized_weights = [w / total_weight for w in weights]
            
            composite_score = sum(score * weight for score, weight in zip(scores, normalized_weights))
            confidence = min(1.0, len(scores) / 5.0)  # Confidence based on data availability
        else:
            composite_score = 50.0  # Default neutral score
            confidence = 0.1  # Low confidence
        
        return {
            'composite_score': max(0, min(100, composite_score)),
            'confidence': confidence,
            'discrepancies': discrepancies,
            'component_scores': {
                'domain_reputation': domain_rep.get('score', 50.0),
                'url_accessibility': url_score if 'url_ver' in locals() else 50.0,
                'content_consistency': content_score if 'content_ver' in locals() and content_ver else 50.0,
                'external_verification': external_ver.get('verification_score', 50.0),
                'metadata_validation': metadata_val.get('score', 50.0)
            }
        }
        
    except Exception as e:
        logger.error(f"Error calculating verification score: {str(e)}")
        return {
            'composite_score': 0.0,
            'confidence': 0.0,
            'discrepancies': [f'Score calculation error: {str(e)}'],
            'component_scores': {}
        }

def determine_verification_status(score: float) -> str:
    """Determine verification status based on composite score."""
    if score >= 80:
        return 'verified'
    elif score >= 60:
        return 'likely_verified'
    elif score >= 40:
        return 'unverified'
    elif score >= 20:
        return 'suspicious'
    else:
        return 'likely_fake'

def store_verification_result(media_id: str, source_info: SourceInfo, verification_result: VerificationResult) -> bool:
    """Store verification results in DynamoDB."""
    try:
        if not source_verification_table:
            logger.error("Source verification table not configured")
            return False
        
        # Prepare verification record
        verification_record = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'sourceInfo': {
                'url': source_info.url,
                'domain': source_info.domain,
                'title': source_info.title,
                'author': source_info.author,
                'publicationDate': source_info.publication_date,
                'description': source_info.description,
                'contentType': source_info.content_type,
                'referrer': source_info.referrer,
                'userAgent': source_info.user_agent,
                'ipAddress': source_info.ip_address
            },
            'verificationResult': {
                'status': verification_result.status,
                'confidence': verification_result.confidence,
                'reputationScore': verification_result.reputation_score,
                'verificationMethods': verification_result.verification_methods,
                'externalSources': verification_result.external_sources,
                'discrepancies': verification_result.discrepancies,
                'metadata': verification_result.metadata
            },
            'ttl': int((datetime.utcnow() + timedelta(days=2555)).timestamp())  # 7 years retention
        }
        
        # Store in DynamoDB
        source_verification_table.put_item(Item=verification_record)
        
        logger.info(f"Source verification stored successfully for {media_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error storing verification result: {str(e)}")
        return False

def create_audit_entry(media_id: str, source_info: SourceInfo, verification_result: VerificationResult):
    """Create audit trail entry for source verification."""
    try:
        audit_event = {
            'mediaId': media_id,
            'timestamp': datetime.utcnow().isoformat(),
            'eventType': 'source_verification',
            'eventSource': 'source_verifier',
            'data': {
                'sourceUrl': source_info.url,
                'sourceDomain': source_info.domain,
                'verificationStatus': verification_result.status,
                'reputationScore': verification_result.reputation_score,
                'confidence': verification_result.confidence,
                'verificationMethods': verification_result.verification_methods,
                'discrepancyCount': len(verification_result.discrepancies),
                'externalSourceCount': len(verification_result.external_sources)
            },
            'userId': 'system',
            'userAgent': 'source-verifier-lambda'
        }
        
        audit_table.put_item(Item=audit_event)
        
    except Exception as e:
        logger.error(f"Error creating audit entry: {str(e)}")

# Additional utility functions for retrieving verification data

def get_source_verification(media_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve source verification data for a media item."""
    try:
        if not source_verification_table:
            return None
        
        response = source_verification_table.get_item(
            Key={'mediaId': media_id}
        )
        
        return response.get('Item')
        
    except Exception as e:
        logger.error(f"Error retrieving source verification: {str(e)}")
        return None

def get_domain_verification_history(domain: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Get verification history for a specific domain."""
    try:
        if not source_verification_table:
            return []
        
        # This would require a GSI on domain in production
        # For now, return empty list
        return []
        
    except Exception as e:
        logger.error(f"Error retrieving domain verification history: {str(e)}")
        return []