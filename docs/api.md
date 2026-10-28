# API local

O servidor do stream95 expõe uma API REST e um WebSocket na porta `PORT` do `.env` (1995 por padrão):
`http://localhost:1995` neste PC e, com o modo de rede ligado, `http://<IP do PC>:1995` para celulares e
tablets pareados. É por ela que o painel, as cenas, a fonte de áudio e os seus próprios scripts conversam
com o chat, a moderação, o assistente, a voz e a mesa de sons.

## Regras de acesso

| Quem pede                                    | O que vale                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Este PC (`localhost`, `127.0.0.1`, `[::1]`)  | Tudo liberado. `POST`, `PUT`, `PATCH` e `DELETE` em `/api/*` exigem o cabeçalho `x-stream95: 1`; se houver `Origin`, ela precisa ser a do próprio servidor (API e WebSocket)                                                                                  |
| Celular ou tablet na mesma rede (`LAN=true`) | Arquivos estáticos (`GET` fora de `/api` e `/ws`) e `POST /api/devices/pair` liberados. Todo o resto exige o **token do aparelho**: cabeçalho `x-stream95-token` na API, `?token=` no WebSocket. As escritas também exigem `x-stream95: 1` e a mesma `Origin` |
| `Host` desconhecido                          | Recusado com 403. Valem só os nomes locais, os IPv4 desta máquina na rede e o `HOST` configurado                                                                                                                                                              |

| Proteção                                     | Contra o quê                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Lista de `Host` aceitos                      | DNS rebinding: um site malicioso não consegue falar com o servidor pelo navegador                      |
| Cabeçalho `x-stream95: 1` nas escritas       | CSRF: navegadores não enviam esse cabeçalho entre sites sem preflight, que o servidor nunca libera     |
| `Origin` igual à do servidor                 | Sequestro do WebSocket por outra aba                                                                   |
| Token por aparelho, guardado só como SHA-256 | Outra pessoa na mesma rede usando o painel. Remover o aparelho derruba as conexões dele na hora (4401) |

Sem token válido a API responde 401 com `{"error": "...", "pair": true}`, e o painel mostra a tela de
pareamento.

### Pareamento de aparelhos

Ao iniciar, o terminal mostra a URL do painel para o celular e um QR code com um **código de 8 caracteres**
(letras e números, sem `0`, `O`, `1` e `I`). O código vale 10 minutos, serve uma vez só e muda a cada
pareamento. Depois de 5 tentativas erradas em um minuto, o mesmo IP recebe 429 (com `retry-after`). O
token do aparelho tem 32 bytes aleatórios; o servidor guarda só o hash em `data/devices.json`.

- `LAN=false` volta ao modo só deste PC: o servidor escuta em `127.0.0.1` e não há pareamento.
- Sem a linha `LAN`, o padrão é ligado. A exceção é um `.env` antigo com `HOST` definido: ele continua no
  modo antigo, como antes da atualização.
- `HOST` explícito sempre vence. `HOST=127.0.0.1` desliga o acesso pela rede mesmo com `LAN=true`.
- Cenas num **segundo PC** de live: use `LAN=false` com `HOST=0.0.0.0`. Esse é o modo antigo de rede
  confiável, sem token. Faça isso só numa rede em que você confia: a API fica sem senha.

Erros sempre vêm como `{"error": "Erro: <o que houve> — Solução: <o que fazer>"}`, com status 400
(corpo inválido), 401 (aparelho não pareado), 403 (acesso negado), 404 (não encontrado), 409 (estado
não permite, por exemplo um som ainda convertendo), 413 (envio grande demais), 415 (formato errado),
429 (tentativas demais) ou 503 (serviço externo indisponível).

## Exemplos

```bash
# Pergunta ao assistente (aparece no overlay e, se configurado, é falada)
curl -X POST http://localhost:1995/api/assistant/ask \
  -H "x-stream95: 1" -H "content-type: application/json" \
  -d '{"question":"o que é um ponteiro?","asker":"streamer"}'

# O assistente fala um texto livre com uma animação
curl -X POST http://localhost:1995/api/assistant/say \
  -H "x-stream95: 1" -H "content-type: application/json" \
  -d '{"text":"Deploy feito! Ninguém mexe em produção hoje.","animation":"Congratulate","speak":true}'

# Toca o primeiro botão da mesa de sons no PC
curl -s http://localhost:1995/api/sfx | jq -r '.buttons[0].id' | xargs -I{} \
  curl -X POST http://localhost:1995/api/sfx/play \
  -H "x-stream95: 1" -H "content-type: application/json" -d '{"buttonId":"{}"}'

# Envia dois áudios para a categoria "memes-pt" (vão para a pasta de sons do PC)
curl -X POST http://localhost:1995/api/sfx/upload -H "x-stream95: 1" \
  -F category=memes-pt -F file=@risada.mp3 -F file=@vinheta.ogg
```

```powershell
Invoke-RestMethod -Method Post http://localhost:1995/api/fx/toast `
  -Headers @{ 'x-stream95' = '1' } -ContentType 'application/json' `
  -Body '{"title":"Build verde","body":"Todos os testes passaram","level":"success"}'
```

Resposta de `/api/assistant/ask`:

```json
{
  "id": "11f0e6a0-54bd-4653-a6a1-57a3ece88695",
  "asker": "streamer",
  "question": "o que é um ponteiro?",
  "answer": "Ponteiro é tipo um endereço no MS-DOS, só que na memória RAM: ele guarda o local onde o dado está, não o dado em si. É essencial pra mexer com arrays e estruturas, igual um disco rígido apontando pro setor certo.",
  "animation": "GetTechy",
  "model": "openai/gpt-4.1-mini",
  "latencyMs": 1413
}
```

## Rotas REST

### Estado

| Método e rota         | Corpo          | Faz                                                                                |
| --------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `GET /api/health`     | —              | Status dos serviços (chat, EventSub, IA, OBS, GitHub), gasto e clientes conectados |
| `GET /api/state`      | —              | Configurações + retrato do estado atual (chat, fila, sons, enquete, pomodoro…)     |
| `GET /api/settings`   | —              | Configurações atuais                                                               |
| `PATCH /api/settings` | objeto parcial | Atualiza configurações (merge profundo, validado)                                  |
| `GET /api/voices`     | —              | Vozes de TTS disponíveis                                                           |
| `GET /api/models`     | —              | Modelos configurados para moderação (Jev e LLM), assistente e TTS                  |
| `GET /api/commands`   | —              | Comandos de chat ativos                                                            |

### Aparelhos

| Método e rota                  | Corpo             | Faz                                                                                                                               |
| ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/devices/pair`       | `{ code, name? }` | Troca o código pelo token do aparelho: `{ token, device }`. Não exige token. 401 código errado ou vencido; 409 já há 50 aparelhos |
| `GET /api/devices`             | —                 | Aparelhos pareados (`id`, `name`, `createdAt`, `lastSeenAt`)                                                                      |
| `DELETE /api/devices/:id`      | —                 | Remove o aparelho e fecha as conexões abertas dele (código 4401)                                                                  |
| `POST /api/devices/pair-code`  | —                 | Gera um código novo: `{ code, url, expiresAt }`                                                                                   |
| `GET /api/devices/pair-info`   | —                 | Código atual, URL de pareamento, todas as URLs da rede e `hint` quando o celular não consegue conectar                            |
| `GET /api/devices/pair-qr.svg` | —                 | QR code (SVG) da URL de pareamento                                                                                                |

### Mesa de sons

Os sons ficam numa pasta do PC (`SOUNDS_DIR`, padrão `stream95/sons` dentro da pasta Documentos que o
Windows usa, inclusive quando ela está no OneDrive); cada subpasta é uma categoria. Se um WAV convertido
sumir do cache, o servidor converte de novo sozinho. O servidor converte cada arquivo uma vez para WAV PCM 16 bits, 48 kHz, estéreo, sem o silêncio
do começo e do fim, e a fonte de áudio do OBS toca a partir da memória. Detalhes em [sons.md](sons.md).

| Método e rota                      | Corpo                                                                   | Faz                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/sfx`                     | —                                                                       | Biblioteca: pasta, sons (`id`, `name`, `category`, `file`, `status`, `durationMs`, `rev`, `error`) e botões |
| `POST /api/sfx/rescan`             | —                                                                       | Relê a pasta e tenta de novo os sons que deram erro                                                         |
| `POST /api/sfx/upload`             | multipart: `file` (1 a 20 arquivos, até 50 MB cada) e `category?`       | Salva na pasta do PC (subpasta = categoria) e converte: `{ sounds }`                                        |
| `DELETE /api/sfx/sounds/:id`       | —                                                                       | Apaga o arquivo do PC e a conversão. Os botões desse som ficam sem som                                      |
| `GET /api/sfx/sounds/:id.wav?rev=` | —                                                                       | O WAV convertido. Cache imutável quando `rev` é a atual; aceita `Range`                                     |
| `POST /api/sfx/buttons`            | `{ label (1 a 32), soundId?, emoji? (até 8), color?, volume? (0 a 1) }` | Cria um botão                                                                                               |
| `PATCH /api/sfx/buttons/:id`       | os mesmos campos, todos opcionais                                       | Edita o botão (`emoji: null` tira o emoji)                                                                  |
| `DELETE /api/sfx/buttons/:id`      | —                                                                       | Remove o botão (o som continua na pasta)                                                                    |
| `PUT /api/sfx/buttons/order`       | `{ ids }`                                                               | Reordena os botões                                                                                          |
| `POST /api/sfx/play`               | `{ buttonId }` ou `{ soundId }`                                         | Toca no PC: `{ playId }`. 404 som desconhecido; 409 som ainda convertendo ou fonte de áudio do OBS fechada  |
| `POST /api/sfx/stop`               | —                                                                       | Para todos os sons                                                                                          |

Cores dos botões: `slate`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `violet` e `pink`. O volume
final é o do botão vezes o volume geral (`settings.sfx.volume`). `settings.sfx.overlap` decide o que
acontece quando um som toca por cima de outro: `stack` (sobrepõe), `restart` (reinicia o mesmo som) ou
`single` (um por vez).

### Chat e moderação

| Método e rota                        | Corpo                                                      | Faz                                                                 |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/chat/simulate`            | `{ user, text, isSub?, isMod?, isVip?, isFirst?, color? }` | Injeta uma mensagem como se viesse do chat (passa pela moderação)   |
| `DELETE /api/chat/:id`               | —                                                          | Tira a mensagem do overlay (e da Twitch, com o escopo de moderação) |
| `POST /api/chat/clear`               | —                                                          | Limpa o chat do overlay                                             |
| `POST /api/mod/:id/approve`          | `{ trustUser? }`                                           | Aprova uma mensagem retida; `trustUser` libera o autor na sessão    |
| `POST /api/mod/:id/reject`           | `{ blockUser? }`                                           | Rejeita; `blockUser` bloqueia o autor na sessão                     |
| `POST /api/mod/users/:login/block`   | —                                                          | Bloqueia um usuário na sessão                                       |
| `POST /api/mod/users/:login/unblock` | —                                                          | Desbloqueia                                                         |
| `POST /api/mod/allow-domain`         | `{ domain }`                                               | Adiciona um domínio à lista de links liberados                      |

### Assistente e voz

| Método e rota             | Corpo                                 | Faz                                      |
| ------------------------- | ------------------------------------- | ---------------------------------------- |
| `POST /api/assistant/ask` | `{ question (≤300), asker? }`         | Pergunta ao assistente (sem cooldown)    |
| `POST /api/assistant/say` | `{ text (≤300), animation?, speak? }` | O assistente fala um texto livre         |
| `POST /api/tts/say`       | `{ text (≤400), voice? }`             | Lê um texto em voz alta                  |
| `POST /api/tts/skip`      | —                                     | Pula a fala atual                        |
| `GET /api/tts/:file`      | —                                     | Áudio gerado (usado pela fonte de áudio) |

### Alertas e efeitos

| Método e rota               | Corpo                                                  | Faz                                                                                                             |
| --------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/alerts/simulate` | `{ kind, user?, amount?, message?, months?, reward? }` | Dispara um alerta. `kind`: `follow`, `sub`, `resub`, `giftsub`, `raid`, `cheer`, `redeem`, `donation`, `custom` |
| `GET /api/alerts/recent`    | —                                                      | Últimos alertas                                                                                                 |
| `POST /api/fx/bsod`         | `{ title?, message? }`                                 | Tela azul                                                                                                       |
| `POST /api/fx/toast`        | `{ title, body?, level? }`                             | Balão na bandeja (`info`, `warning`, `error`, `success`)                                                        |

### Enquete, pomodoro e contadores

| Método e rota                | Corpo                                                | Faz                                           |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `POST /api/poll`             | `{ question (≤120), options (2 a 9), durationSec? }` | Abre uma enquete; o chat vota com `!1`, `!2`… |
| `POST /api/poll/close`       | —                                                    | Encerra e mostra o resultado                  |
| `DELETE /api/poll`           | —                                                    | Remove a enquete da tela                      |
| `POST /api/pomodoro/:action` | `start`: `{ mode?, minutes? }`                       | `start`, `pause`, `resume` ou `stop`          |
| `POST /api/counters`         | `{ id, label }`                                      | Cria um contador                              |
| `POST /api/counters/:id/add` | `{ delta? }`                                         | Soma (ou subtrai)                             |
| `PUT /api/counters/:id`      | `{ value }`                                          | Define o valor                                |
| `DELETE /api/counters/:id`   | —                                                    | Remove                                        |

### OBS, Twitch e cenas

| Método e rota             | Corpo       | Faz                                                               |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| `GET /api/obs/scenes`     | —           | Cenas do OBS e a atual (requer o obs-websocket ativo)             |
| `POST /api/obs/scene`     | `{ name }`  | Troca a cena no OBS                                               |
| `POST /api/scene`         | `{ scene }` | Informa a cena atual aos overlays (`null` limpa)                  |
| `GET /api/twitch/status`  | —           | Origem do chat (`irc` ou `eventsub`) e estado do login            |
| `POST /api/twitch/login`  | —           | Inicia o Device Code Flow; devolve `userCode` e `verificationUri` |
| `POST /api/twitch/logout` | —           | Sai da Twitch e volta para a leitura anônima                      |

## Páginas

| URL      | O que é                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| `/`      | Página inicial com as URLs de todas as cenas e overlays                                   |
| `/dock/` | Painel de controle (PC, celular, tablet e dock do OBS). `/dock` redireciona para `/dock/` |

## WebSocket

`ws://localhost:1995/ws?role=<papel>` (de um aparelho pareado: `&token=<token>`)

| Papel              | Quem usa                | Recebe                                                                                                  |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `overlay` (padrão) | Cenas e overlays        | Tudo, menos a fila de moderação e as mensagens ainda não aprovadas                                      |
| `dock`             | Painel                  | Tudo, inclusive `mod:queue`, `mod:log`, `mod:signals`, `mod:attention`, `chat:incoming` e `sfx:played`  |
| `audio`            | Fonte de áudio (no OBS) | Só o necessário para tocar voz, jingles e sons: `hello`, `settings`, `tts:*`, `sfx:*`, `alert` e `bsod` |

Ao conectar chega um `hello` com o retrato completo do estado. Depois, eventos no formato
`{ "type": "...", ... }`:

| Grupo      | Eventos                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat       | `chat:show`, `chat:remove`, `chat:clear`, `chat:incoming` (painel)                                                                                                  |
| Moderação  | `mod:queue`, `mod:log`, `mod:signals` (sinais do Jev, que chegam depois da mensagem) e `mod:attention` (pergunta ou problema técnico para o streamer), só no painel |
| Assistente | `assistant:thinking`, `assistant:reply`, `assistant:say`                                                                                                            |
| Voz        | `tts:play`, `tts:skip`                                                                                                                                              |
| Sons       | `sfx:library` (a biblioteca mudou), `sfx:play`, `sfx:stop` e `sfx:played` (painel: quanto tempo o toque levou até o som começar no PC)                              |
| Live       | `alert`, `bsod`, `toast`, `poll`, `pomodoro`, `counters`, `github`, `scene`                                                                                         |
| Sistema    | `hello`, `settings`, `status`, `ping`                                                                                                                               |

O cliente pode enviar `{ "type": "ping", "t": <timestamp> }`. A fonte de áudio também envia
`{ "type": "tts:done", "id": "<id>" }` ao terminar uma fala e `{ "type": "sfx:played", "playId": "<id>" }`
quando um som começa a tocar. Se o aparelho for removido, a conexão dele fecha com o código **4401** e o
painel volta para a tela de pareamento. Os tipos completos estão em
[`packages/shared/src/events.ts`](../packages/shared/src/events.ts).
