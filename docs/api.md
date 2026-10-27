# API local

O servidor do stream95 expõe uma API REST e um WebSocket em `http://127.0.0.1:1995` (porta
`PORT` do `.env`). É por ela que o painel, as cenas e os seus próprios scripts conversam com o chat,
a moderação, o Clippy e a voz.

## Regras de acesso

| Regra                                                                            | Por quê                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Só responde a `Host` local (`localhost`, `127.0.0.1`, `[::1]`)                   | Bloqueia DNS rebinding: um site malicioso não consegue falar com o servidor pelo navegador                  |
| `POST`, `PUT`, `PATCH` e `DELETE` em `/api/*` exigem o cabeçalho `x-stream95: 1` | Bloqueia CSRF: navegadores não enviam esse cabeçalho entre sites sem preflight, que o servidor nunca libera |
| Se houver `Origin`, ela precisa ser a do próprio servidor (API e WebSocket)      | Bloqueia sequestro do WebSocket por outra aba                                                               |

Com `HOST=0.0.0.0` o servidor aceita outras máquinas da rede (por exemplo, um segundo PC de live).
Faça isso só numa rede confiável: a API não tem senha.

Erros sempre vêm como `{"error": "Erro: <o que houve> — Solução: <o que fazer>"}`, com status 400
(corpo inválido), 403 (acesso negado), 404 (não encontrado) ou 503 (serviço externo indisponível).

## Exemplos

```bash
# Pergunta ao Clippy (aparece no overlay e, se configurado, é falada)
curl -X POST http://localhost:1995/api/assistant/ask \
  -H "x-stream95: 1" -H "content-type: application/json" \
  -d '{"question":"o que é um ponteiro?","asker":"streamer"}'

# Clippy fala um texto livre com uma animação
curl -X POST http://localhost:1995/api/assistant/say \
  -H "x-stream95: 1" -H "content-type: application/json" \
  -d '{"text":"Deploy feito! Ninguém mexe em produção hoje.","animation":"Congratulate","speak":true}'
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
| `GET /api/state`      | —              | Configurações + retrato do estado atual (chat, fila, enquete, pomodoro…)           |
| `GET /api/settings`   | —              | Configurações atuais                                                               |
| `PATCH /api/settings` | objeto parcial | Atualiza configurações (merge profundo, validado)                                  |
| `GET /api/voices`     | —              | Vozes de TTS disponíveis                                                           |
| `GET /api/models`     | —              | Modelos configurados para moderação (Jev e LLM), assistente e TTS                  |
| `GET /api/commands`   | —              | Comandos de chat ativos                                                            |

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

### Clippy e voz

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

## WebSocket

`ws://localhost:1995/ws?role=<papel>`

| Papel              | Quem usa         | Recebe                                                                                   |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `overlay` (padrão) | Cenas e overlays | Tudo, menos a fila de moderação e as mensagens ainda não aprovadas                       |
| `dock`             | Painel           | Tudo, inclusive `mod:queue`, `mod:log`, `mod:signals`, `mod:attention` e `chat:incoming` |
| `audio`            | Fonte de áudio   | Só o necessário para tocar TTS e jingles                                                 |

Ao conectar chega um `hello` com o retrato completo do estado. Depois, eventos no formato
`{ "type": "...", ... }`:

| Grupo     | Eventos                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat      | `chat:show`, `chat:remove`, `chat:clear`, `chat:incoming` (painel)                                                                                                  |
| Moderação | `mod:queue`, `mod:log`, `mod:signals` (sinais do Jev, que chegam depois da mensagem) e `mod:attention` (pergunta ou problema técnico para o streamer), só no painel |
| Clippy    | `assistant:thinking`, `assistant:reply`, `assistant:say`                                                                                                            |
| Voz       | `tts:play`, `tts:skip`                                                                                                                                              |
| Live      | `alert`, `bsod`, `toast`, `poll`, `pomodoro`, `counters`, `github`, `scene`                                                                                         |
| Sistema   | `hello`, `settings`, `status`, `ping`                                                                                                                               |

O cliente pode enviar `{ "type": "ping", "t": <timestamp> }` e, na fonte de áudio,
`{ "type": "tts:done", "id": "<id>" }` ao terminar uma fala. Os tipos completos estão em
[`packages/shared/src/events.ts`](../packages/shared/src/events.ts).
