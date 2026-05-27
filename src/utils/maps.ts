let googleMapsLoaded = false;

export const loadGoogleMaps = (apiKey: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (googleMapsLoaded) { resolve(); return; }
    if ((window as any).google?.maps) { googleMapsLoaded = true; resolve(); return; }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => { googleMapsLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

export const geocodeAddress = (address: string): Promise<any | null> => {
  return new Promise((resolve) => {
    if (!address) { resolve(null); return; }
    const geocoder = new (window as any).google.maps.Geocoder();
    // Bias geocoding to Ontario, Canada to prevent addresses like "London"
    // from resolving to London UK instead of London Ontario.
    const ontarioBounds = new (window as any).google.maps.LatLngBounds(
      new (window as any).google.maps.LatLng(41.6, -95.2), // SW corner
      new (window as any).google.maps.LatLng(56.9, -74.3)  // NE corner
    );
    geocoder.geocode({
      address,
      region: 'ca',
      bounds: ontarioBounds,
    }, (results: any, status: any) => {
      if (status === 'OK' && results?.[0]) {
        resolve(results[0].geometry.location);
      } else {
        resolve(null);
      }
    });
  });
};

export const calculateRoute = (
  origin: any,
  destination: any,
  waypoints?: any[]
): Promise<any | null> => {
  return new Promise((resolve) => {
    const directionsService = new (window as any).google.maps.DirectionsService();
    const routeRequest: any = {
      origin,
      destination,
      optimizeWaypoints: false,
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    };
    if (waypoints && waypoints.length > 0) {
      routeRequest.waypoints = waypoints.map((loc: any) => ({ location: loc, stopover: true }));
    }
    directionsService.route(
      routeRequest,
      (result: any, status: any) => {
        if (status === 'OK' && result) {
          resolve(result);
        } else {
          console.error('Directions failed:', status);
          resolve(null);
        }
      }
    );
  });
};