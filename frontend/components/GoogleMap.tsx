"use client";

import { useState } from "react";
import {
  GoogleMap,
  LoadScript,
  Marker,
} from "@react-google-maps/api";

const defaultCenter = {
  lat: 27.7172,
  lng: 85.3240,
};

export default function GoogleMapComponent() {
  // Stores the clicked location
  const [markerPosition, setMarkerPosition] =
    useState<google.maps.LatLngLiteral | null>(null);

  // Runs when user clicks on the map
  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;

    setMarkerPosition({
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    });
  };

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <div className="flex h-full min-h-0 gap-5 overflow-hidden rounded-2xl bg-gray-100 p-5">
        {/* Sidebar */}
        <div className="w-80 bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-6 text-black">
            📍 Selected Location
          </h2>

          {markerPosition ? (
            <>
              <div className="mb-6">
                <p className="text-blue-500 text-md font-bold">Latitude</p>
                <p className="text-lg font-medium text-black">
                  {markerPosition.lat.toFixed(6)}
                </p>
              </div>

              <div>
                <p className="text-blue-500 text-md font-bold">Longitude</p>
                <p className="text-lg font-medium text-black">
                  {markerPosition.lng.toFixed(6)}
                </p>
              </div>
            </>
          ) : (
            <p className="text-gray-500">
              Click anywhere on the map to select a location.
            </p>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 rounded-2xl overflow-hidden shadow-lg">
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={defaultCenter}
            zoom={13}
            onClick={handleMapClick}
          >
            {markerPosition && <Marker position={markerPosition} />}
          </GoogleMap>
        </div>
      </div>
    </LoadScript>
  );
}