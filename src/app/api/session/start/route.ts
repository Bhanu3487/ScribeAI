// src/app/api/session/start/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = body?.userId ?? null;

  const session = await prisma.session.create({
    data: {
      userId,
      startTime: new Date(),
      // Let status use default value from schema
    },
  });

  return NextResponse.json({ sessionId: session.id, createdAt: session.createdAt });
}
