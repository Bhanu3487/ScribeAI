import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    
    // Get all chunks
    const chunks = await prisma.transcriptChunk.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' }
    });
    
    const fullText = chunks.map(c => c.text).join(' ');
    
    // Check if summary already exists
    const existingSummary = await prisma.summary.findUnique({
      where: { sessionId }
    });
    
    if (existingSummary) {
      return NextResponse.json({ summary: existingSummary.text });
    }
    
    // Create mock summary
    const summaryText = `Mock Summary: Analyzed ${chunks.length} audio chunk(s). Gemini integration coming next.`;
    
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
