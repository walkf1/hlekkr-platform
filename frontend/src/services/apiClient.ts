import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = process.env.REACT_APP_API_URL || '/api') {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        // Add API key for authentication (if available)
        const apiKey = process.env.REACT_APP_API_KEY || localStorage.getItem('hlekkr-api-key');
        if (apiKey) {
          config.headers['X-API-Key'] = apiKey;
        }
        
        // Add auth token if available (for future IAM auth)
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Log error for monitoring
        console.error('API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message
        });

        if (error.response?.status === 401) {
          localStorage.removeItem('authToken');
          window.location.href = '/login';
        } else if (error.response?.status >= 500) {
          // Server errors - show user-friendly message
          error.userMessage = 'Server error. Please try again later.';
        } else if (error.code === 'ECONNABORTED') {
          // Timeout errors
          error.userMessage = 'Request timeout. Please check your connection.';
        } else if (!error.response) {
          // Network errors
          error.userMessage = 'Network error. Please check your connection.';
        }
        
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.get(url, config);
      return response.data;
    } catch (error: any) {
      throw new Error(error.userMessage || error.message || 'Request failed');
    }
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.post(url, data, config);
      return response.data;
    } catch (error: any) {
      throw new Error(error.userMessage || error.message || 'Request failed');
    }
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.put(url, data, config);
      return response.data;
    } catch (error: any) {
      throw new Error(error.userMessage || error.message || 'Request failed');
    }
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.delete(url, config);
      return response.data;
    } catch (error: any) {
      throw new Error(error.userMessage || error.message || 'Request failed');
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;