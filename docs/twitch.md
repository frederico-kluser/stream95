# Twitch: chat, alertas e login

## Sem login (padrão)

Com só `TWITCH_CHANNEL` no `.env`, o servidor lê o chat do canal de forma **anônima** (IRC, sem
token). Isso já entrega:

- mensagens do chat, com cores, emotes e selos de inscrito, VIP e mod;
- inscrições, reinscrições, inscrições de presente, raids e bits (avisos que chegam pelo próprio chat).

Ficam de fora os **follows** e os **resgates de pontos do canal**, que a Twitch só envia pelo
EventSub, e o Clippy não consegue **responder no chat**.

## Com login (EventSub)

A Twitch recomenda ler o chat pelo EventSub (assinatura `channel.chat.message`) em vez do IRC. Com
login, o stream95 passa a usar o EventSub para chat, avisos, follows e resgates, e o Clippy pode
responder no chat. Quando o EventSub conecta, a leitura anônima é desligada para não duplicar
mensagens. Se ele cair, a leitura anônima volta sozinha.

Mensagens apagadas, timeouts, bans e "limpar chat" feitos na Twitch também somem do overlay.

### 1. Crie um app "Public"

1. Acesse <https://dev.twitch.tv/console/apps> → **Registrar seu aplicativo**.
2. Nome: o que quiser (por exemplo `stream95-seucanal`).
3. URL de redirecionamento OAuth: `http://localhost` (o campo é obrigatório, mas não é usado).
4. Categoria: a que preferir (não muda nada no stream95).
5. Tipo de cliente: **Público**. Apps públicos não têm client secret, e é isso que permite guardar
   o login com segurança numa máquina pessoal.
6. Copie o **ID do cliente** para o `.env`:

   ```dotenv
   TWITCH_CLIENT_ID=seu_client_id
   ```

### 2. Faça login

Pelo terminal:

```bash
npm run twitch:login
```

Ou pelo painel: **Config → Twitch → Entrar com a Twitch**.

Aparece um código e o endereço <https://www.twitch.tv/activate>. Abra o endereço logado na conta do
canal, digite o código e autorize. Esse é o
[Device Code Flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/),
que a Twitch indica para aplicativos que rodam no computador do usuário.

### Permissões pedidas

| Escopo                           | Para quê                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| `user:read:chat`                 | Ler o chat e os avisos (inscrições, raids, bits) pelo EventSub |
| `moderator:read:followers`       | Alertas de follow                                              |
| `channel:read:redemptions`       | Alertas de resgate de pontos do canal                          |
| `user:write:chat`                | Clippy respondendo no chat                                     |
| `moderator:manage:chat_messages` | Apagar no chat da Twitch uma mensagem barrada pelo painel      |

### Como o login é guardado

- Os tokens ficam em `data/` (fora do git), gravados de forma atômica.
- O token de acesso dura cerca de 4 horas e é renovado sozinho.
- O token de renovação é de **uso único**: cada renovação gera outro, que é salvo na hora.
- Se o login ficar **30 dias sem uso**, a Twitch o invalida e é preciso entrar de novo.
- Para sair: **Config → Twitch → Sair**, ou `POST /api/twitch/logout`.

### Limitação do EventSub por WebSocket

Se a conexão cair sem aviso, a Twitch desativa as assinaturas e **não reenvia** os eventos do
intervalo. O stream95 reconecta e recria as assinaturas, mas follows ou resgates que aconteceram
durante a queda se perdem. Reconexões planejadas pela Twitch (`session_reconnect`) não perdem nada.

Fontes: [Twitch Chat](https://dev.twitch.tv/docs/chat/),
[EventSub por WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[tipos de assinatura](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) e
[tokens de renovação](https://dev.twitch.tv/docs/authentication/refresh-tokens/).
