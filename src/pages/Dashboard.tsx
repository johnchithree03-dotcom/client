import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Calendar, Clock } from 'lucide-react';
import { DraggablePanel } from '../components/DraggablePanel';
import { ScrollableSection } from '../components/ScrollableSection';
import { BottomNavigation } from '../components/BottomNavigation';
import { MapLibreMap } from '../components/MapLibreMap';
import { getRecentAddresses, GeoapifyAddress } from '../services/geoapifyService';
import { useRideContext } from '../contexts/RideContext';
import { useGeolocation } from '../hooks/useGeolocation';

interface DashboardProps {
  onSearchSelect: (address: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSearchSelect }) => {
  const navigate = useNavigate();
  const [panelHeight, setPanelHeight] = useState(450);
  const { isRideActive, rideStatus } = useRideContext();
  const { latitude, longitude } = useGeolocation();
  const [recentAddresses, setRecentAddresses] = useState<GeoapifyAddress[]>([]);

  const maxPanelHeight = 600;
  const minPanelHeight = 175;

  // Load real recent addresses from localStorage (saved via Geoapify)
  useEffect(() => {
    const addresses = getRecentAddresses();
    setRecentAddresses(addresses);
  }, []);

  const handleNavigationBlock = (destination: string) => {
    const message = rideStatus === 'pending'
      ? 'You already have an active request.'
      : 'You already have an active ride.';
    alert(message);
    navigate(destination);
  };

  const handleRidesClick = () => {
    if (isRideActive || rideStatus === 'pending') {
      handleNavigationBlock(rideStatus === 'pending' ? '/waiting-for-driver' : '/driver-coming');
    } else {
      navigate('/your-route');
    }
  };

  const handleWhereToClick = () => {
    if (isRideActive || rideStatus === 'pending') {
      handleNavigationBlock(rideStatus === 'pending' ? '/waiting-for-driver' : '/driver-coming');
    } else {
      navigate('/your-route');
    }
  };

  const handleRecentAddressClick = (address: string) => {
    if (isRideActive || rideStatus === 'pending') {
      handleNavigationBlock(rideStatus === 'pending' ? '/waiting-for-driver' : '/driver-coming');
    } else {
      onSearchSelect(address);
    }
  };

  const handleAletwendeClick = () => {
    navigate('/aletwende-send');
  };

  const serviceButtons = [
    { id: 'rides', label: 'Rides', description: "Let's get moving", icon: '🚗', action: handleRidesClick },
    { id: 'schedule', label: 'Schedule', description: 'Book ahead', icon: '📅' },
    { id: 'aletwende', label: 'Aletwende Send', description: 'Package delivery', icon: '📦', action: handleAletwendeClick }
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Real MapLibre Map Background */}
      <div className="absolute inset-0 z-0">
        <MapLibreMap
          center={latitude && longitude ? { lat: latitude, lng: longitude } : { lat: -15.3875, lng: 28.3228 }}
          zoom={13}
          fitBounds={false}
          className="w-full h-full"
        />
      </div>
      
      {/* Header */}
      <motion.div 
        className="absolute top-0 left-0 right-0 z-10 p-4"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <button className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
            <div className="w-6 h-6 grid grid-cols-3 gap-0.5">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="w-1 h-1 bg-gray-800 rounded-full" />
              ))}
            </div>
          </button>
        </div>
      </motion.div>

      <DraggablePanel
        initialHeight={450}
        maxHeight={maxPanelHeight}
        minHeight={minPanelHeight}
        onHeightChange={setPanelHeight}
      >
        <div className="relative">
          {/* Let's go places header - stays in place */}
          <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-6">
            Let's go places.
          </h1>

          {/* Service buttons - stays in place */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {serviceButtons.map((service, index) => (
              <motion.button
                key={service.id}
                onClick={() => {
                  if (service.action) {
                    service.action();
                  } else if (service.id === 'schedule') {
                    navigate('/schedule-ride');
                  }
                }}
                className="bg-gray-100 rounded-2xl p-4 text-center hover:bg-gray-200 transition-all"
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
              >
                <div className="text-3xl mb-2">{service.icon}</div>
                <h3 className="font-semibold text-gray-900">{service.label}</h3>
                <p className="text-xs text-gray-600 mt-1">{service.description}</p>
              </motion.button>
            ))}
          </div>

          {/* Search box - stays in place */}
          <div className="relative z-10">
            <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <button
                  onClick={handleWhereToClick}
                  className="w-full pl-12 pr-4 py-4 text-left text-gray-500 hover:bg-gray-200 transition-colors bg-transparent"
                >
                  Where to?
                </button>
              </div>
              {/* Schedule button inside search box */}
              <button
                onClick={() => navigate('/schedule-ride')}
                className="px-4 py-4 hover:bg-gray-200 transition-colors border-l border-gray-200"
              >
                <Calendar className="text-gray-600" size={20} />
              </button>
            </div>
          </div>

          {/* Recent searches - real addresses from Geoapify history */}
          <div className="mt-4">
            <ScrollableSection maxHeight="max-h-40">
              <div className="space-y-2">
                {recentAddresses.length > 0 ? (
                  recentAddresses.map((search, index) => (
                    <motion.button
                      key={search.id}
                      onClick={() => handleRecentAddressClick(search.address)}
                      className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + index * 0.1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Clock className="text-gray-400 flex-shrink-0" size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{search.address}</p>
                        <p className="text-sm text-gray-500 truncate">{search.description}</p>
                      </div>
                    </motion.button>
                  ))
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-center py-4 text-gray-500"
                  >
                    <p className="text-sm">No recent addresses yet</p>
                    <p className="text-xs mt-1">Search for a destination to get started</p>
                  </motion.div>
                )}
              </div>
            </ScrollableSection>
          </div>
        </div>
      </DraggablePanel>

      <BottomNavigation />
    </div>
  );
};
