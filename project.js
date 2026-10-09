// Multi-file project generator. Returns files the browser previews and zips. Code is never executed on the server.
import { guard, toParts, geminiUrl, upstreamError } from "./_lib.js";

const KIND = {
  game: "Crie um jogo completo e polido para navegador (HTML5 Canvas + JavaScript puro, sem dependências): tela inicial, controles teclado e toque, fases/dificuldade progressiva, placar e recorde em localStorage, sons WebAudio, game over e reinício.",
  app: "Crie um aplicativo web/PWA completo, bonito e responsivo (HTML/CSS/JS puro), com dados persistidos em localStorage, acessível e pronto para publicar.",
  site: "Crie um site profissional completo, moderno, responsivo, com animações suaves e boa tipografia (HTML/CSS/JS puro).",
  files: "Crie exatamente os arquivos pedidos, no formato e linguagem apropriados, completos e coerentes entre si."
};

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const kind = KIND[req.body?.kind] ? req.body.kind : "app";
    const previous = Array.isArray(req.body?.previous) ? req.body.previous.slice(0, 20) : [];
    if (!prompt) return res.status(400).json({ error: "Descreva o que deseja construir." });
    let text = prompt;
    if (previous.length) text = `Projeto atual (aplique as alterações pedidas e devolva TODOS os arquivos atualizados):\n${previous.map(f => `--- ${f.path}\n${String(f.content).slice(0, 40000)}`).join("\n")}\n\nAlteração pedida: ${prompt}`;
    const system = `${KIND[kind]} Se for web, o ponto de entrada DEVE ser index.html, referenciando os outros arquivos por caminho relativo. Até 20 arquivos. Inclua README.md com como rodar. Sem segredos, malware ou coleta oculta de dados. Responda apenas JSON: {"name":"nome-curto","summary":"resumo do que foi feito","files":[{"path":"index.html","content":"..."}]}. Caminhos relativos, sem "..".`;
    const model = process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro";
    const r = await fetch(geminiUrl(model, "generateContent"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: toParts(text, req.body?.attachments) }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 65536, responseMimeType: "application/json" }
      })
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) { const e = upstreamError(r.status, result); return res.status(e.status).json({ error: e.error }); }
    const raw = (result.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("").trim();
    let project; try { project = JSON.parse(raw.replace(/^```json\s*|```$/g, "")); } catch { return res.status(502).json({ error: "A IA não entregou um pacote válido. Tente simplificar ou dividir o pedido." }); }
    const files = [];
    for (const f of Array.isArray(project?.files) ? project.files.slice(0, 20) : []) {
      if (typeof f?.path !== "string" || typeof f?.content !== "string") continue;
      const path = f.path.replace(/\\/g, "/").replace(/^\.\//, "");
      if (path.startsWith("/") || path.split("/").some(s => !s || s === "." || s === "..") || /[<>:"|?*]/.test(path)) continue;
      files.push({ path, content: f.content });
    }
    if (!files.length) return res.status(502).json({ error: "Nenhum arquivo válido foi gerado." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ name: String(project.name || "jarvis-projeto").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "jarvis-projeto", summary: String(project.summary || ""), files, model });
  } catch { return res.status(500).json({ error: "Falha interna ao gerar o projeto." }); }
}
