/**
 * Secure Input Validation Module
 */

class InputValidator {
  static validateFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid fileName: must be non-empty string');
    }
    
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Invalid fileName: path traversal detected');
    }
    
    if (fileName.length > 255 || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
      throw new Error('Invalid fileName: invalid characters or too long');
    }
    
    return fileName.trim();
  }
  
  static validateFileType(fileType) {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/avi', 'video/mov', 'video/webm'
    ];
    
    if (!allowedTypes.includes(fileType)) {
      throw new Error(`Invalid fileType: ${fileType} not allowed`);
    }
    
    return fileType;
  }
  
  static validateMediaId(mediaId) {
    if (!mediaId || typeof mediaId !== 'string') {
      throw new Error('Invalid mediaId: must be non-empty string');
    }
    
    if (!/^[a-zA-Z0-9-]+$/.test(mediaId) || mediaId.length > 100) {
      throw new Error('Invalid mediaId: invalid format');
    }
    
    return mediaId;
  }
  
  static sanitizeUserInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
      .substring(0, 1000);
  }
}

module.exports = { InputValidator };