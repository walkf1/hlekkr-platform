import { authService } from './authService';

class ApiService {
  private baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';

  private async getAuthHeaders() {
    const tokens = authService.getTokens();
    return tokens ? {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json'
    } : {
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(endpoint: string, options: RequestInit = {}) {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    if (response.status === 401) {
      await authService.refreshTokens();
      const newHeaders = await this.getAuthHeaders();
      return fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...newHeaders, ...options.headers }
      });
    }

    return response;
  }
}

export const apiService = new ApiService();