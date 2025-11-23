// src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Get Gemini API key from environment.
 * Throws an Error if the key is not present so callers can handle it.
 * @returns {string} The Gemini API key from `process.env.GEMINI_API_KEY`.
 * @throws {Error} When the environment variable is missing.
 */
function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  return key;
}

/**
 * Create a new GoogleGenerativeAI client using the API key.
 * This is created on-demand to avoid throwing at module import time
 * (useful for server environments and tests).
 * @returns {GoogleGenerativeAI} A configured Gemini client instance.
 */
function createGenAI() {
  const key = getApiKey();
  return new GoogleGenerativeAI(key);
}

/**
 * Transcribe an audio payload using the Gemini generative model.
 * The audio must be provided as a base64-encoded string.
 * @param {string} base64Audio - Base64-encoded audio data.
 * @param {string} [mimeType='audio/wav'] - MIME type describing the audio format.
 * @returns {Promise<string>} The transcribed text.
 * @throws {Error} If transcription fails or the API key is missing.
 */
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

/**
 * Generate a concise summary for a full transcript using Gemini.
 * The function composes a prompt that asks for a main topic, key points,
 * and action items and returns the model's text output.
 * @param {string} fullTranscript - The combined transcript text to summarize.
 * @returns {Promise<string>} The generated summary text.
 * @throws {Error} If summary generation fails or the API key is missing.
 */
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