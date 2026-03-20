// components/TheaterMap.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Theater = {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export default function TheaterMap({ theaters }: { theaters: Theater[] }) {
  const router = useRouter();

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  return (
    <div
      style={{
        height: "600px",
        borderRadius: "16px",
        overflow: "hidden",
        border: "1px solid #222",
      }}
    >
      <MapContainer
        center={[40.73, -73.98]}
        zoom={12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {theaters.map((theater) => (
          <Marker
            key={theater.id}
            position={[theater.latitude, theater.longitude]}
            eventHandlers={{
              click: () => {
                router.push(`/date?theater=${theater.slug}`);
              },
            }}
          >
            <Popup>
              <div>
                <div style={{ fontWeight: 700 }}>{theater.name}</div>
                {theater.address && (
                  <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
                    {theater.address}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}