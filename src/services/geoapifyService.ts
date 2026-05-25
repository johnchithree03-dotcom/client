/**
 * Geoapify Address Autocomplete Service
 * Replaces mock address suggestions with real Geoapify API calls
 * Restricted to Zambia only
 */

const GEOAPIFY_API_KEY = '8d0450d96b5748e89e46afaaf976f890';
const GEOAPIFY_BASE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';

export interface GeoapifyAddress {
  id: string;
  address: string;
  description: string;
  distance?: string;
  coords: {
    lat: number;
    lng: number;
  };
}

interface GeoapifyFeature {
  properties: {
    formatted: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    country?: string;
    place_id?: string;
    lon: number;
    lat: number;
    distance?: number;
  };
}

interface GeoapifyResponse {
  features: GeoapifyFeature[];
}

// Cache for recent addresses (persisted to localStorage)
const RECENT_ADDRESSES_KEY = 'ALETWENDE_RECENT_ADDRESSES';
const MAX_RECENT_ADDRESSES = 10;

/**
 * Get recent addresses from localStorage
 */
export const getRecentAddresses = (): GeoapifyAddress[] => {
  try {
    const stored = localStorage.getItem(RECENT_ADDRESSES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading recent addresses:', error);
  }
  return [];
};

/**
 * Save an address to recent addresses
 */
export const saveRecentAddress = (address: GeoapifyAddress): void => {
  try {
    const recent = getRecentAddresses();
    // Remove if already exists (to move to top)
    const filtered = recent.filter(a => a.id !== address.id);
    // Add to beginning
    filtered.unshift(address);
    // Keep only max recent
    const trimmed = filtered.slice(0, MAX_RECENT_ADDRESSES);
    localStorage.setItem(RECENT_ADDRESSES_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Error saving recent address:', error);
  }
};

/**
 * Search for addresses using Geoapify Autocomplete API
 * Restricted to Zambia only
 */
export const searchAddresses = async (
  query: string,
  userLocation?: { lat: number; lng: number }
): Promise<GeoapifyAddress[]> => {
  if (!query || query.trim().length < 2) {
    return getRecentAddresses();
  }

  try {
    // Build URL with Zambia filter
    let url = `${GEOAPIFY_BASE_URL}?text=${encodeURIComponent(query)}&filter=countrycode:zm,za&apiKey=${GEOAPIFY_API_KEY}&limit=10`;
    
    // Add bias towards user location if available
    if (userLocation?.lat && userLocation?.lng) {
      url += `&bias=proximity:${userLocation.lng},${userLocation.lat}`;
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Geoapify API error: ${response.status}`);
    }

    const data: GeoapifyResponse = await response.json();

    // Transform Geoapify features to our address format
    const addresses: GeoapifyAddress[] = data.features.map((feature, index) => {
      const props = feature.properties;
      
      // Format distance if available
      let distance: string | undefined;
      if (props.distance !== undefined) {
        if (props.distance < 1000) {
          distance = `${Math.round(props.distance)} m`;
        } else {
          distance = `${(props.distance / 1000).toFixed(1)} km`;
        }
      }

      // Create description from address parts
      const descriptionParts: string[] = [];
      if (props.city) descriptionParts.push(props.city);
      if (props.state && props.state !== props.city) descriptionParts.push(props.state);
      if (descriptionParts.length === 0 && props.address_line2) {
        descriptionParts.push(props.address_line2);
      }

      return {
        id: props.place_id || `geoapify-${index}-${Date.now()}`,
        address: props.formatted || props.address_line1 || query,
        description: descriptionParts.join(', ') || 'Zambia',
        distance,
        coords: {
          lat: props.lat,
          lng: props.lon
        }
      };
    });

    return addresses;
  } catch (error) {
    console.error('Geoapify search error:', error);
    // Return recent addresses as fallback
    return getRecentAddresses();
  }
};

/**
 * Reverse geocode coordinates to get address
 */
export const reverseGeocode = async (
  lat: number,
  lng: number
): Promise<GeoapifyAddress | null> => {
  try {
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${GEOAPIFY_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Geoapify reverse geocode error: ${response.status}`);
    }

    const data: GeoapifyResponse = await response.json();

    if (data.features.length === 0) {
      return null;
    }

    const feature = data.features[0];
    const props = feature.properties;

    const descriptionParts: string[] = [];
    if (props.city) descriptionParts.push(props.city);
    if (props.state && props.state !== props.city) descriptionParts.push(props.state);

    return {
      id: props.place_id || `reverse-${Date.now()}`,
      address: props.formatted || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      description: descriptionParts.join(', ') || 'Zambia',
      coords: { lat, lng }
    };
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return null;
  }
};

/**
 * Get address suggestions - returns recent addresses if no query,
 * or searches Geoapify if query is provided
 */
export const getAddressSuggestions = async (
  query: string,
  userLocation?: { lat: number; lng: number }
): Promise<GeoapifyAddress[]> => {
  if (!query || query.trim().length < 2) {
    return getRecentAddresses();
  }
  return searchAddresses(query, userLocation);
};
