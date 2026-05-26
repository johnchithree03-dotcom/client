import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type DeliveryCategory = 'food' | 'clothes' | 'hardware';

export interface GlobalCartItem {
  id: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  category: DeliveryCategory;
  name: string;
  image: string;
  price: number;
  kg?: number; // Weight in kg from Firestore
}

interface GlobalCartContextType {
  cart: GlobalCartItem[];
  addToCart: (item: GlobalCartItem) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  getCartCount: () => number;
  getTotalKg: () => number;
  getKgRange: () => string;
}

const GlobalCartContext = createContext<GlobalCartContextType | undefined>(undefined);

const STORAGE_KEY = 'GLOBAL_CART';

export const GlobalCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<GlobalCartItem[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        console.error('Error loading cart:', error);
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    console.log('🛒 Global cart updated:', cart.length);
  }, [cart]);

  const addToCart = useCallback((item: GlobalCartItem) => {
    setCart(prev => [...prev, item]);
    console.log('✅ Added to cart:', item.name);
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
    console.log('❌ Removed from cart:', itemId);
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    localStorage.removeItem(STORAGE_KEY);
    console.log('🗑️ Cart cleared');
  }, []);

  const getCartCount = useCallback(() => {
    return cart.length;
  }, [cart]);

  // Calculate total weight from all cart items
  const getTotalKg = useCallback(() => {
    return cart.reduce((total, item) => total + (item.kg || 0), 0);
  }, [cart]);

  // Get the kg range string for API calls based on total weight
  const getKgRange = useCallback(() => {
    const totalKg = getTotalKg();
    if (totalKg <= 5) return '0-5kg';
    if (totalKg <= 10) return '5-10kg';
    if (totalKg <= 20) return '10-20kg';
    if (totalKg <= 50) return '20-50kg';
    if (totalKg <= 100) return '50-100kg';
    if (totalKg <= 500) return '100-500kg';
    if (totalKg <= 1000) return '500-1000kg';
    return '1000kg+';
  }, [getTotalKg]);

  const value: GlobalCartContextType = {
    cart,
    addToCart,
    removeFromCart,
    clearCart,
    getCartCount,
    getTotalKg,
    getKgRange
  };

  return (
    <GlobalCartContext.Provider value={value}>
      {children}
    </GlobalCartContext.Provider>
  );
};

export const useGlobalCart = () => {
  const context = useContext(GlobalCartContext);
  if (context === undefined) {
    throw new Error('useGlobalCart must be used within GlobalCartProvider');
  }
  return context;
};
