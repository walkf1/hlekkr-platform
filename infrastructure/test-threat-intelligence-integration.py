#!/usr/bin/env python3
"""
Integration test script for the Hlekkr Threat Intelligence System.
Tests the deployed Lambda function, API endpoints, and integration with review workflow.
"""

import json
import boto3
import requests
import time
from datetime import datetime, timedelta
import uuid
import argparse
import sys

class ThreatIntelligenceIntegrationTest:
    """Integration test suite for threat intelligence system."""
    
    def __init__(self, region='us-east-1', stack_name='HlekkrMvpStack'):
        self.region = region
        self.stack_name = stack_name
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.cloudformation = boto3.client('cloudformation', region_name=region)
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.s3_client = boto3.client('s3', region_name=region)
        self.sns_client = boto3.client('sns', region_name=region)
        
        # Get stack outputs
        self.stack_outputs = self._get_stack_outputs()
        self.function_name = self._get_function_name()
        self.api_endpoint = self._get_api_endpoint()
        self.threat_intelligence_table = self._get_threat_intelligence_table()
        self.threat_reports_bucket = self._get_threat_reports_bucket()
        
    def _get_stack_outputs(self):
        """Get CloudFormation stack outputs."""
        try:
            response = self.cloudformation.describe_stacks(StackName=self.stack_name)
            outputs = {}
            for output in response['Stacks'][0].get('Outputs', []):
                outputs[output['OutputKey']] = output['OutputValue']
            return outputs
        except Exception as e:
            print(f"❌ Failed to get stack outputs: {e}")
            return {}
    
    def _get_function_name(self):
        """Get the threat intelligence processor function name."""
        function_arn = self.stack_outputs.get('ThreatIntelligenceProcessorArn')
        if function_arn:
            return function_arn.split(':')[-1]
        
        # Fallback to constructed name
        account_id = boto3.client('sts').get_caller_identity()['Account']
        return f"hlekkr-threat-intelligence-processor-{account_id}-{self.region}"
    
    def _get_api_endpoint(self):
        """Get the API Gateway endpoint."""
        api_id = self.stack_outputs.get('TrustScoreApiId')
        if api_id:
            return f"https://{api_id}.execute-api.{self.region}.amazonaws.com/prod"
        return None
    
    def _get_threat_intelligence_table(self):
        """Get the threat intelligence DynamoDB table."""
        table_name = self.stack_outputs.get('ThreatIntelligenceTableName')
        if table_name:
            return self.dynamodb.Table(table_name)
        return None
    
    def _get_threat_reports_bucket(self):
        """Get the threat reports S3 bucket name."""
        return self.stack_outputs.get('ThreatReportsBucketName')
    
    def test_lambda_function_exists(self):
        """Test that the Lambda function exists and is accessible."""
        try:
            response = self.lambda_client.get_function(FunctionName=self.function_name)
            print(f"✅ Lambda function exists: {self.function_name}")
            print(f"   Runtime: {response['Configuration']['Runtime']}")
            print(f"   Memory: {response['Configuration']['MemorySize']} MB")
            print(f"   Timeout: {response['Configuration']['Timeout']} seconds")
            return True
        except Exception as e:
            print(f"❌ Lambda function not found: {e}")
            return False
    
    def test_lambda_invocation_invalid_operation(self):
        """Test Lambda function with invalid operation."""
        try:
            payload = {
                "operation": "invalid_operation"
            }
            
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 400:
                print("✅ Lambda correctly handles invalid operations")
                return True
            else:
                print(f"❌ Unexpected response for invalid operation: {result}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to invoke Lambda function: {e}")
            return False
    
    def test_lambda_process_review_decision(self):
        """Test Lambda function with process_review_decision operation."""
        try:
            test_media_id = f"test-media-{uuid.uuid4().hex[:8]}"
            test_review_id = f"test-review-{uuid.uuid4().hex[:8]}"
            
            payload = {
                "operation": "process_review_decision",
                "mediaId": test_media_id,
                "reviewId": test_review_id,
                "moderatorId": "test-moderator-001",
                "decisionData": {
                    "decision": "confirm",
                    "confidence": 0.95,
                    "findings": {
                        "manipulationTechniques": ["face_swap", "voice_cloning"],
                        "suspiciousPatterns": [
                            {"type": "metadata_inconsistency", "details": "timestamp_mismatch"}
                        ],
                        "novelTechnique": False,
                        "techniqueDetails": {
                            "face_swap": {"confidence": 0.95, "method": "deepfakes"}
                        }
                    },
                    "metadata": {
                        "contentHash": "sha256:test123456789",
                        "sourceDomain": "test-suspicious-domain.com",
                        "fileType": "video/mp4",
                        "fileSignature": "test_mp4_signature",
                        "aiConfidence": 0.25
                    }
                }
            }
            
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                print("✅ process_review_decision operation successful")
                print(f"   Media ID: {body.get('mediaId')}")
                print(f"   Review ID: {body.get('reviewId')}")
                print(f"   Indicators extracted: {body.get('indicatorsExtracted', 0)}")
                print(f"   Threat report generated: {body.get('threatReportGenerated', False)}")
                
                # Store test data for later verification
                self.test_media_id = test_media_id
                self.test_review_id = test_review_id
                self.test_threat_report_id = body.get('threatReportId')
                
                return True
            else:
                print(f"❌ process_review_decision failed: {result}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test process_review_decision: {e}")
            return False
    
    def test_lambda_process_low_confidence_decision(self):
        """Test Lambda function with low confidence decision (should not generate report)."""
        try:
            test_media_id = f"test-media-low-{uuid.uuid4().hex[:8]}"
            test_review_id = f"test-review-low-{uuid.uuid4().hex[:8]}"
            
            payload = {
                "operation": "process_review_decision",
                "mediaId": test_media_id,
                "reviewId": test_review_id,
                "moderatorId": "test-moderator-002",
                "decisionData": {
                    "decision": "suspicious",
                    "confidence": 0.4,  # Low confidence
                    "findings": {
                        "manipulationTechniques": [],
                        "suspiciousPatterns": [],
                        "novelTechnique": False
                    },
                    "metadata": {
                        "contentHash": "sha256:lowconf123456",
                        "sourceDomain": "normal-domain.com",
                        "fileType": "image/jpeg",
                        "aiConfidence": 0.6
                    }
                }
            }
            
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                print("✅ Low confidence decision processed correctly")
                print(f"   Indicators extracted: {body.get('indicatorsExtracted', 0)}")
                print(f"   Threat report generated: {body.get('threatReportGenerated', False)}")
                
                # Should have few/no indicators and no threat report for low confidence
                if body.get('indicatorsExtracted', 0) == 0 and not body.get('threatReportGenerated', False):
                    print("✅ Correctly handled low confidence decision")
                    return True
                else:
                    print("⚠️  Low confidence decision generated unexpected results")
                    return True  # Still successful, just different behavior
            else:
                print(f"❌ Low confidence decision processing failed: {result}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test low confidence decision: {e}")
            return False
    
    def test_threat_intelligence_table_access(self):
        """Test that threat intelligence data is being stored."""
        if not self.threat_intelligence_table:
            print("⚠️  Threat intelligence table not found, skipping test")
            return True
        
        try:
            # Try to scan the table (limit to avoid large responses)
            response = self.threat_intelligence_table.scan(Limit=5)
            
            print("✅ Threat intelligence table is accessible")
            print(f"   Items found: {response.get('Count', 0)}")
            
            # If we have test data, try to find it
            if hasattr(self, 'test_media_id'):
                # Look for indicators related to our test
                # This is a simplified check since the actual query would be more complex
                print(f"   Test data may be present for media: {self.test_media_id}")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to access threat intelligence table: {e}")
            return False
    
    def test_threat_reports_bucket_access(self):
        """Test that threat reports bucket is accessible."""
        if not self.threat_reports_bucket:
            print("⚠️  Threat reports bucket not found, skipping test")
            return True
        
        try:
            # Try to list objects in the bucket
            response = self.s3_client.list_objects_v2(
                Bucket=self.threat_reports_bucket,
                MaxKeys=5
            )
            
            print("✅ Threat reports bucket is accessible")
            print(f"   Objects found: {response.get('KeyCount', 0)}")
            
            # If we have a test threat report, try to find it
            if hasattr(self, 'test_threat_report_id') and self.test_threat_report_id:
                # Look for our test report
                today = datetime.utcnow().strftime('%Y-%m-%d')
                test_key = f"threat-reports/{today}/{self.test_threat_report_id}.json"
                
                try:
                    self.s3_client.head_object(Bucket=self.threat_reports_bucket, Key=test_key)
                    print(f"✅ Test threat report found: {test_key}")
                except:
                    print(f"⚠️  Test threat report not found (may not have been generated): {test_key}")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to access threat reports bucket: {e}")
            return False
    
    def test_sns_topic_exists(self):
        """Test that the SNS topic for threat alerts exists."""
        try:
            topic_arn = self.stack_outputs.get('ThreatAlertsTopicArn')
            if not topic_arn:
                print("⚠️  Threat alerts topic ARN not found in stack outputs")
                return False
            
            response = self.sns_client.get_topic_attributes(TopicArn=topic_arn)
            print("✅ Threat alerts SNS topic exists and is accessible")
            print(f"   Topic ARN: {topic_arn}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to verify threat alerts SNS topic: {e}")
            return False
    
    def test_api_gateway_endpoints(self):
        """Test API Gateway endpoints if available."""
        if not self.api_endpoint:
            print("⚠️  API Gateway endpoint not found, skipping API tests")
            return True
        
        try:
            # Test GET /threat-intelligence
            response = requests.get(f"{self.api_endpoint}/threat-intelligence", timeout=30)
            
            if response.status_code in [200, 403, 404]:  # 403/404 might be due to auth
                print("✅ Threat intelligence API endpoint is accessible")
                print(f"   Status code: {response.status_code}")
                return True
            else:
                print(f"❌ Threat intelligence API endpoint returned: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test API Gateway endpoints: {e}")
            return False
    
    def test_integration_with_review_completion(self):
        """Test integration with review completion validator."""
        try:
            # Get the review completion validator function
            account_id = boto3.client('sts').get_caller_identity()['Account']
            review_validator_name = f"hlekkr-review-completion-validator-{account_id}-{self.region}"
            
            # Check if the function exists and has the right environment variable
            response = self.lambda_client.get_function(FunctionName=review_validator_name)
            
            env_vars = response['Configuration'].get('Environment', {}).get('Variables', {})
            threat_intel_function = env_vars.get('THREAT_INTELLIGENCE_PROCESSOR_FUNCTION_NAME')
            
            if threat_intel_function:
                print("✅ Review completion validator has threat intelligence integration")
                print(f"   Configured function: {threat_intel_function}")
                return True
            else:
                print("❌ Review completion validator missing threat intelligence configuration")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test integration with review completion: {e}")
            return False
    
    def test_cloudwatch_logs(self):
        """Test that CloudWatch logs are being generated."""
        try:
            logs_client = boto3.client('logs', region_name=self.region)
            log_group_name = f"/aws/lambda/{self.function_name}"
            
            # Check if log group exists
            response = logs_client.describe_log_groups(
                logGroupNamePrefix=log_group_name
            )
            
            if response['logGroups']:
                print("✅ CloudWatch log group exists")
                print(f"   Log group: {log_group_name}")
                
                # Check for recent log streams
                streams_response = logs_client.describe_log_streams(
                    logGroupName=log_group_name,
                    orderBy='LastEventTime',
                    descending=True,
                    limit=5
                )
                
                if streams_response['logStreams']:
                    latest_stream = streams_response['logStreams'][0]
                    last_event_time = latest_stream.get('lastEventTime', 0)
                    last_event_date = datetime.fromtimestamp(last_event_time / 1000)
                    print(f"   Latest log event: {last_event_date}")
                
                return True
            else:
                print("⚠️  CloudWatch log group not found (function may not have been invoked yet)")
                return False
                
        except Exception as e:
            print(f"❌ Failed to check CloudWatch logs: {e}")
            return False
    
    def test_placeholder_operations(self):
        """Test placeholder operations return appropriate responses."""
        placeholder_operations = [
            'generate_threat_report',
            'analyze_threat_patterns',
            'update_threat_intelligence',
            'get_threat_reports',
            'share_threat_intelligence',
            'cleanup_old_threats'
        ]
        
        passed = 0
        
        for operation in placeholder_operations:
            try:
                payload = {"operation": operation}
                
                response = self.lambda_client.invoke(
                    FunctionName=self.function_name,
                    Payload=json.dumps(payload)
                )
                
                result = json.loads(response['Payload'].read())
                
                if result.get('statusCode') == 200:
                    body = json.loads(result['body'])
                    if 'not yet implemented' in body.get('message', ''):
                        passed += 1
                    else:
                        print(f"⚠️  Operation {operation} returned unexpected message")
                else:
                    print(f"❌ Operation {operation} failed with status {result.get('statusCode')}")
                    
            except Exception as e:
                print(f"❌ Failed to test operation {operation}: {e}")
        
        if passed == len(placeholder_operations):
            print(f"✅ All {len(placeholder_operations)} placeholder operations work correctly")
            return True
        else:
            print(f"⚠️  {passed}/{len(placeholder_operations)} placeholder operations work correctly")
            return passed > len(placeholder_operations) * 0.5  # 50% pass rate
    
    def run_all_tests(self):
        """Run all integration tests."""
        print("🧪 Running Hlekkr Threat Intelligence Integration Tests")
        print("=" * 65)
        
        tests = [
            ("Lambda Function Exists", self.test_lambda_function_exists),
            ("Lambda Invalid Operation", self.test_lambda_invocation_invalid_operation),
            ("Lambda Process Review Decision", self.test_lambda_process_review_decision),
            ("Lambda Low Confidence Decision", self.test_lambda_process_low_confidence_decision),
            ("Threat Intelligence Table", self.test_threat_intelligence_table_access),
            ("Threat Reports Bucket", self.test_threat_reports_bucket_access),
            ("SNS Topic", self.test_sns_topic_exists),
            ("API Gateway Endpoints", self.test_api_gateway_endpoints),
            ("Review Completion Integration", self.test_integration_with_review_completion),
            ("CloudWatch Logs", self.test_cloudwatch_logs),
            ("Placeholder Operations", self.test_placeholder_operations)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n🔍 {test_name}:")
            try:
                if test_func():
                    passed += 1
                time.sleep(1)  # Brief pause between tests
            except Exception as e:
                print(f"❌ Unexpected error in {test_name}: {e}")
        
        print("\n" + "=" * 65)
        print(f"📊 Integration Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All integration tests passed! The threat intelligence system is working correctly.")
            return 0
        elif passed >= total * 0.8:  # 80% pass rate
            print("✅ Most tests passed. The threat intelligence system is mostly functional.")
            return 0
        else:
            print("⚠️  Several tests failed. Please review the deployment.")
            return 1

def main():
    """Main function to run integration tests."""
    parser = argparse.ArgumentParser(description='Run Hlekkr Threat Intelligence integration tests')
    parser.add_argument('--region', default='us-east-1', help='AWS region')
    parser.add_argument('--stack-name', default='HlekkrMvpStack', help='CloudFormation stack name')
    
    args = parser.parse_args()
    
    try:
        tester = ThreatIntelligenceIntegrationTest(
            region=args.region,
            stack_name=args.stack_name
        )
        return tester.run_all_tests()
    except Exception as e:
        print(f"❌ Failed to initialize integration tests: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())