import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, MessageCircle, MapPin, Star, Package, Home, Navigation } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getETA, calculateDistance } from '../utils/etaCalculation';
import { RatingModal } from '../components/RatingModal';
import { MapLibreMap, MapMarker } from '../components/MapLibreMap';
import { listenToDriverLocation } from '../services/trackingService';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

interface DriverData {
  id?: string;
  uid?: string;
  name: string;
  rating: number;
  phone: string;
  profileImage?: string;
  photo?: string;
  carImage?: string; // Vehicle photo from carImage field
  vehicle?: {
    brand: string;
    model: string;
    color: string;
    plateNumber: string;
    type: string;
  };
  // Direct fields from Firestore (alternative to nested vehicle object)
  brand?: string;
  model?: string;
  color?: string;
  plateNumber?: string;
  // Legacy fields for backward compatibility
  vehicleType?: string;
}

// Driver Card Skeleton Component - matches SelectRide skeleton style
const DriverCardSkeleton: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center justify-between"
  >
    <div className="flex items-center space-x-4">
      {/* Profile picture skeleton */}
      <div className="w-14 h-14 rounded-full bg-gray-200 animate-pulse" />
      
      <div className="space-y-2">
        {/* Driver name + rating skeleton */}
        <div className="flex items-center space-x-2">
          <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-12 bg-gray-200 rounded-full animate-pulse" />
        </div>
        {/* Car model skeleton */}
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        {/* Plate number skeleton */}
        <div className="h-5 w-20 bg-gray-200 rounded animate-pulse mt-1" />
      </div>
    </div>
    
    {/* Action buttons skeleton */}
    <div className="flex space-x-2">
      <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
      <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
    </div>
  </motion.div>
);

interface DriverLocation {
  lat: number;
  lng: number;
}

interface OrderData {
  id?: string;
  storeName?: string;
  storeAddress?: string;
  storeImage?: string;
  storeId?: string;
  items?: OrderItem[];
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  status?: string;
  driverStatus?: string;
  driverId?: string | null;
  driverLocation?: DriverLocation;
  destinationAddress?: string;
  destinationLocation?: { lat: number; lng: number };
  storeLocation?: { lat: number; lng: number };
  stops?: Array<{ address: string; items?: OrderItem[] }>;
  type?: string;
}

const getStatusText = (status: string, stops?: any[]): { title: string; subtitle: string } => {
  // STRICT CHECK: Handle "arrived" status explicitly
  if (status === 'arrived') {
    return {
      title: 'Order Arrived',
      subtitle: 'Your order has arrived'
    };
  }

  // STRICT CHECK: Handle "completed" status explicitly
  if (status === 'completed') {
    return {
      title: 'Order Completed',
      subtitle: 'Thank you for your order'
    };
  }

  const statusMessages: Record<string, { title: string; subtitle: string }> = {
    driver_assigned: { title: 'Driver is on the way to store', subtitle: 'Picking up your order' },
    on_the_way_to_store: { title: 'Driver is on the way to store', subtitle: 'Picking up your order' },
    at_store: { title: 'Driver arrived at store', subtitle: 'Collecting your items' },
    picked_up: { title: 'Order picked up', subtitle: 'On the way to you' },
    delivering: { title: 'On the way to you', subtitle: 'Almost there' },
    at_stop: { 
      title: stops && stops.length > 0 ? 'Driver heading to stop' : 'On the way to you', 
      subtitle: 'Delivering your order' 
    },
    delivered: { title: 'Order Delivered', subtitle: 'Enjoy your order' },
  };
  
  return statusMessages[status] || { title: 'Driver is on the way', subtitle: 'Tracking your delivery' };
};

export const LiveTrackingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId, orderData: initialOrderData } = location.state || {};

  const [orderData, setOrderData] = useState<OrderData>(initialOrderData || {});
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [isDriverLoading, setIsDriverLoading] = useState<boolean>(true);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [eta, setEta] = useState<string>('Calculating...');
  const [statusTitle, setStatusTitle] = useState<string>('Driver is on the way');
  const [statusSubtitle, setStatusSubtitle] = useState<string>('Tracking your delivery');
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const driverListenerRef = useRef<(() => void) | null>(null);

  // Listen to order document in real-time
  // IMPORTANT: Driver info MUST come from the order document's "driver" field
  // DO NOT query drivers collection directly
  useEffect(() => {
    if (!orderId) return;

    const orderRef = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(orderRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as OrderData;
        setOrderData({ ...data, id: orderId });
        
        // Update status text using the new format with title/subtitle
        const statusInfo = getStatusText(data.status || 'driver_assigned', data.stops);
        setStatusTitle(statusInfo.title);
        setStatusSubtitle(statusInfo.subtitle);

        // Update driver location from order document
        if (data.driverLocation) {
          setDriverLocation(data.driverLocation);
        }

        // IMPORTANT: Read driver info from the order document's "driverSnapshot" field
        // The backend injects a driver snapshot into the order document after driver acceptance
        // Fields from Firestore driverSnapshot: firstName, profilePicture, rating, brand, model, color, plateNumber, carImage
        // DO NOT query drivers collection directly
        const driverFromOrder = (data as any).driverSnapshot || (data as any).driver;
        if (driverFromOrder && !driverData) {
          setDriverData({
            id: driverFromOrder.uid || driverFromOrder.id || '',
            uid: driverFromOrder.uid || '',
            // Use firstName from Firestore
            name: driverFromOrder.firstName || driverFromOrder.name || 'Driver',
            rating: driverFromOrder.rating || 0,
            phone: driverFromOrder.phone || '',
            // Use profilePicture from Firestore
            profileImage: driverFromOrder.profilePicture || driverFromOrder.profileImage || '',
            // Use carImage from Firestore for vehicle photo
            carImage: driverFromOrder.carImage || driverFromOrder.vehicleImage || '',
            // Direct fields from Firestore
            brand: driverFromOrder.brand || '',
            model: driverFromOrder.model || '',
            color: driverFromOrder.color || '',
            plateNumber: driverFromOrder.plateNumber || '',
            // Also support nested vehicle object for backward compatibility
            vehicle: driverFromOrder.vehicle ? {
              brand: driverFromOrder.vehicle.brand || driverFromOrder.brand || '',
              model: driverFromOrder.vehicle.model || driverFromOrder.model || '',
              color: driverFromOrder.vehicle.color || driverFromOrder.color || '',
              plateNumber: driverFromOrder.vehicle.plateNumber || driverFromOrder.plateNumber || '',
              type: driverFromOrder.vehicle.type || ''
            } : {
              brand: driverFromOrder.brand || '',
              model: driverFromOrder.model || '',
              color: driverFromOrder.color || '',
              plateNumber: driverFromOrder.plateNumber || '',
              type: ''
            }
          });
          setIsDriverLoading(false);
        }

        // STRICT CHECK: Handle "arrived" status
        if (data.status === 'arrived') {
          setEta(''); // Don't show ETA when arrived
        }

        // STRICT CHECK: Handle "completed" status - trigger rating modal
        if (data.status === 'completed') {
          setEta('');
          // Trigger rating modal after a short delay
          setTimeout(() => {
            setShowRatingModal(true);
          }, 1000);
        }

        // Handle "cancelled" status - listener will be cleaned up by useEffect cleanup
        if (data.status === 'cancelled') {
          setEta('');
          setStatusTitle('Order Cancelled');
          setStatusSubtitle('This order has been cancelled');
        }
      }
    });

    return () => unsubscribe();
  }, [orderId]);

  // Listen to driver document for real-time location updates ONLY
  // IMPORTANT: Driver info comes from the order document, NOT from drivers collection
  // This listener is ONLY for live GPS location updates
  useEffect(() => {
    if (!orderData.driverId) return;

    const driverRef = doc(db, 'drivers', orderData.driverId);
    const unsubscribe = onSnapshot(driverRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        // ONLY update location - driver info comes from order document
        if (data.location) {
          setDriverLocation({
            lat: data.location.lat || data.location.latitude,
            lng: data.location.lng || data.location.longitude,
          });
        }
        // DO NOT update driverData here - it must come from order document
      }
    });

    driverListenerRef.current = unsubscribe;

    return () => {
      if (driverListenerRef.current) {
        driverListenerRef.current();
      }
    };
  }, [orderData.driverId]);

  // Calculate ETA based on driver location
  useEffect(() => {
    if (!driverLocation) return;

    // Determine target location based on order status
    let targetLat: number;
    let targetLng: number;

    if (orderData.status === 'on_the_way_to_store' || orderData.status === 'driver_assigned') {
      // Target is store location
      targetLat = orderData.storeLocation?.lat || -26.2041;
      targetLng = orderData.storeLocation?.lng || 28.0473;
    } else {
      // Target is destination
      targetLat = orderData.destinationLocation?.lat || -26.195;
      targetLng = orderData.destinationLocation?.lng || 28.04;
    }

    const etaString = getETA(driverLocation.lat, driverLocation.lng, targetLat, targetLng);
    setEta(etaString);
  }, [driverLocation, orderData.status, orderData.storeLocation, orderData.destinationLocation]);

  const handleCall = () => {
    if (driverData?.phone) {
      window.location.href = `tel:${driverData.phone}`;
    }
  };

  const handleMessage = () => {
    // Navigate to message panel or open messaging
    console.log('Open messaging');
  };

  // Build map markers for store, destination, driver, and stops
  const mapMarkers = useMemo((): MapMarker[] => {
    const markers: MapMarker[] = [];
    
    // Store marker
    if (orderData.storeLocation?.lat && orderData.storeLocation?.lng) {
      markers.push({
        id: 'store',
        type: 'store',
        lat: orderData.storeLocation.lat,
        lng: orderData.storeLocation.lng
      });
    }
    
    // Destination marker
    if (orderData.destinationLocation?.lat && orderData.destinationLocation?.lng) {
      markers.push({
        id: 'dropoff',
        type: 'dropoff',
        lat: orderData.destinationLocation.lat,
        lng: orderData.destinationLocation.lng
      });
    }
    
    // Stop markers
    const stops = orderData.stops || [];
    stops.forEach((stop: any, index: number) => {
      if (stop.lat && stop.lng) {
        markers.push({
          id: `stop-${index}`,
          type: 'stop',
          lat: stop.lat,
          lng: stop.lng,
          label: `${index + 1}`
        });
      }
    });
    
    return markers;
  }, [orderData.storeLocation, orderData.destinationLocation, orderData.stops]);

  // Calculate arrival time from ETA string
  const getArrivalTime = useCallback(() => {
    if (!eta || eta === 'Calculating...') return null;
    const match = eta.match(/(\d+)/);
    if (match) {
      const etaMinutes = parseInt(match[1]);
      const now = new Date();
      const arrivalDate = new Date(now.getTime() + etaMinutes * 60000);
      return arrivalDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return null;
  }, [eta]);

  // Extract ETA minutes
  const getEtaMinutes = useCallback(() => {
    if (!eta || eta === 'Calculating...') return undefined;
    const match = eta.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }, [eta]);

  return (
    <div className="min-h-screen bg-gray-100 relative">
      {/* Real MapLibre Map with live driver tracking */}
      <div className="absolute inset-0 z-0">
        <MapLibreMap
          center={driverLocation 
            ? { lat: driverLocation.lat, lng: driverLocation.lng }
            : orderData.storeLocation?.lat && orderData.storeLocation?.lng 
              ? { lat: orderData.storeLocation.lat, lng: orderData.storeLocation.lng } 
              : { lat: -15.3875, lng: 28.3228 }}
          zoom={14}
          markers={mapMarkers}
          driverPosition={driverLocation || undefined}
          storePosition={orderData.storeLocation || undefined}
          pickupEta={getEtaMinutes()}
          arrivalTime={getArrivalTime() || undefined}
          fitBounds={mapMarkers.length > 1}
          className="w-full h-full"
        />
      </div>

      {/* Top Status Panel */}
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute top-4 left-4 right-4 z-20"
      >
        <div className="bg-white rounded-2xl shadow-xl p-4">
          <motion.h2
            key={statusTitle}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg font-bold text-gray-900"
          >
            {statusTitle}
          </motion.h2>
          <motion.p
            key={`${statusSubtitle}-${eta}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-gray-600 mt-1"
          >
            {/* STRICT CHECK: Don't show "Arriving in" for arrived/completed status */}
            {orderData.status === 'arrived' || orderData.status === 'completed' ? (
              statusSubtitle
            ) : eta ? (
              <>Arriving in <span className="font-semibold text-[#5B2EFF]">{eta}</span></>
            ) : (
              statusSubtitle
            )}
          </motion.p>
        </div>
      </motion.div>

      {/* Bottom Panel */}
      <motion.div
        initial={{ y: 200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200, delay: 0.2 }}
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-20"
      >
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Driver Card - with skeleton loading and slide-up animation */}
          <AnimatePresence mode="wait">
            {isDriverLoading ? (
              <DriverCardSkeleton key="skeleton" />
            ) : driverData && (
              <motion.div
                key="driver-card"
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  {/* Driver Photo - from profilePicture field */}
                  <div className="relative">
                    {driverData.profileImage ? (
                      <img
                        src={driverData.profileImage}
                        alt={driverData.name}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-2xl">
                        {driverData.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>

                  {/* Driver Info - using firstName, rating, color, brand, model, plateNumber */}
                  <div>
                    <div className="flex items-center space-x-2">
                      {/* Driver Name (firstName) */}
                      <h3 className="font-bold text-lg text-gray-900">{driverData.name || 'Driver'}</h3>
                      {/* Star Rating */}
                      <div className="flex items-center space-x-1 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Star size={14} className="text-amber-500 fill-amber-500" />
                        <span className="text-sm font-medium text-amber-700">
                          {driverData.rating?.toFixed(1) || '0.0'}
                        </span>
                      </div>
                    </div>
                    {/* Vehicle info: color brand model */}
                    <p className="text-gray-600 text-sm">
                      {driverData.color && driverData.brand && driverData.model
                        ? `${driverData.color} ${driverData.brand} ${driverData.model}`.trim()
                        : driverData.vehicle 
                          ? `${driverData.vehicle.color || ''} ${driverData.vehicle.brand || ''} ${driverData.vehicle.model || ''}`.trim() || 'Vehicle'
                          : 'Vehicle'}
                    </p>
                    {/* Plate Number */}
                    <p className="text-gray-900 font-medium text-sm bg-gray-100 px-2 py-0.5 rounded inline-block mt-1">
                      {driverData.plateNumber || driverData.vehicle?.plateNumber || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={handleCall}
                    className="w-11 h-11 bg-[#5B2EFF] rounded-full flex items-center justify-center shadow-lg hover:bg-[#4A24D9] transition-colors"
                  >
                    <Phone size={20} className="text-white" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={handleMessage}
                    className="w-11 h-11 bg-gray-800 rounded-full flex items-center justify-center shadow-lg hover:bg-gray-900 transition-colors"
                  >
                    <MessageCircle size={20} className="text-white" />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Order Summary */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Package size={16} className="text-gray-500" />
                <span className="text-gray-600">
                  {orderData.items?.length || 0} Item{(orderData.items?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="font-bold text-gray-900">R {orderData.total?.toFixed(2) || '0.00'}</span>
            </div>
          </motion.div>

          {/* Delivery Address */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex items-start space-x-3 bg-gray-50 rounded-xl p-3"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Delivery Address</p>
              <p className="text-gray-900 text-sm mt-1">
                {orderData.destinationAddress || 'Address not specified'}
              </p>
            </div>
          </motion.div>

          {/* Stops if any */}
          {orderData.stops && orderData.stops.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="space-y-2"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Delivery Stops</p>
              {orderData.stops.map((stop, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 bg-orange-50 rounded-xl p-3"
                >
                  <div className="w-6 h-6 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-orange-700">{index + 1}</span>
                  </div>
                  <p className="text-gray-700 text-sm">{stop.address || String(stop)}</p>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Rating Modal - shown when status becomes "completed" */}
      <RatingModal
        isOpen={showRatingModal}
        onClose={() => {
          setShowRatingModal(false);
          navigate('/');
        }}
        path="store_delivery"
        driverName={driverData?.name || 'Driver'}
        driverPhoto={driverData?.profileImage || driverData?.photo || ''}
        driverId={driverData?.id || orderData.driverId || ''}
        orderId={orderId || ''}
        storeName={orderData.storeName || 'Store'}
        storeImage={orderData.storeImage || ''}
        storeId={orderData.storeId || ''}
      />
    </div>
  );
};
