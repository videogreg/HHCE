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

export const geocodeAddress = (address: string): Promise<google.maps.LatLng | null> => {
  return new Promise((resolve) => {
    if (!address) { resolve(null); return; }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        resolve(results[0].geometry.location);
      } else {
        resolve(null);
      }
    });
  });
};

export const calculateRoute = (
  origin: google.maps.LatLng,
  destination: google.maps.LatLng,
  waypoints: google.maps.LatLng[]
): Promise<google.maps.DirectionsResult | null> => {
  return new Promise((resolve) => {
    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin,
        destination,
        waypoints: waypoints.map(loc => ({ location: loc, stopover: true })),
        optimizeWaypoints: false,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
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