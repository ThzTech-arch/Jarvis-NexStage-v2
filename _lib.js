// Shared helpers for Jarvis NexStage API routes (Vercel Node runtime).
export const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

export function guard(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).json({ error: "Método não permitido." }); return false; }
  if (!process.env.GEMINI_API_KEY) { res.status(503).json({ error: "Servidor sem GEMINI_API_KEY. Configure nas variáveis de ambiente da Vercel e faça novo deploy." }); return false; }
  const key = process.env.JARVIS_ACCESS_KEY;
  if (key && req.headers["x-jarvis-key"] !== key) { res.status(401).json({ error: "Senha de acesso inválida. Abra Configurações e informe a senha do Jarvis." }); return false; }
  return true;
}

const ALLOWED = /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf|text\/.+|application\/json|audio\/.+|video\/(mp4|webm))$/;
export function toParts(text, attachments = []) {
  const parts = [];
  let total = 0;
  for (const a of Array.isArray(attachments) ? attachments.slice(0, 6) : []) {
    if (!a || typeof a.data !== "string" || !ALLOWED.test(String(a.mimeType))) continue;
    total += a.data.length;
    if (total > 4_000_000) break;
    parts.push({ inline_data: { mime_type: a.mimeType, data: a.data } });
  }
  if (text) parts.push({ text });
  return parts;
}

export function geminiUrl(model, method, extra = "") {
  return `${GEMINI}/${encodeURIComponent(model)}:${method}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}${extra}`;
}

export function upstreamError(status, result) {
  const msg = result?.error?.message || `HTTP ${status}`;
  return { status: status === 429 ? 429 : status === 400 ? 400 : 502, error: status === 429 ? "Limite de uso da API atingido. Aguarde um pouco e tente de novo." : `Falha no serviço de IA: ${msg}` };
}
