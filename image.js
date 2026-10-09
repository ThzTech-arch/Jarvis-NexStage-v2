// Image generation AND editing (send a reference image as attachment to edit it).
import { guard, toParts, geminiUrl, upstreamError } from "./_lib.js";

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const attachments = (req.body?.attachments || []).filter(a => String(a?.mimeType).startsWith("image/"));
    if (!prompt) return res.status(400).json({ error: "Descreva a imagem que deseja criar ou a edição desejada." });
    if (prompt.length > 6000) return res.status(413).json({ error: "Pedido de imagem acima de 6.000 caracteres." });
    const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const text = attachments.length ? `Edite a(s) imagem(ns) enviada(s) conforme: ${prompt}` : `Crie uma imagem de alta qualidade: ${prompt}`;
    const r = await fetch(geminiUrl(model, "generateContent"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: toParts(text, attachments) }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } })
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) { const e = upstreamError(r.status, result); return res.status(e.status).json({ error: e.error }); }
    const parts = result.candidates?.[0]?.content?.parts || [];
    const images = parts.filter(p => p.inlineData?.data).map(p => `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`);
    const description = parts.map(p => p.text || "").join("\n").trim();
    if (!images.length) return res.status(502).json({ error: description || "O modelo não retornou imagem. Tente reformular." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ images, description, model });
  } catch { return res.status(500).json({ error: "Falha interna ao gerar imagem." }); }
}
