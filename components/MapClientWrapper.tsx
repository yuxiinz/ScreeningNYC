// components/MapClientWrapper.tsx
"use client";

import dynamic from "next/dynamic";

const TheaterMap = dynamic(() => import("./TheaterMap"), {
  ssr: false,
});

type Theater = {
  id: number;
  name: string;
  slug: string;
  sourceName: string | null;
  sourceTheaterId: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  officialSiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function MapClientWrapper({ theaters }: { theaters: Theater[] }) {
  return <TheaterMap theaters={theaters} />;
}