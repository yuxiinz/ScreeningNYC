'use client'

import dynamic from 'next/dynamic'

const MarketplaceShowtimeSelector = dynamic(
  () => import('@/components/marketplace/MarketplaceShowtimeSelector'),
  {
    ssr: false,
  }
)

export default MarketplaceShowtimeSelector
