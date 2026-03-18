import { View, Text, ScrollView, Pressable, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Plus, Minus, Search, ShoppingCart, ArrowLeft, Filter, Grid, List, Heart, Package, Trash2 } from 'lucide-react-native';
import { SalespersonBottomNav } from '../../../components/SalespersonBottomNav';
import { StorageService } from '../../../services/storage';
import { apiService } from '../../../services/api';
import { useCart } from '../../../contexts/CartContext';

interface Product {
  _id: string;
  name: string;
  price: number;
  originalPrice?: number;
  category: string;
  description: string;
  image: string;
  badge?: string;
  badgeColor?: string;
  rating?: number;
  inStock: boolean;
  active: boolean;
}

export default function SalespersonProducts() {
  const router = useRouter();
  const primaryNavy = "#002B5B";
  const accentBlue = "#3b82f6";
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCart, setShowCart] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart context
  const { items, addToCart, updateQuantity, removeFromCart, getTotalItems, getTotalPrice } = useCart();

  // Load products from backend
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true);
        const token = await StorageService.getToken();
        if (token) {
          apiService.setToken(token);
          const response = await apiService.getProducts();
          if (response.success) {
            setProducts(response.products || []);
            console.log('📦 Products loaded:', response.products);
          }
        }
      } catch (error) {
        console.error('Failed to load products:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadProducts();
  }, []);

  // Get unique categories from products
  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  // Filter products by category and search
  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && product.active;
  });

  const handleQuantityUpdate = (product: Product, delta: number) => {
    const currentItem = items.find(item => item._id === product._id);
    const currentQuantity = currentItem ? currentItem.quantity : 0;
    const newQuantity = Math.max(0, currentQuantity + delta);
    
    if (newQuantity === 0 && currentItem) {
      removeFromCart(product._id);
    } else if (newQuantity > 0) {
      if (currentItem) {
        updateQuantity(product._id, newQuantity);
      } else {
        addToCart(product, delta);
      }
    }
    
    // Show cart when items are added
    if (newQuantity > 0 && !showCart) {
      setShowCart(true);
    }
  };

  const getProductQuantity = (productId: string) => {
    const item = items.find(item => item._id === productId);
    return item ? item.quantity : 0;
  };

  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(category);
  };

  const handleCheckout = () => {
    router.push('/(main)/salesperson/pay');
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 bg-white">
        <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <ArrowLeft size={24} color={primaryNavy} />
        </Pressable>
        <Text style={{ color: primaryNavy }} className="text-lg font-bold">Products</Text>
        <View className="flex-row">
          <Pressable 
            onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="mr-3"
          >
            {viewMode === 'grid' ? <List size={24} color={primaryNavy} /> : <Grid size={24} color={primaryNavy} />}
          </Pressable>
          <Heart size={24} color={primaryNavy} />
        </View>
      </View>

      {/* Search and Filter Section */}
      <View className="px-6 py-4 bg-white border-b border-gray-100">
        {/* Search Bar */}
        <View className="flex-row items-center mb-4">
          <View className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl mr-3">
            <Search size={20} color="#94a3b8" />
            <TextInput 
              placeholder="Search products..." 
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="ml-3 flex-1 text-slate-600 text-base"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <Pressable 
            style={{ backgroundColor: accentBlue }}
            className="w-14 h-14 rounded-2xl items-center justify-center shadow-lg"
          >
            <Filter size={22} color="white" />
          </Pressable>
        </View>

        {/* Category Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((category, index) => (
            <Pressable 
              key={index}
              onPress={() => handleCategoryFilter(category)}
              style={{ 
                backgroundColor: selectedCategory === category ? primaryNavy : 'transparent',
                marginRight: 16
              }}
              className="px-6 py-3 rounded-2xl border border-slate-200"
            >
              <Text style={{ 
                color: selectedCategory === category ? 'white' : '#64748b'
              }} className="text-base font-semibold">{category}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {isLoading ? (
          // Loading state
          <View className="flex-row flex-wrap justify-between">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <View key={item} className="w-[48%] mb-4">
                <View className="bg-slate-100 rounded-3xl p-4 animate-pulse">
                  <View className="w-full h-40 bg-slate-200 rounded-2xl mb-3" />
                  <View className="w-3/4 h-4 bg-slate-200 rounded mb-1" />
                  <View className="w-1/2 h-3 bg-slate-200 rounded mb-2" />
                  <View className="w-1/3 h-6 bg-slate-200 rounded" />
                </View>
              </View>
            ))}
          </View>
        ) : filteredProducts.length > 0 ? (
          viewMode === 'grid' ? (
            <View className="flex-row flex-wrap justify-between">
              {filteredProducts.map(product => (
                <View key={product._id} className="w-[48%] mb-4">
                  <Pressable 
                    onPress={() => router.push({
                      pathname: '/(main)/salesperson/product-detail',
                      params: { productId: product._id }
                    })}
                    className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm"
                  >
                    <View className="relative mb-3">
                      <View className="w-full h-40 rounded-2xl overflow-hidden">
                        {product.image ? (
                          <Image 
                            source={{ uri: product.image }}
                            style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                          />
                        ) : (
                          <View className="w-full h-full bg-slate-100 items-center justify-center">
                            <Package size={32} color={primaryNavy} />
                          </View>
                        )}
                      </View>
                      {product.badge && (
                        <View 
                          style={{ backgroundColor: product.badgeColor || '#3b82f6' }}
                          className="absolute top-2 right-2 px-2 py-1 rounded-full"
                        >
                          <Text style={{ 
                            color: 'white',
                            fontFamily: 'Poppins_700Bold'
                          }} className="text-xs">{product.badge}</Text>
                        </View>
                      )}
                      <Pressable className="absolute top-2 left-2 w-8 h-8 bg-white/80 rounded-full items-center justify-center">
                        <Heart size={16} color="#64748b" />
                      </Pressable>
                      {!product.inStock && (
                        <View className="absolute inset-0 bg-black/50 rounded-2xl items-center justify-center">
                          <Text style={{ 
                            color: 'white',
                            fontFamily: 'Poppins_700Bold'
                          }} className="text-sm">Out of Stock</Text>
                        </View>
                      )}
                    </View>
                    
                    <Text style={{ 
                      color: primaryNavy,
                      fontFamily: 'Poppins_700Bold'
                    }} className="text-sm mb-1" numberOfLines={2}>{product.name}</Text>
                    
                    <Text style={{ 
                      color: '#64748b',
                      fontFamily: 'Poppins_500Medium'
                    }} className="text-xs mb-2" numberOfLines={1}>{product.description}</Text>
                    
                    <View className="flex-row items-center justify-between mb-3">
                      <View>
                        <Text style={{ 
                          color: accentBlue,
                          fontFamily: 'Poppins_800ExtraBold'
                        }} className="text-lg">${(product.price / 100).toFixed(2)}</Text>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <Text style={{ 
                            color: '#94a3b8',
                            fontFamily: 'Poppins_500Medium'
                          }} className="text-xs line-through">${(product.originalPrice / 100).toFixed(2)}</Text>
                        )}
                      </View>
                      <View className="flex-row items-center">
                        <Text className="text-yellow-500 mr-1">★</Text>
                        <Text style={{ 
                          color: '#64748b',
                          fontFamily: 'Poppins_500Medium'
                        }} className="text-xs">{product.rating || '4.5'}</Text>
                      </View>
                    </View>

                    {product.inStock && (
                      <View className="flex-row items-center justify-between bg-slate-50 p-3 rounded-2xl">
                        <Pressable 
                          onPress={(e) => {
                            e.stopPropagation();
                            handleQuantityUpdate(product, -1);
                          }} 
                          className="w-10 h-10 items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm"
                        >
                          <Minus size={16} color={primaryNavy} />
                        </Pressable>
                        <Text style={{ 
                          color: primaryNavy,
                          fontFamily: 'Poppins_700Bold'
                        }} className="text-base">{getProductQuantity(product._id)}</Text>
                        <Pressable 
                          onPress={(e) => {
                            e.stopPropagation();
                            handleQuantityUpdate(product, 1);
                          }} 
                          className="w-10 h-10 items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm"
                        >
                          <Plus size={16} color={primaryNavy} />
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View className="space-y-4">
              {filteredProducts.map(product => (
                <Pressable 
                  key={product._id} 
                  onPress={() => router.push({
                    pathname: '/(main)/salesperson/product-detail',
                    params: { productId: product._id }
                  })}
                  className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm"
                >
                  <View className="flex-row">
                    <View className="w-20 h-20 rounded-2xl overflow-hidden mr-4">
                      {product.image ? (
                        <Image 
                          source={{ uri: product.image }}
                          style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                        />
                      ) : (
                        <View className="w-full h-full bg-slate-100 items-center justify-center">
                          <Package size={24} color={primaryNavy} />
                        </View>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text style={{ 
                        color: primaryNavy,
                        fontFamily: 'Poppins_700Bold'
                      }} className="text-base mb-1">{product.name}</Text>
                      <Text style={{ 
                        color: '#64748b',
                        fontFamily: 'Poppins_500Medium'
                      }} className="text-sm mb-2">{product.description}</Text>
                      <View className="flex-row items-center justify-between">
                        <Text style={{ 
                          color: accentBlue,
                          fontFamily: 'Poppins_800ExtraBold'
                        }} className="text-lg">${(product.price / 100).toFixed(2)}</Text>
                        {product.inStock && (
                          <View className="flex-row items-center">
                            <Pressable 
                              onPress={(e) => {
                                e.stopPropagation();
                                updateQuantity(product._id, -1);
                              }} 
                              className="w-10 h-10 items-center justify-center bg-slate-50 rounded-full"
                            >
                              <Minus size={16} color={primaryNavy} />
                            </Pressable>
                            <Text style={{ 
                              color: primaryNavy,
                              fontFamily: 'Poppins_700Bold'
                            }} className="mx-4 text-base">{getProductQuantity(product._id)}</Text>
                            <Pressable 
                              onPress={(e) => {
                                e.stopPropagation();
                                updateQuantity(product._id, 1);
                              }} 
                              className="w-10 h-10 items-center justify-center bg-slate-50 rounded-full"
                            >
                              <Plus size={16} color={primaryNavy} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          // Empty state
          <View className="flex-1 items-center justify-center py-20">
            <View className="w-20 h-20 bg-slate-100 rounded-full items-center justify-center mb-6">
              <Package size={32} color="#94a3b8" />
            </View>
            <Text style={{ 
              color: primaryNavy,
              fontFamily: 'Poppins_800ExtraBold'
            }} className="text-xl mb-2">No Products Found</Text>
            <Text style={{ 
              color: '#64748b',
              fontFamily: 'Poppins_500Medium'
            }} className="text-base text-center">
              {searchQuery ? `No products match "${searchQuery}"` : 'No products available in this category'}
            </Text>
          </View>
        )}
        <View className="h-40" />
      </ScrollView>

      {/* Sliding Cart Section */}
      {showCart && getTotalItems() > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200" style={{ height: '50%' }}>
          <View className="p-6">
            {/* Handle */}
            <View className="w-12 h-1 bg-slate-300 rounded-full self-center mb-6" />
            
            {/* Cart Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text style={{ 
                color: primaryNavy,
                fontFamily: 'Poppins_800ExtraBold'
              }} className="text-2xl">Shopping Cart</Text>
              <Pressable onPress={() => setShowCart(false)}>
                <Text style={{ 
                  color: '#64748b',
                  fontFamily: 'Poppins_600SemiBold'
                }} className="text-sm">Close</Text>
              </Pressable>
            </View>

            {/* Cart Items */}
            <ScrollView className="flex-1 mb-6" showsVerticalScrollIndicator={false}>
              {items.map((item, index) => (
                <View key={item._id} className="flex-row items-center bg-slate-50 p-4 rounded-2xl mb-3">
                  <View className="w-16 h-16 rounded-2xl overflow-hidden mr-4">
                    {item.image ? (
                      <Image 
                        source={{ uri: item.image }}
                        style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                      />
                    ) : (
                      <View className="w-full h-full bg-slate-100 items-center justify-center">
                        <Package size={20} color={primaryNavy} />
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text style={{ 
                      color: primaryNavy,
                      fontFamily: 'Poppins_700Bold'
                    }} className="text-base mb-1">{item.name}</Text>
                    <Text style={{ 
                      color: accentBlue,
                      fontFamily: 'Poppins_800ExtraBold'
                    }} className="text-lg">${(item.price / 100).toFixed(2)}</Text>
                  </View>
                  <View className="flex-row items-center mr-3">
                    <Pressable 
                      onPress={() => updateQuantity(item._id, item.quantity - 1)} 
                      className="w-10 h-10 items-center justify-center bg-white rounded-full border border-slate-200"
                    >
                      <Minus size={16} color={primaryNavy} />
                    </Pressable>
                    <Text style={{ 
                      color: primaryNavy,
                      fontFamily: 'Poppins_700Bold'
                    }} className="mx-4 text-base">{item.quantity}</Text>
                    <Pressable 
                      onPress={() => updateQuantity(item._id, item.quantity + 1)} 
                      className="w-10 h-10 items-center justify-center bg-white rounded-full border border-slate-200"
                    >
                      <Plus size={16} color={primaryNavy} />
                    </Pressable>
                  </View>
                  {/* Delete Button */}
                  <Pressable 
                    onPress={() => removeFromCart(item._id)}
                    className="w-10 h-10 items-center justify-center bg-red-50 rounded-full border border-red-200"
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            {/* Cart Summary */}
            <View className="bg-slate-50 p-4 rounded-2xl mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text style={{ 
                  color: '#64748b',
                  fontFamily: 'Poppins_600SemiBold'
                }} className="text-base">Items ({getTotalItems()})</Text>
                <Text style={{ 
                  color: primaryNavy,
                  fontFamily: 'Poppins_700Bold'
                }} className="text-base">${(getTotalPrice() / 100).toFixed(2)}</Text>
              </View>
              <View className="flex-row justify-between items-center mb-2">
                <Text style={{ 
                  color: '#64748b',
                  fontFamily: 'Poppins_600SemiBold'
                }} className="text-base">Tax</Text>
                <Text style={{ 
                  color: primaryNavy,
                  fontFamily: 'Poppins_700Bold'
                }} className="text-base">${(getTotalPrice() * 0.1 / 100).toFixed(2)}</Text>
              </View>
              <View className="h-px bg-slate-300 my-2" />
              <View className="flex-row justify-between items-center">
                <Text style={{ 
                  color: primaryNavy,
                  fontFamily: 'Poppins_800ExtraBold'
                }} className="text-xl">Total</Text>
                <Text style={{ 
                  color: primaryNavy,
                  fontFamily: 'Poppins_800ExtraBold'
                }} className="text-xl">${(getTotalPrice() * 1.1 / 100).toFixed(2)}</Text>
              </View>
            </View>

            {/* Checkout Button */}
            <Pressable 
              onPress={handleCheckout}
              style={{ backgroundColor: primaryNavy }}
              className="h-16 flex-row items-center justify-center rounded-2xl shadow-lg"
            >
              <ShoppingCart size={22} color="white" className="mr-3" />
              <Text style={{ 
                color: 'white',
                fontFamily: 'Poppins_700Bold'
              }} className="text-lg">Proceed to Checkout</Text>
            </Pressable>
          </View>
        </View>
      )}

      <SalespersonBottomNav primaryNavy={primaryNavy} />
    </SafeAreaView>
  );
}
