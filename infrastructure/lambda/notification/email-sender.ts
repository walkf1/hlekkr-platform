import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendTemplatedEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';

// Initialize AWS clients with connection reuse
const sesClient = new SESClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

const dynamoClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

// Environment variables validation
const FROM_EMAIL = process.env.FROM_EMAIL;
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE;
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';

if (!FROM_EMAIL || !NOTIFICATIONS_TABLE) {
  throw new Error('Missing required environment variables: FROM_EMAIL, NOTIFICATIONS_TABLE');
}

// Email templates
const EMAIL_TEMPLATES = {
  ANALYSIS_COMPLETE: {
    subject: 'Media Analysis Complete - {{mediaFileName}}',
    template: 'analysis-complete',
  },
  ANALYSIS_FAILED: {
    subject: 'Media Analysis Failed - {{mediaFileName}}',
    template: 'analysis-failed',
  },
  REVIEW_REQUIRED: {
    subject: 'Human Review Required - {{mediaFileName}}',
    template: 'review-required',
  },
  ACCOUNT_CREATED: {
    subject: 'Welcome to Hlekkr Media Analysis Platform',
    template: 'account-created',
  },
  PASSWORD_RESET: {
    subject: 'Password Reset Request',
    template: 'password-reset',
  },
  SECURITY_ALERT: {
    subject: 'Security Alert - {{alertType}}',
    template: 'security-alert',
  },
} as const;

interface EmailNotification {
  notificationId: string;
  type: keyof typeof EMAIL_TEMPLATES;
  recipient: string;
  templateData: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduledFor?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

interface NotificationRecord {
  notificationId: string;
  type: string;
  recipient: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'complained';
  createdAt: string;
  sentAt?: string;
  failureReason?: string;
  messageId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

/**
 * AWS Lambda handler for email notification processing
 * Processes SQS messages containing email notification requests
 * 
 * @param event - SQS event containing notification messages
 * @param context - Lambda execution context
 */
export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  const correlationId = context.awsRequestId;
  
  console.log('Email notification batch:', {
    messageCount: event.Records.length,
    correlationId,
  });

  // Process messages in parallel with controlled concurrency
  const results = await Promise.allSettled(
    event.Records.map(record => processNotificationMessage(record, correlationId))
  );

  // Log results
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log('Email notification batch completed:', {
    total: event.Records.length,
    successful,
    failed,
    correlationId,
  });

  // If any messages failed, log details but don't throw (let SQS handle retries)
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('Message processing failed:', {
        messageId: event.Records[index].messageId,
        error: result.reason,
        correlationId,
      });
    }
  });
};

/**
 * Process individual notification message
 */
async function processNotificationMessage(record: SQSRecord, correlationId: string): Promise<void> {
  try {
    const notification: EmailNotification = JSON.parse(record.body);
    
    console.log('Processing notification:', {
      notificationId: notification.notificationId,
      type: notification.type,
      recipient: notification.recipient,
      correlationId,
    });

    // Validate notification
    const validation = validateNotification(notification);
    if (!validation.valid) {
      throw new Error(`Invalid notification: ${validation.error}`);
    }

    // Create notification record
    await createNotificationRecord(notification, correlationId);

    // Check if scheduled for future
    if (notification.scheduledFor) {
      const scheduledTime = new Date(notification.scheduledFor);
      if (scheduledTime > new Date()) {
        console.log('Notification scheduled for future, skipping for now:', {
          notificationId: notification.notificationId,
          scheduledFor: notification.scheduledFor,
          correlationId,
        });
        return;
      }
    }

    // Send email
    await sendEmail(notification, correlationId);

  } catch (error) {
    console.error('Notification processing error:', error, {
      messageId: record.messageId,
      correlationId,
    });
    
    // Update notification record with failure
    try {
      const notification: EmailNotification = JSON.parse(record.body);
      await updateNotificationStatus(
        notification.notificationId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } catch (updateError) {
      console.error('Failed to update notification status:', updateError);
    }
    
    throw error; // Re-throw to trigger SQS retry
  }
}

/**
 * Send email notification
 */
async function sendEmail(notification: EmailNotification, correlationId: string): Promise<void> {
  try {
    const template = EMAIL_TEMPLATES[notification.type];
    if (!template) {
      throw new Error(`Unknown notification type: ${notification.type}`);
    }

    // Prepare email content
    const subject = replaceTemplateVariables(template.subject, notification.templateData);
    
    let messageId: string;

    // Check if we have a custom template or use simple email
    if (template.template && ENVIRONMENT !== 'development') {
      // Use SES template (for production)
      const result = await sesClient.send(new SendTemplatedEmailCommand({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: [notification.recipient],
        },
        Template: template.template,
        TemplateData: JSON.stringify(notification.templateData),
        Tags: [
          { Name: 'NotificationType', Value: notification.type },
          { Name: 'Priority', Value: notification.priority },
          { Name: 'CorrelationId', Value: correlationId },
        ],
      }));
      
      messageId = result.MessageId!;
    } else {
      // Use simple email (for development or fallback)
      const htmlBody = generateEmailHtml(notification.type, notification.templateData);
      const textBody = generateEmailText(notification.type, notification.templateData);
      
      const result = await sesClient.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: [notification.recipient],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textBody,
              Charset: 'UTF-8',
            },
          },
        },
        Tags: [
          { Name: 'NotificationType', Value: notification.type },
          { Name: 'Priority', Value: notification.priority },
          { Name: 'CorrelationId', Value: correlationId },
        ],
      }));
      
      messageId = result.MessageId!;
    }

    // Update notification record with success
    await updateNotificationStatus(notification.notificationId, 'sent', undefined, messageId);

    console.log('Email sent successfully:', {
      notificationId: notification.notificationId,
      messageId,
      recipient: notification.recipient,
      correlationId,
    });

  } catch (error) {
    console.error('Email sending failed:', error, {
      notificationId: notification.notificationId,
      correlationId,
    });
    
    // Update notification record with failure
    await updateNotificationStatus(
      notification.notificationId,
      'failed',
      error instanceof Error ? error.message : 'Unknown error'
    );
    
    throw error;
  }
}

/**
 * Validate notification data
 */
function validateNotification(notification: EmailNotification): { valid: boolean; error?: string } {
  if (!notification.notificationId) {
    return { valid: false, error: 'notificationId is required' };
  }
  
  if (!notification.type || !EMAIL_TEMPLATES[notification.type]) {
    return { valid: false, error: 'Invalid notification type' };
  }
  
  if (!notification.recipient || !isValidEmail(notification.recipient)) {
    return { valid: false, error: 'Valid recipient email is required' };
  }
  
  if (!notification.templateData) {
    return { valid: false, error: 'templateData is required' };
  }
  
  return { valid: true };
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Replace template variables in string
 */
function replaceTemplateVariables(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
}

/**
 * Generate HTML email content
 */
function generateEmailHtml(type: keyof typeof EMAIL_TEMPLATES, data: Record<string, any>): string {
  const baseStyle = `
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
      .content { padding: 20px; background: #f9fafb; }
      .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
      .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; }
    </style>
  `;

  switch (type) {
    case 'ANALYSIS_COMPLETE':
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Analysis Complete</h1>
          </div>
          <div class="content">
            <p>Your media analysis for <strong>${data.mediaFileName}</strong> has been completed successfully.</p>
            <p><strong>Trust Score:</strong> ${data.trustScore || 'N/A'}</p>
            <p><strong>Analysis Results:</strong></p>
            <ul>
              <li>Deepfake Detection: ${data.deepfakeScore || 'N/A'}</li>
              <li>Source Verification: ${data.sourceVerified ? 'Verified' : 'Not Verified'}</li>
              <li>Metadata Analysis: ${data.metadataIntegrity || 'N/A'}</li>
            </ul>
            <p><a href="${data.resultsUrl}" class="button">View Results</a></p>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;

    case 'ANALYSIS_FAILED':
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Analysis Failed</h1>
          </div>
          <div class="content">
            <p>Unfortunately, the analysis for <strong>${data.mediaFileName}</strong> could not be completed.</p>
            <p><strong>Error:</strong> ${data.errorMessage || 'Unknown error occurred'}</p>
            <p>Please try uploading the file again or contact support if the issue persists.</p>
            <p><a href="${data.supportUrl}" class="button">Contact Support</a></p>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;

    case 'REVIEW_REQUIRED':
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Human Review Required</h1>
          </div>
          <div class="content">
            <p>The analysis for <strong>${data.mediaFileName}</strong> requires human review.</p>
            <p><strong>Reason:</strong> ${data.reviewReason || 'Inconclusive automated analysis'}</p>
            <p>A human moderator will review this content and provide additional insights.</p>
            <p><a href="${data.reviewUrl}" class="button">View Review Queue</a></p>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;

    case 'ACCOUNT_CREATED':
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Welcome to Hlekkr</h1>
          </div>
          <div class="content">
            <p>Welcome to the Hlekkr Media Analysis Platform, ${data.userName || 'User'}!</p>
            <p>Your account has been successfully created. You can now start analyzing media content for authenticity and trustworthiness.</p>
            <p><strong>Getting Started:</strong></p>
            <ul>
              <li>Upload your first media file</li>
              <li>Explore the analysis dashboard</li>
              <li>Set up your preferences</li>
            </ul>
            <p><a href="${data.dashboardUrl}" class="button">Go to Dashboard</a></p>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;

    case 'PASSWORD_RESET':
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Password Reset</h1>
          </div>
          <div class="content">
            <p>You requested a password reset for your Hlekkr account.</p>
            <p>Use the following code to reset your password: <strong>${data.resetCode}</strong></p>
            <p>This code will expire in 15 minutes.</p>
            <p><a href="${data.resetUrl}" class="button">Reset Password</a></p>
            <p>If you didn't request this reset, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;

    case 'SECURITY_ALERT':
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Security Alert</h1>
          </div>
          <div class="content">
            <p><strong>Security Alert:</strong> ${data.alertType}</p>
            <p>${data.alertMessage}</p>
            <p><strong>Time:</strong> ${data.timestamp}</p>
            <p><strong>IP Address:</strong> ${data.ipAddress || 'Unknown'}</p>
            <p>If this wasn't you, please secure your account immediately.</p>
            <p><a href="${data.securityUrl}" class="button">Review Security</a></p>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;

    default:
      return `
        ${baseStyle}
        <div class="container">
          <div class="header">
            <h1>Notification</h1>
          </div>
          <div class="content">
            <p>You have a new notification from Hlekkr Media Analysis Platform.</p>
            <pre>${JSON.stringify(data, null, 2)}</pre>
          </div>
          <div class="footer">
            <p>Hlekkr Media Analysis Platform</p>
          </div>
        </div>
      `;
  }
}

/**
 * Generate plain text email content
 */
function generateEmailText(type: keyof typeof EMAIL_TEMPLATES, data: Record<string, any>): string {
  switch (type) {
    case 'ANALYSIS_COMPLETE':
      return `
Hlekkr Media Analysis - Analysis Complete

Your media analysis for "${data.mediaFileName}" has been completed successfully.

Trust Score: ${data.trustScore || 'N/A'}
Deepfake Detection: ${data.deepfakeScore || 'N/A'}
Source Verification: ${data.sourceVerified ? 'Verified' : 'Not Verified'}
Metadata Analysis: ${data.metadataIntegrity || 'N/A'}

View Results: ${data.resultsUrl}

Hlekkr Media Analysis Platform
      `;

    case 'ANALYSIS_FAILED':
      return `
Hlekkr Media Analysis - Analysis Failed

Unfortunately, the analysis for "${data.mediaFileName}" could not be completed.

Error: ${data.errorMessage || 'Unknown error occurred'}

Please try uploading the file again or contact support if the issue persists.

Contact Support: ${data.supportUrl}

Hlekkr Media Analysis Platform
      `;

    case 'REVIEW_REQUIRED':
      return `
Hlekkr Media Analysis - Human Review Required

The analysis for "${data.mediaFileName}" requires human review.

Reason: ${data.reviewReason || 'Inconclusive automated analysis'}

A human moderator will review this content and provide additional insights.

View Review Queue: ${data.reviewUrl}

Hlekkr Media Analysis Platform
      `;

    case 'ACCOUNT_CREATED':
      return `
Welcome to Hlekkr Media Analysis Platform

Welcome ${data.userName || 'User'}!

Your account has been successfully created. You can now start analyzing media content for authenticity and trustworthiness.

Getting Started:
- Upload your first media file
- Explore the analysis dashboard  
- Set up your preferences

Go to Dashboard: ${data.dashboardUrl}

Hlekkr Media Analysis Platform
      `;

    case 'PASSWORD_RESET':
      return `
Hlekkr Media Analysis - Password Reset

You requested a password reset for your Hlekkr account.

Reset Code: ${data.resetCode}

This code will expire in 15 minutes.

Reset Password: ${data.resetUrl}

If you didn't request this reset, please ignore this email.

Hlekkr Media Analysis Platform
      `;

    case 'SECURITY_ALERT':
      return `
Hlekkr Media Analysis - Security Alert

Security Alert: ${data.alertType}

${data.alertMessage}

Time: ${data.timestamp}
IP Address: ${data.ipAddress || 'Unknown'}

If this wasn't you, please secure your account immediately.

Review Security: ${data.securityUrl}

Hlekkr Media Analysis Platform
      `;

    default:
      return `
Hlekkr Media Analysis - Notification

You have a new notification from Hlekkr Media Analysis Platform.

${JSON.stringify(data, null, 2)}

Hlekkr Media Analysis Platform
      `;
  }
}

/**
 * Create notification record in DynamoDB
 */
async function createNotificationRecord(notification: EmailNotification, correlationId: string): Promise<void> {
  try {
    const record: NotificationRecord = {
      notificationId: notification.notificationId,
      type: notification.type,
      recipient: notification.recipient,
      status: 'pending',
      createdAt: new Date().toISOString(),
      correlationId,
      metadata: notification.metadata,
    };

    await dynamoClient.send(new PutItemCommand({
      TableName: NOTIFICATIONS_TABLE,
      Item: marshall(record),
      ConditionExpression: 'attribute_not_exists(notificationId)',
    }));
  } catch (error) {
    console.error('Error creating notification record:', error);
    throw error;
  }
}

/**
 * Update notification status in DynamoDB
 */
async function updateNotificationStatus(
  notificationId: string,
  status: NotificationRecord['status'],
  failureReason?: string,
  messageId?: string
): Promise<void> {
  try {
    const updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
    const expressionAttributeNames: Record<string, string> = { '#status': 'status' };
    const expressionAttributeValues: Record<string, any> = {
      ':status': status,
      ':updatedAt': new Date().toISOString(),
    };

    if (status === 'sent' && messageId) {
      updateExpression += ', sentAt = :sentAt, messageId = :messageId';
      expressionAttributeValues[':sentAt'] = new Date().toISOString();
      expressionAttributeValues[':messageId'] = messageId;
    }

    if (status === 'failed' && failureReason) {
      updateExpression += ', failureReason = :failureReason';
      expressionAttributeValues[':failureReason'] = failureReason;
    }

    await dynamoClient.send(new UpdateItemCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: marshall({ notificationId }),
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    }));
  } catch (error) {
    console.error('Error updating notification status:', error);
    throw error;
  }
}