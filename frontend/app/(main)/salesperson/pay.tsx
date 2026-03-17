import { View, Text, ScrollView, Pressable, Alert, Image } from 'react-native';
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

            {/* Detected Card Info - Improved UI */}
            {detectedCard && status !== 'success' && (
              <View className="mb-4">
                <View 
                  style={{ 
                    backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#dcfce7' : '#fef2f2',
                    borderColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#16a34a' : '#dc2626',
                    borderWidth: 2,
                    borderRadius: 16,
                    padding: 16,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Background decoration */}
                  <View 
                    style={{ 
                      position: 'absolute',
                      top: -20,
                      right: -20,
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#16a34a' : '#dc2626',
                      opacity: 0.1
                    }}
                  />
                  
                  {/* Card icon and status */}
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center">
                      <View 
                        style={{ 
                          backgroundColor: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#16a34a' : '#dc2626',
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12
                        }}
                      >
                        <CreditCard size={20} color="white" />
                      </View>
                      <View>
                        <Text 
                          style={{ 
                            color: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#15803d' : '#b91c1c',
                            fontFamily: 'Poppins_700Bold'
                          }} 
                          className="text-base"
                        >
                          Card Detected
                        </Text>
                        <Text 
                          style={{ 
                            color: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#16a34a' : '#dc2626',
                            fontFamily: 'Poppins_500Medium'
                          }} 
                          className="text-sm"
                        >
                          {detectedCard.uid}
                        </Text>
                      </View>
                    </View>
                    
                    <Pressable 
                      onPress={() => setDetectedCard(null)}
                      className="bg-white/80 px-3 py-2 rounded-lg border border-gray-200"
                    >
                      <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs">
                        Clear
                      </Text>
                    </Pressable>
                  </View>
                  
                  {/* Balance and payment info */}
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs mb-1">
                        Card Balance
                      </Text>
                      <Text 
                        style={{ 
                          color: detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '#15803d' : '#b91c1c',
                          fontFamily: 'Poppins_800ExtraBold'
                        }} 
                        className="text-xl"
                      >
                        ${detectedCard.deviceBalance.toFixed(2)}
                      </Text>
                    </View>
                    
                    <View className="items-end">
                      <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs mb-1">
                        Required Amount
                      </Text>
                      <Text style={{ color: primaryNavy, fontFamily: 'Poppins_800ExtraBold' }} className="text-xl">
                        ${(getTotalPrice() / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Status indicator */}
                  <View className="mt-4 pt-4 border-t border-white/50">
                    {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? (
                      <View className="flex-row items-center">
                        <CheckCircle2 size={16} color="#16a34a" />
                        <Text 
                          style={{ color: '#15803d', fontFamily: 'Poppins_600SemiBold' }} 
                          className="text-sm ml-2"
                        >
                          ✅ Sufficient balance - Ready for payment
                        </Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center">
                        <XCircle size={16} color="#dc2626" />
                        <Text 
                          style={{ color: '#b91c1c', fontFamily: 'Poppins_600SemiBold' }} 
                          className="text-sm ml-2"
                        >
                          ❌ Insufficient balance - Need ${((getTotalPrice() / 100) - detectedCard.deviceBalance).toFixed(2)} more
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {status !== 'success' && (
              <>
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
                      <>
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
                      </>
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
                      <View className="items-center">
                        <View className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6 w-full">
                          <View className="flex-row items-center justify-center mb-4">
                            <View className="w-3 h-3 bg-green-500 rounded-full mr-3" />
                            <Text className="text-green-700 font-bold text-lg">Card Detected</Text>
                          </View>
                          
                          <View className="space-y-3">
                            <View className="flex-row justify-between">
                              <Text className="text-gray-600 font-medium">Card ID:</Text>
                              <Text className="text-green-700 font-bold">{detectedCard.uid}</Text>
                            </View>
                            <View className="flex-row justify-between">
                              <Text className="text-gray-600 font-medium">Available:</Text>
                              <Text className="text-green-700 font-bold">${detectedCard.deviceBalance.toFixed(2)}</Text>
                            </View>
                            <View className="flex-row justify-between">
                              <Text className="text-gray-600 font-medium">Required:</Text>
                              <Text style={{ color: primaryNavy }} className="font-bold">${(getTotalPrice() / 100).toFixed(2)}</Text>
                            </View>
                            <View className="border-t border-green-200 pt-3">
                              <View className="flex-row justify-between">
                                <Text className="text-gray-600 font-medium">Status:</Text>
                                <Text className={`font-bold ${detectedCard.deviceBalance >= (getTotalPrice() / 100) ? 'text-green-600' : 'text-red-600'}`}>
                                  {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? '✅ Sufficient' : '❌ Insufficient'}
                                </Text>
                              </View>
                            </View>
                          </div>
                        </View>

                        {detectedCard.deviceBalance >= (getTotalPrice() / 100) ? (
                          <View className="w-full space-y-3">
                            <Pressable 
                              onPress={confirmPayment}
                              style={{ backgroundColor: '#3b82f6' }}
                              className="w-full py-4 rounded-2xl shadow-lg"
                            >
                              <Text className="text-white font-bold text-lg text-center">Confirm Payment</Text>
                            </Pressable>
                            <Pressable 
                              onPress={() => setDetectedCard(null)}
                              className="w-full bg-gray-100 py-3 rounded-xl"
                            >
                              <Text style={{ color: primaryNavy }} className="font-semibold text-center">Use Different Card</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <View className="w-full space-y-3">
                            <View className="bg-red-50 border border-red-200 rounded-xl p-4">
                              <Text className="text-red-600 font-semibold text-center mb-2">
                                Insufficient Balance
                              </Text>
                              <Text className="text-red-500 text-sm text-center">
                                Need ${((getTotalPrice() / 100) - detectedCard.deviceBalance).toFixed(2)} more to complete this transaction
                              </Text>
                            </View>
                            <View className="flex-row space-x-3">
                              <Pressable 
                                onPress={() => setDetectedCard(null)}
                                className="flex-1 bg-gray-100 py-3 rounded-xl"
                              >
                                <Text style={{ color: primaryNavy }} className="font-semibold text-center">Try Another</Text>
                              </Pressable>
                              <Pressable 
                                onPress={() => {
                                  setIsCheckoutMode(false);
                                  setDetectedCard(null);
                                }}
                                style={{ backgroundColor: '#dc2626' }}
                                className="flex-1 py-3 rounded-xl"
                              >
                                <Text className="text-white font-semibold text-center">Cancel</Text>
                              </Pressable>
                            </View>
                          </View>
                        )}
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