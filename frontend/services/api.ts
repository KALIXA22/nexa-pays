import { Platform } from 'react-native';

// Network configuration for different environments
// For Android emulator: 10.0.2.2:9210
// For iOS simulator: localhost:9210  
// For physical device: use your machine's IP address (found with ipconfig/ifconfig)
// Current machine IP: 10.12.72.161
const API_BASE_URL = __DEV__
    ? Platform.OS === 'android'
        ? 'http://10.12.72.161:9243'  // Use host machine IP for Android
        : 'http://localhost:9243'     // iOS simulator
    : 'http://localhost:9243';       // Production (update with actual server URL)

export interface User {
    username: string;
    email: string;
    role: 'admin' | 'cashier';
}

export interface AuthResponse {
    success: boolean;
    message: string;
    token: string;
    user: User;
    error?: string;
}

export interface SignupData {
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'cashier';
}

export interface LoginData {
    email: string;
    password: string;
}

class ApiService {
    private static instance: ApiService;
    private token: string | null = null;

    private constructor() { }

    static getInstance(): ApiService {
        if (!ApiService.instance) {
            ApiService.instance = new ApiService();
        }
        return ApiService.instance;
    }

    setToken(token: string) {
        this.token = token;
    }

    getToken(): string | null {
        return this.token;
    }

    clearToken() {
        this.token = null;
    }

    private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
        const url = `${API_BASE_URL}${endpoint}`;

        // Debug logging
        console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);

        const defaultHeaders: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            defaultHeaders['Authorization'] = `Bearer ${this.token}`;
        }

        const config: RequestInit = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers,
            },
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            console.log(`✅ API Response: ${response.status}`, data);

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('❌ API request failed:', error);
            console.error('🔍 Request details:', { url, config });
            throw error;
        }
    }

    // Test connectivity with multiple URLs
    async testConnection(): Promise<{ success: boolean; message: string; url?: string }> {
        const urlsToTry = [
            API_BASE_URL,
            'http://10.0.2.2:9243',      // Android emulator standard
            'http://10.12.72.161:9243',  // Host machine IP
            'http://localhost:9243'       // Localhost fallback
        ];

        for (const url of urlsToTry) {
            try {
                console.log(`🔍 Testing connection to: ${url}`);
                const response = await fetch(`${url}/health`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Connection successful to: ${url}`);
                    return {
                        success: true,
                        message: `Connected successfully to ${url}`,
                        url
                    };
                }
            } catch (error) {
                console.log(`❌ Failed to connect to: ${url}`, error);
                continue;
            }
        }

        return {
            success: false,
            message: 'Could not connect to any backend URL. Please check if the backend server is running and firewall settings.'
        };
    }

    // Authentication endpoints
    async signup(userData: SignupData): Promise<AuthResponse> {
        const response = await this.makeRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(userData),
        });

        if (response.success && response.token) {
            this.setToken(response.token);
        }

        return response;
    }

    async login(credentials: LoginData): Promise<AuthResponse> {
        const response = await this.makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });

        if (response.success && response.token) {
            this.setToken(response.token);
        }

        return response;
    }

    logout() {
        this.clearToken();
    }

    // Wallet endpoints
    async getBalance(uid: string): Promise<any> {
        return this.makeRequest(`/balance/${uid}`);
    }

    async topup(uid: string, amount: number): Promise<any> {
        return this.makeRequest('/topup', {
            method: 'POST',
            body: JSON.stringify({ uid, amount }),
        });
    }

    async pay(uid: string, productId: string, quantity: number, totalAmount: number): Promise<any> {
        return this.makeRequest('/pay', {
            method: 'POST',
            body: JSON.stringify({ uid, productId, quantity, totalAmount }),
        });
    }

    // Product endpoints
    async getProducts(): Promise<any> {
        return this.makeRequest('/products');
    }

    async getProduct(productId: string): Promise<any> {
        return this.makeRequest(`/products/${productId}`);
    }

    async seedProducts(): Promise<any> {
        return this.makeRequest('/seed-products', {
            method: 'POST',
        });
    }

    async forceSeedProducts(): Promise<any> {
        return this.makeRequest('/force-seed-products', {
            method: 'POST',
        });
    }

    // Transaction endpoints
    async getTransactions(uid: string, limit?: number): Promise<any> {
        const query = limit ? `?limit=${limit}` : '';
        return this.makeRequest(`/transactions/${uid}${query}`);
    }

    // User-specific endpoints
    async getUserTransactions(limit?: number): Promise<any> {
        const query = limit ? `?limit=${limit}` : '';
        return this.makeRequest(`/user/transactions${query}`);
    }

    async getUserCards(): Promise<any> {
        return this.makeRequest('/user/cards');
    }

    async assignCardToUser(uid: string): Promise<any> {
        return this.makeRequest('/user/assign-card', {
            method: 'POST',
            body: JSON.stringify({ uid }),
        });
    }

    // Profile management endpoints
    async updateProfile(profileData: {
        username?: string;
        email?: string;
        currentPassword?: string;
        newPassword?: string;
    }): Promise<any> {
        return this.makeRequest('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData),
        });
    }

    // Notification endpoints
    async getNotifications(limit?: number): Promise<any> {
        const query = limit ? `?limit=${limit}` : '';
        return this.makeRequest(`/user/notifications${query}`);
    }

    async getUnreadNotificationCount(): Promise<any> {
        return this.makeRequest('/user/notifications/unread-count');
    }

    async markNotificationAsRead(notificationId: string): Promise<any> {
        return this.makeRequest(`/user/notifications/${notificationId}/read`, {
            method: 'PUT',
        });
    }

    async markAllNotificationsAsRead(): Promise<any> {
        return this.makeRequest('/user/notifications/mark-all-read', {
            method: 'PUT',
        });
    }

    async deleteNotification(notificationId: string): Promise<any> {
        return this.makeRequest(`/user/notifications/${notificationId}`, {
            method: 'DELETE',
        });
    }
}

export const apiService = ApiService.getInstance();