import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
    
    console.log('Received audio:', audioFile.size, 'bytes');
    
    // Save chunk with matching schema fields
    const chunk = await prisma.transcriptChunk.create({
      data: {
        sessionId,
        text: 'Transcription pending...', // Required field
        audioData: base64Audio, // Optional field we just added
      }
    });
    
    console.log('Saved chunk:', chunk.id);
    
    return NextResponse.json({ 
      chunkId: chunk.id,
      transcription: 'Mock transcription: Audio received successfully! Gemini integration coming next.',
    });
    
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
