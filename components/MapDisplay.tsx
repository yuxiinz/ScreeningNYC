// components/MapDisplay.tsx
"use client";

import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import Link from "next/link";

// --- 1. 定义自定义 Emoji 图标 ---

// 电影院图标：🎬
const theaterIcon = L.divIcon({
  html: `<div style="font-size: 18px; cursor: pointer;">🎬</div>`,
  className: 'custom-emoji-icon', 
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

// 用户图标：😊
const userIcon = L.divIcon({
  html: `<div style="font-size: 18px; filter: drop-shadow(0 0 8px rgba(255,255,255,0.8));">😊</div>`,
  className: 'custom-emoji-icon',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

// --- 2. 内部组件：负责定位和飞行 ---

function LocationMarker() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  
  const map = useMapEvents({
    // 当找到位置时
    locationfound(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      // 丝滑飞行：自动缩放到 14 级
      map.flyTo(e.latlng, 14, {
        animate: true,
        duration: 1.5
      });
    },
    // 如果用户拒绝权限或定位失败
    locationerror() {
      console.warn("Location access denied or failed.");
    },
  });

  useEffect(() => {
    // 组件加载后立即请求定位
    map.locate();
  }, [map]);

  return position === null ? null : (
    <Marker position={position} icon={userIcon}>
      <Popup>
        <div style={{ color: '#000', fontWeight: 'bold' }}>YOU ARE HERE 😊</div>
      </Popup>
    </Marker>
  );
}

// --- 3. 主地图组件 ---

interface MapProps {
  theaters: any[];
}

export default function MapDisplay({ theaters }: MapProps) {
  // 初始中心点（在定位成功前显示的默认位置，设为纽约）
  const defaultCenter: [number, number] = [40.7128, -74.0060];

  return (
    <div style={{ width: '100%', height: '600px', position: 'relative' }}>
      <MapContainer 
        center={defaultCenter} 
        zoom={13} 
        style={{ height: "100%", width: "100%", borderRadius: '12px', backgroundColor: '#111' }}
      >
        {/* 使用 CartoDB 的暗黑风格底图 */}
        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* 渲染用户定位逻辑和图标 */}
        <LocationMarker />

        {/* 渲染数据库里的影院图标 */}
        {theaters.map((theater) => (
          <Marker 
            key={theater.id} 
            position={[theater.latitude, theater.longitude]} 
            icon={theaterIcon}
          >
            <Popup>
              <div style={{ color: '#000', minWidth: '150px' }}>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1rem' }}>{theater.name.toUpperCase()}</h3>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#666' }}>
                  {theater.address}<br/>
                  {theater.borough?.toUpperCase()}
                </p>
                <Link 
                  href={`/date?theaterId=${theater.id}`} 
                  style={{ 
                    display: 'inline-block',
                    backgroundColor: '#000',
                    color: '#fff',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    textDecoration: 'none',
                    fontWeight: 'bold'
                  }}
                >
                  VIEW SHOWTIMES ↗
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 简单的 CSS 修复：去掉 Leaflet 默认给 divIcon 加的白框背景 */}
      <style jsx global>{`
        .custom-emoji-icon {
          background: none !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}