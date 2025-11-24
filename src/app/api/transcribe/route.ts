// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { transcribeAudio } from '@/lib/gemini';
import { getLastChunkSequence } from '../session/stop/route';

const sessionQueues: Map<string, Promise<any>> = new Map();

/**
 * POST /api/transcribe
 * 
 * After transcribing a chunk, checks if this was the last chunk
 * for a stopped session. If so, automatically triggers full transcript
 * creation and summary generation.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!audioFile || !sessionId) {
      return NextResponse.json(
        { error: 'Missing audio or sessionId' },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    const sequenceRaw = formData.get('sequence');
    const sequence = sequenceRaw ? parseInt(String(sequenceRaw), 10) : undefined;
    const recorderRaw = formData.get('recorder');
    const recorder = recorderRaw ? parseInt(String(recorderRaw), 10) : undefined;

    console.log('Received audio:', audioFile.size, 'bytes, type:', audioFile.type, 'sequence:', sequence, 'recorder:', recorder);

    // Debug: write to file in development
    try {
      if (process.env.NODE_ENV !== 'production') {
        const fs = await import('fs');
        const path = await import('path');
        const ext = audioFile.type && audioFile.type.includes('webm') ? 'webm' : 'wav';
        const filename = path.join('/tmp', `scribe_${sessionId}_seq${sequence ?? 'nos'}_rec${recorder ?? 'norec'}.${ext}`);
        fs.writeFileSync(filename, Buffer.from(arrayBuffer));
        console.log('Wrote debug audio file to', filename);
      }
    } catch (err) {
      console.error('Failed to write debug audio file:', err);
    }

    // Save placeholder chunk
    const chunk = await prisma.transcriptChunk.create({
      data: {
        sessionId,
        text: 'Transcribing...',
        sequence: sequence ?? undefined,
      },
    });

    console.log(`Calling transcribeAudio for sequence=${sequence}, mime=${audioFile.type}`);

    // Enqueue transcription
    const sessionKey = sessionId || 'no-session';
    const prev = sessionQueues.get(sessionKey) ?? Promise.resolve();

    const current = prev.then(async () => {
      console.log(`Starting transcription for session=${sessionKey} sequence=${sequence}`);
      const txt = await transcribeAudio(base64Audio, audioFile.type);
      console.log(`Finished transcription for session=${sessionKey} sequence=${sequence}`);
      return txt;
    }).catch((err) => {
      console.error('Error in queued transcription:', err);
      throw err;
    });

    sessionQueues.set(sessionKey, current);

    // Await transcription
    const transcription = await current;

    // Clean up queue
    current.finally(() => {
      const tail = sessionQueues.get(sessionKey);
      if (tail === current) {
        sessionQueues.delete(sessionKey);
      }
    });

    // Update chunk with transcription
    await prisma.transcriptChunk.update({
      where: { id: chunk.id },
      data: { text: transcription },
    });

    // Check if this was the last chunk for a stopped session
    const lastChunkSeq = getLastChunkSequence(sessionId);
    
    if (lastChunkSeq !== undefined && sequence !== undefined && sequence >= lastChunkSeq) {
      console.log(`✓ Last chunk (${sequence}) transcribed for session ${sessionId}`);
      
      // Check if session is PROCESSING and doesn't have a full transcript yet
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { 
          status: true,
          fullTranscript: true,
        },
      });

      if (session?.status === 'PROCESSING' && !session.fullTranscript) {
        console.log(`🚀 Auto-triggering summary generation for session ${sessionId}...`);
        
        // Trigger summary generation asynchronously in the background
        // This runs independently and doesn't block the response
        (async () => {
          try {
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/session/summary`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            });
            
            if (response.ok) {
              console.log(`✓ Summary generation completed for session ${sessionId}`);
            } else {
              const error = await response.text();
              console.error(`✗ Summary generation failed for session ${sessionId}:`, error);
            }
          } catch (err) {
            console.error(`✗ Error triggering summary for session ${sessionId}:`, err);
          }
        })();
      }
    }

    return NextResponse.json({
      chunkId: chunk.id,
      transcription: transcription,
    });

  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}