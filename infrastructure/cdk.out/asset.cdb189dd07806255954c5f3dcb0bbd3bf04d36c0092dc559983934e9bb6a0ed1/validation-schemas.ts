/**
 * JSON Schema definitions for API request/response validation
 * Used across all API Gateway endpoints for consistent validation
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Base schemas
export const BaseSchemas = {
  mediaId: {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    description: 'UUID v4 format media identifier'
  },
  
  timestamp: {
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 timestamp'
  },
  
  pagination: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0
      }
    }
  }
};

// Trust Score API Schemas
export const TrustScoreSchemas = {
  // GET /trust-scores query parameters
  getTrustScoresQuery: {
    type: 'object',
    properties: {
      scoreRange: {
        type: 'string',
        enum: ['0-20', '21-40', '41-60', '61-80', '81-100'],
        description: 'Filter by score range'
      },
      startDate: BaseSchemas.timestamp,
      endDate: BaseSchemas.timestamp,
      minScore: {
        type: 'number',
        minimum: 0,
        maximum: 100
      },
      maxScore: {
        type: 'number',
        minimum: 0,
        maximum: 100
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      statistics: {
        type: 'boolean',
        default: false,
        description: 'Include statistical summary'
      },
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        description: 'Number of days to look back'
      }
    }
  },

  // GET /trust-scores/{mediaId} query parameters
  getMediaTrustScoreQuery: {
    type: 'object',
    properties: {
      history: {
        type: 'boolean',
        default: false,
        description: 'Include score history'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        default: 10
      }
    }
  },

  // POST /trust-scores/{mediaId} request body
  calculateTrustScoreRequest: {
    type: 'object',
    properties: {
      forceRecalculation: {
        type: 'boolean',
        default: false,
        description: 'Force recalculation even if recent score exists'
      },
      includeFactors: {
        type: 'boolean',
        default: true,
        description: 'Include detailed factor breakdown'
      }
    }
  },

  // Trust score response
  trustScoreResponse: {
    type: 'object',
    required: ['mediaId', 'compositeScore', 'confidence', 'calculationTimestamp'],
    properties: {
      mediaId: BaseSchemas.mediaId,
      compositeScore: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Overall trust score (0-100)'
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Confidence level in the score'
      },
      calculationTimestamp: BaseSchemas.timestamp,
      breakdown: {
        type: 'object',
        properties: {
          deepfakeScore: { type: 'number', minimum: 0, maximum: 100 },
          sourceReliabilityScore: { type: 'number', minimum: 0, maximum: 100 },
          metadataConsistencyScore: { type: 'number', minimum: 0, maximum: 100 },
          historicalPatternScore: { type: 'number', minimum: 0, maximum: 100 },
          technicalIntegrityScore: { type: 'number', minimum: 0, maximum: 100 }
        }
      },
      factors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            impact: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
            description: { type: 'string' },
            weight: { type: 'string', enum: ['low', 'medium', 'high'] }
          }
        }
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
};

// Source Verification API Schemas
export const SourceVerificationSchemas = {
  // POST /source-verification/{mediaId} request body
  verifySourceRequest: {
    type: 'object',
    properties: {
      sourceUrl: {
        type: 'string',
        format: 'uri',
        description: 'Original source URL if known'
      },
      sourceMetadata: {
        type: 'object',
        description: 'Additional source metadata'
      },
      verificationLevel: {
        type: 'string',
        enum: ['basic', 'standard', 'comprehensive'],
        default: 'standard',
        description: 'Level of verification to perform'
      }
    }
  },

  // Source verification response
  sourceVerificationResponse: {
    type: 'object',
    required: ['mediaId', 'verificationStatus', 'verificationTimestamp'],
    properties: {
      mediaId: BaseSchemas.mediaId,
      verificationStatus: {
        type: 'string',
        enum: ['verified', 'likely_verified', 'unverified', 'suspicious', 'likely_fake']
      },
      verificationConfidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence in verification result (0-1)'
      },
      verificationTimestamp: BaseSchemas.timestamp,
      sourceReputation: {
        type: 'string',
        enum: ['excellent', 'high', 'good', 'medium', 'fair', 'poor', 'low', 'blacklisted']
      },
      reputationHistory: {
        type: 'object',
        properties: {
          trend: { type: 'string', enum: ['improving', 'stable', 'declining'] },
          historicalScore: { type: 'number', minimum: 0, maximum: 100 }
        }
      },
      crossReferences: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            timestamp: BaseSchemas.timestamp
          }
        }
      }
    }
  }
};

// Chain of Custody API Schemas
export const ChainOfCustodySchemas = {
  // POST /chain-of-custody request body
  recordCustodyEventRequest: {
    type: 'object',
    required: ['mediaId', 'operation', 'actor'],
    properties: {
      mediaId: BaseSchemas.mediaId,
      operation: {
        type: 'string',
        enum: ['upload', 'analysis', 'review', 'approval', 'rejection', 'modification', 'deletion']
      },
      actor: {
        type: 'string',
        description: 'User ID or system component performing the operation'
      },
      details: {
        type: 'object',
        description: 'Operation-specific details'
      },
      signature: {
        type: 'string',
        description: 'Cryptographic signature for integrity'
      }
    }
  },

  // GET /chain-of-custody/{mediaId} query parameters
  getCustodyChainQuery: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['upload', 'analysis', 'review', 'approval', 'rejection', 'modification', 'deletion'],
        description: 'Filter by operation type'
      }
    }
  },

  // Chain of custody response
  custodyChainResponse: {
    type: 'object',
    required: ['mediaId', 'events', 'integrityStatus'],
    properties: {
      mediaId: BaseSchemas.mediaId,
      events: {
        type: 'array',
        items: {
          type: 'object',
          required: ['eventId', 'timestamp', 'operation', 'actor'],
          properties: {
            eventId: { type: 'string' },
            timestamp: BaseSchemas.timestamp,
            operation: { type: 'string' },
            actor: { type: 'string' },
            details: { type: 'object' },
            signature: { type: 'string' },
            verified: { type: 'boolean' }
          }
        }
      },
      integrityStatus: {
        type: 'string',
        enum: ['intact', 'compromised', 'unknown']
      },
      verificationTimestamp: BaseSchemas.timestamp
    }
  }
};

// Discrepancy Detection API Schemas
export const DiscrepancySchemas = {
  // POST /discrepancies request body
  detectDiscrepanciesRequest: {
    type: 'object',
    properties: {
      timeRangeHours: {
        type: 'integer',
        minimum: 1,
        maximum: 8760, // 1 year
        default: 24,
        description: 'Time range in hours to analyze'
      },
      severityThreshold: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
        description: 'Minimum severity level to report'
      },
      analysisType: {
        type: 'string',
        enum: ['full', 'incremental', 'targeted'],
        default: 'incremental'
      }
    }
  },

  // GET /discrepancies query parameters
  getDiscrepanciesQuery: {
    type: 'object',
    properties: {
      timeRangeHours: {
        type: 'integer',
        minimum: 1,
        maximum: 8760,
        default: 24
      },
      severityThreshold: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20
      }
    }
  },

  // Discrepancy response
  discrepancyResponse: {
    type: 'object',
    required: ['discrepancies', 'analysisTimestamp', 'summary'],
    properties: {
      discrepancies: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'type', 'severity', 'description', 'detectedAt'],
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: ['score_inconsistency', 'metadata_mismatch', 'temporal_anomaly', 'source_conflict']
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical']
            },
            description: { type: 'string' },
            detectedAt: BaseSchemas.timestamp,
            affectedMedia: {
              type: 'array',
              items: BaseSchemas.mediaId
            },
            details: { type: 'object' }
          }
        }
      },
      summary: {
        type: 'object',
        properties: {
          totalDiscrepancies: { type: 'integer' },
          severityBreakdown: {
            type: 'object',
            properties: {
              low: { type: 'integer' },
              medium: { type: 'integer' },
              high: { type: 'integer' },
              critical: { type: 'integer' }
            }
          }
        }
      },
      analysisTimestamp: BaseSchemas.timestamp
    }
  }
};

// Media Upload API Schemas
export const MediaUploadSchemas = {
  // POST /media request body
  uploadRequestSchema: {
    type: 'object',
    required: ['fileName', 'fileSize', 'contentType'],
    properties: {
      fileName: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '^[^<>:"/\\|?*]+$',
        description: 'Valid filename without path separators'
      },
      fileSize: {
        type: 'integer',
        minimum: 1,
        maximum: 500 * 1024 * 1024, // 500MB
        description: 'File size in bytes'
      },
      contentType: {
        type: 'string',
        enum: [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
        ]
      },
      description: {
        type: 'string',
        maxLength: 1000,
        description: 'Optional media description'
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
          maxLength: 50
        },
        maxItems: 10,
        description: 'Optional tags for categorization'
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata'
      }
    }
  }
};

// Error response schema
export const ErrorResponseSchema = {
  type: 'object',
  required: ['success', 'error', 'correlationId'],
  properties: {
    success: {
      type: 'boolean',
      const: false
    },
    error: {
      type: 'object',
      required: ['message', 'code'],
      properties: {
        message: { type: 'string' },
        code: { type: 'integer' },
        details: { type: 'object' },
        field: { type: 'string' }
      }
    },
    correlationId: { type: 'string' }
  }
};

/**
 * Validate request data against schema
 */
export function validateRequest(data: any, schema: any): ValidationResult {
  const errors: string[] = [];
  
  try {
    // Basic validation implementation
    // In production, use a proper JSON schema validator like Ajv
    const result = validateObject(data, schema, '');
    
    return {
      valid: result.length === 0,
      errors: result
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Validation error: ${error.message}`]
    };
  }
}

function validateObject(data: any, schema: any, path: string): string[] {
  const errors: string[] = [];
  
  if (schema.type === 'object') {
    if (typeof data !== 'object' || data === null) {
      errors.push(`${path}: Expected object, got ${typeof data}`);
      return errors;
    }
    
    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in data)) {
          errors.push(`${path}.${prop}: Required property missing`);
        }
      }
    }
    
    // Validate properties
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in data) {
          const propPath = path ? `${path}.${prop}` : prop;
          errors.push(...validateObject(data[prop], propSchema, propPath));
        }
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(data)) {
      errors.push(`${path}: Expected array, got ${typeof data}`);
      return errors;
    }
    
    if (schema.maxItems && data.length > schema.maxItems) {
      errors.push(`${path}: Array too long (max ${schema.maxItems})`);
    }
    
    if (schema.items) {
      data.forEach((item, index) => {
        errors.push(...validateObject(item, schema.items, `${path}[${index}]`));
      });
    }
  } else if (schema.type === 'string') {
    if (typeof data !== 'string') {
      errors.push(`${path}: Expected string, got ${typeof data}`);
      return errors;
    }
    
    if (schema.minLength && data.length < schema.minLength) {
      errors.push(`${path}: String too short (min ${schema.minLength})`);
    }
    
    if (schema.maxLength && data.length > schema.maxLength) {
      errors.push(`${path}: String too long (max ${schema.maxLength})`);
    }
    
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push(`${path}: String does not match pattern`);
    }
    
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push(`${path}: Value not in allowed enum: ${schema.enum.join(', ')}`);
    }
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof data !== 'number') {
      errors.push(`${path}: Expected number, got ${typeof data}`);
      return errors;
    }
    
    if (schema.type === 'integer' && !Number.isInteger(data)) {
      errors.push(`${path}: Expected integer, got decimal`);
    }
    
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${path}: Value below minimum (${schema.minimum})`);
    }
    
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${path}: Value above maximum (${schema.maximum})`);
    }
  } else if (schema.type === 'boolean') {
    if (typeof data !== 'boolean') {
      errors.push(`${path}: Expected boolean, got ${typeof data}`);
    }
  }
  
  return errors;
}