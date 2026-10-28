# Mesa de sons (soundboard): sons no PC da live

O soundboard do deck dispara efeitos e memes durante a live. O celular só aperta o botão: o som
toca no PC, pela fonte de áudio do OBS (`/overlay/audio`), a mesma do TTS e dos alertas. Assim a
live ouve o som na hora, e o Bluetooth ou o Wi-Fi do celular não atrasam nada.

## Como o som toca sem atraso

1. Você aperta um botão no deck (celular, tablet ou o próprio PC).
2. O deck chama `POST /api/sfx/play` e o servidor avisa a fonte `/overlay/audio` pelo WebSocket
   (`sfx:play`).
3. A fonte de áudio já tem todos os sons decodificados na memória e toca no mesmo instante. Em
   seguida ela responde `sfx:played`, e o deck mostra a latência medida.

Se a fonte de áudio estiver fechada, o servidor recusa o toque na hora e o deck avisa. Se ela estiver
aberta num navegador comum em que ninguém clicou, o navegador bloqueia o som: a fonte não confirma, e
o deck avisa que o PC não confirmou. No OBS isso não acontece.

Cada arquivo da pasta é convertido **uma vez**, no PC, com o ffmpeg que vem com o projeto. O
arquivo original não muda; a cópia convertida fica em cache e só é refeita quando o original
muda.

| Escolha                                   | Por quê                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| WAV PCM 16 bits, 48 kHz, estéreo          | O OBS mistura o áudio em 48 kHz. Com o som já em 48 kHz, nada é reamostrado na hora de tocar.                |
| Nada de MP3 na reprodução                 | O MP3 traz atraso do codificador e preenchimento: dezenas de milissegundos de silêncio antes do som começar. |
| Sons pré-carregados na memória            | A fonte de áudio decodifica cada som ao abrir. O clique só manda tocar, sem baixar nem decodificar nada.     |
| Silêncio do começo e do fim cortado       | O som começa no primeiro instante audível e termina quando para de soar (fica um respiro de 0,1 s).          |
| Volume normalizado em -16 LUFS (EBU R128) | Todo meme toca na mesma altura. Para manter o volume original, desligue `sfx.normalize` nas configurações.   |

O WAV ocupa cerca de 192 KB por segundo de som. Por isso o soundboard aceita sons de até
**2 minutos**.

## A pasta dos sons

| Sistema       | Pasta padrão                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows       | `stream95\sons` dentro da sua pasta Documentos (`C:\Users\<você>\Documents` ou, com backup do OneDrive, `C:\Users\<você>\OneDrive\Documentos`) |
| macOS e Linux | `~/Documents/stream95/sons`                                                                                                                    |

Para usar outra pasta, defina `SOUNDS_DIR` no `.env` com um caminho absoluto.

- Cada subpasta vira uma categoria no deck. Arquivos soltos na raiz aparecem em **Pasta
  principal**.
- Você pode copiar arquivos direto pelo Explorer: o servidor percebe sozinho em menos de um segundo. Se
  algo não aparecer, toque em **Atualizar** no deck (ou chame `POST /api/sfx/rescan`).
- Apagar um som pelo deck apaga o arquivo da pasta e a cópia convertida. Os botões que usavam esse
  som ficam sem som até você escolher outro.
- Arquivos que não são de áudio, como o `CREDITOS.txt`, são ignorados.

## Enviar sons pelo deck

O botão de envio aceita até **20 arquivos por vez**, com até **50 MB cada**. Escolha a categoria
(uma subpasta existente ou uma nova) e envie. O arquivo vai para a pasta dos sons no PC, junto com
os outros, e o servidor converte sozinho. A escolha e a reprodução continuam sempre no PC: o deck
lista os sons do computador, não os do celular.

## Formatos aceitos

`.mp3`, `.wav`, `.ogg`, `.oga`, `.opus`, `.m4a`, `.aac`, `.flac`, `.webm`, `.weba`, `.aif`,
`.aiff`, `.wma` e `.mp4`. De vídeos (`.mp4`, `.webm`) só o áudio é usado.

## Botões

- Cada botão aponta para um som da pasta e tem rótulo, emoji, cor e volume próprio.
- O volume final é o volume do botão vezes o volume geral do soundboard (`sfx.volume`).
- `sfx.overlap` decide o que acontece quando um som ainda está tocando:

| Valor     | Comportamento                                       |
| --------- | --------------------------------------------------- |
| `stack`   | Os sons tocam juntos, até o mesmo som repetido.     |
| `restart` | O mesmo som recomeça; sons diferentes tocam juntos. |
| `single`  | Um som novo para os outros.                         |

## Pacote inicial

```bash
npm run sfx:pack
```

O comando monta um soundboard pronto, com sons de licença livre:

1. Baixa efeitos sonoros (CC0, domínio público e CC BY) do Wikimedia Commons, do OpenGameArt e
   dos pacotes de áudio da Kenney.
2. Gera falas de memes em português e em inglês com a voz da ElevenLabs pelo OpenRouter, usando o
   modelo `elevenlabs/eleven-v3` e as tags de emoção dele (`[laughs]`, `[sighs]`, `[excited]`...).
   Se o modelo sair do ar, o script usa `elevenlabs/eleven-flash-v2.5` com o texto sem as tags.
3. Decodifica cada arquivo com o ffmpeg e descarta os que vierem com defeito.
4. Grava o `CREDITOS.txt` na pasta dos sons, com autor, licença e link de cada arquivo.
5. Cria até **24 botões**: memes em português em verde, em inglês em violeta e efeitos em âmbar.

Rodar de novo é seguro:

- Arquivos que já estão na pasta ficam como estão. O script só baixa ou gera o que falta.
- Botões só são adicionados, nunca alterados ou removidos, e o total para em 24.
- O script lembra os botões que já criou (`data/sfx-pack.json`) e não recria um botão que você
  apagou. Para receber os botões do pacote de novo, apague esse arquivo.
- Para refazer uma fala, apague o arquivo dela e rode o comando outra vez.

Com o servidor ligado, o script usa a pasta do servidor e cria os botões pela API. Com o servidor
desligado, ele grava `data/sfx-buttons.json`, e os botões aparecem no deck quando o servidor
iniciar.

Sem `OPENROUTER_API_KEY`, o script baixa os efeitos e avisa que as falas ficaram de fora. Gerar as
22 falas custa cerca de **US$ 0,05**: são uns 600 caracteres a US$ 80 por milhão no
`eleven-v3`.

Se a Kenney recusar o download (HTTP 403), espere alguns minutos e rode de novo. Se continuar,
baixe o zip na página do pacote pelo navegador. O script usa os zips que estiverem em `Downloads`
ou na pasta definida em `SFX_PACK_ZIP_DIR`.

### Efeitos (`efeitos/`)

| Arquivo                 | Fonte                                                                                                             | Licença         | Autor                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------- |
| `aplausos.wav`          | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:277021_sandermotions_applause-2.wav)                  | CC0             | Sandermotions (Freesound)       |
| `risadas.wav`           | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:72844_lonemonk_approx-800-laughter-and-clapter-1.wav) | CC BY 3.0       | lonemonk (Freesound)            |
| `ba-dum-tss.wav`        | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_assorted_rimshots_-_Kdum-keesh.wav)     | CC BY 3.0       | Kevin MacLeod (incompetech.com) |
| `trombone-triste.ogg`   | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sad_Trombone-Joe_Lamb-665429450.ogg)                  | CC BY 3.0       | Joe Lamb (SoundBible)           |
| `grilos.mp3`            | [OpenGameArt](https://opengameart.org/content/crickets-ambient-noise-loopable)                                    | CC0             | Wolfgang\_                      |
| `rufar-de-tambores.wav` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_assorted_rimshots_-_4-second_roll.wav)  | CC BY 3.0       | Kevin MacLeod (incompetech.com) |
| `buzina.wav`            | [OpenGameArt](https://opengameart.org/content/bicycle-horn)                                                       | CC0             | AntumDeluge                     |
| `braaam.ogg`            | [OpenGameArt](https://opengameart.org/content/their-coming-generic-horn-sound)                                    | CC0             | StumpyStrust                    |
| `errado.wav`            | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Buzzer.wav)                                           | CC0             | David Pride (Cotswold Jam)      |
| `acerto.ogg`            | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds)                                              | CC0             | Kenney                          |
| `gongo.ogg`             | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Gong_or_bell_vibrant_%28short%29.ogg)                 | CC0             | PDSounds                        |
| `lingua-de-sogra.ogg`   | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Luftr%C3%BCssel.ogg)                                  | Domínio público | Flo Sorg                        |
| `risada-maligna.ogg`    | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Evil_laugh.ogg)                                       | CC0             | Freesound (#50176)              |
| `ohhh.ogg`              | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ohhh_ahhh.ogg)                                        | Domínio público | starlite (PDSounds)             |
| `internet-discada.oga`  | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dial_up_connection_%28short%29.oga)                   | CC0             | PDSounds                        |
| `explosao.ogg`          | [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds)                                                    | CC0             | Kenney                          |
| `soco.ogg`              | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)                                                    | CC0             | Kenney                          |
| `panelada.ogg`          | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio)                                                            | CC0             | Kenney                          |
| `moedas.ogg`            | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio)                                                            | CC0             | Kenney                          |
| `power-up.ogg`          | [Kenney Digital Audio](https://kenney.nl/assets/digital-audio)                                                    | CC0             | Kenney                          |

### Vozes em inglês da Kenney (`memes-en/`)

`game-over.ogg`, `you-win.ogg`, `you-lose.ogg`, `congratulations.ogg`, `new-highscore.ogg`,
`level-up.ogg`, `mission-completed.ogg`, `fire-in-the-hole.ogg` e `go-go-go.ogg` vêm do
[Kenney Voiceover Pack](https://kenney.nl/assets/voiceover-pack) (CC0), com as vozes de Jeffrey
M. Smith e Giselle.

### Falas geradas por IA (`memes-pt/` e `memes-en/`)

Frases genéricas, faladas pelas vozes prontas da ElevenLabs. Nenhuma imita a voz de uma pessoa
real.

| Arquivo                                  | Fala                                     | Voz     |
| ---------------------------------------- | ---------------------------------------- | ------- |
| `memes-pt/que-isso-meu-filho.mp3`        | Que isso, meu filho?!                    | bill    |
| `memes-pt/calma-calma-calma.mp3`         | Calma, calma... CALMA!                   | jessica |
| `memes-pt/deu-ruim.mp3`                  | Ih... deu ruim!                          | liam    |
| `memes-pt/brabo-demais.mp3`              | Brabo demais!                            | charlie |
| `memes-pt/oloco.mp3`                     | Ô loco!                                  | eric    |
| `memes-pt/rapaz.mp3`                     | Rapaz...                                 | brian   |
| `memes-pt/errou-feio-errou-rude.mp3`     | Errou feio... errou rude!                | chris   |
| `memes-pt/ta-pegando-fogo.mp3`           | Tá pegando fogo!                         | laura   |
| `memes-pt/bora-codar.mp3`                | Bora codar!                              | will    |
| `memes-pt/ai-papai.mp3`                  | Ai, papai!                               | will    |
| `memes-pt/compilou-de-primeira.mp3`      | Compilou... de primeira?!                | river   |
| `memes-pt/funciona-na-minha-maquina.mp3` | Ué... funciona na minha máquina!         | adam    |
| `memes-en/bruh.mp3`                      | Bruh.                                    | daniel  |
| `memes-en/oh-no.mp3`                     | Oh NO!                                   | sarah   |
| `memes-en/lets-go.mp3`                   | Let's goooo!                             | liam    |
| `memes-en/emotional-damage.mp3`          | EMOTIONAL DAMAGE!                        | george  |
| `memes-en/works-on-my-machine.mp3`       | Well... it works on my machine.          | chris   |
| `memes-en/mission-failed.mp3`            | Mission failed. We'll get 'em next time. | roger   |
| `memes-en/nice.mp3`                      | Nice.                                    | lily    |
| `memes-en/wait-what.mp3`                 | Wait... what?                            | alice   |
| `memes-en/ship-it.mp3`                   | Ship it!                                 | matilda |
| `memes-en/big-brain.mp3`                 | Big brain move.                          | callum  |

O áudio gerado é seu, dentro dos termos de uso do [OpenRouter](https://openrouter.ai/terms) e da
[ElevenLabs](https://elevenlabs.io/terms-of-use).

### Créditos obrigatórios

Os sons CC BY 3.0 pedem crédito ao autor. Cole estas linhas no painel ou na descrição do canal (o
`CREDITOS.txt` traz a lista completa):

- "Kdum-keesh" e "4-second roll" (Assorted Rimshots) por Kevin MacLeod (incompetech.com), CC BY 3.0
- "Sad Trombone" por Joe Lamb (soundbible.com), CC BY 3.0
- "Approx 800 laughter and clapter" por lonemonk (freesound.org), CC BY 3.0

## Direitos autorais: o que não colocar no soundboard

O pacote não baixa nada de sites como o MyInstants. A maioria dos botões desses sites traz trechos
de programas de TV, filmes, novelas, desenhos, músicas e vozes de famosos, enviados por usuários
sem licença. Na Twitch, esse material pode gerar notificações DMCA: o VOD ou o clipe sai do ar e o
canal leva um strike. Pela [política de DMCA da Twitch](https://legal.twitch.com/en/legal/dmca-guidelines/),
três strikes encerram a conta. Os VODs e clipes ficam guardados, então a notificação pode chegar
meses depois da live.

Regras práticas:

- Prefira sons CC0 ou de domínio público. Sons CC BY também servem, desde que você dê o crédito.
- Não use música, nem poucos segundos. Veja as
  [regras de música da Twitch](https://legal.twitch.com/en/legal/music/).
- Não use trechos de TV, cinema, novela, desenho, jogo ou vídeo de outra pessoa.
- Não clone nem imite a voz de pessoas reais. Frases genéricas numa voz sintética pronta estão
  liberadas.
- "Uso justo" (fair use) não protege a live: é uma defesa decidida caso a caso, depois da
  notificação.

## Problemas comuns

| Sintoma                                | Causa provável                                                      | O que fazer                                                             |
| -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| O botão não toca nada                  | Fonte `/overlay/audio` fora do OBS ou sem "Controlar áudio via OBS" | Siga o passo 3 da montagem manual em [obs.md](obs.md)                   |
| Um som aparece com erro no deck        | Arquivo corrompido, formato fora da lista ou mais de 2 minutos      | Troque o arquivo por outro e atualize a lista                           |
| Um meme toca muito mais alto que outro | Normalização desligada                                              | Ligue `sfx.normalize` ou ajuste o volume do botão                       |
| `npm run sfx:pack` mostra HTTP 403     | A Kenney bloqueou downloads seguidos                                | Espere alguns minutos ou baixe o zip pelo navegador e rode de novo      |
| `npm run sfx:pack` mostra HTTP 429     | Muitas requisições ao Wikimedia                                     | O script já espera e tenta de novo; rode outra vez mais tarde           |
| As falas de memes não foram geradas    | Falta `OPENROUTER_API_KEY` ou créditos no OpenRouter                | Defina a chave no `.env` ou adicione créditos, e rode o comando de novo |
