// src/app/api/session/stop/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId = body?.sessionId;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      endTime: new Date(),
      status: "COMPLETED", // Common alternative to PROCESSING
    },
  });

  return NextResponse.json({ sessionId: updated.id, status: updated.status });
}
