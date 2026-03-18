import { View, Text, ScrollView, Pressable, Alert, Image, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { CheckCircle2, ArrowLeft, ShoppingCart, CreditCard, Trash2, Plus, Minus, Download, XCircle } from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat, 
  withSequence,
  Easing
} from 'react-native-reanimated';
import { SalespersonBottomNav } from '../../../components/SalespersonBottomNav';
import { StorageService } from '../../../services/storage';
import { User, apiService } from '../../../services/api';
import { webSocketService, CardScannedEvent } from '../../../services/websocket';
import { useCart } from '../../../contexts/CartContext';

export default function SalespersonPay() {
  const router = useRouter();
  const primaryNavy = "#002B5B";
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckoutMode, setIsCheckoutMode] = useState(false);
  const [detectedCard, setDetectedCard] = useState<CardScannedEvent | null>(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  
  // Cart context
  const { items, getTotalItems, getTotalPrice, updateQuantity, removeFromCart, clearCart } = useCart();

  // Group identical items (same ID) for display
  const groupedItems = items.reduce((acc, item) => {
    const key = item._id;
    if (acc[key]) {
      acc[key].quantity += item.quantity;
      acc[key].totalPrice += item.price * item.quantity;
    } else {
      acc[key] = {
        ...item,
        totalPrice: item.price * item.quantity
      };
    }
    return acc;
  }, {} as Record<string, any>);

  const displayItems = Object.values(groupedItems);

  // Load current user data
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await StorageService.getUser();
        setCurrentUser(user);
        
        // Set API token for authenticated requests
        const token = await StorageService.getToken();
        if (token) {
          apiService.setToken(token);
        }
      } catch (error) {
        console.error('Failed to load user data:', error);
      }
    };
    loadUserData();
  }, []);

  // WebSocket connection for real-time RFID detection
  useEffect(() => {
    const connectWebSocket = async () => {
      try {
        const connected = await webSocketService.connect();
        setIsWebSocketConnected(connected);
        
        if (connected) {
          // Listen for real RFID card detections
          const handleCardScanned = async (data: CardScannedEvent) => {
            console.log('💳 RFID card detected for payment:', data);
            setDetectedCard(data);
            
            // Don't auto-process payment - wait for manual confirmation
            if (status === 'scanning') {
              setStatus('idle'); // Reset to idle when card is detected
            }
          };

          webSocketService.on('card-scanned', handleCardScanned);

          return () => {
            webSocketService.off('card-scanned', handleCardScanned);
          };
        }
      } catch (error) {
        console.error('WebSocket connection error:', error);
        setIsWebSocketConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      webSocketService.disconnect();
    };
  }, [isCheckoutMode, status]);

  // Confirm and process payment with detected card
  const confirmPayment = async () => {
    if (!detectedCard) {
      Alert.alert('No Card Detected', 'Please place an RFID card on the reader first.');
      return;
    }
    
    await processPayment(detectedCard);
  };
  const processPayment = async (cardData: CardScannedEvent) => {
    setStatus('scanning');
    
    try {
      const totalAmount = getTotalPrice(); // Amount in cents
      const totalAmountDollars = totalAmount / 100;
      
      console.log('💰 Processing payment:', {
        cardUID: cardData.uid,
        totalAmount: totalAmountDollars,
        cardBalance: cardData.deviceBalance,
        items: displayItems
      });
      
      // Check if card has sufficient balance
      if (cardData.deviceBalance < totalAmountDollars) {
        setStatus('failed');
        Alert.alert(
          '❌ Insufficient Balance',
          `Card Balance: $${cardData.deviceBalance.toFixed(2)}\n` +
          `Required Amount: $${totalAmountDollars.toFixed(2)}\n` +
          `Shortage: $${(totalAmountDollars - cardData.deviceBalance).toFixed(2)}\n\n` +
          `Please top-up the card or use a different payment method.`,
          [
            {
              text: 'Try Another Card',
              onPress: () => {
                setStatus('idle');
                setDetectedCard(null);
              }
            },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        return;
      }
      
      // Process payment via API
      const response = await apiService.pay(
        cardData.uid,
        'multiple_items', // productId for multiple items
        getTotalItems(), // quantity
        totalAmount // totalAmount in cents
      );
      
      if (response.success) {
        setStatus('success');
        setPaymentResult(response);
        
        console.log('✅ Payment successful:', response);
        
        // Show success notification
        Alert.alert(
          '✅ Payment Successful!',
          `Card: ${cardData.uid}\n` +
          `Amount Paid: $${totalAmountDollars.toFixed(2)}\n` +
          `Previous Balance: $${cardData.deviceBalance.toFixed(2)}\n` +
          `New Balance: $${response.newBalance.toFixed(2)}`,
          [{ text: 'OK' }]
        );
        
      } else {
        throw new Error(response.error || 'Payment failed');
      }
      
    } catch (error) {
      console.error('❌ Payment error:', error);
      setStatus('failed');
      Alert.alert(
        '❌ Payment Failed',
        `Failed to process payment for card ${cardData.uid}.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`,
        [
          {
            text: 'Retry',
            onPress: () => {
              setStatus('idle');
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  // Animation values
  const pulseScale = useSharedValue(1);
  const successScale = useSharedValue(0);

  useEffect(() => {
    if (status === 'scanning') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        false
      );
    } else {
      pulseScale.value = 1;
    }
  }, [status]);

  const handleStartPay = () => {
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart before proceeding to payment.');
      return;
    }
    
    if (!isWebSocketConnected) {
      Alert.alert('Connection Error', 'Not connected to RFID system. Please check your connection.');
      return;
    }
    
    // Set to idle mode and wait for card detection
    setStatus('idle');
    Alert.alert(
      'Ready for Payment',
      'Please place the RFID card on the reader. You will need to confirm the payment after card detection.',
      [{ text: 'OK' }]
    );
  };

  const handleProceedToCheckout = () => {
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart before proceeding to checkout.');
      return;
    }
    setIsCheckoutMode(true);
    // Don't automatically start payment - wait for manual card placement
  };

  const handleQuantityUpdate = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
    } else {
      updateQuantity(itemId, newQuantity);
    }
  };

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const animatedSuccessStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
    opacity: successScale.value,
  }));

  // If cart is empty, show empty cart message
  if (items.length === 0 && status === 'idle') {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-row items-center justify-between px-6 py-4 bg-white">
          <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
            <ArrowLeft size={24} color={primaryNavy} />
          </Pressable>
          <Text style={{ color: primaryNavy }} className="text-lg font-bold">Payment</Text>
          <View className="w-10" />
        </View>
        
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-24 h-24 bg-gray-100 rounded-full items-center justify-center mb-6">
            <ShoppingCart size={48} color="#9ca3af" />
          </View>
          <Text style={{ color: primaryNavy }} className="text-2xl font-bold mb-2">Your Cart is Empty</Text>
          <Text className="text-gray-500 text-center mb-8">Add some products to your cart to proceed with payment</Text>
          
          <Pressable 
            onPress={() => router.push('/(main)/salesperson/products')}
            style={{ backgroundColor: primaryNavy }}
            className="px-8 py-4 rounded-xl"
          >
            <Text className="text-white font-bold text-lg">Browse Products</Text>
          </Pressable>
        </View>
        
        <SalespersonBottomNav primaryNavy={primaryNavy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-white">
        <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ArrowLeft size={24} color={primaryNavy} />
        </Pressable>
        <Text style={{ color: primaryNavy }} className="text-lg font-bold">Payment</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Order Summary Card */}
        <View className="mx-6 mt-6 bg-white rounded-2xl p-6 shadow-sm">
          <View className="flex-row items-center mb-4">
            <View style={{ backgroundColor: primaryNavy }} className="w-10 h-10 rounded-full items-center justify-center mr-3">
              <ShoppingCart size={20} color="white" />
            </View>
            <View>
              <Text style={{ color: primaryNavy }} className="text-lg font-bold">Order Summary</Text>
              <Text className="text-gray-500 text-sm">{getTotalItems()} items</Text>
            </View>
          </View>

          {/* Cart Items */}
          <ScrollView className="max-h-48 mb-4" showsVerticalScrollIndicator={false}>
            {displayItems.map((item, index) => (
              <View key={item._id} className={`flex-row items-center py-3 ${index < displayItems.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <Image 
                  source={{ uri: item.image }}
                  style={{ width: 50, height: 50, borderRadius: 8 }}
                  className="mr-3"
                />
                <View className="flex-1">
                  <Text style={{ color: primaryNavy }} className="font-semibold" numberOfLines={1}>{item.name}</Text>
                  <Text className="text-gray-500 text-sm">${(item.price / 100).toFixed(2)} each</Text>
                </View>
                
                {/* Quantity Controls */}
                <View className="flex-row items-center mr-4">
                  <Pressable 
                    onPress={() => handleQuantityUpdate(item._id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full border border-gray-300 items-center justify-center"
                  >
                    <Minus size={16} color={primaryNavy} />
                  </Pressable>
                  <Text style={{ color: primaryNavy }} className="mx-3 font-bold text-lg min-w-[24px] text-center">
                    {item.quantity}
                  </Text>
                  <Pressable 
                    onPress={() => handleQuantityUpdate(item._id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full border border-gray-300 items-center justify-center"
                  >
                    <Plus size={16} color={primaryNavy} />
                  </Pressable>
                </View>
                
                <View className="items-end">
                  <Text style={{ color: primaryNavy }} className="font-bold">${(item.totalPrice / 100).toFixed(2)}</Text>
                  <Pressable 
                    onPress={() => removeFromCart(item._id)}
                    className="mt-1 p-1"
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Total */}
          <View className="border-t border-gray-100 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <Text style={{ color: primaryNavy }} className="text-lg font-bold">Total</Text>
              <Text style={{ color: primaryNavy }} className="text-2xl font-bold">${(getTotalPrice() / 100).toFixed(2)}</Text>
            </View>
            <Text className="text-gray-500 text-sm mb-4">Including taxes and fees</Text>
            
            {/* Proceed to Checkout Button */}
            {!isCheckoutMode && status === 'idle' && (
              <Pressable 
                onPress={handleProceedToCheckout}
                style={{ backgroundColor: primaryNavy }}
                className="h-12 rounded-xl items-center justify-center"
              >
                <Text className="text-white font-bold text-base">Proceed to Checkout</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Payment Method Card - Only show when in checkout mode */}
        {isCheckoutMode && (
          <View className="mx-6 mt-4 bg-white rounded-2xl p-6 shadow-sm">
            <View className="flex-row items-center mb-4">
              <View style={{ backgroundColor: status === 'success' ? '#10b981' : '#3b82f6' }} className="w-10 h-10 rounded-full items-center justify-center mr-3">
                {status === 'success' ? (
                  <CheckCircle2 size={20} color="white" />
                ) : (
                  <CreditCard size={20} color="white" />
                )}
              </View>
              <View>
                <Text style={{ color: primaryNavy }} className="text-lg font-bold">
                  {status === 'success' ? 'Payment Completed' : 'Payment Method'}
                </Text>
                <Text className="text-gray-500 text-sm">
                  {status === 'success' ? 'Transaction successful' : 'RFID Card Payment'}
                </Text>
              </View>
            </View>

            {/* Connection Status */}
            {!isWebSocketConnected && (
              <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <Text style={{ color: '#dc2626' }} className="font-semibold text-sm mb-1">
                  RFID System Offline
                </Text>
                <Text style={{ color: '#b91c1c' }} className="text-xs">
                  Cannot process payments. Please check connection.
                </Text>
              </View>
            )}

            {/* Detected Card Info - Redesigned with Blue Theme */}
            {detectedCard && status !== 'success' && (
              <View className="mb-4">
                <View 
                  style={{ 
                    backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#eff6ff' : '#fef2f2',
                    borderColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#3b82f6' : '#f87171',
                    borderWidth: 2,
                    borderRadius: 20,
                    padding: 20,
                    position: 'relative',
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 4
                  }}
                >
                  {/* Gradient Background Decoration */}
                  <View 
                    style={{ 
                      position: 'absolute',
                      top: -30,
                      right: -30,
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#3b82f6' : '#f87171',
                      opacity: 0.08
                    }}
                  />
                  <View 
                    style={{ 
                      position: 'absolute',
                      bottom: -20,
                      left: -20,
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#1d4ed8' : '#ef4444',
                      opacity: 0.05
                    }}
                  />
                  
                  {/* Header Section */}
                  <View className="flex-row items-center justify-between mb-5">
                    <View className="flex-row items-center">
                      <View 
                        style={{ 
                          backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#3b82f6' : '#f87171',
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 16,
                          shadowColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#3b82f6' : '#f87171',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                          elevation: 3
                        }}
                      >
                        <CreditCard size={24} color="white" />
                      </View>
                      <View>
                        <Text 
                          style={{ 
                            color: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#1e40af' : '#dc2626',
                            fontSize: 18,
                            fontWeight: '700'
                          }}
                        >
                          Card Detected
                        </Text>
                        <Text 
                          style={{ 
                            color: '#64748b',
                            fontSize: 14,
                            fontWeight: '500',
                            marginTop: 2
                          }}
                        >
                          ID: {detectedCard.uid}
                        </Text>
                      </View>
                    </View>
                    
                    <Pressable 
                      onPress={() => setDetectedCard(null)}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#e2e8f0'
                      }}
                    >
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600' }}>
                        Clear
                      </Text>
                    </Pressable>
                  </View>
                  
                  {/* Balance Information Cards */}
                  <View className="flex-row justify-between mb-5">
                    <View 
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        borderRadius: 16,
                        padding: 16,
                        flex: 0.48,
                        borderWidth: 1,
                        borderColor: 'rgba(148, 163, 184, 0.2)'
                      }}
                    >
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '500', marginBottom: 4 }}>
                        Available Balance
                      </Text>
                      <Text 
                        style={{ 
                          color: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#1e40af' : '#dc2626',
                          fontSize: 24,
                          fontWeight: '800'
                        }}
                      >
                        ${detectedCard.deviceBalance.toFixed(2)}
                      </Text>
                    </View>
                    
                    <View 
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        borderRadius: 16,
                        padding: 16,
                        flex: 0.48,
                        borderWidth: 1,
                        borderColor: 'rgba(148, 163, 184, 0.2)'
                      }}
                    >
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '500', marginBottom: 4 }}>
                        Required Amount
                      </Text>
                      <Text style={{ color: primaryNavy, fontSize: 24, fontWeight: '800' }}>
                        ${(getTotalPrice() / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Status Indicator */}
                  <View 
                    style={{
                      backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : 'rgba(248, 113, 113, 0.1)',
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) 
                        ? 'rgba(59, 130, 246, 0.2)' 
                        : 'rgba(248, 113, 113, 0.2)'
                    }}
                  >
                    {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? (
                      <View className="flex-row items-center">
                        <View 
                          style={{
                            backgroundColor: '#3b82f6',
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12
                          }}
                        >
                          <CheckCircle2 size={14} color="white" />
                        </View>
                        <View className="flex-1">
                          <Text 
                            style={{ color: '#1e40af', fontSize: 16, fontWeight: '600', marginBottom: 2 }}
                          >
                            Payment Ready
                          </Text>
                          <Text 
                            style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}
                          >
                            Sufficient balance available for this transaction
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View className="flex-row items-center">
                        <View 
                          style={{
                            backgroundColor: '#f87171',
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12
                          }}
                        >
                          <XCircle size={14} color="white" />
                        </View>
                        <View className="flex-1">
                          <Text 
                            style={{ color: '#dc2626', fontSize: 16, fontWeight: '600', marginBottom: 2 }}
                          >
                            Insufficient Balance
                          </Text>
                          <Text 
                            style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}
                          >
                            Need ${((getTotalPrice() / 100) - detectedCard.deviceBalance).toFixed(2)} more to complete payment
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {status !== 'success' && (
              <View>
                {/* RFID Scanner Area with Corner Framers */}
                <View className="items-center py-8">
                  {/* Scanner Frame with Corner Framers */}
                  <View className="relative">
                    {/* Corner Framers */}
                    <View className="absolute -top-2 -left-2 w-6 h-6 border-l-4 border-t-4 border-blue-500 rounded-tl-lg" />
                    <View className="absolute -top-2 -right-2 w-6 h-6 border-r-4 border-t-4 border-blue-500 rounded-tr-lg" />
                    <View className="absolute -bottom-2 -left-2 w-6 h-6 border-l-4 border-b-4 border-blue-500 rounded-bl-lg" />
                    <View className="absolute -bottom-2 -right-2 w-6 h-6 border-r-4 border-b-4 border-blue-500 rounded-br-lg" />
                    
                    {/* Scanning Waves Animation */}
                    {status === 'scanning' && (
                      <View>
                        <Animated.View 
                          style={[
                            {
                              position: 'absolute',
                              top: -20,
                              left: -20,
                              right: -20,
                              bottom: -20,
                              borderRadius: 20,
                              borderWidth: 2,
                              borderColor: '#3b82f6',
                              opacity: 0.3
                            },
                            animatedPulseStyle
                          ]} 
                        />
                        <Animated.View 
                          style={[
                            {
                              position: 'absolute',
                              top: -30,
                              left: -30,
                              right: -30,
                              bottom: -30,
                              borderRadius: 25,
                              borderWidth: 2,
                              borderColor: '#60a5fa',
                              opacity: 0.2
                            },
                            { ...animatedPulseStyle, transform: [{ scale: pulseScale.value * 1.1 }] }
                          ]} 
                        />
                      </View>
                    )}

                    {/* Card Visual */}
                    <Animated.View style={[animatedPulseStyle]}>
                      <View 
                        style={{ 
                          backgroundColor: detectedCard ? '#1e40af' : (status === 'scanning' ? '#3b82f6' : primaryNavy),
                          width: 240,
                          height: 150,
                          borderRadius: 20,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 16,
                          elevation: 8
                        }}
                        className="items-center justify-center relative overflow-hidden"
                      >
                        {/* Background gradient circles */}
                        <View 
                          style={{ 
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            width: 120,
                            height: 120,
                            borderRadius: 60,
                            position: 'absolute',
                            top: -30,
                            right: -30
                          }}
                        />
                        <View 
                          style={{ 
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            position: 'absolute',
                            bottom: -20,
                            left: -20
                          }}
                        />
                        
                        {/* Card chip */}
                        <View 
                          style={{ 
                            backgroundColor: '#FFD700',
                            width: 36,
                            height: 28,
                            borderRadius: 6,
                            position: 'absolute',
                            top: 24,
                            left: 24,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.3,
                            shadowRadius: 4
                          }}
                        >
                          <View className="absolute inset-1 border border-yellow-600/30 rounded-sm" />
                          <View className="absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-600/20 rounded-full transform -translate-x-1 -translate-y-1" />
                        </View>
                        
                        {/* VISA logo */}
                        <View className="absolute top-6 right-6">
                          <Text className="text-white font-bold text-lg opacity-90">VISA</Text>
                        </View>
                        
                        {/* Card number */}
                        <View className="absolute bottom-16 left-6">
                          <Text className="text-white font-mono text-lg tracking-wider">
                            {detectedCard ? `${detectedCard.uid.slice(0, 4)} •••• •••• ${detectedCard.uid.slice(-4)}` : '•••• •••• •••• ••••'}
                          </Text>
                        </View>
                        
                        {/* Cardholder name */}
                        <View className="absolute bottom-6 left-6">
                          <Text className="text-white/90 text-sm font-semibold uppercase tracking-wide">
                            {detectedCard ? 'CARD HOLDER' : 'PLACE CARD HERE'}
                          </Text>
                        </View>
                        
                        {/* Balance/Status indicator */}
                        <View className="absolute top-6 left-6">
                          {detectedCard ? (
                            <View className="bg-white/20 rounded-lg px-3 py-1">
                              <Text className="text-white text-sm font-bold">
                                ${detectedCard.deviceBalance.toFixed(2)}
                              </Text>
                            </View>
                          ) : (
                            <View className="bg-white/10 rounded-lg px-3 py-1">
                              <Text className="text-white/70 text-xs font-semibold">
                                {status === 'scanning' ? 'SCANNING...' : 'WAITING'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Center status indicator */}
                        <View className="absolute inset-0 items-center justify-center">
                          {status === 'idle' && !detectedCard && (
                            <View className="bg-white/20 rounded-2xl px-6 py-3 border border-white/30">
                              <Text className="text-white text-lg font-bold text-center">TAP CARD</Text>
                            </View>
                          )}

                          {status === 'scanning' && (
                            <View className="bg-blue-500/30 rounded-2xl px-6 py-3 border border-blue-300/50">
                              <Text className="text-white text-lg font-bold text-center">SCANNING</Text>
                            </View>
                          )}

                          {status === 'failed' && (
                            <View className="bg-red-500/30 rounded-2xl px-6 py-3 border border-red-300/50">
                              <Text className="text-white text-lg font-bold text-center">FAILED</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </Animated.View>
                  </View>

                  {/* Status Text and Actions */}
                  <View className="mt-8 w-full max-w-sm">
                    {status === 'idle' && !detectedCard && (
                      <View className="items-center">
                        <Text style={{ color: primaryNavy }} className="text-xl font-bold mb-2">
                          Ready for Payment
                        </Text>
                        <Text className="text-gray-500 text-center mb-6">
                          Place your RFID card within the scanner frame to detect it
                        </Text>
                        {!isWebSocketConnected && (
                          <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 w-full">
                            <Text className="text-red-600 font-semibold text-center">
                              ⚠️ RFID System Offline
                            </Text>
                          </View>
                        )}
                        <Pressable 
                          onPress={() => {
                            setIsCheckoutMode(false);
                            setDetectedCard(null);
                            setStatus('idle');
                          }}
                          className="bg-gray-100 px-8 py-3 rounded-xl"
                        >
                          <Text style={{ color: primaryNavy }} className="font-bold">Cancel Payment</Text>
                        </Pressable>
                      </View>
                    )}

                    {status === 'idle' && detectedCard && (
                      <View>
                        {/* Side-by-side layout: Card Info (Left) + Payment Actions (Right) */}
                        <View className="flex-row mb-6" style={{ gap: 16 }}>
                        {/* Left Side - Card Information */}
                        <View 
                          style={{
                            backgroundColor: '#f8fafc',
                            borderWidth: 2,
                            borderColor: '#3b82f6',
                            borderRadius: 20,
                            padding: 20,
                            flex: 1,
                            shadowColor: '#3b82f6',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.1,
                            shadowRadius: 12,
                            elevation: 6
                          }}
                        >
                          <View className="flex-row items-center mb-4">
                            <View 
                              style={{
                                width: 10,
                                height: 10,
                                backgroundColor: '#3b82f6',
                                borderRadius: 5,
                                marginRight: 10,
                                shadowColor: '#3b82f6',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.4,
                                shadowRadius: 4
                              }}
                            />
                            <Text style={{ color: '#1e40af', fontSize: 16, fontWeight: '700' }}>
                              Card Ready
                            </Text>
                          </View>
                          
                          <View style={{ gap: 12 }}>
                            <View 
                              style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                borderRadius: 10,
                                padding: 12,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>ID:</Text>
                              <Text style={{ color: '#1e40af', fontSize: 13, fontWeight: '700' }}>{detectedCard.uid}</Text>
                            </View>
                            
                            <View 
                              style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                borderRadius: 10,
                                padding: 12,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>Balance:</Text>
                              <Text style={{ color: '#1e40af', fontSize: 13, fontWeight: '700' }}>${detectedCard.deviceBalance.toFixed(2)}</Text>
                            </View>
                            
                            <View 
                              style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                borderRadius: 10,
                                padding: 12,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>Required:</Text>
                              <Text style={{ color: primaryNavy, fontSize: 13, fontWeight: '700' }}>${(getTotalPrice() / 100).toFixed(2)}</Text>
                            </View>
                            
                            <View 
                              style={{
                                backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) 
                                  ? 'rgba(59, 130, 246, 0.1)' 
                                  : 'rgba(248, 113, 113, 0.1)',
                                borderRadius: 10,
                                padding: 12,
                                borderTopWidth: 1,
                                borderTopColor: 'rgba(148, 163, 184, 0.2)',
                                marginTop: 4
                              }}
                            >
                              <View className="flex-row justify-between items-center">
                                <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>Status:</Text>
                                <View className="flex-row items-center">
                                  <View 
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: 3,
                                      backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#3b82f6' : '#f87171',
                                      marginRight: 6
                                    }}
                                  />
                                  <Text 
                                    style={{ 
                                      color: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#1e40af' : '#dc2626',
                                      fontSize: 13,
                                      fontWeight: '700'
                                    }}
                                  >
                                    {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? 'Ready' : 'Low'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* Right Side - Card Frame + Payment Actions */}
                        <View style={{ flex: 1 }}>
                          {/* Card Frame */}
                          <View 
                            style={{
                              backgroundColor: '#1e40af',
                              borderRadius: 16,
                              padding: 16,
                              marginBottom: 16,
                              shadowColor: '#1e40af',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.2,
                              shadowRadius: 8,
                              elevation: 6,
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                          >
                            {/* Card Background Pattern */}
                            <View 
                              style={{
                                position: 'absolute',
                                top: -20,
                                right: -20,
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                backgroundColor: 'rgba(255, 255, 255, 0.1)'
                              }}
                            />
                            <View 
                              style={{
                                position: 'absolute',
                                bottom: -15,
                                left: -15,
                                width: 60,
                                height: 60,
                                borderRadius: 30,
                                backgroundColor: 'rgba(255, 255, 255, 0.05)'
                              }}
                            />
                            
                            {/* Card Chip */}
                            <View 
                              style={{
                                backgroundColor: '#FFD700',
                                width: 28,
                                height: 22,
                                borderRadius: 4,
                                marginBottom: 8,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.3,
                                shadowRadius: 2
                              }}
                            >
                              <View style={{ 
                                position: 'absolute', 
                                inset: 2, 
                                borderWidth: 1, 
                                borderColor: 'rgba(0,0,0,0.1)', 
                                borderRadius: 2 
                              }} />
                            </View>
                            
                            {/* Card Number */}
                            <Text style={{ 
                              color: 'white', 
                              fontSize: 14, 
                              fontWeight: '600', 
                              letterSpacing: 2,
                              marginBottom: 8
                            }}>
                              {detectedCard.uid.slice(0, 4)} •••• ••••
                            </Text>
                            
                            {/* Card Holder */}
                            <Text style={{ 
                              color: 'rgba(255, 255, 255, 0.8)', 
                              fontSize: 10, 
                              fontWeight: '500',
                              marginBottom: 4
                            }}>
                              CARD HOLDER
                            </Text>
                            
                            {/* Balance Display */}
                            <View style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.2)',
                              borderRadius: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              alignSelf: 'flex-start'
                            }}>
                              <Text style={{ 
                                color: 'white', 
                                fontSize: 12, 
                                fontWeight: '700'
                              }}>
                                ${detectedCard.deviceBalance.toFixed(2)}
                              </Text>
                            </View>
                          </View>

                          {/* Payment Actions */}
                          {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? (
                            <View style={{ gap: 12 }}>
                              <Pressable 
                                onPress={confirmPayment}
                                style={{ 
                                  backgroundColor: '#3b82f6',
                                  paddingVertical: 16,
                                  borderRadius: 16,
                                  shadowColor: '#3b82f6',
                                  shadowOffset: { width: 0, height: 4 },
                                  shadowOpacity: 0.3,
                                  shadowRadius: 8,
                                  elevation: 6
                                }}
                              >
                                <Text style={{ 
                                  color: 'white', 
                                  fontWeight: '700', 
                                  fontSize: 16, 
                                  textAlign: 'center' 
                                }}>
                                  Confirm Payment
                                </Text>
                              </Pressable>
                              <Pressable 
                                onPress={() => setDetectedCard(null)}
                                style={{
                                  backgroundColor: '#f1f5f9',
                                  paddingVertical: 12,
                                  borderRadius: 12
                                }}
                              >
                                <Text style={{ 
                                  color: primaryNavy, 
                                  fontWeight: '600', 
                                  fontSize: 14, 
                                  textAlign: 'center' 
                                }}>
                                  Use Different Card
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            <View style={{ gap: 12 }}>
                              <View style={{
                                backgroundColor: '#fef2f2',
                                borderWidth: 1,
                                borderColor: '#fecaca',
                                borderRadius: 12,
                                padding: 16
                              }}>
                                <Text style={{ 
                                  color: '#dc2626', 
                                  fontWeight: '600', 
                                  fontSize: 14, 
                                  textAlign: 'center',
                                  marginBottom: 4
                                }}>
                                  Insufficient Balance
                                </Text>
                                <Text style={{ 
                                  color: '#991b1b', 
                                  fontSize: 12, 
                                  textAlign: 'center' 
                                }}>
                                  Need ${((getTotalPrice() / 100) - detectedCard.deviceBalance).toFixed(2)} more
                                </Text>
                              </View>
                              <View className="flex-row" style={{ gap: 8 }}>
                                <Pressable 
                                  onPress={() => setDetectedCard(null)}
                                  style={{
                                    flex: 1,
                                    backgroundColor: '#f1f5f9',
                                    paddingVertical: 12,
                                    borderRadius: 12
                                  }}
                                >
                                  <Text style={{ 
                                    color: primaryNavy, 
                                    fontWeight: '600', 
                                    fontSize: 14, 
                                    textAlign: 'center' 
                                  }}>
                                    Try Another
                                  </Text>
                                </Pressable>
                                <Pressable 
                                  onPress={() => {
                                    setIsCheckoutMode(false);
                                    setDetectedCard(null);
                                  }}
                                  style={{
                                    flex: 1,
                                    backgroundColor: '#dc2626',
                                    paddingVertical: 12,
                                    borderRadius: 12
                                  }}
                                >
                                  <Text style={{ 
                                    color: 'white', 
                                    fontWeight: '600', 
                                    fontSize: 14, 
                                    textAlign: 'center' 
                                  }}>
                                    Cancel
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                    
                    {status === 'scanning' && (
                      <View className="items-center">
                        <Text style={{ color: '#3b82f6' }} className="text-xl font-bold mb-2">
                          Processing Payment
                        </Text>
                        <Text className="text-gray-500 text-center">
                          Please wait while we process your transaction...
                        </Text>
                      </View>
                    )}

                    {status === 'failed' && (
                      <View className="items-center">
                        <Text className="text-red-600 text-xl font-bold mb-2">
                          Payment Failed
                        </Text>
                        <Text className="text-gray-500 text-center mb-6">
                          Transaction could not be completed. Please try again.
                        </Text>
                        <Pressable 
                          onPress={() => {
                            setStatus('idle');
                            setDetectedCard(null);
                          }}
                          style={{ backgroundColor: primaryNavy }}
                          className="px-8 py-3 rounded-xl"
                        >
                          <Text className="text-white font-bold">Try Again</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {status === 'success' && (
              <View className="items-center py-8">
                <Animated.View style={[animatedSuccessStyle]}>
                  <View 
                    style={{
                      backgroundColor: '#3b82f6',
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                      shadowColor: '#3b82f6',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 6
                    }}
                  >
                    <CheckCircle2 size={40} color="white" />
                  </View>
                </Animated.View>
                <Text style={{ color: '#1e40af', fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
                  Payment Successful!
                </Text>
                <Text style={{ color: '#64748b', textAlign: 'center', fontSize: 16 }}>
                  Your payment has been processed successfully.{'\n'}
                  Receipt details are shown below.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Receipt Section - Only show after successful payment */}
        {status === 'success' && (
          <View className="mx-6 mt-4 bg-white rounded-2xl p-6 shadow-sm border-2" style={{ borderColor: '#3b82f6' }}>
            <View className="items-center mb-4">
              <View 
                style={{
                  backgroundColor: '#3b82f6',
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                  shadowColor: '#3b82f6',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 3
                }}
              >
                <CheckCircle2 size={24} color="white" />
              </View>
              <Text style={{ color: primaryNavy }} className="text-lg font-bold">Payment Receipt</Text>
              <Text className="text-gray-500 text-sm">Transaction completed successfully</Text>
            </View>

            {/* Receipt Details */}
            <View className="border-t border-gray-100 pt-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-600">Transaction ID:</Text>
                <Text style={{ color: primaryNavy }} className="font-mono text-sm">
                  {paymentResult?.transactionId || `TXN-${Date.now().toString().slice(-8)}`}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-600">Date & Time:</Text>
                <Text style={{ color: primaryNavy }} className="text-sm">{new Date().toLocaleString()}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-600">Payment Method:</Text>
                <Text style={{ color: primaryNavy }} className="text-sm">
                  RFID Card {detectedCard ? `••••${detectedCard.uid.slice(-4)}` : '••••0349'}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-600">Previous Balance:</Text>
                <Text style={{ color: primaryNavy }} className="text-sm">
                  ${paymentResult?.previousBalance?.toFixed(2) || detectedCard?.deviceBalance?.toFixed(2) || '0.00'}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-600">New Balance:</Text>
                <Text style={{ color: primaryNavy }} className="text-sm">
                  ${paymentResult?.newBalance?.toFixed(2) || '0.00'}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-600">Cashier:</Text>
                <Text style={{ color: primaryNavy }} className="text-sm">{currentUser?.username || 'Sales Pro'}</Text>
              </View>
              
              <View className="border-t border-gray-100 mt-4 pt-4">
                <Text className="text-gray-600 mb-3 font-semibold">Items Purchased:</Text>
                {displayItems.map((item, index) => (
                  <View key={index} className="flex-row justify-between mb-2">
                    <View className="flex-1">
                      <Text style={{ color: primaryNavy }} className="text-sm font-medium" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-gray-500 text-xs">
                        {item.quantity} × ${(item.price / 100).toFixed(2)}
                      </Text>
                    </View>
                    <Text style={{ color: primaryNavy }} className="font-semibold">
                      ${(item.totalPrice / 100).toFixed(2)}
                    </Text>
                  </View>
                ))}
                
                <View className="border-t border-gray-100 mt-3 pt-3">
                  <View className="flex-row justify-between">
                    <Text style={{ color: primaryNavy }} className="text-lg font-bold">Total Paid:</Text>
                    <Text style={{ color: primaryNavy }} className="text-xl font-bold">
                      ${(getTotalPrice() / 100).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Receipt Footer */}
            <View className="border-t border-gray-100 mt-4 pt-4">
              <Text className="text-gray-500 text-xs text-center mb-4">
                Thank you for your purchase!{'\n'}
                Receipt sent to customer&apos;s digital wallet
              </Text>
              
              {/* Action Buttons */}
              <View className="flex-row mb-3">
                <Pressable 
                  onPress={async () => {
                    try {
                      // Create detailed receipt data with real payment information
                      const receiptData = {
                        transactionId: paymentResult?.transactionId || `TXN-${Date.now().toString().slice(-8)}`,
                        date: new Date().toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        }),
                        time: new Date().toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: true 
                        }),
                        cashier: currentUser?.username || 'Sales Pro',
                        cardUID: detectedCard?.uid || 'Unknown',
                        previousBalance: paymentResult?.previousBalance || detectedCard?.deviceBalance || 0,
                        newBalance: paymentResult?.newBalance || 0,
                        items: displayItems.map(item => ({
                          name: item.name,
                          quantity: item.quantity,
                          unitPrice: (item.price / 100).toFixed(2),
                          totalPrice: (item.totalPrice / 100).toFixed(2)
                        })),
                        subtotal: (getTotalPrice() / 100).toFixed(2),
                        totalAmount: (getTotalPrice() / 100).toFixed(2),
                        paymentMethod: `RFID Card ••••${detectedCard?.uid?.slice(-4) || '0000'}`,
                        location: 'Nexa Luxury Vehicles',
                        address: '123 Premium Drive, Luxury District'
                      };
                      
                      // Create formatted receipt text
                      const receiptText = `
═══════════════════════════════════
         NEXA LUXURY VEHICLES
═══════════════════════════════════
${receiptData.address}

Transaction ID: ${receiptData.transactionId}
Date: ${receiptData.date}
Time: ${receiptData.time}
Cashier: ${receiptData.cashier}

═══════════════════════════════════
              PAYMENT INFO
═══════════════════════════════════
Card UID: ${receiptData.cardUID}
Previous Balance: $${receiptData.previousBalance.toFixed(2)}
Amount Paid: $${receiptData.totalAmount}
New Balance: $${receiptData.newBalance.toFixed(2)}

═══════════════════════════════════
                ITEMS
═══════════════════════════════════
${receiptData.items.map(item => 
`${item.name}
  ${item.quantity} x $${item.unitPrice} = $${item.totalPrice}`
).join('\n\n')}

═══════════════════════════════════
TOTAL PAID:                 $${receiptData.totalAmount}

Payment Method: ${receiptData.paymentMethod}
═══════════════════════════════════
      Thank you for your purchase!
         Visit us again soon!
═══════════════════════════════════
                      `;
                      
                      // Share the receipt using native share functionality
                      try {
                        await Share.share({
                          message: receiptText,
                          title: `Receipt - ${receiptData.transactionId}`,
                        });
                        console.log('✅ Receipt shared successfully');
                      } catch (shareError) {
                        console.log('Share cancelled or failed:', shareError);
                      }
                      
                      // Show success message
                      Alert.alert(
                        '✅ Receipt Generated!', 
                        `Receipt created successfully!\n\n📄 Transaction: ${receiptData.transactionId}\n💰 Total: $${receiptData.totalAmount}\n📅 ${receiptData.date}\n🕐 ${receiptData.time}\n\n📱 Receipt has been shared - you can save it to your device`,
                        [
                          { 
                            text: 'View Receipt', 
                            onPress: () => {
                              Alert.alert('Digital Receipt', receiptText, [{ text: 'Close' }]);
                            }
                          },
                          { text: 'OK' }
                        ]
                      );
                    } catch (error) {
                      console.error('❌ Receipt download error:', error);
                      Alert.alert(
                        'Download Failed', 
                        `Unable to save receipt to device storage.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check storage permissions and try again.`,
                        [{ text: 'OK' }]
                      );
                    }
                  }}
                  className="flex-1 bg-gray-100 py-4 rounded-xl flex-row items-center justify-center mr-3"
                >
                  <Download size={20} color={primaryNavy} />
                  <Text style={{ color: primaryNavy }} className="ml-2 font-bold">Download Receipt</Text>
                </Pressable>
                
                <Pressable 
                  onPress={() => {
                    clearCart();
                    router.push('/(main)/salesperson/dashboard');
                  }}
                  style={{ backgroundColor: primaryNavy }}
                  className="flex-1 py-4 rounded-xl flex-row items-center justify-center"
                >
                  <ArrowLeft size={20} color="white" />
                  <Text className="text-white ml-2 font-bold">Back to Dashboard</Text>
                </Pressable>
              </View>
              
              {/* New Transaction Button */}
              <Pressable 
                onPress={() => {
                  clearCart();
                  router.push('/(main)/salesperson/products');
                }}
                style={{ backgroundColor: '#3b82f6' }}
                className="py-4 rounded-xl flex-row items-center justify-center"
              >
                <ShoppingCart size={20} color="white" />
                <Text className="text-white ml-2 font-bold">Start New Transaction</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View className="h-32" />
      </ScrollView>

      <SalespersonBottomNav primaryNavy={primaryNavy} />
    </SafeAreaView>
  );
}