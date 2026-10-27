# stream95

<p align="center">
  <a href="https://github.com/frederico-kluser/stream95/actions/workflows/ci.yml"><img src="https://github.com/frederico-kluser/stream95/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/frederico-kluser/stream95/actions/workflows/tests.yml"><img src="https://github.com/frederico-kluser/stream95/actions/workflows/tests.yml/badge.svg" alt="Testes"></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/frederico-kluser/stream95"><img src="https://api.securityscorecards.dev/projects/github.com/frederico-kluser/stream95/badge" alt="OpenSSF Scorecard"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg" alt="Licença: MIT"></a>
  <a href="https://github.com/frederico-kluser/stream95/releases"><img src="https://img.shields.io/github/v/release/frederico-kluser/stream95?include_prereleases" alt="Release"></a>
</p>

Overlay de live com cara de **Windows 95** para canais de programação old school, feito com
[React95](https://github.com/React95/React95). O chat passa por moderação (regras locais + IA)
**antes** de aparecer na tela. O Clippy responde perguntas do chat, os comentários podem ser lidos em
voz alta e as cenas já vêm prontas para o OBS. Tudo roda num servidor local na sua máquina.

![Cenas: Abertura, Eu + Chat, Só Eu + Chat e Reagindo](docs/img/cenas-1.png)
![Cenas: Codando, Jogando, Volto Já e Encerramento](docs/img/cenas-2.png)

> O xadrez nas imagens marca as áreas transparentes: é ali que o OBS encaixa a câmera e as capturas.

## O que vem pronto

### 8 cenas (fonte de navegador 1920x1080)

| Cena                 | O que mostra                                                   | Câmera / captura           |
| -------------------- | -------------------------------------------------------------- | -------------------------- |
| **Abertura**         | Instalador do Windows 95 com contagem regressiva, redes e chat | —                          |
| **Eu + Chat**        | Webcam numa janela, chat, links (ou enquete) e alertas         | câmera                     |
| **Só Eu + Chat**     | Webcam em tela cheia com chat flutuante                        | câmera em tela cheia       |
| **Reagindo (Limpo)** | Janela grande para o conteúdo + webcam; sem chat e sem alertas | câmera + captura de janela |
| **Codando**          | Monitor 16:10 + webcam + chat + status do build/pomodoro       | câmera + captura de tela   |
| **Jogando**          | Jogo em tela cheia com webcam pequena                          | câmera + captura de jogo   |
| **Volto Já**         | Proteção de tela com estrelas e chat                           | —                          |
| **Encerramento**     | "Agora você pode desligar o computador com segurança."         | —                          |

As janelas têm **buracos transparentes** exatamente onde entram câmera e capturas. A geometria vive
num só lugar ([`packages/shared/src/layout.ts`](packages/shared/src/layout.ts)), usado pelo overlay e
pelo gerador da coleção do OBS. Um teste garante que o Clippy nunca cubra câmera, captura ou janela.

### Chat moderado antes de aparecer

1. **Regras locais** (instantâneas): termos bloqueados (inclusive ofuscados), links fora da lista,
   golpes, flood, caixa alta e mensagens repetidas.
2. **IA via [OpenRouter](https://openrouter.ai)**: um modelo pequeno classifica o que as regras não
   decidiram. O padrão (`google/gemini-2.5-flash-lite` com fallback `mistralai/ministral-8b-2512`) foi
   escolhido por [benchmark em PT-BR](docs/moderation-benchmark.md): 8/8 acertos, ~0,7 s.
3. **Fila de aprovação** no painel: aprovar, aprovar e confiar no usuário, rejeitar ou banir na sessão.

Modos: automático (regras + IA), manual (tudo passa pela fila) ou só regras locais. Mods e usuários
marcados como confiáveis passam direto; VIPs (e, se você quiser, inscritos) passam só pelas regras
locais, sem IA. A política da IA trata o texto do chat como dado, nunca como instrução.

### Clippy com IA e API local

- `!clippy <pergunta>` no chat: responde em PT-BR, em até 2 frases, com animações do Office 97.
  A resposta também passa pela moderação antes de aparecer.
- Também dá para trocar de assistente: Merlin, Rover, Links, Bonzi, Peedy, Genie, Genius, Rocky ou F1.
- **API local** para você ou seus scripts: `POST /api/assistant/ask` (pergunta) e
  `POST /api/assistant/say` (fala livre). Veja [docs/api.md](docs/api.md).

### Comentários em voz (TTS)

ElevenLabs Flash v2.5 via OpenRouter, com voz fixa por usuário, fila, limite de tamanho, cooldown e
limpeza de links/emotes. Modos: `!tts <texto>`, todas as mensagens aprovadas, só inscritos/VIPs/mods ou
destaque de pontos do canal. Só lê o que a moderação já aprovou. Desligado por padrão.

### Alertas e efeitos

Follow, sub, resub, sub de presente, raid, bits, resgate de pontos do canal e alertas personalizados
viram caixas de diálogo do Windows 95 com jingles próprios (WebAudio). Também há **tela azul (BSOD)**
como efeito e balões de notificação na bandeja.

### Interação com o chat

| Comando                                               | O que faz                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `!clippy <pergunta>` (`!ajuda`, `!pergunta`)          | Pergunta ao Clippy                                        |
| `!tts <texto>`                                        | Lê o texto em voz alta (se o TTS estiver no modo comando) |
| `!1` … `!9`                                           | Vota na enquete aberta                                    |
| `!comandos`                                           | Lista os comandos                                         |
| `!redes`, `!discord`, `!github`, `!site`, `!linkedin` | Mostra os links do canal                                  |
| `!projeto`, `!lurk`, `!pomodoro`                      | Projeto atual, modo lurk e estado do pomodoro             |
| `!bugs`, `!cafe`, `!deploys` (mods)                   | Soma no contador (`!bugs -` desfaz)                       |
| `!so <usuário>` (mods)                                | Recomenda outro canal                                     |
| `!bsod` (mods)                                        | Tela azul na live                                         |

Na barra de tarefas também passam o **feed do GitHub** (commits e PRs públicos), o pomodoro, os
contadores e o relógio.

### Painel no OBS (dock)

![Painel de moderação](docs/img/painel.png)

Abas **Moderação**, **Clippy & Voz**, **Alertas** (simular), **Enquete**, **Live** (cenas do OBS,
pomodoro e contadores) e **Config** (tema entre os 35 do React95, listas, redes e login da Twitch).

## Começando

Requisitos: **Node.js 22.12+** e **OBS Studio 30+** (testado no 32.2). Opcional: uma chave da
[OpenRouter](https://openrouter.ai/keys) (IA e voz) e um app da Twitch (alertas).

```bash
git clone https://github.com/frederico-kluser/stream95.git
cd stream95
npm install
cp .env.example .env   # defina TWITCH_CHANNEL e, se quiser IA/voz, OPENROUTER_API_KEY
npm run build
npm start              # http://localhost:1995
```

Abra `http://localhost:1995`: a página inicial lista as URLs de todas as cenas e overlays e o
retângulo exato de câmera e captura de cada uma.

![Página inicial com as URLs](docs/img/inicio.png)

Sem nenhuma chave, o chat já funciona (leitura anônima) com os filtros locais.

### No OBS

Gere uma coleção de cenas pronta, com câmera, capturas, overlays, áudio e atalhos `Ctrl+Alt+1..8`.
Feche o OBS antes:

```bash
npm run obs:collection -- --install \
  --camera-from "%APPDATA%/obs-studio/basic/scenes/SuaColecao.json" \
  --capture-from "%APPDATA%/obs-studio/basic/scenes/SuaColecao.json" \
  --browser brave
```

Depois, no OBS: **Coleção de cenas → stream95**. Sua coleção atual não é alterada. O painel entra em
**Docks → Docks de navegador personalizados** com a URL `http://localhost:1995/dock`.
Passo a passo e montagem manual: [docs/obs.md](docs/obs.md).

### Twitch

O chat é lido sem login. Para **alertas** (follow, sub, raid, bits, pontos do canal), chat pela API
oficial (EventSub) e o Clippy respondendo no chat, crie um app **Public** na Twitch e rode
`npm run twitch:login`. Não é preciso client secret. Veja [docs/twitch.md](docs/twitch.md).

## Custos (OpenRouter)

O painel mostra o gasto real de cada chamada (`usage.cost`). Referência medida em outubro de 2026:

| Uso                                     | Modelo padrão                  | Custo aproximado |
| --------------------------------------- | ------------------------------ | ---------------- |
| Moderar 1.000 mensagens que chegam à IA | `google/gemini-2.5-flash-lite` | US$ 0,03         |
| 100 respostas do Clippy                 | `openai/gpt-4.1-mini`          | US$ 0,02         |
| Ler 100 comentários de 180 caracteres   | `elevenlabs/eleven-flash-v2.5` | US$ 0,36         |

Mensagens triviais ("oi", "kkkk") e as decididas pelas regras locais não chegam à IA, e veredictos
repetidos vêm do cache.

## Segurança

- O servidor escuta só em `127.0.0.1` e recusa `Host` desconhecido (proteção contra DNS rebinding).
- Rotas que alteram estado exigem o cabeçalho `x-stream95: 1` e origem local (proteção contra CSRF).
  O WebSocket também confere a origem.
- Chaves ficam no `.env` (fora do git); tokens da Twitch e dados ficam em `data/` (também fora).
- A moderação trata o texto do chat como dado, nunca como instrução (proteção contra prompt injection).

Para relatar uma vulnerabilidade, veja [SECURITY.md](SECURITY.md).

## Arquitetura

```mermaid
flowchart LR
  twitch[Twitch<br/>IRC anônimo / EventSub] --> server
  github[GitHub API] --> server
  subgraph server [Servidor local · Fastify · 127.0.0.1:1995]
    rules[Regras locais] --> llm[IA OpenRouter] --> queue[Fila de aprovação]
    clippy[Clippy · LLM] --- tts[TTS ElevenLabs]
    hub[Hub WebSocket]
  end
  server <--> openrouter[(OpenRouter)]
  server <--> obsws[OBS WebSocket v5]
  hub --> scenes[Cenas e overlays<br/>React95 · Browser Source]
  hub --> dock[Painel · dock do OBS]
  hub --> audio[Fonte de áudio<br/>TTS + jingles]
```

| Pasta                                                                      | Conteúdo                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`apps/server`](apps/server)                                               | Servidor local: chat, moderação, TTS, Clippy, alertas, API REST e WebSocket |
| [`apps/overlay`](apps/overlay)                                             | Cenas, overlays e painel (React 19 + React95 + Vite)                        |
| [`packages/shared`](packages/shared)                                       | Tipos, configurações, eventos e geometria das cenas                         |
| [`obs`](obs)                                                               | Gerador da coleção de cenas do OBS                                          |
| [`docs`](docs)                                                             | Documentação, pesquisa e benchmarks                                         |
| [`.agents/skills/react95-agent-skill`](.agents/skills/react95-agent-skill) | Skill de agente para dominar o React95                                      |

## Desenvolvimento

```bash
npm run dev     # servidor (tsx watch) + Vite em http://localhost:5173
npm run check   # lint + formatação + testes + build
```

Commits seguem [Conventional Commits](https://www.conventionalcommits.org/) e toda mudança entra por
PR com squash. Veja [CONTRIBUTING.md](CONTRIBUTING.md).

Agentes de código (Claude Code, Codex e afins) encontram em
[`.agents/skills/react95-agent-skill`](.agents/skills/react95-agent-skill) uma skill completa do
React95: componentes, temas, ícones, Clippy, receitas e armadilhas.

## Pesquisa

- [docs/research.md](docs/research.md): pesquisa verificada (Twitch EventSub, autenticação,
  moderação em camadas, alternativas) com fontes.
- [docs/moderation-benchmark.md](docs/moderation-benchmark.md): comparação de modelos de moderação e
  do assistente em PT-BR.

## Créditos

- [React95](https://github.com/React95/React95) e [@react95/clippy](https://www.npmjs.com/package/@react95/clippy)
  (MIT), sobre o [clippyjs](https://github.com/pi0/clippyjs).
- [Twurple](https://twurple.js.org), [obscenity](https://github.com/jo3-l/obscenity),
  [Fastify](https://fastify.dev), [OpenRouter](https://openrouter.ai) e ElevenLabs.
- Windows, Office e Clippy são marcas da Microsoft. Este projeto não tem relação com a Microsoft.

## Licença

[MIT](LICENSE) © Frederico Kluser
