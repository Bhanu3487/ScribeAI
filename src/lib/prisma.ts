// lib/prisma.ts
// Ensures a single PrismaClient instance across HMR (development).
import { PrismaClient } from "@prisma/client";

declare global {
  // Allow global prisma across HMR in dev to prevent multiple instances
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") global.prisma = prisma;

/**
 * Default exported Prisma client instance.
 * Use this throughout the server codebase to access the database.
 *
 * Example:
 * ```ts
 * import prisma from '@/lib/prisma';
 * await prisma.user.findMany();
 * ```
 */
export default prisma;
