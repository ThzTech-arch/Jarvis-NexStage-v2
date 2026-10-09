// Streaming multimodal chat with tools (Google Search, URL reading, code execution).
import { guard, toParts, geminiUrl, upstreamError } from "./_lib.js";

const BASE = `Você é JARVIS, assistente pessoal de última geração do NexStage. Responda no idioma do usuário (padrão: português do Brasil).
Seja direto, inteligente e proativo: antecipe o próximo passo e ofereça-o no fim quando útil. Use Markdown rico (títulos, listas, tabelas, blocos de código com linguagem).
Seja honesto: não invente fatos, fontes ou resultados de testes; diferencie certeza de estimativa. Data atual: {DATE}.`;

const MODES = {
  assistant: "Modo assistente geral: resolva qualquer tarefa — explicar, planejar, resumir, traduzir, decidir, escrever.",
  research: "Modo pesquisador: use a busca do Google e leitura de URLs. Compare fontes, cite links reais com datas, aponte divergências. Termine com um resumo executivo.",
  analysis: "Modo analista de dados: use a execução de código Python para cálculos, estatística, conversões, gráficos (matplotlib) e análise de arquivos enviados. Mostre resultados reais da execução.",
  prompts: "Modo engenheiro de prompts: entregue um prompt profissional pronto para copiar (papel, objetivo, contexto, restrições, etapas, formato de saída, critérios de qualidade) em bloco de código, mais variações curtas.",
  code: "Modo engenheiro de software sênior: código completo, moderno, seguro e comentado, em blocos com a linguagem. Para interfaces web, entregue UM único bloco ```html autocontido (CSS e JS embutidos) para que o usuário veja a prévia ao vivo.",
  documents: "Modo redator: produza documentos completos e bem estruturados (relatórios, contratos-modelo, currículos, e-mails, artigos), prontos para exportar.",
  games: "Modo desenvolvedor de jogos: crie jogos completos e jogáveis. Por padrão entregue UM único bloco ```html autocontido com Canvas + JavaScript, controles de teclado e toque, placar, sons via WebAudio, tela de início e game over. Nada de dependências externas.",
  apps: "Modo construtor de aplicativos: crie apps web completos e bonitos. Por padrão entregue UM único bloco ```html autocontido, responsivo, com CSS moderno e JS, salvando dados em localStorage quando fizer sentido.",
  tutor: "Modo professor: ensine passo a passo, com exemplos, analogias e um mini exercício no final. Adapte ao nível do aluno.",
  image: "Modo diretor de arte: ajude a refinar ideias visuais em prompts de imagem detalhados."
};

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const { message = "", mode = "assistant", history = [], attachments = [], web = false, deep = false, memory = "" } = req.body || {};
  if (typeof message !== "string" || (!message.trim() && !attachments.length)) return res.status(400).json({ error: "Envie uma mensagem." });
  if (message.length > 30000) return res.status(413).json({ error: "Mensagem acima de 30.000 caracteres." });

  const contents = [];
  for (const h of Array.isArray(history) ? history.slice(-20) : []) {
    if (!h || typeof h.text !== "string" || !["user", "assistant"].includes(h.role)) continue;
    contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text.slice(0, 20000) }] });
  }
  contents.push({ role: "user", parts: toParts(message.trim(), attachments) });

  let system = BASE.replace("{DATE}", new Date().toLocaleDateString("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" })) + "\n" + (MODES[mode] || MODES.assistant);
  if (typeof memory === "string" && memory.trim()) system += `\nMemória sobre o usuário (use quando relevante):\n${memory.slice(0, 4000)}`;

  const tools = [];
  if (mode === "analysis") tools.push({ code_execution: {} });
  else if (mode === "research" || web) tools.push({ google_search: {} }, { url_context: {} });

  const model = deep ? (process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro") : (process.env.GEMINI_MODEL || "gemini-2.5-flash");
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: mode === "code" || mode === "games" || mode === "apps" ? 0.4 : 0.7, maxOutputTokens: 32768, thinkingConfig: { thinkingBudget: deep ? -1 : 2048 } },
    ...(tools.length ? { tools } : {})
  };

  let upstream;
  try {
    upstream = await fetch(geminiUrl(model, "streamGenerateContent", "&alt=sse"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { return res.status(502).json({ error: "Não foi possível falar com o serviço de IA." }); }
  if (!upstream.ok) {
    const r = await upstream.json().catch(() => ({}));
    const e = upstreamError(upstream.status, r);
    return res.status(e.status).json({ error: e.error });
  }

  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ t: "meta", model });
  const sources = new Map();
  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let chunk; try { chunk = JSON.parse(line.slice(5)); } catch { continue; }
        const cand = chunk.candidates?.[0];
        for (const p of cand?.content?.parts || []) {
          if (p.thought) continue;
          if (p.text) send({ t: "text", v: p.text });
          if (p.executableCode?.code) send({ t: "text", v: `\n\n\`\`\`python\n${p.executableCode.code}\n\`\`\`\n` });
          if (p.codeExecutionResult?.output) send({ t: "text", v: `\n**Resultado da execução:**\n\`\`\`\n${p.codeExecutionResult.output}\n\`\`\`\n\n` });
          if (p.inlineData?.data) send({ t: "image", v: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` });
        }
        for (const g of cand?.groundingMetadata?.groundingChunks || []) if (g.web?.uri) sources.set(g.web.uri, g.web.title || g.web.uri);
        if (cand?.finishReason === "SAFETY") send({ t: "text", v: "\n\n_Resposta interrompida pelo filtro de segurança do provedor._" });
      }
    }
    if (sources.size) send({ t: "sources", v: [...sources].map(([uri, title]) => ({ uri, title })) });
    send({ t: "done" });
  } catch { send({ t: "error", v: "A conexão com a IA foi interrompida." }); }
  res.end();
}
