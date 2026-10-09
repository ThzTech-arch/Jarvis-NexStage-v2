// Natural neural voice (Gemini TTS). Returns WAV base64. Falls back to browser voice on the client if this fails.
import { guard, geminiUrl, upstreamError } from "./_lib.js";

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  try {
    const text = String(req.body?.text || "").replace(/```[\s\S]*?```/g, " (código omitido) ").replace(/[#*_`>|]/g, "").slice(0, 4000);
    if (!text.trim()) return res.status(400).json({ error: "Nada para falar." });
    const voice = String(req.body?.voice || process.env.JARVIS_VOICE || "Charon");
    const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
    const r = await fetch(geminiUrl(model, "generateContent"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } })
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) { const e = upstreamError(r.status, result); return res.status(e.status).json({ error: e.error }); }
    const data = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!data) return res.status(502).json({ error: "Sem áudio." });
    return res.status(200).json({ audio: "data:audio/wav;base64," + wav(Buffer.from(data, "base64")).toString("base64") });
  } catch { return res.status(500).json({ error: "Falha ao gerar voz." }); }
}
