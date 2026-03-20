// components/UserLocationMarker.tsx
"use client";

import { useEffect, useState } from "react";
import { Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";

// 使用我们刚才定义的 😊 图标
const userIcon = L.divIcon({
  html: `<div style="font-size: 30px;">😊</div>`,
  className: 'custom-icon',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export default function UserLocationMarker() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  
  const map = useMapEvents({
    locationfound(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      // 关键：定位到用户后，平滑飞行到该位置，缩放级别设为 14 (更近一点)
      map.flyTo(e.latlng, 14, { duration: 1.5 });
    },
    locationerror() {
      console.log("定位失败，可能用户禁用了权限");
    }
  });

  useEffect(() => {
    map.locate();
  }, [map]);

  return position === null ? null : (
    <Marker position={position} icon={userIcon}>
      <Popup><div style={{color:'#000'}}>YOU ARE HERE 😊</div></Popup>
    </Marker>
  );
}