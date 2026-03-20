// scripts/update_theaters.ts

import { prisma } from '@/lib/prisma'

async function main() {
  await prisma.theater.update({
    where: { slug: 'metrograph' },
    data: {
      latitude: 40.7182,
      longitude: -73.9902,
      address: '7 Ludlow St, New York, NY',
    },
  })

  await prisma.theater.update({
    where: { slug: 'filmforum' },
    data: {
      latitude: 40.7287,
      longitude: -74.0053,
      address: '209 W Houston St, New York, NY',
    },
  })

  console.log('✅ Theater locations updated')
}

main().finally(() => prisma.$disconnect())