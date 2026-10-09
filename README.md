# Jarvis NexStage 2.0

Assistente pessoal de IA para PC e Android (app instalável/PWA), usando a API Gemini do Google.

## O que há de novo na 2.0
- **Respostas em tempo real** (aparecem enquanto o Jarvis digita) com botão de parar.
- **Anexos**: fotos, PDFs, planilhas/CSV, textos, código, áudio e vídeo curto — arraste, cole (Ctrl+V) ou toque em ＋.
- **Pesquisa na web** com Google Search + leitura de links, com fontes clicáveis. Ative “🌐 Web” em qualquer modo.
- **Dados & cálculo**: executa Python de verdade (estatística, gráficos, planilhas).
- **Raciocínio profundo**: usa o modelo Pro com pensamento estendido para problemas difíceis.
- **Jogos e apps com prévia ao vivo**: o código roda dentro do próprio Jarvis. “📦 Gerar projeto completo” cria até 20 arquivos, com prévia, **download em ZIP** e **pedidos de alteração** iterativos.
- **Imagens**: gera e **edita** imagens (anexe uma foto e diga o que mudar).
- **Voz natural**: voz neural do Gemini (7 vozes) e **modo conversa por voz** contínuo (botão ◉).
- **Memória**: o Jarvis lembra fatos sobre você em todas as conversas (“lembre que…”).
- **Várias conversas** com busca, renomear, apagar e exportar em Markdown.
- Markdown completo, realce de código, fórmulas matemáticas (KaTeX) e diagramas (Mermaid).
- **Senha de acesso** opcional para proteger sua chave de API.
- Modos: Assistente, Pesquisa, Dados, Programação, Jogos, Apps, Imagens, Documentos, Prompts, Professor.

## Publicar na Vercel (5 minutos)
1. Extraia o ZIP e envie todos os arquivos (incluindo a pasta `api`) para um repositório no GitHub.
2. Em vercel.com → Add New → Project → importe o repositório (Framework: **Other**).
3. Em Settings → Environment Variables, adicione:
   - `GEMINI_API_KEY` — **obrigatória**. Crie grátis em https://aistudio.google.com/apikey
   - `JARVIS_ACCESS_KEY` — **recomendada**: uma senha. Sem ela, qualquer pessoa com o link usa sua cota.
   - Opcionais: `GEMINI_MODEL` (padrão `gemini-2.5-flash`), `GEMINI_PRO_MODEL` (padrão `gemini-2.5-pro`), `GEMINI_IMAGE_MODEL` (padrão `gemini-2.5-flash-image`), `GEMINI_TTS_MODEL` (padrão `gemini-2.5-flash-preview-tts`), `JARVIS_VOICE` (padrão `Charon`).
4. Deploy. Abra o site, vá em ⚙ Configurações e digite a senha de acesso e seu nome.
5. No Android (Chrome): menu ⋮ → **Instalar app**. No PC (Chrome/Edge): ícone de instalar na barra de endereço.

> Tempo máximo das funções está em 300 s (`vercel.json`). No plano gratuito Hobby a Vercel limita a 60 s; projetos muito grandes podem precisar do plano Pro ou de pedidos menores.

## Limites honestos
- Modelos de IA podem errar; revise código e informações importantes.
- O Python roda no servidor do Google em sandbox; o código dos jogos/apps roda isolado na prévia.
- Disponibilidade de modelos de imagem/voz depende da sua conta e região; se a voz neural falhar, o Jarvis usa a voz do navegador.
- Histórico e memória ficam salvos só no aparelho (não sincronizam entre PC e celular).
- Uso da API pode ter custos; acompanhe em aistudio.google.com.
