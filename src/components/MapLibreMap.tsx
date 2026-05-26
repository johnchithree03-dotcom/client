/**
 * MapLibre GL JS Map Component
 * Real map implementation using OpenStreetMap / OpenFreeMap tiles
 * Supports route polyline, markers, and live driver tracking
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import polyline from '@mapbox/polyline';
import 'maplibre-gl/dist/maplibre-gl.css';

// OpenFreeMap tile URL (free, no API key required)
const TILE_URL = 'https://tiles.openfreemap.org/styles/liberty/style.json';

export interface MapMarker {
  id: string;
  type: 'pickup' | 'dropoff' | 'stop' | 'driver' | 'store';
  lat: number;
  lng: number;
  label?: string;
}

export interface RoutePolyline {
  encoded: string;
  color?: string;
  width?: number;
}

interface MapLibreMapProps {
  // Initial center and zoom
  center?: { lat: number; lng: number };
  zoom?: number;
  
  // Markers to display
  markers?: MapMarker[];
  
  // Route polyline (encoded)
  polyline?: string;
  
  // ETA bubble at pickup
  pickupEta?: number; // in minutes
  
  // Arrival time at destination
  arrivalTime?: string; // e.g., "5:18 PM"
  
  // Driver position (for live tracking)
  driverPosition?: { lat: number; lng: number };
  
  // Callback when driver marker is animated
  onDriverMove?: (position: { lat: number; lng: number }) => void;
  
  // CSS class name
  className?: string;
  
  // Whether to fit bounds to show all markers
  fitBounds?: boolean;
  
  // Store location for delivery tracking
  storePosition?: { lat: number; lng: number };
}

// Custom marker elements
const createMarkerElement = (type: MapMarker['type'], label?: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'maplibre-marker';
  
  switch (type) {
    case 'pickup':
      el.innerHTML = `
        <div style="
          width: 32px;
          height: 32px;
          background: #5B2EFF;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(91, 46, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
        </div>
      `;
      break;
      
    case 'dropoff':
      el.innerHTML = `
        <div style="
          width: 36px;
          height: 44px;
          position: relative;
        ">
          <div style="
            width: 36px;
            height: 36px;
            background: #5B2EFF;
            border: 3px solid white;
            border-radius: 8px 8px 8px 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 8px rgba(91, 46, 255, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              width: 12px;
              height: 12px;
              background: white;
              border-radius: 2px;
              transform: rotate(45deg);
            "></div>
          </div>
        </div>
      `;
      break;
      
    case 'stop':
      el.innerHTML = `
        <div style="
          width: 24px;
          height: 24px;
          background: #5B2EFF;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(91, 46, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          color: white;
        ">${label || ''}</div>
      `;
      break;
      
    case 'driver':
      el.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          background: #10B981;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 10px rgba(16, 185, 129, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s ease;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
          </svg>
        </div>
      `;
      break;
      
    case 'store':
      el.innerHTML = `
        <div style="
          width: 32px;
          height: 32px;
          background: #F59E0B;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M18.36 9l.6 3H5.04l.6-3h12.72M20 4H4v2h16V4zm0 3H4l-1 5v2h1v6h10v-6h4v6h2v-6h1v-2l-1-5zM6 18v-4h6v4H6z"/>
          </svg>
        </div>
      `;
      break;
  }
  
  return el;
};

// Create ETA bubble element
const createEtaBubble = (eta: number): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="
      background: #5B2EFF;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(91, 46, 255, 0.3);
      white-space: nowrap;
      transform: translateY(-60px);
      animation: etaPulse 2s ease-in-out infinite;
    ">
      ${eta} min
    </div>
    <style>
      @keyframes etaPulse {
        0%, 100% { transform: translateY(-60px) scale(1); }
        50% { transform: translateY(-60px) scale(1.05); }
      }
    </style>
  `;
  return el;
};

// Create arrival card element
const createArrivalCard = (arrivalTime: string): HTMLElement => {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="
      background: white;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      transform: translateY(-70px);
      border-left: 4px solid #5B2EFF;
    ">
      <div style="font-size: 12px; color: #6B7280; margin-bottom: 2px;">Arrive by</div>
      <div style="font-size: 18px; font-weight: 700; color: #1F2937;">${arrivalTime}</div>
    </div>
  `;
  return el;
};

export const MapLibreMap: React.FC<MapLibreMapProps> = ({
  center = { lat: -15.3875, lng: 28.3228 }, // Default to Lusaka, Zambia
  zoom = 13,
  markers = [],
  polyline: encodedPolyline,
  pickupEta,
  arrivalTime,
  driverPosition,
  onDriverMove,
  className = '',
  fitBounds = true,
  storePosition
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const etaBubbleRef = useRef<maplibregl.Marker | null>(null);
  const arrivalCardRef = useRef<maplibregl.Marker | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: TILE_URL,
      center: [center.lng, center.lat],
      zoom: zoom,
      attributionControl: false
    });

    map.current.on('load', () => {
      setIsMapLoaded(true);
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove old markers that are no longer in the list
    Object.keys(markersRef.current).forEach(id => {
      if (!markers.find(m => m.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add/update markers
    markers.forEach(marker => {
      if (markersRef.current[marker.id]) {
        // Update existing marker position
        markersRef.current[marker.id].setLngLat([marker.lng, marker.lat]);
      } else {
        // Create new marker
        const el = createMarkerElement(marker.type, marker.label);
        const newMarker = new maplibregl.Marker({ element: el })
          .setLngLat([marker.lng, marker.lat])
          .addTo(map.current!);
        markersRef.current[marker.id] = newMarker;
      }
    });

    // Fit bounds to show all markers
    if (fitBounds && markers.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      markers.forEach(marker => {
        bounds.extend([marker.lng, marker.lat]);
      });
      if (driverPosition) {
        bounds.extend([driverPosition.lng, driverPosition.lat]);
      }
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    }
  }, [markers, isMapLoaded, fitBounds, driverPosition]);

  // Update polyline
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove existing polyline
    if (map.current.getSource('route')) {
      map.current.removeLayer('route-line');
      map.current.removeSource('route');
    }

    if (!encodedPolyline) return;

    try {
      // Decode polyline
      const decoded = polyline.decode(encodedPolyline);
      const coordinates = decoded.map(([lat, lng]) => [lng, lat]);

      // Add source and layer
      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      });

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#5B2EFF',
          'line-width': 5,
          'line-opacity': 0.8
        }
      });

      // Fit bounds to polyline
      if (coordinates.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        coordinates.forEach(coord => {
          bounds.extend(coord as [number, number]);
        });
        map.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      }
    } catch (error) {
      console.error('Error decoding polyline:', error);
    }
  }, [encodedPolyline, isMapLoaded]);

  // Update driver marker with smooth animation
  useEffect(() => {
    if (!map.current || !isMapLoaded || !driverPosition) return;

    if (driverMarkerRef.current) {
      // Animate existing marker
      const currentPos = driverMarkerRef.current.getLngLat();
      const newPos = new maplibregl.LngLat(driverPosition.lng, driverPosition.lat);
      
      // Smooth interpolation
      let start: number | null = null;
      const duration = 1000; // 1 second animation
      
      const animate = (timestamp: number) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        
        const interpolatedLng = currentPos.lng + (newPos.lng - currentPos.lng) * eased;
        const interpolatedLat = currentPos.lat + (newPos.lat - currentPos.lat) * eased;
        
        driverMarkerRef.current?.setLngLat([interpolatedLng, interpolatedLat]);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          onDriverMove?.(driverPosition);
        }
      };
      
      requestAnimationFrame(animate);
    } else {
      // Create new driver marker
      const el = createMarkerElement('driver');
      driverMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([driverPosition.lng, driverPosition.lat])
        .addTo(map.current);
    }
  }, [driverPosition, isMapLoaded, onDriverMove]);

  // Update ETA bubble
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove existing ETA bubble
    if (etaBubbleRef.current) {
      etaBubbleRef.current.remove();
      etaBubbleRef.current = null;
    }

    if (pickupEta === undefined) return;

    // Find pickup marker position
    const pickupMarker = markers.find(m => m.type === 'pickup');
    if (pickupMarker) {
      const el = createEtaBubble(pickupEta);
      etaBubbleRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pickupMarker.lng, pickupMarker.lat])
        .addTo(map.current);
    }
  }, [pickupEta, markers, isMapLoaded]);

  // Update arrival card
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Remove existing arrival card
    if (arrivalCardRef.current) {
      arrivalCardRef.current.remove();
      arrivalCardRef.current = null;
    }

    if (!arrivalTime) return;

    // Find dropoff marker position
    const dropoffMarker = markers.find(m => m.type === 'dropoff');
    if (dropoffMarker) {
      const el = createArrivalCard(arrivalTime);
      arrivalCardRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([dropoffMarker.lng, dropoffMarker.lat])
        .addTo(map.current);
    }
  }, [arrivalTime, markers, isMapLoaded]);

  // Add store marker
  useEffect(() => {
    if (!map.current || !isMapLoaded || !storePosition) return;

    const storeMarker = markers.find(m => m.type === 'store');
    if (!storeMarker && storePosition) {
      const el = createMarkerElement('store');
      new maplibregl.Marker({ element: el })
        .setLngLat([storePosition.lng, storePosition.lat])
        .addTo(map.current);
    }
  }, [storePosition, markers, isMapLoaded]);

  return (
    <div 
      ref={mapContainer} 
      className={`w-full h-full ${className}`}
      style={{ minHeight: '200px' }}
    />
  );
};

export default MapLibreMap;
