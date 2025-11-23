// src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  return key;
}

function createGenAI() {
  const key = getApiKey();
  return new GoogleGenerativeAI(key);
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string = 'audio/wav'
): Promise<string> {
  try {
    const genAI = createGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio,
        },
      },
      {
        text: 'Transcribe this audio exactly as spoken. Output only the transcribed text, nothing else.',
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini transcription error:', error);
    throw new Error(
      `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function generateSummary(fullTranscript: string): Promise<string> {
  try {
    const genAI = createGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `\nSummarize this transcript concisely:\n\n**Format:**\n- Main topic: [one sentence]\n- Key points: [bullet points]\n- Action items: [if any]\n\n**Transcript:**\n${fullTranscript}\n`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini summary error:', error);
    throw new Error(
      `Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}