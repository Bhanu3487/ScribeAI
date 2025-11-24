import { NextResponse } from 'next/server';
import { checkGemini } from '@/lib/gemini';

export async function GET() {
    try {
        const res = await checkGemini();
        if (res.ok) {
            return NextResponse.json({ ok: true, detail: res.detail });
        }
        return NextResponse.json({ ok: false, detail: res.detail }, { status: 503 });
    } catch (err) {
        console.error('Health route error:', err);
        return NextResponse.json({ ok: false, detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
