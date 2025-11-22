import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = body?.userId;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const session = await prisma.session.create({
    data: {
      userId,
      status: "RECORDING", // Match your enum
    },
  });

  return NextResponse.json({ 
    sessionId: session.id, 
    createdAt: session.startTime 
  });
}
