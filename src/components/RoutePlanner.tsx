import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { loadGoogleMaps, geocodeAddress, calculateRoute } from '../utils/maps';
import { format, parse, addMinutes, isAfter } from 'date-fns';
import { Car, MapPin, Clock, Home, Users, X, AlertTriangle, Navigation } from 'lucide-react';
import type { Cleaner, Visit } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

interface RouteStop {
  type: 'depart' | 'pickup' | 'clean' | 'dropoff' | 'home';
  label: string;
  address: string;
  arrivalTime: string;
  departTime?: string;
  durationMin?: number;
  legDistanceKm?: number;
  legDurationMin?: number;
  isLate?: boolean;
  lateMin?: number;
}

export const RoutePlanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { visits, cleaners, clients, teams, selectedDate } = useAppContext();
  const [selectedDriver, setSelectedDriver] = useState<Cleaner | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [totalKm, setTotalKm] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);

  // ... rest of the file stays exactly the same ...