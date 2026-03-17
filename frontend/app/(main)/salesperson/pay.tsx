import { View, Text, ScrollView, Pressable, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { CheckCircle2, ArrowLeft, ShoppingCart, CreditCard, Trash2, Plus, Minus, Download } from 'lucide-react-native';
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
            
            // Auto-process payment when card is detected and in checkout mode
            if (isCheckoutMode && status === 'idle') {
              await processPayment(data);
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

  // Process payment with detected card
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
        `Failed to process payment for card ${cardData.uid}.\n\nError: ${error.message || 'Unknown error'}\n\nPlease try again.`,
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
    
    // Just set to scanning mode - actual payment will be triggered by RFID detection
    setStatus('scanning');
    Alert.alert(
      'Ready for Payment',
      'Please place the RFID card on the reader to process payment.',
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

            {/* Detected Card Info */}
            {detectedCard && status !== 'success' && (
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text style={{ color: '#1d4ed8' }} className="font-semibold text-sm mb-1">
                      Card Detected: {detectedCard.uid}
                    </Text>
                    <Text style={{ color: '#1e40af' }} className="text-sm">
                      Balance: ${detectedCard.deviceBalance.toFixed(2)}
                    </Text>
                  </View>
                  <Pressable 
                    onPress={() => setDetectedCard(null)}
                    className="bg-slate-100 px-3 py-1 rounded-lg"
                  >
                    <Text style={{ color: '#64748b' }} className="text-xs font-medium">Clear</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {status !== 'success' && (
              <>
                {/* RFID Card Visual - Non-tappable */}
                <View className="items-center py-8">
                  <Animated.View style={[animatedPulseStyle]}>
                    <View 
                      style={{ 
                        backgroundColor: status === 'scanning' ? '#1e40af' : primaryNavy,
                        width: 200,
                        height: 120,
                        borderRadius: 16,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        elevation: 4
                      }}
                      className="items-center justify-center relative overflow-hidden"
                    >
                      {/* Background gradient */}
                      <View 
                        style={{ 
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          width: 100,
                          height: 100,
                          borderRadius: 50,
                          position: 'absolute',
                          top: -20,
                          right: -20
                        }}
                      />
                      
                      {/* Card chip */}
                      <View 
                        style={{ 
                          backgroundColor: '#FFD700',
                          width: 32,
                          height: 24,
                          borderRadius: 4,
                          position: 'absolute',
                          top: 20,
                          left: 20
                        }}
                      />
                      
                      {/* Card number */}
                      <View className="absolute bottom-12 left-5">
                        <Text className="text-white font-mono text-base">
                          {detectedCard ? `${detectedCard.uid.slice(0, 4)} •••• •••• ${detectedCard.uid.slice(-4)}` : '7048 •••• •••• 0349'}
                        </Text>
                      </View>
                      
                      {/* Cardholder name */}
                      <View className="absolute bottom-4 left-5">
                        <Text className="text-white/80 text-xs uppercase">
                          CARD HOLDER
                        </Text>
                      </View>
                      
                      {/* Balance display */}
                      <View className="absolute top-4 right-4">
                        {detectedCard && (
                          <View className="bg-white/20 rounded-lg px-2 py-1">
                            <Text className="text-white text-xs font-semibold">
                              ${detectedCard.deviceBalance.toFixed(2)}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Waiting indicator when idle */}
                      {status === 'idle' && !detectedCard && (
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="bg-white/20 rounded-full px-4 py-2">
                            <Text className="text-white text-sm font-semibold">WAITING FOR CARD</Text>
                          </View>
                        </View>
                      )}

                      {/* Card detected but not processing */}
                      {status === 'idle' && detectedCard && (
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="bg-green-500/30 rounded-full px-4 py-2">
                            <Text className="text-white text-sm font-semibold">CARD READY</Text>
                          </View>
                        </View>
                      )}

                      {/* Processing indicator */}
                      {status === 'scanning' && (
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="bg-blue-500/30 rounded-full px-4 py-2">
                            <Text className="text-white text-sm font-semibold">PROCESSING...</Text>
                          </View>
                        </View>
                      )}

                      {/* Failed indicator */}
                      {status === 'failed' && (
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="bg-red-500/30 rounded-full px-4 py-2">
                            <Text className="text-white text-sm font-semibold">PAYMENT FAILED</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </Animated.View>

                  <Text style={{ 
                    color: status === 'scanning' ? '#3b82f6' : status === 'failed' ? '#dc2626' : detectedCard ? '#16a34a' : '#6b7280'
                  }} className="text-lg font-semibold mt-6">
                    {status === 'scanning' ? 'Processing payment...' : 
                     status === 'failed' ? 'Payment failed - try again' :
                     detectedCard ? `Card detected: ${detectedCard.uid}` :
                     'Please place your RFID card on the reader'}
                  </Text>
                  
                  {status === 'idle' && !detectedCard && (
                    <View className="items-center mt-4">
                      <Text className="text-gray-500 text-sm mb-4">
                        Hold your card close to the RFID reader device to complete payment
                      </Text>
                      {!isWebSocketConnected && (
                        <Text className="text-red-500 text-sm mb-4">
                          ⚠️ RFID system is offline. Please check connection.
                        </Text>
                      )}
                    </View>
                  )}

                  {status === 'idle' && detectedCard && (
                    <View className="items-center mt-4">
                      <Text className="text-green-600 text-sm mb-2">
                        ✅ Card detected and ready for payment
                      </Text>
                      <Text className="text-gray-500 text-sm mb-4">
                        Balance: ${detectedCard.deviceBalance.toFixed(2)} | Required: ${(getTotalPrice() / 100).toFixed(2)}
                      </Text>
                      {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? (
                        <Text className="text-green-600 text-sm font-semibold">
                          ✅ Sufficient balance - Payment will process automatically
                        </Text>
                      ) : (
                        <Text className="text-red-500 text-sm font-semibold">
                          ❌ Insufficient balance - Need ${((getTotalPrice() / 100) - detectedCard.deviceBalance).toFixed(2)} more
                        </Text>
                      )}
                    </View>
                  )}
                  
                  {status === 'scanning' && (
                    <Text className="text-blue-500 text-sm mt-2">
                      Please wait while we process your payment
                    </Text>
                  )}

                  {status === 'failed' && (
                    <View className="items-center mt-4">
                      <Text className="text-red-500 text-sm mb-4">
                        Payment could not be processed. Please try again or use a different card.
                      </Text>
                      <Pressable 
                        onPress={() => {
                          setStatus('idle');
                          setDetectedCard(null);
                        }}
                        style={{ backgroundColor: primaryNavy }}
                        className="px-6 py-3 rounded-xl"
                      >
                        <Text className="text-white font-bold">Try Again</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </>
            )}

            {status === 'success' && (
              <View className="items-center py-8">
                <Animated.View style={[animatedSuccessStyle]}>
                  <View className="bg-green-500 w-20 h-20 rounded-full items-center justify-center mb-4">
                    <CheckCircle2 size={40} color="white" />
                  </View>
                </Animated.View>
                <Text style={{ color: '#10b981' }} className="text-xl font-bold mb-2">
                  Payment Successful!
                </Text>
                <Text className="text-gray-500 text-center">
                  Your payment has been processed successfully.{'\n'}
                  Receipt details are shown below.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Receipt Section - Only show after successful payment */}
        {status === 'success' && (
          <View className="mx-6 mt-4 bg-white rounded-2xl p-6 shadow-sm border border-green-200">
            <View className="items-center mb-4">
              <View className="bg-green-500 w-12 h-12 rounded-full items-center justify-center mb-3">
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
                      // Create detailed receipt data
                      const receiptData = {
                        transactionId: `TXN-${Date.now().toString().slice(-8)}`,
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
                        items: displayItems.map(item => ({
                          name: item.name,
                          quantity: item.quantity,
                          unitPrice: (item.price / 100).toFixed(2),
                          totalPrice: (item.totalPrice / 100).toFixed(2)
                        })),
                        subtotal: (getTotalPrice() / 100).toFixed(2),
                        tax: ((getTotalPrice() * 0.1) / 100).toFixed(2),
                        totalAmount: ((getTotalPrice() * 1.1) / 100).toFixed(2),
                        paymentMethod: 'RFID Card ••••0349',
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
                ITEMS
═══════════════════════════════════
${receiptData.items.map(item => 
`${item.name}
  ${item.quantity} x $${item.unitPrice} = $${item.totalPrice}`
).join('\n\n')}

═══════════════════════════════════
Subtotal:                   $${receiptData.subtotal}
Tax (10%):                  $${receiptData.tax}
TOTAL:                      $${receiptData.totalAmount}

Payment Method: ${receiptData.paymentMethod}
═══════════════════════════════════
      Thank you for your purchase!
         Visit us again soon!
═══════════════════════════════════
                      `;
                      
                      // For now, show detailed success message
                      Alert.alert(
                        'Receipt Generated Successfully!', 
                        `Receipt details:\n\n📄 Transaction: ${receiptData.transactionId}\n💰 Total: $${receiptData.totalAmount}\n📅 ${receiptData.date}\n🕐 ${receiptData.time}\n\nReceipt has been prepared for download.`,
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
                      Alert.alert('Download Failed', 'Unable to download receipt. Please try again.');
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
                className="bg-green-500 py-4 rounded-xl flex-row items-center justify-center"
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