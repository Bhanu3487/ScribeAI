// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { transcribeAudio } from '@/lib/gemini';

// Simple in-memory per-session transcription queue to serialize calls
const sessionQueues: Map<string, Promise<any>> = new Map();

/**
 * POST /api/transcribe
 * Accepts multipart/form-data with fields:
 * - `audio`: file blob (audio/wav recommended)
 * - `sessionId`: string session identifier
 *
 * The route will store a placeholder transcript chunk, call the speech
 * transcription function, update the chunk with the resulting text, and
 * return the chunk id and transcription.
 *
 * Responses:
 * - 200: { chunkId, transcription }
 * - 400: Missing audio or sessionId
 * - 500: Internal / transcription error
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

    // Convert to base64 (used only transiently for transcription)
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    // Parse optional metadata from the form
    const sequenceRaw = formData.get('sequence');
    const sequence = sequenceRaw ? parseInt(String(sequenceRaw), 10) : undefined;
    const recorderRaw = formData.get('recorder');
    const recorder = recorderRaw ? parseInt(String(recorderRaw), 10) : undefined;

    console.log('Received audio:', audioFile.size, 'bytes, type:', audioFile.type, 'sequence:', sequence, 'recorder:', recorder);
    // Log base64 length (not full data) for debugging
    console.log('Base64 length:', base64Audio.length);
    // In development, write the raw uploaded file to /tmp for inspection
    try {
      if (process.env.NODE_ENV !== 'production') {
        const fs = await import('fs');
        const path = await import('path');
        const ext = audioFile.type && audioFile.type.includes('webm') ? 'webm' : 'wav';
        const filename = path.join('/tmp', `scribe_${sessionId || 'nosession'}_seq${sequence ?? 'nos'}_rec${recorder ?? 'norec'}.${ext}`);
        fs.writeFileSync(filename, Buffer.from(arrayBuffer));
        console.log('Wrote debug audio file to', filename, 'size', Buffer.from(arrayBuffer).length);
      }
    } catch (err) {
      console.error('Failed to write debug audio file:', err);
    }

    // Save chunk
    const chunk = await prisma.transcriptChunk.create({
      data: {
        sessionId,
        text: 'Transcribing...',
        sequence: sequence ?? undefined,
      },
    });

    // Transcribe with correct MIME type
    console.log(`Calling transcribeAudio for sequence=${sequence}, mime=${audioFile.type}`);

    // Enqueue transcription for this session to avoid concurrent Gemini calls
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

    // Store current promise as the queue tail
    sessionQueues.set(sessionKey, current);

    // Await the current transcription result
    const transcription = await current;
    console.log(`Transcription result for sequence=${sequence}:`, typeof transcription === 'string' ? `${transcription.substring(0, 80)}...` : transcription);

    // Clean up queue map if this is the last task
    current.finally(() => {
      const tail = sessionQueues.get(sessionKey);
      if (tail === current) {
        sessionQueues.delete(sessionKey);
      }
    });

    // Update chunk
    await prisma.transcriptChunk.update({
      where: { id: chunk.id },
      data: { text: transcription },
    });

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