import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/session/stop
 * Mark a session as stopped/processing and set its end time.
 *
 * Request JSON body: { sessionId: string }
 * Response: { sessionId: string, status: string }
 *
 * Returns 400 if `sessionId` is missing.
 */
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
      status: "PROCESSING", // Match your enum
    },
  });

  return NextResponse.json({
    sessionId: updated.id,
    status: updated.status,
  });
}
