// app/api/theaters/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; 

export async function GET() {
  try {
    const theaters = await prisma.theater.findMany();
    return NextResponse.json(theaters);
  } catch (error) {
    console.error('Database Error:', error);
    return NextResponse.json({ error: 'Failed to fetch theaters' }, { status: 500 });
  }
}