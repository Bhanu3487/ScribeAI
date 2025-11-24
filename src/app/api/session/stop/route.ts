// src/app/api/session/stop/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// In-memory store for last chunk sequence per session
// Format: Map<sessionId, lastSequence>
const sessionLastChunks = new Map<string, number>();

/**
 * POST /api/session/stop
 * Stop a recording session and mark the last chunk sequence in memory.
 * 
 * Request JSON body: { sessionId: string, lastSequence: number }
 * Response: { sessionId: string, status: string, lastChunkSeq: number }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, lastSequence } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId required' },
        { status: 400 }
      );
    }

    // Get current max sequence from chunks if not provided
    let finalSequence = lastSequence;
    
    if (finalSequence === undefined || finalSequence === null) {
      const maxChunk = await prisma.transcriptChunk.findFirst({
        where: { sessionId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      finalSequence = maxChunk?.sequence ?? 0;
    }

    console.log(`Stopping session ${sessionId} at sequence ${finalSequence}`);

    // Store the last sequence in memory
    sessionLastChunks.set(sessionId, finalSequence);

    // Update session status to PROCESSING
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'PROCESSING',
        endTime: new Date(),
      },
    });

    console.log(`Session ${sessionId} stopped. Last chunk sequence: ${finalSequence}`);

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      lastChunkSeq: finalSequence,
      message: 'Session stopped. Summary will be generated automatically.',
    });

  } catch (error) {
    console.error('Stop session error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Export helper to get last chunk sequence
export function getLastChunkSequence(sessionId: string): number | undefined {
  return sessionLastChunks.get(sessionId);
}

// Export helper to clear session data (cleanup after summary is generated)
export function clearSessionLastChunk(sessionId: string): void {
  sessionLastChunks.delete(sessionId);
}