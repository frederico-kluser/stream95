# Pesquisa

Antes de escrever o código, fizemos uma pesquisa com verificação adversarial: 5 ângulos de busca,
23 fontes lidas, 115 alegações extraídas, 25 verificadas por 3 votos independentes cada, 22
confirmadas e 3 refutadas. Este documento resume o que ficou de pé, o que o projeto adotou e o que
medimos depois para cobrir as lacunas.

## O que a pesquisa confirmou

### Twitch

1. **Chat por EventSub, não IRC.** A Twitch recomenda ler e enviar mensagens pelo EventSub
   (`channel.chat.message`) e pela API; o IRC é descrito como interface antiga, limitada e mais
   difícil de interpretar. Com token de usuário, basta o escopo `user:read:chat`.
   ([Twitch Chat](https://dev.twitch.tv/docs/chat/), [migração do IRC](https://dev.twitch.tv/docs/chat/irc-migration/))
2. **EventSub por WebSocket exige token de usuário.** Token de app falha nas assinaturas. Para um
   servidor local de um canal só, é o transporte certo: webhook precisa de URL HTTPS pública.
   ([EventSub por WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/))
3. **Escopos por evento.** Follow v2 → `moderator:read:followers`; inscrições →
   `channel:read:subscriptions`; bits → `bits:read`; resgates → `channel:read:redemptions`; raid sem
   escopo; avisos do chat (`channel.chat.notification`) com `user:read:chat`.
   ([tipos de assinatura](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/))
4. **Login sem client secret.** O Device Code Flow com app do tipo _public_ é o indicado para
   aplicativos no computador do usuário. O token de acesso dura cerca de 4 h; o de renovação é de uso
   único e expira após 30 dias sem uso.
   ([tokens](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/),
   [renovação](https://dev.twitch.tv/docs/authentication/refresh-tokens/))
5. **Quedas perdem eventos.** Se o WebSocket do EventSub cai sem aviso, as assinaturas morrem e os
   eventos do intervalo não são reenviados. Reconexões planejadas (`session_reconnect`) não perdem
   nada.
6. **Alternativa para alertas:** o gateway Astro da StreamElements (`wss://astro.streamelements.com`)
   é um WebSocket comum, com ping a cada 30 s.
   ([StreamElements WebSockets](https://docs.streamelements.com/websockets))

### Moderação

7. **Camadas antes de exibir:** regras locais baratas primeiro, um classificador pequeno depois e,
   só nos casos ambíguos, um modelo de política própria; o que continuar incerto vai para a fila do
   streamer. O guia do gpt-oss-safeguard recomenda pré-filtrar e não chamar o modelo em todo evento.
   ([guia gpt-oss-safeguard](https://developers.openai.com/cookbook/articles/gpt-oss-safeguard-guide))
8. **Filtros de palavrão (npm):** num benchmark pequeno do autor do allprofanity, ele e o obscenity
   lideraram em evasões detectadas; bad-words e leo-profanity ficaram bem atrás.
   ([AllProfanity](https://github.com/ayush-jadaun/AllProfanity))
9. **Llama Guard 4** classifica a mensagem do usuário e a resposta do LLM. A saída é texto
   (`safe`/`unsafe` + códigos S1–S14), sem JSON; na OpenRouter custa US$ 0,18 por milhão de tokens.
   ([cartão do modelo](https://huggingface.co/meta-llama/Llama-Guard-4-12B),
   [OpenRouter](https://openrouter.ai/meta-llama/llama-guard-4-12b))
10. **gpt-oss-safeguard** classifica segundo uma política escrita por você (20B e 120B, pesos
    abertos; na OpenRouter só o 20B).
11. **JSON na OpenRouter:** o suporte a `response_format` depende do provedor, não do modelo.
    Valide sempre o JSON no servidor e tenha fallback.
    ([structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs))

## O que o stream95 adotou

| Decisão                                                                          | Por quê                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| EventSub por WebSocket com Device Code Flow, sem secret                          | Achados 1, 2 e 4                                                                            |
| Leitura anônima por IRC quando não há login                                      | Funciona sem configurar nada; o EventSub assume quando disponível e o IRC volta se ele cair |
| Tokens gravados de forma atômica a cada renovação                                | Token de renovação de uso único (achado 4)                                                  |
| Recriar assinaturas a cada nova sessão                                           | Achado 5                                                                                    |
| Moderação em 3 camadas: regras → IA pequena → fila                               | Achado 7                                                                                    |
| obscenity (só ofensas e conteúdo explícito) + listas próprias em PT-BR           | Achado 8 e alegações refutadas abaixo                                                       |
| Modelo geral pequeno com política própria e JSON validado, em vez do Llama Guard | Achados 9 e 11 e o [benchmark](moderation-benchmark.md)                                     |
| Resposta do Clippy também passa pela moderação                                   | Achado 9 (classificar a saída do LLM)                                                       |

## Lacunas e como foram cobertas

A pesquisa não confirmou nada sobre alguns temas. Eles foram resolvidos com teste próprio:

| Lacuna                                       | Como resolvemos                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Acurácia e latência dos moderadores em PT-BR | [Benchmark](moderation-benchmark.md) ao vivo: o Llama Guard 4 errou 3 de 8; modelos gerais pequenos acertaram 8 de 8 em menos de 1 s |
| TTS                                          | ElevenLabs Flash v2.5 via OpenRouter (`/api/v1/audio/speech`), com 20 vozes conferidas uma a uma e idioma fixado em português        |
| Listas de palavrões e spam em PT-BR          | Listas próprias, com normalização contra ofuscação (acentos, números no lugar de letras, letras repetidas)                           |
| obs-websocket                                | Cliente próprio do protocolo v5, sem a dependência abandonada `crypto-js`                                                            |
| React95                                      | Estudo completo do código e do Storybook, registrado na [skill do React95](../.agents/skills/react95-agent-skill)                    |

## Alegações refutadas (não use)

- Números multilíngues de recall do Llama Guard 4 citados como do cartão do modelo.
- "O allprofanity traz dicionário em português do Brasil."
- "O obscenity pega variantes ofuscadas sem listas."

Por isso, suporte a PT-BR e resistência a ofuscação foram testados localmente
(veja [`apps/server/test/rules.test.ts`](../apps/server/test/rules.test.ts)).

## Jev (TypeSafe), pesquisado depois

A moderação de todo comentário usa o Jev, adicionado depois da pesquisa inicial. O que foi conferido
nas fontes oficiais e testado ao vivo:

- O Jev é um modelo de **decisão** ("System One"): não gera texto. Recebe um `state` e perguntas
  tipadas e devolve, para cada pergunta, a opção escolhida com a probabilidade de cada opção
  (`choice`), a probabilidade de "sim" (`noul`) ou um nível numa escala (`score`).
  ([Jev na OpenRouter](https://openrouter.ai/docs/guides/community/jev),
  [tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial))
- Endpoint: `POST https://openrouter.ai/api/alpha/decisions`, com a mesma chave da OpenRouter. Cobra só
  os tokens de entrada (US$ 0,042 por milhão); a saída é grátis.
  ([referência da API de decisões](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-decisions/references/decisions-api.md))
- Fixe uma versão (`typesafe/jev-1.14`), nunca o alias `~typesafe/jev-latest`: os limiares valem para
  um build, e a resposta informa o build exato.
  ([escolha de modelos de decisão](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-decisions/references/models.md))
- **Limites**: o conteúdo é lido como dado, mas texto que argumenta pela própria classificação pode
  mover a resposta; uma pergunta por julgamento; critérios explícitos.
  ([limites dos modelos de decisão](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-decisions/references/decision-model-limits.md))
  Por isso as regras locais rodam antes e os casos ambíguos vão para o LLM ou para um humano.
- O **Jev Router** (`typesafe/jev-router`) é outra coisa: usa o Jev para escolher, a cada pedido de
  chat, qual modelo gerativo responde. Não serve para moderação (precisamos da decisão tipada), mas
  pode ser avaliado no futuro para o Clippy.
  ([anúncio](https://x.com/OpenRouter/status/2103610898690855161))

No teste ao vivo com 20 mensagens em PT-BR, o Jev 1.14 não deixou passar nada que deveria ser
barrado, resistiu às duas tentativas de injeção e respondeu em 0,36 s na mediana. Detalhes em
[moderation-benchmark.md](moderation-benchmark.md).

## Outras referências consultadas

- [Social Stream Ninja](https://github.com/steveseguin/social_stream), overlays de chat multiplataforma.
- [obs-browser](https://github.com/obsproject/obs-browser) e
  [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js).
- [React95](https://github.com/React95/React95) e [clippyjs](https://github.com/pi0/clippyjs).
- [Polls da Twitch](https://dev.twitch.tv/docs/api/polls/).
- TTS local para comparação: [Piper (vozes pt_BR)](https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR)
  e [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).
