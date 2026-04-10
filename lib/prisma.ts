// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion: string | undefined;
};
const PRISMA_SCHEMA_VERSION = "202604101130_marketplace_posts";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

const shouldReuseGlobalPrisma =
  typeof globalForPrisma.prisma !== "undefined" &&
  globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION;

export const prisma: PrismaClient = shouldReuseGlobalPrisma
  ? globalForPrisma.prisma!
  : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}
