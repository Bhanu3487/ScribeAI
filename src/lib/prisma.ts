// lib/prisma.ts
// This ensures one client instance during hot reloads.
import { PrismaClient } from "@prisma/client";

declare global {
  // allow global prisma across HMR in dev
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") global.prisma = prisma;

export default prisma;
