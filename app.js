/* Jarvis NexStage 2.0 — client */
const $ = s => document.querySelector(s);
const MODES = {
  assistant: ["◈", "Assistente", "ASSISTENTE"],
  research: ["⌕", "Pesquisa web", "PESQUISA"],
  analysis: ["∑", "Dados & cálculo", "ANÁLISE"],
  code: ["⌘", "Programação", "CÓDIGO"],
  games: ["🎮", "Criar jogos", "JOGOS"],
  apps: ["▣", "Criar apps", "APPS"],
  image: ["✦", "Imagens", "IMAGENS"],
  documents: ["▤", "Documentos", "DOCUMENTOS"],
  prompts: ["✧", "Prompts", "PROMPTS"],
  tutor: ["🎓", "Professor", "TUTOR"]
};
const CARDS = [
  ["⌕", "Notícias de hoje", "O que aconteceu de importante hoje no Brasil e no mundo?", "research"],
  ["🎮", "Criar um jogo", "Crie um jogo de nave espacial com power-ups e chefões", "games"],
  ["✦", "Gerar imagem", "Um robô futurista estilo Iron Man em uma cidade neon, cinematográfico", "image"],
  ["▣", "Construir app", "Crie um app de controle financeiro pessoal com gráficos", "apps"],
  ["∑", "Analisar dados", "Calcule juros compostos de R$ 500/mês por 10 anos a 1% ao mês e mostre um gráfico", "analysis"],
  ["📄", "Analisar arquivo", "Anexe um PDF, foto ou planilha e me pergunte qualquer coisa sobre ele", "assistant"]
];

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("jn2-" + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("jn2-" + k, JSON.stringify(v)); } catch { toast("Armazenamento cheio — apague conversas antigas."); } }
};
let settings = store.get("settings", { name: "", key: "", voice: "Charon", save: true });
let memory = store.get("memory", "");
let chats = store.get("chats", []);
let current = null, mode = "assistant", attachments = [], controller = null, voiceLoop = false, lastProject = null;

const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2400); }
function persist() { if (settings.save) store.set("chats", chats.slice(0, 60).map(c => ({ ...c, messages: c.messages.map(m => ({ ...m, images: (m.images || []).slice(0, 2) })) }))); }
const headers = () => ({ "Content-Type": "application/json", ...(settings.key ? { "X-Jarvis-Key": settings.key } : {}) });

/* ---------- Markdown ---------- */
function md(text) {
  if (!window.marked) return `<p>${esc(text)}</p>`;
  // protect math
  const math = [];
  text = text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => { math.push([a || b, true]); return `@@M${math.length - 1}@@`; })
             .replace(/\\\((.+?)\\\)/g, (_, a) => { math.push([a, false]); return `@@M${math.length - 1}@@`; });
  let html = DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }), { ADD_ATTR: ["target"] });
  html = html.replace(/@@M(\d+)@@/g, (_, i) => { const [m, d] = math[i]; try { return katex.renderToString(m, { displayMode: d, throwOnError: false }); } catch { return esc(m); } });
  return html;
}
function enhance(el) {
  el.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
  el.querySelectorAll("pre > code").forEach(code => {
    const pre = code.parentElement; if (pre.parentElement.classList.contains("code")) return;
    const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || "texto";
    const raw = code.textContent;
    if (lang === "mermaid" && window.mermaid) {
      const d = document.createElement("div"); d.className = "mermaid"; d.textContent = raw; pre.replaceWith(d);
      try { mermaid.run({ nodes: [d] }); } catch {} return;
    }
    const box = document.createElement("div"); box.className = "code";
    const runnable = /^(html|svg)$/i.test(lang) || (/^(xml)$/i.test(lang) && raw.includes("<html"));
    box.innerHTML = `<header><span>${esc(lang)}</span>${runnable ? '<button class="run">▶ Executar</button>' : ""}<button data-a="copy">Copiar</button><button data-a="dl">Baixar</button></header>`;
    pre.replaceWith(box); box.appendChild(pre);
    if (window.hljs) { try { hljs.highlightElement(code); } catch {} }
    box.querySelector("[data-a=copy]").onclick = () => { navigator.clipboard.writeText(raw); toast("Código copiado"); };
    box.querySelector("[data-a=dl]").onclick = () => download(`jarvis.${extFor(lang)}`, raw);
    const run = box.querySelector(".run"); if (run) run.onclick = () => openPreview({ name: "prévia", files: [{ path: "index.html", content: raw }] });
  });
}
const extFor = l => ({ javascript: "js", js: "js", typescript: "ts", python: "py", py: "py", html: "html", css: "css", json: "json", bash: "sh", sh: "sh", markdown: "md", md: "md", java: "java", kotlin: "kt", csharp: "cs", "c++": "cpp", cpp: "cpp", c: "c", go: "go", rust: "rs", php: "php", sql: "sql", svg: "svg", gdscript: "gd", lua: "lua", ruby: "rb", swift: "swift", yaml: "yml" }[l.toLowerCase()] || "txt");
function download(name, content, type = "text/plain") { const a = document.createElement("a"); a.href = content instanceof Blob ? URL.createObjectURL(content) : (String(content).startsWith("data:") ? content : URL.createObjectURL(new Blob([content], { type }))); a.download = name; a.click(); }

/* ---------- UI build ---------- */
$("#modes").innerHTML = Object.entries(MODES).map(([k, [i, n]]) => `<button data-mode="${k}">${i} ${n}</button>`).join("");
$("#cards").innerHTML = CARDS.map(([i, t, p, m]) => `<button class="card" data-p="${esc(p)}" data-m="${m}"><b>${i}</b><strong>${t}</strong><small>${esc(p.slice(0, 52))}…</small></button>`).join("");
$("#modes").onclick = e => { const b = e.target.closest("button"); if (b) { setMode(b.dataset.mode); closeSide(); $("#input").focus(); } };
$("#cards").onclick = e => { const b = e.target.closest(".card"); if (!b) return; setMode(b.dataset.m); if (b.dataset.m === "assistant" && b.dataset.p.startsWith("Anexe")) { $("#fileInput").click(); return; } $("#input").value = b.dataset.p; autosize(); $("#input").focus(); };
function setMode(m) {
  mode = MODES[m] ? m : "assistant";
  document.querySelectorAll("#modes button").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
  $("#modeEyebrow").textContent = MODES[mode][2];
  $("#input").placeholder = { image: "Descreva a imagem (anexe uma foto para editá-la)…", games: "Descreva o jogo que você quer…", apps: "Descreva o aplicativo…", research: "O que você quer pesquisar?", analysis: "Peça um cálculo, gráfico ou envie uma planilha…" }[mode] || "Pergunte qualquer coisa ao Jarvis…";
  $("#modelHint").textContent = { games: "Projeto completo: use ‘Gerar projeto’ na resposta", apps: "Projeto completo: use ‘Gerar projeto’ na resposta", analysis: "Executa Python de verdade", research: "Google Search + leitura de links" }[mode] || "";
  if (current) { current.mode = mode; persist(); }
}
const closeSide = () => $("#side").classList.remove("open");
$("#menuBtn").onclick = () => $("#side").classList.add("open");
$("#scrim").onclick = closeSide;

function renderChats() {
  const q = $("#searchChats").value.toLowerCase();
  $("#chats").innerHTML = chats.filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.text.toLowerCase().includes(q)))
    .map(c => `<div class="chat-item ${c.id === current?.id ? "on" : ""}" data-id="${c.id}"><span>${esc(c.title)}</span><button data-a="ren" title="Renomear">✎</button><button data-a="del" title="Apagar">✕</button></div>`).join("") || `<p class="muted" style="padding:8px">Nenhuma conversa ainda.</p>`;
}
$("#searchChats").oninput = renderChats;
$("#chats").onclick = e => {
  const item = e.target.closest(".chat-item"); if (!item) return;
  const c = chats.find(x => x.id === item.dataset.id);
  const a = e.target.dataset.a;
  if (a === "del") { if (confirm("Apagar esta conversa?")) { chats = chats.filter(x => x !== c); if (current === c) newChat(); persist(); renderChats(); } return; }
  if (a === "ren") { const t = prompt("Novo título:", c.title); if (t) { c.title = t.slice(0, 80); persist(); renderChats(); if (current === c) $("#chatTitle").textContent = c.title; } return; }
  openChat(c); closeSide();
};
function newChat() { current = null; $("#thread").innerHTML = ""; $("#thread").appendChild(heroEl); $("#chatTitle").textContent = "Nova conversa"; renderChats(); $("#input").focus(); }
const heroEl = $("#hero");
function openChat(c) {
  current = c; setMode(c.mode || "assistant"); $("#chatTitle").textContent = c.title;
  $("#thread").innerHTML = ""; c.messages.forEach(m => addMessage(m)); renderChats(); scrollDown(true);
}
$("#newChat").onclick = newChat;

/* ---------- Messages ---------- */
function addMessage(m) {
  heroEl.remove();
  const el = document.createElement("div"); el.className = `msg ${m.role === "user" ? "user" : "ai"}`;
  if (m.role === "user") {
    const thumbs = (m.attachNames || []).map((n, i) => m.attachThumbs?.[i] ? `<img src="${m.attachThumbs[i]}" alt="">` : `<span class="file">📎 ${esc(n)}</span>`).join("");
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:flex-end;max-width:85%">${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}<div class="body" style="max-width:100%">${esc(m.text)}</div></div>`;
  } else {
    el.innerHTML = `<div class="avatar">J</div><div class="body"></div>`;
    fillAI(el.querySelector(".body"), m);
  }
  $("#thread").appendChild(el); return el;
}
function fillAI(body, m) {
  let html = m.error ? `<div class="err">${esc(m.error)}</div>` : md(m.text || "");
  (m.images || []).forEach(src => html += `<img class="gen" src="${src}" alt="Imagem gerada">`);
  if (m.sources?.length) html += `<div class="sources">${m.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">🔗 ${esc(s.title)}</a>`).join("")}</div>`;
  if (m.project) html += projectCard(m.project);
  body.innerHTML = html; enhance(body);
  if (m.project) bindProject(body, m.project);
  if (!m.streaming && (m.text || m.images?.length)) {
    const tools = document.createElement("div"); tools.className = "tools";
    tools.innerHTML = `<button data-a="copy">⧉ Copiar</button><button data-a="speak">🔊 Ouvir</button>${m.images?.length ? '<button data-a="img">⤓ Imagem</button>' : ""}<button data-a="retry">↻ Refazer</button>${["games", "apps", "code"].includes(mode) && !m.project ? '<button data-a="proj">📦 Gerar projeto completo</button>' : ""}`;
    tools.onclick = e => {
      const a = e.target.dataset.a;
      if (a === "copy") { navigator.clipboard.writeText(m.text); toast("Copiado"); }
      if (a === "speak") speak(m.text);
      if (a === "img") m.images.forEach((s, i) => download(`jarvis-imagem-${i + 1}.png`, s));
      if (a === "retry") retry();
      if (a === "proj") buildProject(lastUserText());
    };
    body.appendChild(tools);
  }
}
function lastUserText() { return [...(current?.messages || [])].reverse().find(m => m.role === "user")?.text || ""; }
function scrollDown(force) { const t = $("#thread"); if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 200) t.scrollTop = t.scrollHeight; }
function ensureChat(firstText) {
  if (!current) { current = { id: uid(), title: firstText.slice(0, 60) || "Conversa", mode, messages: [], created: Date.now() }; chats.unshift(current); $("#chatTitle").textContent = current.title; }
  return current;
}

/* ---------- Send ---------- */
async function send(textOverride) {
  if (controller) { controller.abort(); return; }
  const text = (textOverride ?? $("#input").value).trim();
  if (!text && !attachments.length) return;
  $("#input").value = ""; autosize();
  // memory command
  const mem = text.match(/^(lembre(-se)?( que)?|memorize|anote que)\s+(.+)/i);
  if (mem) { memory = (memory ? memory + "\n" : "") + "- " + mem[4]; store.set("memory", memory); }
  const chat = ensureChat(text);
  const atts = attachments; attachments = []; renderAttach();
  const um = { role: "user", text, attachNames: atts.map(a => a.name), attachThumbs: atts.map(a => a.thumb || null) };
  chat.messages.push(um); addMessage(um); scrollDown(true); renderChats();
  if (mode === "image") return generateImage(text, atts);
  await streamChat(text, atts);
}
async function streamChat(text, atts) {
  const chat = current;
  const am = { role: "assistant", text: "", streaming: true };
  const el = addMessage(am); const body = el.querySelector(".body");
  body.innerHTML = `<div class="thinking"><i></i><i></i><i></i></div>`; scrollDown(true);
  setBusy(true);
  const history = chat.messages.slice(0, -1).filter(m => m.text && !m.error).map(m => ({ role: m.role, text: m.text }));
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: headers(), signal: controller.signal,
      body: JSON.stringify({ message: text, mode, history, attachments: atts.map(({ mimeType, data }) => ({ mimeType, data })), web: $("#webToggle").checked, deep: $("#deepToggle").checked, memory: [settings.name && `Nome do usuário: ${settings.name}`, memory].filter(Boolean).join("\n") }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erro HTTP ${r.status}`); }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", last = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith("data:")) continue;
        const ev = JSON.parse(line.slice(5));
        if (ev.t === "text") am.text += ev.v;
        else if (ev.t === "image") (am.images ||= []).push(ev.v);
        else if (ev.t === "sources") am.sources = ev.v;
        else if (ev.t === "meta") $("#modelHint").textContent = ev.model;
        else if (ev.t === "error") throw new Error(ev.v);
      }
      if (Date.now() - last > 60) { fillAI(body, am); scrollDown(); last = Date.now(); }
    }
  } catch (e) {
    if (e.name === "AbortError") am.text += "\n\n_— interrompido._";
    else if (!am.text) am.error = e.message.includes("Failed to fetch") ? "Sem conexão com o servidor. Verifique a internet ou o deploy." : e.message;
    else am.text += `\n\n_Erro: ${e.message}_`;
  }
  am.streaming = false; fillAI(body, am); chat.messages.push(am); persist(); setBusy(false); scrollDown();
  autoProject(am);
  if ($("#speakToggle").checked || voiceLoop) speak(am.text);
}
function autoProject(am) {
  // if the reply is a self-contained html, auto-open preview
  if (!["games", "apps", "code"].includes(mode)) return;
  const m = am.text.match(/```html\n([\s\S]*?)```/i);
  if (m && /<(html|body|canvas|script)/i.test(m[1])) openPreview({ name: current.title, files: [{ path: "index.html", content: m[1] }] });
}
async function generateImage(text, atts) {
  const chat = current; const am = { role: "assistant", text: "", streaming: true };
  const el = addMessage(am); const body = el.querySelector(".body");
  body.innerHTML = `<div class="thinking"><i></i><i></i><i></i></div><p class="muted">Criando imagem…</p>`; setBusy(true);
  try {
    const r = await fetch("/api/image", { method: "POST", headers: headers(), signal: controller.signal, body: JSON.stringify({ prompt: text, attachments: atts.map(({ mimeType, data }) => ({ mimeType, data })) }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    am.images = j.images; am.text = j.description || "";
  } catch (e) { am.error = e.name === "AbortError" ? "Cancelado." : e.message; }
  am.streaming = false; fillAI(body, am); chat.messages.push(am); persist(); setBusy(false); scrollDown(true);
}
async function buildProject(text, previous) {
  if (!text) return toast("Descreva o projeto primeiro.");
  const chat = ensureChat(text);
  const kind = mode === "games" ? "game" : mode === "apps" ? "app" : "files";
  const am = { role: "assistant", text: "", streaming: true };
  const el = addMessage(am); const body = el.querySelector(".body");
  body.innerHTML = `<div class="thinking"><i></i><i></i><i></i></div><p class="muted">Construindo projeto completo com o modelo mais avançado… isso pode levar 1–3 minutos.</p>`; scrollDown(true); setBusy(true);
  try {
    const r = await fetch("/api/project", { method: "POST", headers: headers(), signal: controller.signal, body: JSON.stringify({ prompt: text, kind, previous }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    am.project = j; am.text = `**${j.name}** — ${j.summary}`; lastProject = j; openPreview(j);
  } catch (e) { am.error = e.name === "AbortError" ? "Cancelado." : e.message; }
  am.streaming = false; fillAI(body, am); chat.messages.push(am); persist(); setBusy(false); scrollDown(true);
}
function projectCard(p) {
  return `<div class="project"><b>📦 ${esc(p.name)}</b> <span class="muted">${p.files.length} arquivos</span><ul>${p.files.map(f => `<li>${esc(f.path)}</li>`).join("")}</ul><div class="acts"><button class="pbtn primary" data-p="open">▶ Abrir prévia</button><button class="pbtn" data-p="zip">⤓ Baixar ZIP</button><button class="pbtn" data-p="edit">✎ Pedir alteração</button></div></div>`;
}
function bindProject(body, p) {
  body.querySelector("[data-p=open]").onclick = () => openPreview(p);
  body.querySelector("[data-p=zip]").onclick = () => zipProject(p);
  body.querySelector("[data-p=edit]").onclick = () => { const t = prompt("O que deseja mudar no projeto?"); if (t) { const um = { role: "user", text: t }; current.messages.push(um); addMessage(um); buildProject(t, p.files); } };
}
async function zipProject(p) {
  if (!window.JSZip) return toast("Carregando compactador, tente de novo.");
  const z = new JSZip(); p.files.forEach(f => z.file(f.path, f.content));
  download(`${p.name || "jarvis"}.zip`, await z.generateAsync({ type: "blob" }));
}
function retry() {
  if (!current || controller) return;
  const msgs = current.messages; let i = msgs.length - 1;
  while (i >= 0 && msgs[i].role !== "user") i--;
  if (i < 0) return;
  const text = msgs[i].text; current.messages = msgs.slice(0, i); openChat(current); send(text);
}
function setBusy(b) {
  controller = b ? new AbortController() : null;
  $("#sendBtn").classList.toggle("stop", b); $("#sendBtn").textContent = b ? "■" : "➤";
  document.body.classList.toggle("busy", b);
}

/* ---------- Preview ---------- */
let previewProject = null, previewUrl = null;
function bundle(p) {
  // inline relative css/js into index.html so it runs inside a sandboxed iframe
  const map = Object.fromEntries(p.files.map(f => [f.path, f.content]));
  let html = map["index.html"] || p.files.find(f => f.path.endsWith(".html"))?.content;
  if (!html) return null;
  html = html.replace(/<link[^>]+href=["']([^"':]+\.css)["'][^>]*>/gi, (t, h) => map[h.replace(/^\.\//, "")] != null ? `<style>${map[h.replace(/^\.\//, "")]}</style>` : t);
  html = html.replace(/<script([^>]*)src=["']([^"':]+\.js)["']([^>]*)><\/script>/gi, (t, a, h, b) => map[h.replace(/^\.\//, "")] != null ? `<script${a}${b}>${map[h.replace(/^\.\//, "")].replace(/<\/script/gi, "<\\/script")}</script>` : t);
  return html;
}
function openPreview(p) {
  previewProject = p; $("#preview").classList.add("open"); $("#previewTitle").textContent = p.name || "Prévia";
  const html = bundle(p);
  $("#previewTabs").innerHTML = (html ? `<button class="on" data-f="__run">▶ Rodando</button>` : "") + p.files.map(f => `<button data-f="${esc(f.path)}">${esc(f.path)}</button>`).join("");
  showTab(html ? "__run" : p.files[0].path);
}
function showTab(f) {
  document.querySelectorAll("#previewTabs button").forEach(b => b.classList.toggle("on", b.dataset.f === f));
  const frame = $("#previewFrame"), code = $("#previewCode");
  if (f === "__run") { frame.hidden = false; code.hidden = true; frame.srcdoc = bundle(previewProject); }
  else { frame.hidden = true; code.hidden = false; code.textContent = previewProject.files.find(x => x.path === f)?.content || ""; }
}
$("#previewTabs").onclick = e => { const b = e.target.closest("button"); if (b) showTab(b.dataset.f); };
$("#previewClose").onclick = () => { $("#preview").classList.remove("open"); $("#previewFrame").srcdoc = ""; };
$("#previewZip").onclick = () => previewProject && zipProject(previewProject);
$("#previewFull").onclick = () => { const h = previewProject && bundle(previewProject); if (!h) return; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(new Blob([h], { type: "text/html" })); window.open(previewUrl, "_blank"); };

/* ---------- Attachments ---------- */
async function addFiles(files) {
  for (const f of files) {
    if (attachments.length >= 6) { toast("Máximo de 6 anexos."); break; }
    if (f.size > 3.5e6 && !f.type.startsWith("image/")) { toast(`${f.name} é grande demais (máx. 3,5 MB).`); continue; }
    let mimeType = f.type || (/\.(md|csv|txt|js|ts|py|json|html|css)$/i.test(f.name) ? "text/plain" : "");
    if (!mimeType) { toast(`Formato não suportado: ${f.name}`); continue; }
    let dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    let thumb = null;
    if (mimeType.startsWith("image/")) { dataUrl = await shrink(dataUrl); mimeType = "image/jpeg"; thumb = await shrink(dataUrl, 160, .6); }
    if (mimeType.startsWith("text/") || mimeType === "application/json") mimeType = "text/plain";
    attachments.push({ name: f.name, mimeType, data: dataUrl.split(",")[1], thumb });
  }
  renderAttach();
}
function shrink(src, max = 1600, q = .85) {
  return new Promise(res => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", q)); }; img.onerror = () => res(src); img.src = src; });
}
function renderAttach() {
  $("#attachRow").innerHTML = attachments.map((a, i) => `<div class="att">${a.thumb ? `<img src="${a.thumb}" alt="">` : "📎"}<span>${esc(a.name)}</span><button data-i="${i}">✕</button></div>`).join("");
}
$("#attachRow").onclick = e => { if (e.target.dataset.i) { attachments.splice(+e.target.dataset.i, 1); renderAttach(); } };
$("#attachBtn").onclick = () => $("#fileInput").click();
$("#fileInput").onchange = e => { addFiles([...e.target.files]); e.target.value = ""; };
document.addEventListener("paste", e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
document.addEventListener("dragover", e => { e.preventDefault(); document.body.classList.add("drop"); });
document.addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("drop"); });
document.addEventListener("drop", e => { e.preventDefault(); document.body.classList.remove("drop"); addFiles([...e.dataTransfer.files]); });

/* ---------- Composer ---------- */
const input = $("#input");
function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 220) + "px"; }
input.oninput = autosize;
input.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer:fine)").matches) { e.preventDefault(); send(); } };
$("#sendBtn").onclick = () => send();
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newChat(); } if (e.key === "Escape" && controller) controller.abort(); });

/* ---------- Voice ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, audio = null;
function listen(onFinal) {
  if (!SR) { toast("Seu navegador não suporta reconhecimento de voz (use Chrome)."); return; }
  rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = true;
  let final = "";
  rec.onresult = e => { let t = ""; for (const r of e.results) t += r[0].transcript; final = t; if (!voiceLoop) { input.value = t; autosize(); } else $("#voiceStatus").textContent = t || "Ouvindo…"; };
  rec.onend = () => { $("#micBtn").classList.remove("on"); onFinal?.(final.trim()); };
  rec.onerror = () => {};
  rec.start(); $("#micBtn").classList.add("on");
}
$("#micBtn").onclick = () => { if (rec && $("#micBtn").classList.contains("on")) { rec.stop(); return; } listen(); };
async function speak(text) {
  stopSpeak();
  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[#*_`>|]/g, "").trim(); if (!clean) return voiceNext();
  if (settings.voice !== "browser") {
    try {
      const r = await fetch("/api/speak", { method: "POST", headers: headers(), body: JSON.stringify({ text: clean.slice(0, 4000), voice: settings.voice }) });
      const j = await r.json(); if (!r.ok) throw 0;
      audio = new Audio(j.audio); audio.onended = voiceNext; await audio.play(); return;
    } catch {}
  }
  if (!speechSynthesis) return voiceNext();
  const u = new SpeechSynthesisUtterance(clean.slice(0, 3000)); u.lang = "pt-BR"; u.rate = 1.05;
  const v = speechSynthesis.getVoices().find(v => v.lang.startsWith("pt")); if (v) u.voice = v;
  u.onend = voiceNext; speechSynthesis.speak(u);
}
function stopSpeak() { audio?.pause(); audio = null; try { speechSynthesis.cancel(); } catch {} }
function voiceNext() { if (voiceLoop) { $("#voiceStatus").textContent = "Ouvindo…"; setTimeout(voiceTurn, 300); } }
function voiceTurn() { if (!voiceLoop) return; listen(t => { if (!voiceLoop) return; if (!t) return voiceTurn(); $("#voiceStatus").textContent = "Pensando…"; send(t); }); }
$("#voiceMode").onclick = () => { voiceLoop = true; $("#voiceOverlay").hidden = false; voiceTurn(); };
$("#voiceStop").onclick = () => { voiceLoop = false; $("#voiceOverlay").hidden = true; rec?.abort(); stopSpeak(); };

/* ---------- Export / settings / memory ---------- */
$("#exportChat").onclick = () => {
  if (!current) return toast("Nenhuma conversa aberta.");
  const mdText = `# ${current.title}\n\n` + current.messages.map(m => `### ${m.role === "user" ? "Você" : "Jarvis"}\n\n${m.text || m.error || ""}\n`).join("\n");
  download(`${current.title.replace(/[^\w-]+/g, "_")}.md`, mdText, "text/markdown");
};
$("#openSettings").onclick = () => { $("#setName").value = settings.name; $("#setKey").value = settings.key; $("#setVoice").value = settings.voice; $("#setSave").checked = settings.save; $("#settings").showModal(); };
$("#settings").onclose = () => {
  if ($("#settings").returnValue === "clear") { if (confirm("Apagar todas as conversas e memória?")) { chats = []; memory = ""; store.set("chats", []); store.set("memory", ""); newChat(); } return; }
  settings = { name: $("#setName").value.trim(), key: $("#setKey").value, voice: $("#setVoice").value, save: $("#setSave").checked };
  store.set("settings", settings); $("#userName").textContent = settings.name || "senhor"; if (!settings.save) localStorage.removeItem("jn2-chats"); toast("Configurações salvas");
};
$("#openMemory").onclick = () => { $("#memText").value = memory; $("#memory").showModal(); };
$("#memory").onclose = () => { memory = $("#memText").value; store.set("memory", memory); toast("Memória atualizada"); };

/* ---------- Boot ---------- */
window.addEventListener("load", () => {
  if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: "default" });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
});
$("#userName").textContent = settings.name || "senhor";
setMode("assistant"); renderChats(); input.focus();
