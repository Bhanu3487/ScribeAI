// src/app/api/session/summary/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateSummary } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    
    // Check if summary already exists
    const existingSummary = await prisma.summary.findUnique({
      where: { sessionId }
    });
    
    if (existingSummary) {
      return NextResponse.json({ summary: existingSummary.text });
    }
    
    // Get all chunks
    const chunks = await prisma.transcriptChunk.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' }
    });
    
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No transcript chunks found' }, { status: 404 });
    }
    
    // Combine all transcriptions
    const fullText = chunks.map(c => c.text).join(' ');
    
    console.log('Generating summary for transcript:', fullText.substring(0, 100));
    
    // Generate summary with Gemini
    const summaryText = await generateSummary(fullText);
    
    console.log('Summary generated:', summaryText);
    
    // Save summary
    const summary = await prisma.summary.create({
      data: {
        sessionId,
        text: summaryText
      }
    });
    
    // Update session status
    await prisma.session.update({
      where: { id: sessionId },
      data: { 
        status: 'COMPLETED',
        endTime: new Date()
      }
    });
    
    return NextResponse.json({ summary: summary.text });
    
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
