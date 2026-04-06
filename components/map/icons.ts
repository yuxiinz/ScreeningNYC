// components/map/icons.ts

import L from 'leaflet'

export function getIconSize(zoom: number) {
  if (zoom <= 10) return 16
  if (zoom <= 12) return 20
  if (zoom <= 14) return 24
  return 28
}

export function createEmojiIcon(
  emoji: string,
  size: number,
  extraStyle = ''
) {
  return L.divIcon({
    html: `
      <div
        style="
          font-size: ${size}px;
          line-height: ${size}px;
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          transform: translateZ(0);
          ${extraStyle}
        "
      >
        ${emoji}
      </div>
    `,
    className: 'custom-emoji-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}
