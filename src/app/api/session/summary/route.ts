// src/app/api/session/summary/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateSummary } from '@/lib/gemini';
import { getLastChunkSequence, clearSessionLastChunk } from '../stop/route';

/**
 * POST /api/session/summary
 * Generate (or return existing) a summary for a session's transcript.
 * 
 * Flow:
 * 1. Check if summary already exists → return it
 * 2. Check if full transcript exists → use it for summary
 * 3. Get lastChunkSeq from memory and check if all chunks are ready
 * 4. Create full transcript from chunks (up to lastChunkSeq)
 * 5. Generate summary from full transcript
 * 6. Clean up memory
 *
 * Request JSON body: { sessionId: string }
 * Response: { summary: string, fullTranscript: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;

    if (!sessionId) {
      console.error('Summary endpoint called without sessionId');
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    console.log(`📋 Summary request for session: ${sessionId}`);

    // Check if summary already exists
    const existingSummary = await prisma.summary.findUnique({
      where: { sessionId },
      include: {
        session: {
          include: {
            fullTranscript: true,
          },
        },
      },
    });

    if (existingSummary) {
      console.log('✓ Returning cached summary for session:', sessionId);
      return NextResponse.json({ 
        summary: existingSummary.text,
        fullTranscript: existingSummary.session.fullTranscript?.text || '',
        cached: true,
      });
    }

    console.log('No existing summary found, generating new one...');

    // Check if full transcript already exists
    let fullTranscript = await prisma.fullTranscript.findUnique({
      where: { sessionId },
    });

    // If no full transcript, create it from chunks
    if (!fullTranscript) {
      console.log('Creating full transcript from chunks...');

      const lastChunkSeq = getLastChunkSequence(sessionId);
      console.log('Last chunk sequence from memory:', lastChunkSeq);

      // Get all chunks up to lastChunkSeq
      const chunks = await prisma.transcriptChunk.findMany({
        where: { 
          sessionId,
          ...(lastChunkSeq !== undefined ? {
            sequence: { lte: lastChunkSeq }
          } : {})
        },
        orderBy: [
          { sequence: 'asc' },
          { timestamp: 'asc' },
        ],
      });

      console.log(`Found ${chunks.length} chunks for session ${sessionId}`);

      if (chunks.length === 0) {
        return NextResponse.json(
          { error: 'No transcript chunks found' }, 
          { status: 404 }
        );
      }

      // Check if all chunks are transcribed
      const stillTranscribing = chunks.filter(c => 
        c.text === 'Transcribing...' || c.text.trim() === ''
      );

      if (stillTranscribing.length > 0) {
        console.warn(
          `⏳ ${stillTranscribing.length}/${chunks.length} chunks still transcribing for session ${sessionId}`
        );

        return NextResponse.json(
          { 
            error: 'Transcription still in progress',
            totalChunks: chunks.length,
            transcribingChunks: stillTranscribing.length,
            readyChunks: chunks.length - stillTranscribing.length,
            message: 'Please wait for all chunks to be transcribed',
          },
          { status: 202 } // 202 Accepted - request received, processing not complete
        );
      }

      // Combine chunks into full transcript
      const fullText = chunks
        .map((c) => c.text.trim())
        .filter(text => text.length > 0)
        .join(' ');

      if (fullText.length === 0) {
        return NextResponse.json(
          { error: 'All transcript chunks are empty' },
          { status: 404 }
        );
      }

      console.log(
        `✓ Creating full transcript: ${chunks.length} chunks, ` +
        `${fullText.length} characters (up to seq ${lastChunkSeq ?? 'N/A'})`
      );

      // Save full transcript
      try {
        fullTranscript = await prisma.fullTranscript.create({
          data: {
            sessionId,
            text: fullText,
          },
        });
        console.log(`✓ Full transcript saved with id: ${fullTranscript.id}`);
      } catch (err) {
        console.error('Error saving full transcript:', err);
        throw new Error(`Failed to save full transcript: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else {
      console.log('✓ Using existing full transcript:', fullTranscript.id);
    }

    // Generate summary from full transcript
    console.log('🤖 Generating AI summary...');
    let summaryText;
    try {
      summaryText = await generateSummary(fullTranscript.text);
      console.log(`✓ Summary generated (${summaryText?.length || 0} characters)`);
    } catch (err) {
      console.error('Error generating summary:', err);
      throw new Error(`Failed to generate summary: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Save summary
    console.log('💾 Saving summary to database...');
    let summary;
    try {
      summary = await prisma.summary.create({
        data: {
          sessionId,
          text: summaryText,
        },
      });
      console.log(`✓ Summary saved with id: ${summary.id}`);
    } catch (err) {
      console.error('Error saving summary:', err);
      throw new Error(`Failed to save summary: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Update session status to COMPLETED
    console.log('📝 Updating session status to COMPLETED...');
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
        },
      });
      console.log('✓ Session marked as COMPLETED');
    } catch (err) {
      console.error('Error updating session status:', err);
    }

    // Clean up in-memory data
    clearSessionLastChunk(sessionId);
    console.log(`✓ Cleaned up memory for session ${sessionId}`);

    console.log(`🎉 Summary generation complete for session ${sessionId}`);

    return NextResponse.json({ 
      summary: summary.text,
      fullTranscript: fullTranscript.text,
      cached: false,
    });

  } catch (error) {
    console.error('❌ Summary generation error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/session/summary?sessionId=xxx
 * Check status of summary generation
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        summary: true,
        fullTranscript: true,
        chunks: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const transcribingChunks = session.chunks.filter(
      c => c.text === 'Transcribing...' || c.text.trim() === ''
    ).length;

    return NextResponse.json({
      sessionId,
      status: session.status,
      hasSummary: !!session.summary,
      hasFullTranscript: !!session.fullTranscript,
      totalChunks: session.chunks.length,
      transcribingChunks,
      summary: session.summary?.text || null,
      fullTranscript: session.fullTranscript?.text || null,
      lastChunkSeqInMemory: getLastChunkSequence(sessionId),
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}