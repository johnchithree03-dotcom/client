/**
 * API Configuration
 * Central location for all API endpoints and helpers
 */

// Base URL for the backend API
export const API_BASE = 
  import.meta.env.VITE_API_URL || 
  'https://aletwend-render-backend.onrender.com';

/**
 * Generic POST helper for API calls
 */
export async function apiPost<T = any>(path: string, data: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

// API Endpoints
export const API_ENDPOINTS = {
  // Main ride options endpoint
  GET_RIDE_OPTIONS: '/getRideOptions',
  
  // Ride endpoints
  RIDE_ESTIMATE: '/ride/estimate',
  RIDE_REQUEST: '/ride/request',
  RIDE_CANCEL: '/ride/cancel',
  
  // Delivery endpoints
  DELIVERY_ESTIMATE: '/delivery/estimate',
  DELIVERY_REQUEST: '/delivery/request',
  
  // Intercity endpoints
  INTERCITY_ESTIMATE: '/intercity/estimate',
  INTERCITY_REQUEST: '/intercity/request',
  
  // Aletwende (shared ride) endpoints
  ALETWENDE_ESTIMATE: '/aletwende/estimate',
  ALETWENDE_REQUEST: '/aletwende/request',
  
  // User endpoints
  USER_PROFILE: '/user/profile',
  USER_PAYMENT_METHODS: '/user/payment-methods',
  
  // Location endpoints
  GEOCODE: '/location/geocode',
  REVERSE_GEOCODE: '/location/reverse-geocode',
  PLACES_AUTOCOMPLETE: '/location/autocomplete',
};

// Payload types for different service types
export interface RidePayload {
  serviceType: 'ride';
  pickup: string;
  destination: string;
  stops: string[];
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
}

export interface CourierPayload {
  serviceType: 'courier';
  category: 'food' | 'clothes' | 'package';
  kg: string;
  pickup: string;
  destination: string;
  stops: string[];
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
}

export interface DeliveryPayload {
  serviceType: 'delivery';
  category: 'hardware';
  kg: string;
  pickup: string;
  destination: string;
  stops: string[];
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
}

export interface TowingPayload {
  serviceType: 'towing';
  vehicleType: string;
  pickup: string;
  destination: string;
  stops: string[];
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
}

export interface TruckPayload {
  serviceType: 'delivery_truck';
  deliveryType: string;
  pickup: string;
  destination: string;
  stops: string[];
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
}

export type ServicePayload = RidePayload | CourierPayload | DeliveryPayload | TowingPayload | TruckPayload;
