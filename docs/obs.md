# OBS: cenas, painel e áudio

O stream95 desenha as janelas do Windows 95 numa **fonte de navegador** transparente de
1920x1080. Câmera e capturas ficam **abaixo** dela, encaixadas nos buracos transparentes de cada
cena. Há dois jeitos de montar isso: o gerador automático (recomendado) ou à mão.

## 1. Gerador automático

O gerador cria uma coleção de cenas nova, com tudo posicionado. A coleção que você já usa não é
alterada.

1. Deixe o servidor rodando (`npm start`) e **feche o OBS**: ele só lê a lista de coleções ao abrir.
2. Rode, apontando para a coleção atual para reaproveitar a webcam e o monitor já configurados:

   ```bash
   npm run obs:collection -- --install \
     --camera-from "%APPDATA%/obs-studio/basic/scenes/SuaColecao.json" \
     --capture-from "%APPDATA%/obs-studio/basic/scenes/SuaColecao.json" \
     --browser brave
   ```

3. Abra o OBS e escolha **Coleção de cenas → stream95**.

| Opção                      | O que faz                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `--install`                | Copia a coleção para a pasta de cenas do OBS (Windows, macOS ou Linux). Não ativa nada.       |
| `--force`                  | Junto com `--install`: substitui uma coleção `stream95` existente, guardando antes um `.bak`. |
| `--name <nome>`            | Nome da coleção (padrão `stream95`).                                                          |
| `--url <url>`              | Endereço do servidor (padrão `http://localhost:1995`).                                        |
| `--camera-from <arquivo>`  | Copia o dispositivo da primeira webcam (`dshow_input`) de outra coleção.                      |
| `--capture-from <arquivo>` | Copia o monitor e a janela já escolhidos em outra coleção.                                    |
| `--browser <nome>`         | Navegador da cena "Reagindo": `chrome`, `brave`, `edge` ou `firefox`.                         |
| `--out <arquivo>`          | Onde gravar o JSON (padrão `obs/<nome>.json`, fora do git).                                   |

### O que é criado

| Cena                              | Fontes, de baixo para cima                                                  |
| --------------------------------- | --------------------------------------------------------------------------- |
| `1. Abertura` … `8. Encerramento` | captura (quando a cena tem) → câmera (quando tem) → overlay da cena → áudio |
- **stream95 · Câmera**: a webcam, ajustada ao buraco com "Redimensionar para os limites externos"
  e recorte, para preencher sem distorcer.
- **stream95 · Captura do navegador** (Reagindo): captura de janela pelo executável do navegador,
  com o método Windows Graphics Capture, o único que funciona com aceleração de hardware.
- **stream95 · Captura da tela** (Codando): captura de monitor.
- **stream95 · Captura de jogo** (Jogando): qualquer aplicação em tela cheia.
- **stream95 · Overlay &lt;cena&gt;**: fonte de navegador 1920x1080 a 60 fps com
  `http://localhost:1995/scene/<id>`.
- **stream95 · Áudio (TTS + jingles)**: uma única fonte compartilhada por todas as cenas, com
  "Controlar áudio via OBS" e monitoramento em "Monitorar e enviar" (você ouve e a live também).
  É ela que toca a voz, os jingles dos alertas e a **mesa de sons** do painel.
- Atalhos **Ctrl+Alt+1** a **Ctrl+Alt+8** para trocar de cena. Atalhos de cena valem só na coleção
  ativa, então não colidem com os de outras coleções.

## 2. Montagem manual

Abra `http://localhost:1995`: a página inicial lista as URLs e os retângulos em pixels reais
(1920x1080).

| Cena             | URL               | Câmera (x, y, largura x altura) | Captura                    |
| ---------------- | ----------------- | ------------------------------- | -------------------------- |
| Abertura         | `/scene/starting` | —                               | —                          |
| Eu + Chat        | `/scene/main`     | 40, 72 · 1152x648               | —                          |
| Só Eu + Chat     | `/scene/fullcam`  | 0, 0 · 1920x1080                | —                          |
| Reagindo (Limpo) | `/scene/react`    | 1456, 68 · 448x252              | janela: 24, 68 · 1408x792  |
| Codando          | `/scene/code`     | 1344, 68 · 560x316              | monitor: 24, 68 · 1280x800 |
| Jogando          | `/scene/gaming`   | 24, 808 · 416x234               | jogo: 0, 0 · 1920x1080     |
| Volto Já         | `/scene/brb`      | —                               | —                          |
| Encerramento     | `/scene/ending`   | —                               | —                          |

Para cada cena:

1. Adicione a câmera e a captura e, em **Editar transformação**, use os valores da tabela com
   "Tipo de caixa delimitadora: Redimensionar para os limites externos" e "Recortar para os limites".
2. Adicione uma **Fonte de navegador** por cima, 1920x1080, com a URL da cena. Deixe desmarcados
   "Desligar a fonte quando não estiver visível" e "Atualizar o navegador quando a cena ficar ativa".
3. Adicione a fonte de áudio `http://localhost:1995/overlay/audio` (400x60), marque
   **Controlar áudio via OBS** e, em Propriedades avançadas de áudio, escolha
   **Monitorar e enviar**. Para não duplicar o som, use **a mesma fonte** em todas as cenas
   (Colar referência), nunca uma cópia.

### Overlays avulsos

Se você prefere manter suas próprias cenas, use só as peças:

| URL                         | O que é                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `/overlay/audio`            | Player de voz, jingles e mesa de sons (obrigatório para ter som)        |
| `/overlay/all`              | Chat, enquete, barra de tarefas, Clippy, balões e alertas numa fonte só |
| `/overlay/chat?x=&y=&w=&h=` | Só o chat, posicionado em pixels lógicos (960x540)                      |
| `/overlay/alerts`           | Diálogos de alerta, tela azul e balões                                  |
| `/overlay/clippy?x=&y=`     | Só o Clippy                                                             |
| `/overlay/taskbar`          | Barra de tarefas com feed do GitHub, pomodoro, contadores e relógio     |
| `/overlay/poll`             | Enquete (aparece só quando há uma aberta)                               |

Parâmetros úteis em qualquer URL: `?checker` mostra as áreas transparentes como xadrez e
`?scale=1` mostra a cena em 960x540.

## 3. Painel (dock, celular e tablet)

**Docks → Docks de navegador personalizados**, nome `stream95`, URL `http://localhost:1995/dock/`
(o endereço antigo, sem a barra no fim, redireciona). O painel modera o chat, toca a mesa de sons,
controla o assistente e a voz, simula alertas, abre enquetes, comanda pomodoro e contadores e troca
de cena.

O mesmo painel abre no celular ou no tablet, na mesma rede Wi-Fi do PC:

1. Rode `npm start`. O terminal mostra o endereço do painel para o celular e um QR code.
2. Aponte a câmera do celular para o QR code e abra o link. O aparelho fica pareado.
3. Na primeira vez, o Windows pode perguntar se o Node.js pode usar a rede: permita em
   **Redes privadas**.

O código do QR vale 10 minutos e serve uma vez. Para parear outro aparelho depois, abra
**Config → Aparelhos** no painel do PC: lá aparecem um QR novo, o código e a lista de aparelhos, com o
botão para remover cada um. Detalhes de segurança em [api.md](api.md#regras-de-acesso).

Os sons tocam sempre no PC, pela fonte de áudio do OBS, nunca no celular. Veja [sons.md](sons.md).

## 4. Trocar de cena pelo painel

A aba **Live** troca as cenas do OBS pelo [obs-websocket](https://github.com/obsproject/obs-websocket)
(protocolo v5, já incluso no OBS 28+):

1. No OBS: **Ferramentas → Configurações do servidor WebSocket → Ativar servidor WebSocket**.
2. Copie a senha para o `.env` em `OBS_WS_PASSWORD` (e a porta em `OBS_WS_URL`, se mudou).
3. Reinicie o servidor. O painel mostra `OBS ● online`.

Sem isso, o resto funciona normalmente; só a troca de cena pelo painel fica indisponível.

## Problemas comuns

| Sintoma                       | Causa provável                                                                           | Solução                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cena aparece branca no OBS    | Servidor desligado                                                                       | `npm start` e, na fonte, **Atualizar**                            |
| Sem som do TTS ou dos alertas | Fonte de áudio ausente ou sem "Controlar áudio via OBS"                                  | Veja o passo 3 da montagem manual                                 |
| Botão de som "sem retorno"    | Fonte de áudio fechada, sem "Controlar áudio via OBS" ou aberta num navegador sem clique | Veja o passo 3 da montagem manual; no navegador, clique na página |
| Celular não abre o painel     | Firewall do Windows ou rede diferente                                                    | Mesma rede do PC; permita o Node.js em "Redes privadas"           |
| Som duplicado                 | Mais de uma fonte `/overlay/audio` ativa                                                 | Use a mesma fonte (referência) em todas as cenas                  |
| Captura do navegador preta    | Método de captura errado                                                                 | Use "Windows 10 (1903 e superior)" na captura de janela           |
| Captura de tela vazia         | Monitor não escolhido                                                                    | Escolha o monitor nas propriedades ou use `--capture-from`        |
