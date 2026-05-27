let googleMapsLoaded = false;

const areSameLocation = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  const latDiff = Math.abs(a.lat() - b.lat());
  const lngDiff = Math.abs(a.lng() - b.lng());
  return latDiff < 0.0001 && lngDiff < 0.0001;
};

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
    geocoder.geocode({ address }, (results: any, status: any) => {
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
    // Deduplicate waypoints and remove ones identical to origin/destination
    let filteredWaypoints = (waypoints || []).filter((wp, idx, arr) => {
      if (areSameLocation(wp, origin) || areSameLocation(wp, destination)) return false;
      return arr.findIndex(w => areSameLocation(w, wp)) === idx;
    });

    // If origin === destination and no waypoints, return synthetic zero-result
    if (areSameLocation(origin, destination) && filteredWaypoints.length === 0) {
      const bounds = new (window as any).google.maps.LatLngBounds();
      bounds.extend(origin);
      resolve({
        routes: [{
          legs: [{
            distance: { value: 0, text: '0 m' },
            duration: { value: 0, text: '0 min' },
            steps: [],
            start_location: origin,
            end_location: destination,
          }],
          bounds,
          overview_polyline: { points: '' },
        }],
      });
      return;
    }

    const directionsService = new (window as any).google.maps.DirectionsService();
    const routeRequest: any = {
      origin,
      destination,
      optimizeWaypoints: false,
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    };
    if (filteredWaypoints.length > 0) {
      routeRequest.waypoints = filteredWaypoints.map((loc: any) => ({ location: loc, stopover: true }));
    }

    directionsService.route(
      routeRequest,
      (result: any, status: any) => {
        if (status === 'OK' && result) {
          resolve(result);
          return;
        }

        if (status === 'ZERO_RESULTS') {
          // Fallback: try without waypoints (direct route)
          if (filteredWaypoints.length > 0) {
            directionsService.route(
              {
                origin,
                destination,
                optimizeWaypoints: false,
                travelMode: (window as any).google.maps.TravelMode.DRIVING,
              },
              (result2: any, status2: any) => {
                if (status2 === 'OK' && result2) {
                  resolve(result2);
                } else {
                  // Synthetic direct route
                  const bounds = new (window as any).google.maps.LatLngBounds();
                  bounds.extend(origin);
                  bounds.extend(destination);
                  resolve({
                    routes: [{
                      legs: [{
                        distance: { value: 0, text: '0 m' },
                        duration: { value: 0, text: '0 min' },
                        steps: [],
                        start_location: origin,
                        end_location: destination,
                      }],
                      bounds,
                      overview_polyline: { points: '' },
                    }],
                  });
                }
              }
            );
          } else {
            // No waypoints — synthetic direct route
            const bounds = new (window as any).google.maps.LatLngBounds();
            bounds.extend(origin);
            bounds.extend(destination);
            resolve({
              routes: [{
                legs: [{
                  distance: { value: 0, text: '0 m' },
                  duration: { value: 0, text: '0 min' },
                  steps: [],
                  start_location: origin,
                  end_location: destination,
                }],
                bounds,
                overview_polyline: { points: '' },
              }],
            });
          }
          return;
        }

        console.error('Directions failed:', status);
        resolve(null);
      }
    );
  });
};