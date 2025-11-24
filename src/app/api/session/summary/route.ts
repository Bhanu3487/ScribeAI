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
      console.log('✓ Returning existing summary for session:', sessionId);
      return NextResponse.json({ 
        summary: existingSummary.text,
        fullTranscript: existingSummary.session.fullTranscript?.text || '',
        cached: true,
      });
    }

    console.log('No existing summary found, proceeding to generate...');

    // Check if full transcript already exists
    let fullTranscript = await prisma.fullTranscript.findUnique({
      where: { sessionId },
    });

    // If no full transcript, create it from chunks
    if (!fullTranscript) {
      console.log('No full transcript found, creating from chunks...');

      // Get the last chunk sequence from memory
      const lastChunkSeq = getLastChunkSequence(sessionId);

      // Get all chunks up to lastChunkSeq (if available)
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

      if (chunks.length === 0) {
        return NextResponse.json(
          { error: 'No transcript chunks found' }, 
          { status: 404 }
        );
      }

      // Check if all required chunks are transcribed
      const hasPlaceholders = chunks.some(c => 
        c.text === 'Transcribing...' || 
        c.text.trim() === ''
      );

      if (hasPlaceholders) {
        const transcribingCount = chunks.filter(c => 
          c.text === 'Transcribing...'
        ).length;
        
        console.warn(
          `Not all chunks ready for session ${sessionId}. ` +
          `${transcribingCount}/${chunks.length} still transcribing.`
        );

        return NextResponse.json(
          { 
            error: 'Not all chunks have been transcribed yet',
            totalChunks: chunks.length,
            transcribingChunks: transcribingCount,
            lastChunkSeq: lastChunkSeq,
          },
          { status: 425 }
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
        `Creating full transcript from ${chunks.length} chunks ` +
        `(up to sequence ${lastChunkSeq ?? 'N/A'}). ` +
        `Total length: ${fullText.length} characters`
      );

      // Save full transcript
      fullTranscript = await prisma.fullTranscript.create({
        data: {
          sessionId,
          text: fullText,
        },
      });

      console.log('Full transcript created with id:', fullTranscript.id);
    } else {
      console.log('Using existing full transcript with id:', fullTranscript.id);
    }

    // Generate summary from full transcript
    console.log('Generating summary for transcript...');

    let summaryText;
    try {
      summaryText = await generateSummary(fullTranscript.text);
      console.log('Summary generated successfully. Length:', summaryText?.length || 0);
    } catch (err) {
      console.error('Error generating summary:', err);
      throw new Error(`Failed to generate summary: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Save summary
    console.log('Saving summary to database...');
    let summary;
    try {
      summary = await prisma.summary.create({
        data: {
          sessionId,
          text: summaryText,
        },
      });
      console.log('Summary saved with id:', summary.id);
    } catch (err) {
      console.error('Error saving summary to database:', err);
      throw new Error(`Failed to save summary: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Update session status to COMPLETED
    console.log('Updating session status to COMPLETED...');
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
        },
      });
      console.log('Session status updated to COMPLETED');
    } catch (err) {
      console.error('Error updating session status:', err);
      // Don't throw here, summary is already saved
    }

    // Clean up in-memory data since we're done
    clearSessionLastChunk(sessionId);
    console.log(`✓ Cleaned up session data for ${sessionId}`);

    return NextResponse.json({ 
      summary: summary.text,
      fullTranscript: fullTranscript.text,
      cached: false,
    });

  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}