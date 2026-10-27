# Theming & CSS — `@react95/core` 10.0.6

Verified against the repo (commit `97bd045`) and the compiled CSS in the published tarball.
Source: `packages/core/components/themes/*`, `GlobalStyle/*`, `Cursor/*`, `shared/layers.css.ts`.

## 1. How the CSS ships

- React95 v8+ is written with **vanilla-extract** and published as **precompiled static CSS**
  (no runtime CSS-in-JS, no styled-components, no build plugin needed in your app).
- Every component's JS module imports its own stylesheet, e.g. `esm/Button/Button.css.mjs`
  starts with `import './Button.css.ts.vanilla.css';`. Importing a component therefore pulls
  its CSS; your bundler must handle `.css` imports from `node_modules` (Vite, Next.js, Parcel,
  webpack + css-loader do).
- Class names are hashed (`r95_1bzq74l0`, theme files `r95_theme_<name>_<hash>`) and unstable:
  never target them. Style through Frame props, `className`/`style`, or the CSS variables.
- Two global stylesheets are opt-in imports (both are plain `.css` files in the exports map):

```ts
import '@react95/core/GlobalStyle'; // fonts, body font/color, box-sizing, links, scrollbars
import '@react95/core/themes/win95.css'; // ONE theme = the --r95-* CSS variables on :root
```

The theme is effectively **required**: every component reads `var(--r95-…)`; without a theme
the variables are undefined (no colors, paddings collapse). GlobalStyle is "optional" per the
README but needed for the look (MS Sans Serif font, 12px body text, Video's LCD font).
The GlobalStyle docs say: import it once, **before** the theme.
- No provider/component is involved (`ThemeProvider` and `<GlobalStyle />` were removed in v8).

Published CSS sizes (10.0.6, unminified): GlobalStyle **473 KB** (fonts are base64-inlined),
each theme ~1.9 KB, Frame style-prop atoms ~15 KB, Cursor 12.7 KB (inlined PNGs), each
component 0.5–3.5 KB.

`package.json` has `"sideEffects": ["**/*.{woff2,woff,ttf,eot}"]` (CSS is not listed). Vite
keeps CSS imports anyway; Next.js and CRA mark CSS rules `sideEffects: true`. With a custom
webpack config, add `sideEffects: true` to your CSS rule or production builds may drop the
CSS imports (webpack's documented behavior — not reproduced here).

## 2. Cascade layers (new in v10)

Every component stylesheet and GlobalStyle declares the full order first (the theme, Frame
and Cursor stylesheets are unlayered and declare nothing):

```css
@layer react95;
@layer react95.global;
@layer react95.components;
@layer react95.composed;
```

| Layer                | Contains                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `react95.global`     | GlobalStyle rules (box-sizing, body, links, scrollbars).                                                                                  |
| `react95.components` | Component styles (Button, Input, List, Modal, Tabs, Tree, …).                                                                             |
| `react95.composed`   | Components that restyle what they render: Alert, TitleBar (bar + options), TaskBar, Video.                                                |
| **unlayered**        | Theme variables (`:root { --r95-… }`), **Frame style-prop classes**, **Cursor classes**, `@font-face`, and all of your own unlayered CSS. |

Consequences:

1. Any **unlayered** CSS of yours beats React95 regardless of specificity:
   `.my-button { background: teal }` or even `button { padding: 0 }` wins.
2. Frame props (`<Button p="$2">`) and `Cursor.*` classes always beat component styles.
3. **CSS resets now break React95** if they are unlayered (normalize.css, Tailwind v3 preflight:
   `button { padding: 0; background-color: transparent }`). Put the reset in a layer **before**
   `react95`, and declare the order **before any CSS loads** (the first order the browser sees
   wins — each React95 component file re-declares `react95` first):

```html
<!-- index.html <head>, before any stylesheet/script -->
<style>
  @layer reset, react95;
</style>
```

```css
@layer reset {
  /* normalize.css / your reset here */
}
```

Tailwind v4 (already layered: `theme, base, components, utilities`) — README recipe, put
`react95` after preflight (`base`) and before utilities so `className="p-4"` still wins:

```html
<style>
  @layer theme, base, react95, components, utilities;
</style>
```

Alternative to the `<head>` tag: make the very first CSS your app imports start with the
`@layer …;` statement (import it before any React95 module/CSS).

Tailwind v3 (preflight is unlayered): either disable it
(`corePlugins: { preflight: false }`) or wrap it — `@layer reset { @tailwind base; }` plus the
`@layer reset, react95;` order statement (wrapping is **unverified** with Tailwind v3).
Note: the official `React95/nextjs-template` (built for v9, Tailwind 3.4) imports
`globals.css` with unlayered preflight — on v10 its Buttons lose padding/background until
you apply one of these fixes.
4. To override a component, plain unlayered CSS is enough; if you use your own layers, they
must come **after** `react95` in the order statement to win.

## 3. Themes

### Applying a theme

`import '@react95/core/themes/<name>.css'` — the file is a single unlayered rule
`:root { --r95-…: … }` generated by `createGlobalTheme(':root', contract, tokens)`. No class
names, no provider. All 35 theme files target the same selector, so importing two means the
last one in the CSS order wins; don't import several to "switch" (see §5).

### All 35 themes (exact import names)

`azureOrange`, `bee`, `blackAndWhite`, `brick`, `candy`, `coldGray`, `counterStrike`,
`eggplant`, `highContrast`, `lilac`, `lilacRoseDark`, `maple`, `marine`, `matrix`,
`millenium`, `modernDark`, `molecule`, `ninjaTurtles`, `olive`, `pamelaAnderson`, `plum`,
`rainyDay`, `rose`, `slate`, `spruce`, `storm`, `theSixtiesUSA`, `tokyoDark`, `tooSexy`,
`travel`, `vaporTeal`, `vermillion`, `violetDark`, `water`, `win95`.

CSS: `@react95/core/themes/<name>.css` · raw values (JS): `@react95/core/themes/tokens/<name>`
(exports `tokens`) or `import { tokens } from '@react95/core'` (`tokens.<name>`).

Key colors (from `themes/tokens/*.ts`):

| Theme            | material  | materialText | headerBackground                              | headerText | headerNotActiveBackground                         | canvas    | canvasText | inputBackground | progress  | anchor    |
| ---------------- | --------- | ------------ | --------------------------------------------- | ---------- | ------------------------------------------------- | --------- | ---------- | --------------- | --------- | --------- |
| `azureOrange`    | `#0180ff` | `#000000`    | `#171123`                                     | `#ffffff`  | `#4E6766`                                         | `#000000` | `#ffffff`  | `#ffffff`       | `#F46036` | `#1034a6` |
| `bee`            | `#e5bd03` | `#0C1618`    | `#0C1618`                                     | `#f8df6e`  | `#7F7B82`                                         | `#0C1618` | `#ffffff`  | `#ffffff`       | `#0C1618` | `#1034a6` |
| `blackAndWhite`  | `#ffffff` | `#000000`    | `#000000`                                     | `#ffffff`  | `#ffffff`                                         | `#000000` | `#ffffff`  | `#ffffff`       | `#000000` | `#1034a6` |
| `brick`          | `#c2bfa3` | `#020000`    | `#8e0101`                                     | `#ffffff`  | `#90885c`                                         | `#ffffff` | `#020000`  | `#ffffff`       | `#8e0101` | `#1034a6` |
| `candy`          | `#E5A4CB` | `#000000`    | `#87255B`                                     | `#EFF1F3`  | `#a08796`                                         | `#EFF1F3` | `#000000`  | `#ffffff`       | `#256EFF` | `#1034a6` |
| `coldGray`       | `#a1a3ca` | `#010601`    | `#3B3D64`                                     | `#e2e4ed`  | `#6063a5`                                         | `#3B3D64` | `#050608`  | `#ffffff`       | `#8d88c2` | `#8d88c2` |
| `counterStrike`  | `#4b5844` | `#f6fbf5`    | `#4b5844`                                     | `#fefefe`  | `#4b5844`                                         | `#3e4639` | `#f6fbf5`  | `#4b5844`       | `#978830` | `#1034a6` |
| `eggplant`       | `#89b0a8` | `#050608`    | `#4b8178`                                     | `#ffffff`  | `#89b0a8`                                         | `#000000` | `#050608`  | `#ffffff`       | `#4b8178` | `#1034a6` |
| `highContrast`   | `#000000` | `#ffffff`    | `#8e0284`                                     | `#ffffff`  | `#7f7f7f`                                         | `#353535` | `#ffffff`  | `#353535`       | `#8e0284` | `#1034a6` |
| `lilac`          | `#b1a7df` | `#050608`    | `#5e4dba`                                     | `#ffffff`  | `#7f7f81`                                         | `#ffffff` | `#050608`  | `#ffffff`       | `#5e4dba` | `#1034a6` |
| `lilacRoseDark`  | `#b26496` | `#000000`    | `#4C0030`                                     | `#dab1c7`  | `#763a60`                                         | `#000000` | `#f6dfee`  | `#ffffff`       | `#713259` | `#a65387` |
| `maple`          | `#e5cc90` | `#2a1801`    | `#8e0101`                                     | `#ffffff`  | `#a1a0a5`                                         | `#2a1801` | `#ffffff`  | `#ffffff`       | `#8e0101` | `#1034a6` |
| `marine`         | `#75c1ba` | `#050608`    | `#000080`                                     | `#ffffff`  | `#7f7f7f`                                         | `#050608` | `#c3e2da`  | `#ffffff`       | `#000080` | `#1034a6` |
| `matrix`         | `#535353` | `#35FF69`    | `#000000`                                     | `#a7a7a7`  | `#7f7f7f`                                         | `#000000` | `#c0c0c0`  | `#ffffff`       | `#000000` | `#1034a6` |
| `millenium`      | `#d6cfc7` | `black`      | `linear-gradient(to right, #012470, #a5c7e7)` | `#ffffff`  | `#7f7f7f`                                         | `black`   | `#ffffff`  | `#ffffff`       | `#00256e` | `#1034a6` |
| `modernDark`     | `#202127` | `#f88702`    | `#4b4d58`                                     | `#202127`  | `transparent`                                     | `#000000` | `#4b4d58`  | `#ffffff`       | `#f88702` | `#1034a6` |
| `molecule`       | `#c2c1c2` | `#020102`    | `#a03d49`                                     | `#f1f5f6`  | `#7f7f7f`                                         | `#020102` | `#f1f5f6`  | `#ffffff`       | `#a03d49` | `#1034a6` |
| `ninjaTurtles`   | `#00a800` | `#000000`    | `#FF1D15`                                     | `#ffffff`  | `#7f7f7f`                                         | `#000000` | `#ffffff`  | `#ffffff`       | `#FF1D15` | `#1034a6` |
| `olive`          | `#807f00` | `#000000`    | `#F3DE2C`                                     | `#000000`  | `#4f4c02`                                         | `#000000` | `#ffffff`  | `#ffffff`       | `#F3DE2C` | `#1034a6` |
| `pamelaAnderson` | `#ff0080` | `#000000`    | `#FF8CC6`                                     | `#000000`  | `#95818D`                                         | `#000000` | `#F5CCE8`  | `#fec0dc`       | `#004FFF` | `#1034a6` |
| `plum`           | `#ac978f` | `#050608`    | `#483f63`                                     | `#ffffff`  | `#7d5e58`                                         | `#050608` | `#dad0c7`  | `#ffffff`       | `#483f63` | `#1034a6` |
| `rainyDay`       | `#7a99b3` | `#050608`    | `#4b6480`                                     | `#ffffff`  | `#7f7f81`                                         | `#050608` | `#ffffff`  | `#ffffff`       | `#4b6480` | `#1034a6` |
| `rose`           | `#d6adb8` | `#050608`    | `#ab5a71`                                     | `#ffffff`  | `#a19fa5`                                         | `#050608` | `#ffffff`  | `#ffffff`       | `#ab5a71` | `#1034a6` |
| `slate`          | `#97b9cb` | `#00010f`    | `#448199`                                     | `#f2ffff`  | `#807f80`                                         | `#00010f` | `#f2ffff`  | `#ffffff`       | `#448199` | `#1034a6` |
| `spruce`         | `#99c9a8` | `#050608`    | `#3d9961`                                     | `#fcfff6`  | `#807f80`                                         | `#050608` | `#fcfff6`  | `#ffffff`       | `#3d9961` | `#1034a6` |
| `storm`          | `#c6c6c6` | `#0a0a0a`    | `linear-gradient(to right, #8c0184, #0089ad)` | `#ffffff`  | `linear-gradient(to right, #7f7f81, transparent)` | `#0a0a0a` | `#ffffff`  | `#ffffff`       | `#8c0184` | `#1034a6` |
| `theSixtiesUSA`  | `#d067d7` | `#010001`    | `#050080`                                     | `#ffffff`  | `#a130a9`                                         | `#010001` | `#ffffff`  | `#ffffff`       | `#0f0`    | `#1034a6` |
| `tokyoDark`      | `#465051` | `#F4F4ED`    | `#1f2223`                                     | `#F4F4ED`  | `#5e696a`                                         | `#2f3435` | `#F4F4ED`  | `#ffffff`       | `#F61067` | `#1034a6` |
| `tooSexy`        | `#B80100` | `#000000`    | `#161B33`                                     | `#FFF1D0`  | `#5a0302`                                         | `#000000` | `#FFF1D0`  | `#ffffff`       | `#474973` | `#1034a6` |
| `travel`         | `#908070` | `#28251e`    | `#404878`                                     | `#d8d0c8`  | `#605848`                                         | `#28251e` | `#d8d0c8`  | `#ffffff`       | `#48604f` | `#1034a6` |
| `vaporTeal`      | `#01a8a8` | `#000000`    | `#246A73`                                     | `#58ffff`  | `#2fcecd`                                         | `#000000` | `#98DFEA`  | `#ffffff`       | `#FF99C8` | `#1034a6` |
| `vermillion`     | `#cf4545` | `#130405`    | `#000103`                                     | `#EFE9F4`  | `#7f2120`                                         | `#130405` | `#EFE9F4`  | `#ffffff`       | `#000103` | `#1034a6` |
| `violetDark`     | `#652a6d` | `#c57ece`    | `#1034a6`                                     | `#010601`  | `#210e23`                                         | `#18051a` | `#c47bcc`  | `#ffffff`       | `#000080` | `#1034a6` |
| `water`          | `#ced0cf` | `#050608`    | `#72b3b4`                                     | `#ffffff`  | `#9a9e9c`                                         | `#050608` | `#ffffff`  | `#ffffff`       | `#72b3b4` | `#72b3b4` |
| `win95`          | `#c3c7cb` | `#000000`    | `#000e7a`                                     | `#fefefe`  | `#7f787f`                                         | `#000000` | `#ffffff`  | `#ffffff`       | `#000e7a` | `#000e7a` |

Theme caveats:
- `millenium`/`storm` use a **gradient** for `headerBackground` (and `storm` for
  `headerNotActiveBackground`): fine where React95 uses `background:` (TitleBar, List hover),
  invalid in `background-color` (`bgColor="$headerBackground"`) — use
  `style={{ background: contract.colors.headerBackground }}` instead.
- The TitleBar title is always painted white (white `text-shadow` on transparent text), so
  themes with a dark `headerText` (`olive`, `pamelaAnderson`, `modernDark`, `violetDark`) show
  white titles on light bars. Override with unlayered CSS on the title `div` if needed.
- There is no "desktop/background" token: the classic teal desktop (`#008080`) is yours to set.

## 4. The theme contract (every token)

`import { contract } from '@react95/core'` (or `@react95/core/contract`, which also exports
the raw `zIndices` and `theme` objects). `contract.*` values are CSS `var()` strings, e.g.
`contract.colors.material === 'var(--r95-color-material)'`. Variable naming:
`--r95-space-N`, `--r95-color-<name>`, `--r95-zIndex-<name>`, `--r95-shadow-<name>`.

### Colors (21)

| Token (`contract.colors.*`, Frame `$name`) | CSS variable                             | win95     | Controls (verified by usage in components)                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anchor`                                   | `--r95-color-anchor`                     | `#000e7a` | Link color (GlobalStyle `a`).                                                                                                                                                                                             |
| `anchorVisited`                            | `--r95-color-anchorVisited`              | `#440381` | Visited link color.                                                                                                                                                                                                       |
| `borderDark`                               | `--r95-color-borderDark`                 | `#868a8e` | Dark bevel edge: Button, Input/TextArea/Dropdown/Checkbox/ProgressBar top-left borders, Fieldset bottom/right, Tabs, List divider, Modal menu line, Avatar ring, Range, Video, scrollbars; baked into `shadows.out`/`in`. |
| `borderDarkest`                            | `--r95-color-borderDarkest`              | `#000000` | Outer/black edge: Button outer shadow & pressed outline, Dropdown, Tabs, TaskBar, Tree lines and +/- box, Range; baked into `shadows.out`/`input`.                                                                        |
| `borderLight`                              | `--r95-color-borderLight`                | `#d2d2d2` | Disabled Checkbox text shadow, Range track, scrollbar thumb.                                                                                                                                                              |
| `borderLighter`                            | `--r95-color-borderLighter`              | `#e6e6e6` | Fieldset groove, Modal menu-bar highlight, Range, active TaskBar window button background.                                                                                                                                |
| `borderLightest`                           | `--r95-color-borderLightest`             | `#ffffff` | Highlight edge on raised elements, Tooltip background, scrollbar track; baked into all three shadows.                                                                                                                     |
| `canvas`                                   | `--r95-color-canvas`                     | `#000000` | Video LCD counter background.                                                                                                                                                                                             |
| `canvasText`                               | `--r95-color-canvasText`                 | `#ffffff` | Video LCD counter text.                                                                                                                                                                                                   |
| `headerBackground`                         | `--r95-color-headerBackground`           | `#000e7a` | Active TitleBar background; List item hover background.                                                                                                                                                                   |
| `headerNotActiveBackground`                | `--r95-color-headerNotActiveBackground`  | `#7f787f` | Inactive TitleBar background.                                                                                                                                                                                             |
| `headerNotActiveText`                      | `--r95-color-headerNotActiveText`        | `#c6c6c6` | Inactive TitleBar `color`.                                                                                                                                                                                                |
| `headerText`                               | `--r95-color-headerText`                 | `#fefefe` | Active TitleBar `color` (the title glyphs themselves are white).                                                                                                                                                          |
| `material`                                 | `--r95-color-material`                   | `#c3c7cb` | Face color of raised UI: Button, List, Modal, Tabs, TaskBar, Avatar, Dropdown caret, Range thumb, Video, scrollbars; inner edge of `shadows.input`.                                                                       |
| `materialText`                             | `--r95-color-materialText`               | `#000000` | Default text: body (GlobalStyle), Button, Input, Dropdown, List, Modal menus, TaskBar, ProgressBar label, Video glyphs.                                                                                                   |
| `materialTextDisabled`                     | `--r95-color-materialTextDisabled`       | `#868a8e` | Disabled Button text, disabled RadioButton label.                                                                                                                                                                         |
| `materialTextDisabledShadow`               | `--r95-color-materialTextDisabledShadow` | `#d2d2d2` | Disabled RadioButton label text-shadow.                                                                                                                                                                                   |
| `materialTextInvert`                       | `--r95-color-materialTextInvert`         | `#ffffff` | List item hover text, open Modal menu text, ProgressBar filled label.                                                                                                                                                     |
| `progress`                                 | `--r95-color-progress`                   | `#000e7a` | ProgressBar fill.                                                                                                                                                                                                         |
| `inputBackground`                          | `--r95-color-inputBackground`            | `#ffffff` | Input/TextArea, Checkbox box, Dropdown select, ProgressBar empty bar, Tree +/- box.                                                                                                                                       |
| `inputBackgroundDisabled`                  | `--r95-color-inputBackgroundDisabled`    | `#d2d2d2` | Disabled Checkbox box.                                                                                                                                                                                                    |

### Space (Frame `$0`…`$22`)

`contract.space['0'…'22']` → `--r95-space-0` … `--r95-space-22` = `0px` … `22px` (1px steps).
Only 0–22 exist (`$23`, `$24`, `$100` are **not** tokens and stay as invalid literals).

### zIndices

| Token                  | Variable               | Value | Used by                                 |
| ---------------------- | ---------------------- | ----- | --------------------------------------- |
| `modal` (`$modal`)     | `--r95-zIndex-modal`   | `2`   | The active Modal window.                |
| `tooltip` (`$tooltip`) | `--r95-zIndex-tooltip` | `3`   | Declared but not used by any component. |
| `taskbar` (`$taskbar`) | `--r95-zIndex-taskbar` | `3`   | TaskBar, Tooltip tip, List submenus.    |

### Shadows (Frame `boxShadow="$out" | "$in" | "$input"`)

Generated per theme by `generateShadows(colors)` in `themes/baseTheme.ts` (literal colors are
baked in, so a scoped theme must redefine the shadows too):

```ts
export const generateShadows = (colors: IColors) => {
  return {
    out: `inset 0.5px 0.5px 0px 0.5px ${colors.borderLightest},
          inset 0 0 0 1px ${colors.borderDark},
          1px 0px 0 0px ${colors.borderDarkest},
          0px 1px 0 0px ${colors.borderDarkest},
          1px 1px 0 0px ${colors.borderDarkest}`,
    in: `inset 0px 0px 0px 0px,
        inset 1px 1px 0px 0px ${colors.borderDark},
        0.5px 0.5px 0px 0.5px ${colors.borderLightest}`,
    input: `inset -1px -1px 0 0 ${colors.material},
            inset 1px 1px 0 0 ${colors.borderDarkest},
            0.5px 0.5px 0 0.5px ${colors.borderLightest}`,
  };
};
```

`out` = raised (windows, List, TaskBar, Tabs panel); `in` = sunken (Avatar, TaskBar clock,
content wells); `input` = field (Input, Checkbox box, ProgressBar).

### Using tokens in your own code

```tsx
import { contract } from '@react95/core';

<div style={{ background: contract.colors.material, padding: contract.space[8], boxShadow: contract.shadows.out }} />
<Frame bgColor="$material" p="$8" boxShadow="$out" />          {/* same, via Frame */}
```

```css
.status {
  color: var(--r95-color-materialText);
  box-shadow: var(--r95-shadow-in);
}
```

## 5. Switching themes at runtime

Built-in theme CSS always targets `:root`, so runtime switching is done with the CSS
variables — exactly what the repo's Storybook does (`.storybook/decorators/Frame.tsx`):

```tsx
// npm i @vanilla-extract/dynamic   (already a dependency of @react95/core; add it explicitly for pnpm)
import { useEffect } from 'react';
import { setElementVars } from '@vanilla-extract/dynamic';
import { contract, tokens } from '@react95/core';
import '@react95/core/themes/win95.css'; // static default for first paint / no-JS

export type ThemeName = keyof typeof tokens; // 'win95' | 'matrix' | …

export function useReact95Theme(name: ThemeName) {
  useEffect(() => {
    // inline CSS variables on <html> win over any :root theme stylesheet
    setElementVars(document.documentElement, contract, tokens[name] ?? tokens.win95);
  }, [name]);
}
```

Scoped theme for one subtree (Storybook's theme panel does this):

```tsx
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { contract, tokens } from '@react95/core';

<div style={assignInlineVars(contract, tokens.matrix)}>
  {/* every React95 component rendered inside (DOM descendants) uses the matrix theme */}
</div>;
```

Notes: CSS variables inherit through the DOM, not visual position, so fixed windows/TaskBar
rendered inside the wrapper follow it; portals to `document.body` and GlobalStyle's `body`
text/scrollbars do not. For SSR without a flash, put `style={assignInlineVars(contract,
tokens[name])}` on the server-rendered wrapper/`<html>`.

CSS-only alternative: define classes that set every `--r95-*` variable (copy the block in §6)
and toggle the class on `<html>`/a wrapper. Don't import several theme files or `import()`
them dynamically to switch: loaded CSS can't be unloaded and they all target `:root`.

## 6. Creating a custom theme

A theme = `{ space, zIndices, colors, shadows }` matching the contract (all 21 colors).
`themes/baseTheme` (`theme`, `generateShadows`) is **not** in the exports map —
`import … from '@react95/core/themes/baseTheme'` (shown in the "Contract → Custom Theme"
story) fails in exports-aware resolvers. Copy `generateShadows` from §4 or start from a token set:

```ts
// my-theme.ts — no build plugin needed (apply with setElementVars/assignInlineVars)
import { tokens } from '@react95/core';

const generateShadows = (c: typeof tokens.win95.colors) => ({
  out: `inset 0.5px 0.5px 0px 0.5px ${c.borderLightest}, inset 0 0 0 1px ${c.borderDark}, 1px 0px 0 0px ${c.borderDarkest}, 0px 1px 0 0px ${c.borderDarkest}, 1px 1px 0 0px ${c.borderDarkest}`,
  in: `inset 0px 0px 0px 0px, inset 1px 1px 0px 0px ${c.borderDark}, 0.5px 0.5px 0px 0.5px ${c.borderLightest}`,
  input: `inset -1px -1px 0 0 ${c.material}, inset 1px 1px 0 0 ${c.borderDarkest}, 0.5px 0.5px 0 0.5px ${c.borderLightest}`,
});

const colors = { ...tokens.win95.colors, material: '#d4d0c8', headerBackground: '#0a246a', progress: '#0a246a' };
export const win98ish = { ...tokens.win95, colors, shadows: generateShadows(colors) };
// setElementVars(document.documentElement, contract, win98ish)
```

With vanilla-extract in your app (`@vanilla-extract/css` + e.g. `@vanilla-extract/vite-plugin`),
the story's approach works in a `.css.ts` file:

```ts
// custom-theme.css.ts
import { createGlobalTheme } from '@vanilla-extract/css';
import { contract } from '@react95/core';
import { tokens as cs16 } from '@react95/core/themes/tokens/counterStrike';

createGlobalTheme('.contract-story', contract, {
  ...cs16,
  colors: {
    ...cs16.colors,
    material: 'thistle',
    headerBackground: 'tomato',
    materialText: '#1a1a1a',
    headerText: '#1a1a1a',
  },
}); // use ':root' instead of a class for a global theme
```

Plain CSS starting point (the compiled `win95.css`; change values, keep every variable):

```css
:root {
  /* or .my-theme */
  --r95-zIndex-modal: 2;
  --r95-zIndex-tooltip: 3;
  --r95-zIndex-taskbar: 3;
  --r95-space-0: 0px;
  --r95-space-1: 1px;
  --r95-space-2: 2px;
  --r95-space-3: 3px;
  --r95-space-4: 4px;
  --r95-space-5: 5px;
  --r95-space-6: 6px;
  --r95-space-7: 7px;
  --r95-space-8: 8px;
  --r95-space-9: 9px;
  --r95-space-10: 10px;
  --r95-space-11: 11px;
  --r95-space-12: 12px;
  --r95-space-13: 13px;
  --r95-space-14: 14px;
  --r95-space-15: 15px;
  --r95-space-16: 16px;
  --r95-space-17: 17px;
  --r95-space-18: 18px;
  --r95-space-19: 19px;
  --r95-space-20: 20px;
  --r95-space-21: 21px;
  --r95-space-22: 22px;
  --r95-color-anchor: #000e7a;
  --r95-color-anchorVisited: #440381;
  --r95-color-borderDark: #868a8e;
  --r95-color-borderDarkest: #000000;
  --r95-color-borderLight: #d2d2d2;
  --r95-color-borderLighter: #e6e6e6;
  --r95-color-borderLightest: #ffffff;
  --r95-color-canvas: #000000;
  --r95-color-canvasText: #ffffff;
  --r95-color-headerBackground: #000e7a;
  --r95-color-headerNotActiveBackground: #7f787f;
  --r95-color-headerNotActiveText: #c6c6c6;
  --r95-color-headerText: #fefefe;
  --r95-color-material: #c3c7cb;
  --r95-color-materialText: #000000;
  --r95-color-materialTextDisabled: #868a8e;
  --r95-color-materialTextDisabledShadow: #d2d2d2;
  --r95-color-materialTextInvert: #ffffff;
  --r95-color-progress: #000e7a;
  --r95-color-inputBackground: #ffffff;
  --r95-color-inputBackgroundDisabled: #d2d2d2;
  --r95-shadow-out:
    inset 0.5px 0.5px 0px 0.5px #ffffff, inset 0 0 0 1px #868a8e, 1px 0px 0 0px #000000, 0px 1px 0 0px #000000,
    1px 1px 0 0px #000000;
  --r95-shadow-in: inset 0px 0px 0px 0px, inset 1px 1px 0px 0px #868a8e, 0.5px 0.5px 0px 0.5px #ffffff;
  --r95-shadow-input: inset -1px -1px 0 0 #c3c7cb, inset 1px 1px 0 0 #000000, 0.5px 0.5px 0 0.5px #ffffff;
}
```

A plain `:root` override competes with the theme file by source order (same specificity):
load it after the theme, or use `:root:root` / a class on `<html>`.

Tweaking z-indices (e.g. windows above your own sticky header) — change the variables, not
the Modal's `zIndex` prop (a Frame `zIndex` overrides the active/inactive logic):
`:root:root { --r95-zIndex-modal: 1000; --r95-zIndex-taskbar: 1001; }`.

## 7. GlobalStyle (`@react95/core/GlobalStyle`)

Exact content (layer `react95.global` unless noted):

| Rule                              | Declarations                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@font-face` (unlayered)          | `MS Sans Serif` normal (TTF), `MS Sans Serif` bold (TTF; declares `font-style: bold`, an invalid descriptor — harmless), `React95Video-Numbers` (woff2, woff, ttf, eot). All base64 data URIs. |
| `*, *::before, *::after`          | `box-sizing: border-box`                                                                                                                                                                       |
| `html`                            | `font-size: 100%`                                                                                                                                                                              |
| `body`                            | `margin: 0; padding: 0; font-family: MS Sans Serif; font-size: 12px; color: var(--r95-color-materialText)`                                                                                     |
| `button, input, select, textarea` | `font-family: inherit`                                                                                                                                                                         |
| `a` / `a:visited`                 | `color: anchor` / `anchorVisited`                                                                                                                                                              |
| `::-webkit-scrollbar*`            | 17px Win95 scrollbars: checkerboard track, beveled thumb/buttons, triangle arrows (Chromium/WebKit only; Firefox keeps native scrollbars).                                                     |
- No `background` on `html`/`body` (good for transparent OBS overlays; set your own desktop color).
- v10 change: v9 forced `* { font-family: MS Sans Serif }`; v10 sets it on `body` and lets
  controls inherit. If your app sets `body { font-family: … }` (unlayered), React95
  components follow it — scope `font-family: 'MS Sans Serif'` to your React95 area if needed.
- Use the fonts anywhere: `font-family: 'MS Sans Serif'` (12px looks crispest — it's a
  pixel font) and `font-family: 'React95Video-Numbers', monospace` (LCD digits).
- The scrollbar arrow SVGs embed `var(--r95-color-materialText)` inside a data-URI image,
  where CSS variables can't resolve — expect default (black) arrows in every theme (by code
  analysis; not checked visually).

## 8. Cursor helpers

`import { Cursor } from '@react95/core'` (or `@react95/core/Cursor`). Each key is a class name
(unlayered, so it beats component styles) with a 32×32 Win95 PNG and a CSS fallback keyword:

| Class          | Fallback        | Image            | Class        | Fallback      | Image              |
| -------------- | --------------- | ---------------- | ------------ | ------------- | ------------------ |
| `Auto`         | `auto`          | Arrow.png        | `RowResize`  | `row-resize`  | RowResize.png      |
| `Text`         | `text`          | Text.png         | `NResize`    | `n-resize`    | UpArrow.png        |
| `VerticalText` | `vertical-text` | VText.png        | `EResize`    | `e-resize`    | RightArrow.png     |
| `Help`         | `help`          | Help.png         | `SResize`    | `s-resize`    | DownArrow.png      |
| `Crosshair`    | `crosshair`     | Cross.png        | `WResize`    | `w-resize`    | LeftArrow.png      |
| `Pointer`      | `pointer`       | HandPointer.png  | `NsResize`   | `ns-resize`   | UpDownArrow.png    |
| `Progress`     | `progress`      | AppStarting.png  | `EwResize`   | `ew-resize`   | LeftRight.png      |
| `Wait`         | `wait`          | Wait.png         | `NeResize`   | `ne-resize`   | UpRightArrow.png   |
| `Alias`        | `alias`         | Link.png         | `NwResize`   | `nw-resize`   | UpLeftArrow.png    |
| `Copy`         | `copy`          | Copy.png         | `SeResize`   | `se-resize`   | DownRightArrow.png |
| `Move`         | `move`          | Move.png         | `SwResize`   | `sw-resize`   | DownLeftArrow.png  |
| `None`         | `none`          | —                | `NeswResize` | `nesw-resize` | AngleUpRight.png   |
| `NoDrop`       | `no-drop`       | Circle.png       | `NwseResize` | `nwse-resize` | AngleUpLeft.png    |
| `NotAllowed`   | `not-allowed`   | NO.png           | `ZoomIn`     | `zoom-in`     | ZoomIn.png         |
| `Grab`         | `grab`          | Hand.png         | `ZoomOut`    | `zoom-out`    | ZoomOut.png        |
| `Grabbing`     | `grabbing`      | Handsqueezed.png | `ColResize`  | `col-resize`  | ColRezise.png      |

```tsx
import { Cursor } from '@react95/core';

document.body.classList.add(Cursor.Auto);          // Win95 arrow for the whole page (cursor inherits)
<a href="#" className={Cursor.Pointer}>link</a>   // links get the UA pointer unless you add this
<Frame className={Cursor.Wait}>Working…</Frame>
```

- `Input`/`TextArea` already include `Cursor.Text`.
- No hotspot coordinates are declared (`url(…) <keyword>` only), so the hotspot is the image's
  top-left corner — imprecise for Text/Crosshair/Move (code analysis).
- Some PNGs in `Cursor/cursors/` (DND-*, Handwriting, SizeAll, X, …) are not exposed.
