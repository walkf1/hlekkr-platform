import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

export class BillingAlarmsStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SNS Topic for billing alerts
    const billingTopic = new sns.Topic(this, 'BillingAlerts', {
      displayName: 'Hlekkr Billing Alerts'
    });

    // Email subscription (replace with actual email)
    billingTopic.addSubscription(
      new subscriptions.EmailSubscription(process.env.ALERT_EMAIL || 'admin@hlekkr.com')
    );

    // $50 Warning Alarm
    new cloudwatch.Alarm(this, 'BillingAlarm50', {
      alarmName: 'Hlekkr-Billing-50USD',
      alarmDescription: 'Billing alarm when charges exceed $50',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6)
      }),
      threshold: 50,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    }).addAlarmAction(new cloudwatch.SnsAction(billingTopic));

    // $100 Critical Alarm
    new cloudwatch.Alarm(this, 'BillingAlarm100', {
      alarmName: 'Hlekkr-Billing-100USD-CRITICAL',
      alarmDescription: 'CRITICAL: Billing charges exceed $100',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.hours(1)
      }),
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    }).addAlarmAction(new cloudwatch.SnsAction(billingTopic));

    // $200 Emergency Alarm
    new cloudwatch.Alarm(this, 'BillingAlarm200', {
      alarmName: 'Hlekkr-Billing-200USD-EMERGENCY',
      alarmDescription: 'EMERGENCY: Billing charges exceed $200 - IMMEDIATE ACTION REQUIRED',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(30)
      }),
      threshold: 200,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    }).addAlarmAction(new cloudwatch.SnsAction(billingTopic));
  }
}