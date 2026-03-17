import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Maximize, Wifi, Cpu, ShieldCheck, CheckCircle, ChevronRight, TrendingUp, Users, Zap, Clock, BarChart3, Activity, DollarSign, CreditCard, ArrowUpRight, ArrowDownRight, Radio } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat, 
  withSequence,
  interpolate,
  Easing
} from 'react-native-reanimated';
import { AgentTopbar } from '../../../components/AgentTopbar';
import { AgentBottomNav } from '../../../components/AgentBottomNav';
import { StorageService } from '../../../services/storage';
import { User, apiService } from '../../../services/api';
import { webSocketService, CardScannedEvent } from '../../../services/websocket';
import { Alert } from 'react-native';

export default function AgentScanScreen() {
  const router = useRouter();
  const primaryNavy = "#002B5B";
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<'NGN' | 'USD' | 'EUR'>('NGN');
  const [scanResult, setScanResult] = useState<{id: string, name: string, balance: number} | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [userCards, setUserCards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [lastScannedCard, setLastScannedCard] = useState<CardScannedEvent | null>(null);

  // Currency conversion rates (in a real app, these would come from an API)
  const currencyRates = {
    NGN: 1600, // 1 USD = 1600 NGN
    USD: 1,    // Base currency
    EUR: 0.85  // 1 USD = 0.85 EUR
  };

  // Load current user data and their cards
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setIsLoading(true);
        const user = await StorageService.getUser();
        setCurrentUser(user);
        
        // Set API token for authenticated requests
        const token = await StorageService.getToken();
        if (token) {
          apiService.setToken(token);
          console.log('🔑 API token set for authenticated requests');
          
          // Load user's cards
          const cardsResponse = await apiService.getUserCards();
          if (cardsResponse.success) {
            setUserCards(cardsResponse.cards || []);
            console.log('📱 User cards loaded:', cardsResponse.cards);
          }
          
          // Load notification count
          const notifCountResponse = await apiService.getUnreadNotificationCount();
          if (notifCountResponse.success) {
            setNotificationCount(notifCountResponse.count || 0);
            console.log('🔔 Notification count loaded:', notifCountResponse.count);
          }
        }
      } catch (error) {
        console.error('Failed to load user data:', error);
        Alert.alert('Error', 'Failed to load user data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    loadUserData();
  }, []);

  // WebSocket connection and RFID card detection
  useEffect(() => {
    const connectWebSocket = async () => {
      try {
        console.log('🔌 Attempting WebSocket connection...');
        const connected = await webSocketService.connect();
        setIsWebSocketConnected(connected);
        
        if (connected) {
          console.log('✅ WebSocket connected successfully');
          
          // Listen for real RFID card detections
          const handleCardScanned = async (data: CardScannedEvent) => {
            console.log('📱 Real RFID card detected:', data);
            setLastScannedCard(data);
            
            // Get fresh balance from backend for the detected card
            try {
              const balanceResponse = await apiService.getBalance(data.uid);
              if (balanceResponse.success) {
                // Update the card data with fresh balance
                const updatedCardData = {
                  ...data,
                  deviceBalance: balanceResponse.balance
                };
                setLastScannedCard(updatedCardData);
                
                // Auto-stop scanning when card is detected
                if (isScanning) {
                  setIsScanning(false);
                  
                  // Update scan result with real card data and fresh balance
                  setScanResult({
                    id: data.uid,
                    name: currentUser?.username || 'Card Holder',
                    balance: balanceResponse.balance
                  });
                }
              }
            } catch (error) {
              console.error('Failed to get fresh balance:', error);
              // Still show the card with device balance if API fails
              if (isScanning) {
                setIsScanning(false);
                setScanResult({
                  id: data.uid,
                  name: currentUser?.username || 'Card Holder',
                  balance: data.deviceBalance
                });
              }
            }
          };

          webSocketService.on('card-scanned', handleCardScanned);

          // Cleanup function
          return () => {
            webSocketService.off('card-scanned', handleCardScanned);
          };
        } else {
          console.log('❌ Failed to connect to WebSocket');
        }
      } catch (error) {
        console.error('WebSocket connection error:', error);
        setIsWebSocketConnected(false);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      webSocketService.disconnect();
    };
  }, [isScanning, currentUser]);

  // Convert balance to selected currency
  const convertCurrency = (amountInUSD: number): string => {
    const convertedAmount = amountInUSD * currencyRates[selectedCurrency];
    
    switch (selectedCurrency) {
      case 'NGN':
        return `₦${convertedAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'EUR':
        return `€${convertedAmount.toLocaleString('en-EU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'USD':
      default:
        return `$${convertedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  // Animation values
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const scanLinePosition = useSharedValue(0);
  const rippleScale = useSharedValue(1);
  const rippleOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (isScanning) {
      // Pulse animation
      pulseScale.value = withRepeat(
        withTiming(1.3, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 600 }),
          withTiming(0, { duration: 600 })
        ),
        -1,
        false
      );

      // Scanning line animation
      scanLinePosition.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );

      // Ripple effect
      rippleScale.value = withRepeat(
        withTiming(2, { duration: 2000, easing: Easing.out(Easing.quad) }),
        -1,
        false
      );
      rippleOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 200 }),
          withTiming(0, { duration: 1800 })
        ),
        -1,
        false
      );

      // Glow effect
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 800 }),
          withTiming(0.3, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0, { duration: 300 });
      scanLinePosition.value = withTiming(0, { duration: 300 });
      rippleScale.value = withTiming(1, { duration: 300 });
      rippleOpacity.value = withTiming(0, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [isScanning]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const animatedScanLineStyle = useAnimatedStyle(() => ({
    transform: [{ 
      translateY: interpolate(scanLinePosition.value, [0, 1], [-55, 55]) 
    }],
    opacity: isScanning ? 0.8 : 0,
  }));

  const animatedRippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handleStartScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    setLastScannedCard(null);
    
    try {
      // Check WebSocket connection
      if (!isWebSocketConnected) {
        setIsScanning(false);
        Alert.alert(
          'Connection Error', 
          'Not connected to RFID system. Please check your connection and try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('🔍 Starting real RFID scan - waiting for card detection...');
      
      // Set a timeout for scanning (30 seconds)
      const scanTimeout = setTimeout(() => {
        if (isScanning) {
          setIsScanning(false);
          Alert.alert(
            'Scan Timeout', 
            'No RFID card detected. Please place a card near the reader and try again.',
            [{ text: 'OK' }]
          );
        }
      }, 30000);

      // The actual card detection will be handled by the WebSocket listener
      // When a card is detected, the WebSocket event will automatically stop scanning
      
    } catch (error) {
      console.error('❌ Scan error:', error);
      setIsScanning(false);
      Alert.alert('Scan Error', 'Failed to start RFID scan. Please try again.');
    }
  };

  const NexaCard = () => {
    // Priority: 1. Last scanned card, 2. Scan result, 3. First user card, 4. No card
    let displayCard = null;
    let displayBalance = 0;
    let cardSource = 'none';

    if (lastScannedCard) {
      displayCard = { cardUid: lastScannedCard.uid };
      displayBalance = lastScannedCard.deviceBalance;
      cardSource = 'scanned';
    } else if (scanResult) {
      displayCard = { cardUid: scanResult.id };
      displayBalance = scanResult.balance;
      cardSource = 'result';
    } else if (userCards.length > 0) {
      displayCard = userCards[0];
      displayBalance = displayCard.balance / 100; // Convert from cents to dollars
      cardSource = 'user';
    }
    
    return (
      <View className="px-4 mt-2">
        <View 
          style={{ 
            height: 280, 
            backgroundColor: displayCard ? primaryNavy : '#64748b', 
            borderRadius: 16, 
            padding: 30 
          }} 
          className="shadow-2xl shadow-blue-900/20 border border-blue-100 relative overflow-hidden"
        >
          <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', width: 200, height: 200, borderRadius: 100, position: 'absolute', top: -100, right: -100 }} />
          
          {/* Status indicator for scanned cards */}
          {cardSource === 'scanned' && (
            <View className="absolute top-4 left-4">
              <View className="bg-green-500 px-2 py-1 rounded-full flex-row items-center">
                <View className="w-2 h-2 bg-white rounded-full mr-1" />
                <Text style={{ color: 'white', fontFamily: 'Poppins_600SemiBold' }} className="text-xs">
                  LIVE
                </Text>
              </View>
            </View>
          )}
          
          <View className="flex-row justify-between items-start mb-6">
            <View style={{ backgroundColor: '#FFD700', width: 50, height: 38, borderRadius: 8, opacity: 0.9, position: 'relative', overflow: 'hidden' }}>
               <View className="absolute inset-0 border border-black/10 opacity-20" />
               <View className="absolute top-1/2 w-full h-[1px] bg-black/10" />
               <View className="absolute left-1/2 h-full w-[1px] bg-black/10" />
            </View>
            <Wifi size={24} color="white" opacity={displayCard ? 0.6 : 0.3} />
          </View>
          
          <Text style={{ 
            color: 'white',
            fontFamily: 'Poppins_900Black'
          }} className="text-2xl tracking-[4px] mb-8 opacity-80">
            {displayCard ? '**** **** **** ****' : '---- ---- ---- ----'}
          </Text>
          
          <View className="flex-row justify-between items-end mt-auto">
            <View>
              <Text style={{ 
                color: 'rgba(255,255,255,0.6)',
                fontFamily: 'Poppins_800ExtraBold'
              }} className="text-[10px] uppercase tracking-[2px] mb-2">CARD UID</Text>
              <View className="flex-row items-center">
                <Cpu size={14} color="white" className="mr-2" opacity={0.7} />
                <Text style={{ 
                  color: 'white',
                  fontFamily: 'Poppins_900Black'
                }} className="text-lg tracking-tighter">
                  {displayCard ? displayCard.cardUid : 'No Card'}
                </Text>
              </View>
              {cardSource === 'scanned' && (
                <Text style={{ 
                  color: 'rgba(34, 197, 94, 0.8)',
                  fontFamily: 'Poppins_500Medium'
                }} className="text-xs mt-1">
                  Detected: {new Date(lastScannedCard!.timestamp).toLocaleTimeString()}
                </Text>
              )}
            </View>
            <View className="items-end">
              <Text style={{ 
                color: 'rgba(255,255,255,0.6)',
                fontFamily: 'Poppins_800ExtraBold'
              }} className="text-[10px] uppercase tracking-[2px] mb-2">WALLET BALANCE</Text>
              <Text style={{ 
                color: 'white',
                fontFamily: 'Poppins_900Black'
              }} className="text-2xl">
                {isLoading ? '...' : displayCard ? convertCurrency(displayBalance) : '--'}
              </Text>
              {cardSource === 'scanned' && (
                <Text style={{ 
                  color: 'rgba(34, 197, 94, 0.8)',
                  fontFamily: 'Poppins_500Medium'
                }} className="text-xs">
                  Live Balance
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <AgentTopbar 
        name={currentUser?.username || 'Agent'} 
        role={currentUser?.role === 'admin' ? 'Nexa Agent' : 'Nexa Salesman'} 
        primaryNavy={primaryNavy}
        notificationCount={notificationCount}
      />
      
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <NexaCard />
        
        {/* Clear Card Button */}
        {(lastScannedCard || scanResult) && (
          <View className="px-4 mt-4">
            <Pressable 
              onPress={() => {
                setLastScannedCard(null);
                setScanResult(null);
              }}
              className="bg-slate-100 px-4 py-3 rounded-xl border border-slate-200 flex-row items-center justify-center"
            >
              <Text style={{ 
                color: '#64748b',
                fontFamily: 'Poppins_600SemiBold'
              }} className="text-sm">
                Clear Card Display
              </Text>
            </Pressable>
          </View>
        )}
        
        <View className="px-6 mt-10">

          {/* User Cards Section */}
          {userCards.length > 0 && (
            <View className="mb-8">
              <Text style={{ color: primaryNavy, fontFamily: 'Poppins_800ExtraBold' }} className="text-xl mb-4">Your Cards</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {userCards.map((card, index) => (
                  <View key={card.cardUid} className="mr-4">
                    <View className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm" style={{ width: 200 }}>
                      <View className="flex-row items-center justify-between mb-3">
                        <View className="bg-slate-100 p-2 rounded-xl">
                          <CreditCard size={16} color={primaryNavy} />
                        </View>
                        <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs">
                          Card #{index + 1}
                        </Text>
                      </View>
                      <Text style={{ color: primaryNavy, fontFamily: 'Poppins_700Bold' }} className="text-sm mb-1">
                        {card.cardUid}
                      </Text>
                      <Text style={{ color: primaryNavy, fontFamily: 'Poppins_800ExtraBold' }} className="text-lg">
                        {convertCurrency(card.balance / 100)}
                      </Text>
                      <Text style={{ color: '#64748b', fontFamily: 'Poppins_400Regular' }} className="text-xs mt-1">
                        Added {new Date(card.assignedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* No Cards Message */}
          {!isLoading && userCards.length === 0 && !lastScannedCard && !scanResult && (
            <View className="mb-8 bg-blue-50 p-6 rounded-2xl border border-blue-200">
              <View className="flex-row items-start">
                <View className="bg-blue-100 p-3 rounded-xl mr-4">
                  <CreditCard size={24} color="#3b82f6" />
                </View>
                <View className="flex-1">
                  <Text style={{ 
                    color: '#1e40af',
                    fontFamily: 'Poppins_700Bold'
                  }} className="text-lg mb-2">No Cards Assigned</Text>
                  <Text style={{ 
                    color: '#1d4ed8',
                    fontFamily: 'Poppins_500Medium'
                  }} className="text-sm leading-5">
                    You don't have any cards assigned to your account. Please contact an administrator to assign a card to start using the system.
                  </Text>
                </View>
              </View>
            </View>
          )}
          {/* Quick Actions */}
          <View className="mb-8">
            <Text style={{ color: primaryNavy, fontFamily: 'Poppins_800ExtraBold' }} className="text-xl mb-4">Quick Actions</Text>
            
            <View className="flex-row justify-between">
              <Pressable 
                onPress={() => router.push('/(main)/agent/topup')}
                className="flex-1 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 mr-2 shadow-lg"
                style={{ backgroundColor: primaryNavy }}
                disabled={userCards.length === 0}
              >
                <View className="bg-white/20 p-2 rounded-xl mb-3 self-start">
                  <Zap size={20} color="white" />
                </View>
                <Text style={{ color: 'white', fontFamily: 'Poppins_700Bold' }} className="text-sm">Top-up</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: 'Poppins_500Medium' }} className="text-xs">
                  {userCards.length === 0 ? 'No cards' : 'Add funds'}
                </Text>
              </Pressable>

              <Pressable 
                onPress={() => router.push('/(main)/agent/transactions')}
                className="flex-1 bg-white rounded-2xl p-4 mx-1 border border-slate-100 shadow-sm"
              >
                <View className="bg-slate-50 p-2 rounded-xl mb-3 self-start">
                  <BarChart3 size={20} color={primaryNavy} />
                </View>
                <Text style={{ color: primaryNavy, fontFamily: 'Poppins_700Bold' }} className="text-sm">History</Text>
                <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs">View all</Text>
              </Pressable>

              <Pressable 
                onPress={() => router.push('/(main)/agent/settings')}
                className="flex-1 bg-white rounded-2xl p-4 ml-2 border border-slate-100 shadow-sm"
              >
                <View className="bg-slate-50 p-2 rounded-xl mb-3 self-start">
                  <Users size={20} color={primaryNavy} />
                </View>
                <Text style={{ color: primaryNavy, fontFamily: 'Poppins_700Bold' }} className="text-sm">Settings</Text>
                <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs">Configure</Text>
              </Pressable>
            </View>
          </View>

          {/* Currency Selection Section */}
          <View className="mb-8">
            <Text style={{ color: primaryNavy, fontFamily: 'Poppins_800ExtraBold' }} className="text-2xl mb-6">Currency</Text>
            <View className="flex-row justify-between mb-3">
              <Pressable 
                onPress={() => setSelectedCurrency('NGN')}
                style={{ backgroundColor: selectedCurrency === 'NGN' ? primaryNavy : '#f1f5f9' }}
                className={`flex-1 mx-2 px-10 py-5 rounded-2xl shadow-lg ${selectedCurrency === 'NGN' ? '' : 'border border-slate-200'}`}
              >
                <Text style={{ 
                  color: selectedCurrency === 'NGN' ? 'white' : '#64748b',
                  fontFamily: 'Poppins_700Bold'
                }} className="text-lg text-center">NGN</Text>
              </Pressable>
              <Pressable 
                onPress={() => setSelectedCurrency('USD')}
                style={{ backgroundColor: selectedCurrency === 'USD' ? primaryNavy : '#f1f5f9' }}
                className={`flex-1 mx-2 px-10 py-5 rounded-2xl shadow-lg ${selectedCurrency === 'USD' ? '' : 'border border-slate-200'}`}
              >
                <Text style={{ 
                  color: selectedCurrency === 'USD' ? 'white' : '#64748b',
                  fontFamily: 'Poppins_700Bold'
                }} className="text-lg text-center">USD</Text>
              </Pressable>
              <Pressable 
                onPress={() => setSelectedCurrency('EUR')}
                style={{ backgroundColor: selectedCurrency === 'EUR' ? primaryNavy : '#f1f5f9' }}
                className={`flex-1 mx-2 px-10 py-5 rounded-2xl shadow-lg ${selectedCurrency === 'EUR' ? '' : 'border border-slate-200'}`}
              >
                <Text style={{ 
                  color: selectedCurrency === 'EUR' ? 'white' : '#64748b',
                  fontFamily: 'Poppins_700Bold'
                }} className="text-lg text-center">EUR</Text>
              </Pressable>
            </View>
            {/* Exchange Rate Info */}
            <View className="bg-slate-50 p-3 rounded-xl">
              <Text style={{ color: '#64748b', fontFamily: 'Poppins_500Medium' }} className="text-xs text-center">
                {selectedCurrency === 'USD' ? 'Base currency' : 
                 selectedCurrency === 'NGN' ? '1 USD = ₦1,600' : 
                 '1 USD = €0.85'} • Rates are approximate
              </Text>
            </View>
          </View>

          {/* Nexa Reader Section */}
          <View className="mb-8">
            <Text style={{ color: primaryNavy, fontFamily: 'Poppins_800ExtraBold' }} className="text-2xl mb-6">Nexa Reader</Text>
            
            <View className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
              <View className="flex-row justify-between items-start mb-6">
                <View className="flex-1">
                  {/* Card Scanning Animation Area */}
                  <View className="items-center justify-center py-8">
                    <Pressable 
                      onPress={handleStartScan}
                      disabled={isScanning || !isWebSocketConnected}
                      className="items-center justify-center"
                    >
                      {/* Multiple ripple effects */}
                      <Animated.View 
                        style={[
                          { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: primaryNavy },
                          animatedRippleStyle
                        ]} 
                      />
                      <Animated.View 
                        style={[
                          { position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: '#3b82f6' },
                          { ...animatedRippleStyle, opacity: animatedRippleStyle.opacity * 0.6 }
                        ]} 
                      />
                      
                      {/* Pulse effect */}
                      <Animated.View 
                        style={[
                          { position: 'absolute', width: 200, height: 125, borderRadius: 16, backgroundColor: primaryNavy },
                          animatedPulseStyle
                        ]} 
                      />
                      
                      {/* Glow effect */}
                      <Animated.View 
                        style={[
                          { 
                            position: 'absolute', 
                            width: 190, 
                            height: 115, 
                            borderRadius: 14, 
                            backgroundColor: '#60a5fa',
                            shadowColor: '#3b82f6',
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 1,
                            shadowRadius: 20,
                            elevation: 20
                          },
                          animatedGlowStyle
                        ]} 
                      />
                      
                      {/* Card Visual - Blue Design */}
                      <View 
                        style={{ 
                          backgroundColor: isScanning ? '#1e40af' : primaryNavy,
                          width: 180,
                          height: 110,
                          borderRadius: 12,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.15,
                          shadowRadius: 12,
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
                            right: -20
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
                            left: -10
                          }}
                        />
                        
                        {/* Card chip */}
                        <View 
                          style={{ 
                            backgroundColor: '#FFD700',
                            width: 28,
                            height: 22,
                            borderRadius: 4,
                            position: 'absolute',
                            top: 16,
                            left: 16,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.2,
                            shadowRadius: 3
                          }}
                        >
                          {/* Chip details */}
                          <View className="absolute inset-1 border border-yellow-600/20 rounded-sm" />
                        </View>
                        
                        {/* VISA logo area */}
                        <View className="absolute top-4 right-4">
                          <Text className="text-white font-bold text-xs opacity-80">VISA</Text>
                        </View>
                        
                        {/* Card number */}
                        <View className="absolute bottom-8 left-4">
                          <Text className="text-white font-mono text-sm tracking-wider">
                            {userCards.length > 0 ? `${userCards[0].cardUid.slice(0, 4)} •••• •••• ${userCards[0].cardUid.slice(-4)}` : '•••• •••• •••• ••••'}
                          </Text>
                        </View>
                        
                        {/* Cardholder name */}
                        <View className="absolute bottom-3 left-4">
                          <Text className="text-white/80 text-xs font-medium uppercase tracking-wide">
                            {currentUser?.username?.toUpperCase() || 'CARD HOLDER'}
                          </Text>
                        </View>
                        
                        {/* Expiry */}
                        <View className="absolute bottom-3 right-4">
                          <Text className="text-white/60 text-xs">12/28</Text>
                        </View>
                        
                        {/* Scanning line animation */}
                        {isScanning && (
                          <Animated.View 
                            style={[
                              {
                                position: 'absolute',
                                width: '100%',
                                height: 2,
                                backgroundColor: '#60a5fa',
                                shadowColor: '#60a5fa',
                                shadowOffset: { width: 0, height: 0 },
                                shadowOpacity: 1,
                                shadowRadius: 8,
                                elevation: 10
                              },
                              animatedScanLineStyle
                            ]}
                          />
                        )}
                        
                        {/* RFID scanning indicator */}
                        {isScanning && (
                          <View className="absolute inset-0 items-center justify-center">
                            <View className="flex-row items-center">
                              <Radio size={16} color="white" className="mr-2" />
                              <View className="w-2 h-2 bg-white rounded-full animate-pulse mr-1" />
                              <View className="w-2 h-2 bg-white rounded-full animate-pulse mr-1" />
                              <View className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            </View>
                          </View>
                        )}
                      </View>
                    </Pressable>
                    
                    <Text style={{ 
                      color: isScanning ? '#2563eb' : !isWebSocketConnected ? '#94a3b8' : '#64748b',
                      fontFamily: 'Poppins_700Bold'
                    }} className="text-lg mt-6">
                      {isScanning ? 'Waiting for RFID card...' : !isWebSocketConnected ? 'RFID system offline' : 'Tap to start RFID scan'}
                    </Text>
                    
                    {isScanning && (
                      <View className="items-center mt-3">
                        <Text style={{ 
                          color: '#3b82f6',
                          fontFamily: 'Poppins_500Medium'
                        }} className="text-sm animate-pulse mb-2">
                          Place RFID card near the reader
                        </Text>
                        <View className="flex-row items-center">
                          <Radio size={14} color="#3b82f6" className="mr-2" />
                          <Text style={{ 
                            color: '#64748b',
                            fontFamily: 'Poppins_400Regular'
                          }} className="text-xs">
                            {isWebSocketConnected ? 'Listening for RFID signals...' : 'Connection required'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
                
                {/* Copy QR Code Button (styled as scan card button) */}
                <Pressable className="bg-slate-100 px-6 py-3 rounded-xl border border-slate-200 shadow-sm">
                  <Text style={{ 
                    color: '#64748b',
                    fontFamily: 'Poppins_500Medium'
                  }} className="text-base">Scan card</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Scan Result Card */}
          {scanResult && (
            <View className="mt-8 bg-white border border-slate-100 rounded-3xl p-6 shadow-2xl shadow-blue-900/10">
               <View className="flex-row items-center mb-6">
                  <View className="bg-green-100 p-2 rounded-xl mr-4">
                     <CheckCircle size={24} color="#16a34a" />
                  </View>
                  <View>
                     <Text className="text-green-600 font-black text-xs uppercase tracking-widest">Connection Secured</Text>
                     <Text style={{ color: primaryNavy }} className="text-lg font-black">NexCard Detected</Text>
                  </View>
               </View>

               <View className="bg-slate-50 p-5 rounded-2xl mb-6">
                  <View className="flex-row justify-between mb-2">
                     <Text className="text-slate-400 font-bold text-[10px] uppercase">Owner</Text>
                     <Text style={{ color: primaryNavy }} className="font-black text-sm">{scanResult.name}</Text>
                  </View>
                  <View className="flex-row justify-between mb-2">
                     <Text className="text-slate-400 font-bold text-[10px] uppercase">UID</Text>
                     <Text style={{ color: primaryNavy }} className="font-mono text-sm">{scanResult.id}</Text>
                  </View>
                  <View className="flex-row justify-between">
                     <Text className="text-slate-400 font-bold text-[10px] uppercase">Balance</Text>
                     <Text style={{ color: primaryNavy }} className="font-black text-lg">
                       {convertCurrency(scanResult.balance / 100)}
                     </Text>
                  </View>
               </View>

               <Pressable 
                 onPress={() => router.push('/(main)/agent/topup')}
                 style={{ backgroundColor: primaryNavy }}
                 className="h-14 rounded-2xl flex-row items-center justify-center active:bg-blue-900"
               >
                  <Text className="text-white font-black text-sm uppercase tracking-widest mr-2">Open Wallet</Text>
                  <ChevronRight size={18} color="white" />
               </Pressable>
            </View>
          )}

          {!scanResult && !isScanning && (
            <View className="mt-8 bg-blue-50/50 p-8 rounded-2xl border border-blue-100/50 flex-row items-start">
               <View className="bg-blue-600/10 p-3 rounded-xl mr-6">
                  <ShieldCheck size={28} color={primaryNavy} />
               </View>
               <View className="flex-1">
                  <Text style={{ 
                    color: primaryNavy,
                    fontFamily: 'Poppins_800ExtraBold'
                  }} className="text-lg mb-2">Nexa Security</Text>
                  <Text style={{ 
                    color: '#64748b',
                    fontFamily: 'Poppins_500Medium'
                  }} className="text-base leading-6">Hold your RFID card close to the back of the device for high-speed synchronization.</Text>
               </View>
            </View>
          )}
        </View>
        <View className="h-40" />
      </ScrollView>

      <AgentBottomNav primaryNavy={primaryNavy} />
    </SafeAreaView>
  );
}
