// src/app/api/transcribe/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { transcribeAudio } from '@/lib/gemini';

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

    // Convert to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    console.log('Received audio:', audioFile.size, 'bytes, type:', audioFile.type);

    // Save chunk first
    const chunk = await prisma.transcriptChunk.create({
      data: {
        sessionId,
        text: 'Transcribing...',
        audioData: base64Audio,
      },
    });

    // Transcribe with correct MIME type
    const transcription = await transcribeAudio(base64Audio, audioFile.type);

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