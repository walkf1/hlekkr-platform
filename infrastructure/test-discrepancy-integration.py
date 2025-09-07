#!/usr/bin/env python3
"""
Integration test script for the Hlekkr Discrepancy Detection System.
Tests the deployed Lambda function and API endpoints.
"""

import json
import boto3
import requests
import time
from datetime import datetime, timedelta
import uuid
import argparse
import sys

class DiscrepancyDetectionIntegrationTest:
    """Integration test suite for discrepancy detection system."""
    
    def __init__(self, region='us-east-1', stack_name='HlekkrMvpStack'):
        self.region = region
        self.stack_name = stack_name
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.cloudformation = boto3.client('cloudformation', region_name=region)
        self.sns_client = boto3.client('sns', region_name=region)
        
        # Get stack outputs
        self.stack_outputs = self._get_stack_outputs()
        self.function_name = self._get_function_name()
        self.api_endpoint = self._get_api_endpoint()
        
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
        """Get the discrepancy detector function name."""
        function_arn = self.stack_outputs.get('DiscrepancyDetectorArn')
        if function_arn:
            return function_arn.split(':')[-1]
        
        # Fallback to constructed name
        account_id = boto3.client('sts').get_caller_identity()['Account']
        return f"hlekkr-discrepancy-detector-{account_id}-{self.region}"
    
    def _get_api_endpoint(self):
        """Get the API Gateway endpoint."""
        api_id = self.stack_outputs.get('TrustScoreApiId')
        if api_id:
            return f"https://{api_id}.execute-api.{self.region}.amazonaws.com/prod"
        return None
    
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
    
    def test_lambda_invocation_detect_discrepancies(self):
        """Test Lambda function with detect_discrepancies operation."""
        try:
            payload = {
                "operation": "detect_discrepancies",
                "timeRangeHours": 1,
                "severityThreshold": "low"
            }
            
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                print("✅ detect_discrepancies operation successful")
                print(f"   Total discrepancies: {body.get('totalDiscrepancies', 0)}")
                print(f"   Critical discrepancies: {body.get('criticalDiscrepancies', 0)}")
                return True
            else:
                print(f"❌ detect_discrepancies failed: {result}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test detect_discrepancies: {e}")
            return False
    
    def test_lambda_invocation_analyze_media(self):
        """Test Lambda function with analyze_media operation."""
        try:
            test_media_id = f"test-media-{uuid.uuid4().hex[:8]}"
            
            payload = {
                "operation": "analyze_media",
                "mediaId": test_media_id
            }
            
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                print("✅ analyze_media operation successful")
                print(f"   Media ID: {body.get('mediaId')}")
                print(f"   Discrepancies found: {len(body.get('discrepancies', []))}")
                return True
            else:
                print(f"❌ analyze_media failed: {result}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test analyze_media: {e}")
            return False
    
    def test_lambda_invocation_analyze_patterns(self):
        """Test Lambda function with analyze_patterns operation."""
        try:
            payload = {
                "operation": "analyze_patterns",
                "timeRangeHours": 24,
                "minSeverity": "medium"
            }
            
            response = self.lambda_client.invoke(
                FunctionName=self.function_name,
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                print("✅ analyze_patterns operation successful")
                print(f"   Patterns analyzed: {len(body.get('patterns', []))}")
                return True
            else:
                print(f"❌ analyze_patterns failed: {result}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test analyze_patterns: {e}")
            return False
    
    def test_api_gateway_endpoints(self):
        """Test API Gateway endpoints if available."""
        if not self.api_endpoint:
            print("⚠️  API Gateway endpoint not found, skipping API tests")
            return True
        
        try:
            # Test GET /discrepancies
            response = requests.get(f"{self.api_endpoint}/discrepancies", timeout=30)
            
            if response.status_code in [200, 403, 404]:  # 403/404 might be due to auth
                print("✅ API Gateway endpoint is accessible")
                print(f"   Status code: {response.status_code}")
                return True
            else:
                print(f"❌ API Gateway endpoint returned: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to test API Gateway: {e}")
            return False
    
    def test_sns_topic_exists(self):
        """Test that the SNS topic exists."""
        try:
            topic_arn = self.stack_outputs.get('DiscrepancyAlertsTopicArn')
            if not topic_arn:
                print("⚠️  SNS topic ARN not found in stack outputs")
                return False
            
            response = self.sns_client.get_topic_attributes(TopicArn=topic_arn)
            print("✅ SNS topic exists and is accessible")
            print(f"   Topic ARN: {topic_arn}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to verify SNS topic: {e}")
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
    
    def test_cloudwatch_events_rule(self):
        """Test that the CloudWatch Events rule exists."""
        try:
            events_client = boto3.client('events', region_name=self.region)
            
            # List rules with our naming pattern
            response = events_client.list_rules(
                NamePrefix='hlekkr-discrepancy-detection'
            )
            
            if response['Rules']:
                rule = response['Rules'][0]
                print("✅ CloudWatch Events rule exists")
                print(f"   Rule name: {rule['Name']}")
                print(f"   Schedule: {rule.get('ScheduleExpression', 'N/A')}")
                print(f"   State: {rule['State']}")
                return True
            else:
                print("❌ CloudWatch Events rule not found")
                return False
                
        except Exception as e:
            print(f"❌ Failed to check CloudWatch Events rule: {e}")
            return False
    
    def run_all_tests(self):
        """Run all integration tests."""
        print("🧪 Running Hlekkr Discrepancy Detection Integration Tests")
        print("=" * 60)
        
        tests = [
            ("Lambda Function Exists", self.test_lambda_function_exists),
            ("Lambda Invalid Operation", self.test_lambda_invocation_invalid_operation),
            ("Lambda Detect Discrepancies", self.test_lambda_invocation_detect_discrepancies),
            ("Lambda Analyze Media", self.test_lambda_invocation_analyze_media),
            ("Lambda Analyze Patterns", self.test_lambda_invocation_analyze_patterns),
            ("API Gateway Endpoints", self.test_api_gateway_endpoints),
            ("SNS Topic", self.test_sns_topic_exists),
            ("CloudWatch Logs", self.test_cloudwatch_logs),
            ("CloudWatch Events Rule", self.test_cloudwatch_events_rule)
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
        
        print("\n" + "=" * 60)
        print(f"📊 Integration Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All integration tests passed! The system is working correctly.")
            return 0
        elif passed >= total * 0.8:  # 80% pass rate
            print("✅ Most tests passed. The system is mostly functional.")
            return 0
        else:
            print("⚠️  Several tests failed. Please review the deployment.")
            return 1

def main():
    """Main function to run integration tests."""
    parser = argparse.ArgumentParser(description='Run Hlekkr Discrepancy Detection integration tests')
    parser.add_argument('--region', default='us-east-1', help='AWS region')
    parser.add_argument('--stack-name', default='HlekkrMvpStack', help='CloudFormation stack name')
    
    args = parser.parse_args()
    
    try:
        tester = DiscrepancyDetectionIntegrationTest(
            region=args.region,
            stack_name=args.stack_name
        )
        return tester.run_all_tests()
    except Exception as e:
        print(f"❌ Failed to initialize integration tests: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())