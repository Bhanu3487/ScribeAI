// src/app/api/auth/mock-login/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/auth/mock-login
 * Create or return a test user by email. Intended for local/dev auth mocking.
 *
 * Request JSON body: { email: string }
 * Response: { userId: string }
 *
 * Returns 400 if `email` is not provided.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = body?.email;

  // If email is required in your schema, enforce it
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email },
  });

  // If not, create new user
  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }

  return NextResponse.json({ userId: user.id });
}
