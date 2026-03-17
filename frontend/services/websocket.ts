import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';

// Use the same base URL as API service
const WEBSOCKET_URL = __DEV__
    ? Platform.OS === 'android'
        ? 'http://10.12.72.161:9210'  // Use host machine IP for Android
        : 'http://localhost:9210'     // iOS simulator
    : 'http://localhost:9210';       // Production

export interface CardScannedEvent {
    uid: string;
    deviceBalance: number;
    timestamp: string;
}

export interface PaymentEvent {
    uid: string;
    status: string;
    newBalance: number;
    timestamp: string;
}

export interface BalanceUpdatedEvent {
    uid: string;
    newBalance: number;
    timestamp: string;
}

export interface TopupEvent {
    uid: string;
    amount: number;
    previousBalance: number;
    newBalance: number;
    timestamp: string;
}

class WebSocketService {
    private static instance: WebSocketService;
    private socket: Socket | null = null;
    private isConnected = false;
    private listeners: Map<string, Function[]> = new Map();

    private constructor() { }

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    connect(): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.socket && this.isConnected) {
                resolve(true);
                return;
            }

            console.log('🔌 Connecting to WebSocket:', WEBSOCKET_URL);

            this.socket = io(WEBSOCKET_URL, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                forceNew: true
            });

            this.socket.on('connect', () => {
                console.log('✅ WebSocket connected');
                this.isConnected = true;
                resolve(true);
            });

            this.socket.on('disconnect', () => {
                console.log('❌ WebSocket disconnected');
                this.isConnected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ WebSocket connection error:', error);
                this.isConnected = false;
                resolve(false);
            });

            // Listen for RFID card scanned events
            this.socket.on('card-scanned', (data: CardScannedEvent) => {
                console.log('📱 RFID Card Detected:', data);
                this.emit('card-scanned', data);
            });

            // Listen for payment events
            this.socket.on('payment-success', (data: PaymentEvent) => {
                console.log('💳 Payment Success:', data);
                this.emit('payment-success', data);
            });

            this.socket.on('payment-declined', (data: any) => {
                console.log('❌ Payment Declined:', data);
                this.emit('payment-declined', data);
            });

            // Listen for balance updates
            this.socket.on('balance-updated', (data: BalanceUpdatedEvent) => {
                console.log('💰 Balance Updated:', data);
                this.emit('balance-updated', data);
            });

            // Listen for topup events
            this.socket.on('topup-success', (data: TopupEvent) => {
                console.log('⬆️ Topup Success:', data);
                this.emit('topup-success', data);
            });

            // Set timeout for connection attempt
            setTimeout(() => {
                if (!this.isConnected) {
                    console.log('⏰ WebSocket connection timeout');
                    resolve(false);
                }
            }, 10000);
        });
    }

    disconnect() {
        if (this.socket) {
            console.log('🔌 Disconnecting WebSocket');
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.listeners.clear();
        }
    }

    // Event listener management
    on(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    off(event: string, callback: Function) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => callback(data));
        }
    }

    // Request methods for backend communication
    requestBalance(uid: string) {
        if (this.socket && this.isConnected) {
            this.socket.emit('request-balance', { uid });
        }
    }

    requestProducts() {
        if (this.socket && this.isConnected) {
            this.socket.emit('request-products');
        }
    }

    requestHistory(uid: string, limit?: number) {
        if (this.socket && this.isConnected) {
            this.socket.emit('request-history', { uid, limit });
        }
    }

    isSocketConnected(): boolean {
        return this.isConnected;
    }
}

export const webSocketService = WebSocketService.getInstance();