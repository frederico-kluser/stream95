---

name: react95-agent-skill
description: >-
Domínio completo do React95 (`@react95/core` 10, `@react95/icons` 2 e `@react95/clippy` 2) para
construir interfaces Windows 95 em React: Frame e tokens, Button, Input, TitleBar, Modal, TaskBar,
Tabs, List, Tree, ProgressBar, temas (35, troca em runtime), cascade layers do CSS, 1.131 ícones
sem inchar o bundle e o assistente Clippy (10 agentes). Use SEMPRE que for criar ou alterar UI com
React95, escolher componente/ícone/tema, depurar estilo que não aplica, montar janela, barra de
tarefas ou overlay de OBS no estilo Win95, ou integrar o Clippy. Não serve para o pacote antigo
`react95` (arturbien), que tem outra API.
metadata:
version: 1.0.0
type: knowledge
verified-against: '@react95/core 10.0.6 · @react95/icons 2.8.0 · @react95/clippy 2.2.3 · React 19.3'
---

# React95: guia para agentes

Tudo aqui foi verificado no código-fonte publicado e no Storybook oficial
(<https://react95.github.io/React95/?path=/story/all--all>), e posto à prova neste repositório
(stream95: overlays de OBS + painel). As referências detalhadas estão em `references/`; leia só a
que a tarefa pede.

## Quando usar

- Criar ou mudar qualquer tela com `@react95/core`, `@react95/icons` ou `@react95/clippy`.
- "O estilo não aplica", "a janela não fica azul", "a aba ativa pula", "o bundle ficou enorme".
- Trocar tema, criar tema próprio, deixar fundo transparente para OBS, escalar pixel art.

**Não use** para `react95` (pacote do arturbien: `Window`, `AppBar`, `ThemeProvider`,
`styleReset`). Nada disso existe em `@react95/core`. Se o código importa de `'react95'`, é a outra
biblioteca.

## Bootstrap em 4 passos

```bash
npm i @react95/core @react95/icons      # + @react95/clippy se quiser o assistente
npm i @vanilla-extract/dynamic          # só se for trocar de tema em runtime
```

```tsx
// main.tsx — exatamente UM tema + o GlobalStyle. Não existe Provider.
import '@react95/core/GlobalStyle';
import '@react95/core/themes/win95.css';
```

```tsx
// Janela estática (sem arrastar): Frame + TitleBar.
import { Button, Frame, TitleBar } from '@react95/core';
import { Notepad } from '@react95/icons/Notepad'; // import por subcaminho, nunca o barrel

export function Janela() {
  return (
    <Frame w="320px" bgColor="$material" boxShadow="$out" p="$2">
      <TitleBar active title="Bloco de notas" icon={<Notepad variant="16x16_4" />}>
        <TitleBar.OptionsBox>
          <TitleBar.Close />
        </TitleBar.OptionsBox>
      </TitleBar>
      <Frame p="$8">
        <Button>OK</Button>
      </Frame>
    </Frame>
  );
}
```

No Vite, adicione o plugin de `references/icons.md` que marca `@react95/icons` como sem efeitos
colaterais. Sem ele, cada ícone puxa os 1.131.

## Regras de ouro

1. **Um tema por página**, importado uma vez. Para trocar em runtime use
   `setElementVars(document.documentElement, contract, tokens[nome])` (`@vanilla-extract/dynamic`).
   Importar vários `themes/*.css` não "troca": todos escrevem em `:root`.
2. **O CSS do React95 vive em `@layer react95.*`**. Qualquer regra sua **sem layer** vence,
   seja qual for a especificidade. Não precisa de `!important`. O outro lado: resets sem layer
   (preflight do Tailwind 3, normalize, o `index.css` do create-vite) quebram o visual. Coloque-os
   num layer ou apague.
3. **`Frame` usa tokens, não números.** `w={200}` vira `width: 200` (inválido). Use `w="200px"` ou
   tokens: espaço `$0`…`$24`, cores (`bgColor="$material"`), sombras (`boxShadow="$out" | "$in"`).
   `bg` e `borderRadius` não têm escala de tokens.
4. **`Modal` tem um barramento global de foco**: só uma janela fica ativa (barra azul) por vez.
   Para várias janelas "ativas" ao mesmo tempo (overlays, mockups), use `Frame` +
   `TitleBar active`. `Modal` não tem `open`/`onClose`: fica aberto enquanto montado.
5. **`TaskBar`** só lê `list` e `className`, e precisa ser montado **antes** das janelas para
   receber os botões delas.
6. **`Tabs` não é controlado**: os títulos precisam ser únicos e estáveis (um contador no título,
   como "Fila (3)", faz a aba ativa pular) e os painéis inativos são desmontados (estado local
   some; guarde-o acima).
7. **`RadioButton`**: o texto é posicionado em absoluto a 18px do controle. Nunca coloque vários
   numa linha flex: o texto se sobrepõe. Empilhe-os.
8. **`ProgressBar`** recebe `width` como string (`"240px"`) e tem 20px de altura fixa. Para outra
   altura, sobrescreva o wrapper, `> div` e `> div > div` com CSS sem layer.
9. **`Dropdown`** sem `options` mostra caminhos de demonstração (`C:\Documents and Settings`…).
10. **Ícones**: importe por subcaminho (`@react95/icons/Computer`) e passe `variant`
    (`"16x16_4"`, `"32x32_4"`…). Alguns ícones só têm um tamanho (`InfoBubble`: só `32x32_4`);
    confira em `references/icons.md`.
11. **Pixel art nítida**: escale por inteiro. Para OBS em 1080p, desenhe num canvas lógico de
    960x540 e aplique `zoom: 2` no contêiner. Escala fracionária borra fontes e bordas.
12. **Testes (Vitest)**: o React95 importa `.css` de dentro do pacote. Adicione
    `server: { deps: { inline: [/@react95\//, /clippyjs/] } }` ou os testes falham com
    `Unknown file extension ".css"`.

## Clippy (`@react95/clippy`)

```tsx
import { ClippyProvider, useClippy } from '@react95/clippy';
import { useEffect } from 'react';

function Assistente() {
  const { clippy } = useClippy(); // undefined até o agente carregar
  useEffect(() => {
    if (!clippy) return;
    clippy.play(clippy.animations().includes('Wave') ? 'Wave' : 'Greeting');
  }, [clippy]);
  return null;
}

<ClippyProvider agentName="Clippy">
  <Assistente />
</ClippyProvider>;
```

- Agentes: Clippy, Merlin, Rover, Links, Bonzi, Peedy, Genie, Genius, Rocky e F1.
- O elemento do agente (`clippy._el`) é anexado ao `<body>`, **fora** de qualquer `zoom` do seu
  layout. Para posicioná-lo, aplique `position: fixed`, `left`/`top` em pixels reais e
  `transform: scale(n)` com `n` inteiro.
- O sprite ocupa um quadro de 124x93; a parte visível vai de x+16 a x+112 e de y+3 a y+92.
  Reserve esse retângulo no layout para ele não cobrir conteúdo.
- Monte **um** provider. Trocar `agentName` toca `Hide`, descarta o agente e carrega outro.

## Mapa rápido

| Preciso de…                       | Use                                                                             | Referência                    |
| --------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| Superfície, caixa, espaçamento    | `Frame`                                                                         | `frame-and-layout.md` §1–3    |
| Janela arrastável com foco        | `Modal` + `useModal()`                                                          | `components.md` → Modal       |
| Janela estática (overlay, mockup) | `Frame` + `TitleBar active`                                                     | `frame-and-layout.md` §5.3    |
| Barra de tarefas e menu Iniciar   | `TaskBar` + `List`                                                              | `frame-and-layout.md` §5.6    |
| Abas (Propriedades)               | `Tabs` + `Tab`                                                                  | `components.md` → Tabs        |
| Formulário                        | `Input`, `TextArea`, `Checkbox`, `RadioButton`, `Dropdown`, `Range`, `Fieldset` | `components.md`               |
| Progresso                         | `ProgressBar`                                                                   | `components.md` → ProgressBar |
| Árvore de pastas                  | `Tree`                                                                          | `components.md` → Tree        |
| Caixa de mensagem                 | `Alert`                                                                         | `components.md` → Alert       |
| Fundo transparente (OBS)          | regras para `body`/`html`                                                       | `frame-and-layout.md` §5.11   |
| Tema próprio ou troca de tema     | `contract`, `tokens`, `setElementVars`                                          | `theming-and-css.md` §5–6     |
| Ícone certo                       | busca por categoria ou nome                                                     | `icons.md`                    |
| Exemplo oficial de um componente  | história do Storybook                                                           | `storybook-map.md`            |

## Referências

| Arquivo                                                                  | Leia quando                                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [`references/components.md`](references/components.md)                   | Vai usar qualquer componente: props reais, padrões, armadilhas e o que **não** existe na v10                                                  |
| [`references/frame-and-layout.md`](references/frame-and-layout.md)       | Vai montar layout: catálogo de props do `Frame`, superfícies Win95 e 12 receitas (desktop, barra de tarefas, diálogo de abas, overlay de OBS) |
| [`references/theming-and-css.md`](references/theming-and-css.md)         | Estilo não aplica, tema novo, troca de tema, cascade layers, `GlobalStyle`, cursores                                                          |
| [`references/icons.md`](references/icons.md)                             | Precisa de um ícone: imports, `variant`, plugin do Vite e índice dos 1.131                                                                    |
| [`references/clippy.md`](references/clippy.md)                           | Vai usar o Clippy ou outro agente: provider, hook, animações e alternativas                                                                   |
| [`references/recipes-and-gotchas.md`](references/recipes-and-gotchas.md) | Bootstrap (Vite, Next.js), React 19, bundle, acessibilidade, z-index, bugs conhecidos                                                         |
| [`references/storybook-map.md`](references/storybook-map.md)             | Quer o exemplo oficial de um componente no Storybook                                                                                          |

## Como este repositório usa o React95

- Janelas com "buracos" transparentes para câmera e capturas: `Frame` + `TitleBar active` com
  `clip-path: polygon(evenodd, ...)` (`apps/overlay/src/components/Win.tsx`).
- Canvas lógico 960x540 com `zoom: 2` (`apps/overlay/src/components/Stage.tsx`).
- Troca de tema em runtime com `setElementVars` (`apps/overlay/src/lib/themes.ts`).
- Clippy posicionado fora do zoom, com retângulo reservado por cena e teste que impede sobreposição
  (`apps/overlay/src/components/ClippyStage.tsx`, `packages/shared/src/layout.ts`).
- Overrides de estilo sempre em classes `s95-*` sem layer (`apps/overlay/src/styles.css`).

## Ao terminar uma mudança visual

1. Rode a página e olhe (no stream95: `?checker` mostra as áreas transparentes).
2. Confira se nenhum `!important` ou reset sem layer entrou.
3. Confira imports de ícones por subcaminho e com `variant`.
4. Se descobriu uma armadilha nova, registre-a em `references/recipes-and-gotchas.md` §8.
