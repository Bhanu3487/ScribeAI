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

    console.log('Gemini: sending audio for transcription. mimeType:', mimeType, 'base64 length:', base64Audio.length);

    // Retry logic for transient errors (e.g., 503 Service Unavailable)
    const maxAttempts = 4;
    const baseDelayMs = 1000; // initial backoff

    function sleep(ms: number) {
      return new Promise((res) => setTimeout(res, ms));
    }

    let lastErr: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
        const text = await response.text();
        console.log('Gemini response (preview):', (text && text.length) ? `${text.substring(0, 200)}...` : '<empty>');
        return text;
      } catch (err: any) {
        lastErr = err;
        const isTransient = err && (err.status === 503 || (err.message && /503|Service Unavailable/i.test(err.message)));
        console.warn(`Gemini attempt ${attempt} failed${isTransient ? ' (transient)' : ''}:`, err && err.message ? err.message : err);

        if (attempt < maxAttempts && isTransient) {
          // exponential backoff with jitter
          const backoff = baseDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 300);
          const waitMs = backoff + jitter;
          console.log(`Retrying Gemini in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
          await sleep(waitMs);
          continue;
        }

        // If not transient or out of attempts, rethrow after loop
        break;
      }
    }

    // If we reach here, all attempts failed
    // Log full error details (including non-enumerable props) to aid debugging
    try {
      console.error('Gemini transcription failed after retries:', JSON.stringify(lastErr, Object.getOwnPropertyNames(lastErr)));
    } catch (e) {
      console.error('Gemini transcription failed after retries (could not stringify):', lastErr);
    }

    throw lastErr;
  } catch (error) {
    console.error('Gemini transcription error (outer):', error);
    throw new Error(
      `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Perform a lightweight health check against the Gemini model by making a small text-only request.
 * Returns an object with `ok: boolean` and `detail` containing either the response text or the error.
 */
export async function checkGemini(): Promise<{ ok: boolean; detail: string }> {
  try {
    const genAI = createGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = 'Say "hello" briefly.';
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return { ok: true, detail: text };
  } catch (err: any) {
    try {
      console.error('Gemini healthcheck error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    } catch (e) {
      console.error('Gemini healthcheck error (raw):', err);
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: message };
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