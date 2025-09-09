import json
import boto3
from datetime import datetime, timedelta

def lambda_handler(event, context):
    """Monitor Bedrock API usage and costs"""
    
    try:
        cloudwatch = boto3.client('cloudwatch', region_name='eu-central-1')
        
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=24)
        
        models = [
            'anthropic.claude-3-sonnet-20240229-v1:0',
            'anthropic.claude-3-haiku-20240307-v1:0'
        ]
        
        usage_data = {}
        total_cost = 0
        
        for model_id in models:
            metrics = get_model_metrics(cloudwatch, model_id, start_time, end_time)
            cost = calculate_cost(model_id, metrics['input_tokens'], metrics['output_tokens'])
            
            usage_data[model_id] = {**metrics, 'estimated_cost': cost}
            total_cost += cost
        
        print(f"Bedrock Usage - Total Cost: ${total_cost:.4f}")
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'total_estimated_cost': total_cost,
                'models': usage_data,
                'summary': {
                    'total_invocations': sum(m['invocations'] for m in usage_data.values()),
                    'total_input_tokens': sum(m['input_tokens'] for m in usage_data.values())
                }
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def get_model_metrics(cloudwatch, model_id, start_time, end_time):
    metrics = {'invocations': 0, 'input_tokens': 0, 'output_tokens': 0}
    
    try:
        response = cloudwatch.get_metric_statistics(
            Namespace='AWS/Bedrock',
            MetricName='Invocations',
            Dimensions=[{'Name': 'ModelId', 'Value': model_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,
            Statistics=['Sum']
        )
        metrics['invocations'] = sum(point['Sum'] for point in response['Datapoints'])
        
    except Exception as e:
        print(f"Error getting metrics for {model_id}: {str(e)}")
    
    return metrics

def calculate_cost(model_id, input_tokens, output_tokens):
    pricing = {
        'anthropic.claude-3-sonnet-20240229-v1:0': {'input': 0.003, 'output': 0.015},
        'anthropic.claude-3-haiku-20240307-v1:0': {'input': 0.00025, 'output': 0.00125}
    }
    
    model_pricing = pricing.get(model_id, pricing['anthropic.claude-3-sonnet-20240229-v1:0'])
    
    return (input_tokens / 1000) * model_pricing['input'] + (output_tokens / 1000) * model_pricing['output']