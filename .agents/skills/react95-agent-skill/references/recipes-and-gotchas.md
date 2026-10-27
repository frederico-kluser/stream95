# Recipes & gotchas — `@react95/core` 10.0.6 / `@react95/icons` 2.8.0 / `@react95/clippy` 2.2.3

Everything here is derived from the repo source (commit `97bd045`), the published tarballs
and npm registry metadata. Statements that could not be checked by reading code are marked
**unverified**. No app was actually built/run while writing this.

## 0. Ten mistakes to avoid

1. No theme CSS → every `var(--r95-…)` is undefined → unstyled/collapsed UI. Import exactly
   one `@react95/core/themes/<name>.css` (plus `@react95/core/GlobalStyle`).
2. Importing several theme files to "switch" themes — they all target `:root`; use
   `setElementVars` (see `theming-and-css.md` §5).
3. Numbers in Frame props: `w={200}` → `width: 200` (invalid). Write `w="200px"` or a token.
4. `bg="$material"` / `borderRadius="$4"` — those props have no token scale. Use `bgColor`.
5. Looking for `open`/`onClose` on `Modal` — a window is open while mounted; close it from
   `<TitleBar.Close onClick>` by unmounting it.
6. Rendering `<TaskBar />` after windows that mount at the same time → they never get a
   TaskBar button. Put the TaskBar first in the tree.
7. `<Dropdown />` without `options` shows demo paths (`C:\Documents and Settings`, …).
8. `import { X } from '@react95/icons'` (barrel) → all 1131 icons (~5.7 MB) in the bundle.
   Import `@react95/icons/X` and add the Vite plugin from `icons.md`.
9. Unlayered resets / starter CSS (Tailwind v3 preflight, normalize, create-vite's `index.css`)
   override React95 v10 (its CSS is in `@layer react95`). Layer them or delete them.
10. Using the API of the **other** library (`react95` by arturbien: `Window`, `AppBar`,
    `ThemeProvider`, `styleReset`…). None of it exists in `@react95/core`.

## 1. Bootstrap: Vite + React 19 + TypeScript

```bash
npm create vite@latest my-win95 -- --template react-ts
cd my-win95
npm i @react95/core @react95/icons
# optional: npm i @react95/clippy @vanilla-extract/dynamic
```

Delete the starter styles (`src/index.css`, `src/App.css` and their imports). In the current
template (vitejs/vite `main`, fetched 2026-10-27: Vite 8.3 with Rolldown, React 19.3,
TypeScript ~7.0, `@vitejs/plugin-react` 6) `index.css` sets, unlayered, `:root { font: 18px/145%
system-ui…; letter-spacing; color; background }`, constrains `#root` (1126px wide, centered
text, flex column, side borders) and styles `body`, `h1`, `h2`, `p`, `code` — all of which
beat or leak into React95 v10's layered styles (and paint an opaque background).

`index.html` — the layer-order statement must come before any CSS (harmless if you have no
reset; required if you add one or Tailwind):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      @layer reset, react95; /* Tailwind v4: @layer theme, base, react95, components, utilities; */
    </style>
    <title>Win95</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@react95/core/GlobalStyle'; // fonts (inlined), body font 12px + color, links, scrollbars
import '@react95/core/themes/win95.css'; // exactly one theme: --r95-* variables on :root
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (no provider needed):

```tsx
import { useState } from 'react';
import { Button, Frame, List, Modal, TaskBar, TitleBar } from '@react95/core';
import { Computer } from '@react95/icons/Computer';

export default function App() {
  const [open, setOpen] = useState(true);
  return (
    <Frame position="fixed" top="0px" left="0px" w="100vw" h="100vh" bgColor="#008080">
      <TaskBar
        list={
          <List>
            <List.Item icon={<Computer variant="32x32_4" />} onClick={() => setOpen(true)}>
              My Computer
            </List.Item>
          </List>
        }
      />
      {open && (
        <Modal
          title="My Computer"
          icon={<Computer variant="16x16_4" />}
          top="0px"
          left="0px"
          dragOptions={{ defaultPosition: { x: 80, y: 60 }, bounds: 'body' }}
          titleBarOptions={[
            <Modal.Minimize key="min" />,
            <TitleBar.Close key="close" onClick={() => setOpen(false)} />,
          ]}
          buttons={[{ value: 'OK', onClick: () => setOpen(false) }]}
        >
          <Modal.Content width="300px" boxShadow="$in" bgColor="white">
            Hello, Windows 95!
          </Modal.Content>
        </Modal>
      )}
      <Button style={{ margin: 8 }} onClick={() => setOpen(true)}>
        Open window
      </Button>
    </Frame>
  );
}
```

`vite.config.ts` (the icons fix is optional but strongly recommended — see §4):

```ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const react95IconsSideEffectFree = (): Plugin => ({
  name: 'react95-icons-side-effect-free',
  transform(code, id) {
    if (/[\\/]@react95[\\/]icons[\\/]/.test(id)) return { code, map: null, moduleSideEffects: false };
  },
});

export default defineConfig({ plugins: [react(), react95IconsSideEffectFree()] });
```

TypeScript: subpath imports (`@react95/core/Modal`, `@react95/icons/Computer`) need
`"moduleResolution": "bundler"` (create-vite's default) or `node16/nodenext`. With
`verbatimModuleSyntax`, import types with `import type { ModalProps } from '@react95/core/Modal'`.
The side-effect CSS imports resolve to declared `.d.ts` files, so they also pass
`noUncheckedSideEffectImports`.

## 2. Next.js

What the repo offers: the README points to `React95/nextjs-template` (Next 14.2.13, App
Router, React 18, Tailwind 3.4, `@react95/core ^9.0.0`): `app/layout.tsx` imports
`./globals.css`, then `@react95/core/GlobalStyle` and `@react95/core/themes/win95.css`;
`next.config.mjs` is empty; `app/page.tsx` (a Server Component) renders `Button as="a"` and
icons from `@react95/icons`. It predates v10.

Guidance for v10:
- CSS: keep the imports in the root `app/layout.tsx`. Because v10 is layered and Tailwind v3's
  preflight is not, fix the order (`theming-and-css.md` §2) or Buttons/inputs lose their look.
  Put `@layer reset, react95;` at the very top of the first CSS file you import (unverified
  whether Next keeps an inline `<style>` in `<head>` ahead of its stylesheet links).
- `@react95/core` ships **no `'use client'` directives**. Components with hooks — `Modal`,
  `Alert`, `TaskBar`, `Tabs`, `Tree`, `Tooltip`, `Video`, `Modal.Minimize`, anything using
  `useModal`, and `@react95/clippy` — must render inside Client Components (`'use client'`
  at the top of your file). Hook-free ones (`Button`, `Frame`, `TitleBar`, `List`, `Input`,
  `TextArea`, `Checkbox`, `RadioButton`, `Dropdown`, `Range`, `Fieldset`, `ProgressBar`,
  `Avatar`) and all icons can render in Server Components, as the template's page does
  (verified for v9 by the template only — unverified for v10).
- Hydration: the TaskBar clock renders `new Date()` during render → server/client time-zone
  mismatch. Render it client-only, e.g.
  `const TaskBar = dynamic(() => import('@react95/core/TaskBar').then(m => m.TaskBar), { ssr: false })`
  inside a Client Component, or behind a `mounted` flag.
- Pages Router (unverified): the CJS build `require()`s `.css` files, which plain Node can't
  load if Next externalizes the package on the server — add
  `transpilePackages: ['@react95/core']` in `next.config` and import the CSS in `_app.tsx`.
- Webpack keeps CSS imports only if the CSS rule is `sideEffects: true` (Next.js does this;
  check custom webpack setups) — the package's `sideEffects` lists only font files.

## 3. React 19 compatibility

- Peer ranges allow React 19: `@react95/core` → `react`/`react-dom` `>= 16.8.0`;
  `@react95/clippy` → `react >= 16.8.0`. Transitive: `usehooks-ts@^3.1.0` resolves to 3.1.1
  (peer `^16.8 || ^17 || ^18 || ^19`), `@neodrag/react@2.3.1` has no peers. So no ERESOLVE is
  expected with npm (registry metadata; install not executed).
- Code scan (core, icons, clippy sources): no `defaultProps`, `propTypes`, `findDOMNode`,
  string refs, legacy context or `element.ref` access. Components use `forwardRef`
  (still supported in React 19); `Tabs` only reads `child.props`. Icons are
  `React.createElement` + `React.memo`.
- The repo develops and tests against React 18.2 (devDependencies); React 19 runtime
  behavior is **unverified** by its tests.
- Types: published `.d.ts` reference `import('react/jsx-runtime').JSX.Element` (fine with
  `@types/react` 19). Polymorphic props can trigger TS2590 ("union type too complex") —
  the repo's stories work around it with `as Meta<…>` casts; cast when wrapping in HOCs.
- StrictMode double effects are handled (Modal unregisters/re-registers), but the
  TaskBar-before-windows ordering rule still applies.

## 4. Tree-shaking & bundle size

Verified with a Rollup 4.65.1 probe (Vite ≤ 7) over the published files, modelling
`package.json` `sideEffects` the way Vite does (unminified output; gzip in parentheses). A
Rolldown 1.2.15 probe (Vite 8) matches: icons barrel 5.59 MB (621 KB), `{ Button }` 45.5 KB,
`{ TaskBar }` 5.65 MB → 58.5 KB (9.1 KB) with the icons fix.

| Import                                                     | Result                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `import { Button } from '@react95/core'`                   | 39.7 KB, 4 core modules — same as `@react95/core/Button` (core's barrel tree-shakes thanks to its `sideEffects` field) |
| `import { Modal, TitleBar } from '@react95/core'`          | 52 KB, 0 icons                                                                                                         |
| `import { TaskBar } from '@react95/core'` (or Alert, Tree) | **5.72 MB (648 KB)** — all 1131 icons, because core imports the icons barrel                                           |
| same + `moduleSideEffects: false` for `@react95/icons`     | 53.5 KB (8.7 KB), 1 icon                                                                                               |
| `import { Computer } from '@react95/icons'`                | **5.67 MB (639 KB)**                                                                                                   |
| `import { Computer } from '@react95/icons/Computer'`       | 5.4 KB (1.6 KB)                                                                                                        |

Other weights: GlobalStyle CSS 473 KB (base64 fonts — the bulk of React95's CSS); each
theme ~1.9 KB; Frame atoms ~15 KB; Cursor 12.7 KB; Alert's chord (19 KB mp3) adds ~26 KB of base64 audio to
JS; Clippy agents 1–2.8 MB each, fetched lazily. In Vite **dev**, a barrel icon import makes
the dependency pre-bundle include every icon (dev only).

## 5. Accessibility notes

- `Modal`/`Alert`: `role="dialog"`, `aria-label` = `title` (10.0.6), `aria-current="true"` on
  the active window, `aria-hidden` while minimized. No focus trap, no initial focus, no
  Escape, no `aria-modal` — add your own `onKeyDown` handling if needed. The "focus" in
  `useModal().focus` means _active window_, not DOM focus.
- TitleBar options have accessible names `help`/`close`/`maximize`/`minimize`/`restore`
  (from `<img alt>`); give icon-only `TitleBar.Option`s an `aria-label`.
- `Tabs`: plain `ol/li`, not focusable, no `tablist`/`tab` roles, no arrow keys.
- `Tree`: focusable `label`s; Space toggles + fires `onClick`; Enter does nothing; no
  `tree`/`treeitem`/`aria-expanded`.
- `List`: `ul/li`, items not focusable; submenus open on hover only.
- `Tooltip`: mouse-only; no `role="tooltip"`/`aria-describedby`.
- `ProgressBar`: no role — add `role="progressbar"` + `aria-value*` (props pass through).
- `Input`, `TextArea`, `Range`, `Dropdown`: native controls — give them `aria-label`/`<label>`.
  `Checkbox`/`RadioButton` wrap the native input in a `<label>`, so their text names them.
- `Video`: controls are labelled (Play/Pause, Stop, Fullscreen, Progress).
- Icons: no title/role — `aria-hidden` when decorative, `role="img" aria-label` otherwise.
- Storybook's a11y addon runs in `test: 'todo'` mode (violations reported as warnings), i.e.
  known violations exist.

## 6. z-index & stacking

| Layer                                    | z-index                                        |
| ---------------------------------------- | ---------------------------------------------- |
| Inactive Modal windows                   | none (`position: fixed`, painted in DOM order) |
| Active Modal window                      | `var(--r95-zIndex-modal)` = 2                  |
| TaskBar, Tooltip tip, List submenus      | `var(--r95-zIndex-taskbar)` = 3                |
| Clippy agent + balloon (clippyjs inline) | 10001                                          |
| modern-clippy                            | 1000                                           |
- Only the active window is raised; there is no full most-recently-used order.
- A Modal's Frame `zIndex` prop overrides the active/inactive logic for that window — prefer
  changing `--r95-zIndex-modal`/`--r95-zIndex-taskbar` (`:root:root { … }`) to sit above your
  own layers.
- Windows are `position: fixed` without a portal: an ancestor with `transform`, `filter`,
  `perspective`, `contain` or `will-change: transform` becomes their containing block and may
  clip them; neodrag's own `transform` makes nested windows move with their parent. Render
  windows near the root or portal them to `document.body`.

## 7. Controlled vs uncontrolled

| Component                                      | Model                                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Input`, `TextArea`, `Range`, `Dropdown`       | Native: `value`+`onChange` (controlled) or `defaultValue` (uncontrolled).                                                                                                                                                     |
| `Checkbox`, `RadioButton`                      | Native: `checked`+`onChange` or `defaultChecked`; use `readOnly` for static checked states.                                                                                                                                   |
| `Tabs`                                         | **Uncontrolled only**: `defaultActiveTab` read on mount; observe with `onChange(title)`; force a tab by changing `key`.                                                                                                       |
| `Tree`                                         | **Uncontrolled** expand state per node; no `expanded`/`selected` props; selection highlight is up to you.                                                                                                                     |
| `Modal`                                        | Open = mounted (you control). Active/minimized state is internal but driven by `useModal()` events (`focus`, `minimize`, `restore`, `toggle`). Position: uncontrolled `defaultPosition` or controlled `dragOptions.position`. |
| `TaskBar` Start menu                           | Internal; no prop to open/close it.                                                                                                                                                                                           |
| `Tooltip`                                      | Internal hover state.                                                                                                                                                                                                         |
| `Video`                                        | Internal; drive the element through the `VideoRefs` ref (`ref.current.video.current`).                                                                                                                                        |
| `ProgressBar`, `Avatar`, `TitleBar` (`active`) | Pure props.                                                                                                                                                                                                                   |

## 8. Known bugs, quirks and TODOs found in the code

No `TODO`/`FIXME` comments exist in core/icons/clippy sources; these are behaviors found by
reading the code (component sections in `components.md` have details):

1. `TaskBar` reads only `list` and `className`; all other props (Frame props, `style`, `id`,
   `aria-*`) are silently dropped despite its type.
2. Event-bus ordering: windows mounting before the TaskBar subscribes are never listed.
3. `Modal`: `id` isn't forwarded to the DOM; `onMouseDown`, `role`, `aria-current`,
   `aria-hidden` are overwritten; menus stay open after an item click.
4. `Dropdown`: demo default `options`; `style` → `<select>` but `className`/Frame props →
   wrapper; `<option>` children ignored; options must be unique.
5. `Tabs`: Tab `onClick`/`activeTab` overwritten; content panel only gets `width`/`w`;
   `disabled` has no visual style; fragments/wrapped Tabs break title detection.
6. `Tooltip`: user `onMouseEnter`/`onMouseLeave` overwritten; timer not cleared on unmount.
7. `TitleBar`: title text always white (text-shadow trick), ignoring `headerText`.
8. `Alert`: default OK button is a no-op; its internal `height="120"` has no unit (no effect);
   centering uses `window` size at mount.
9. `Video`: `<source type>` = `video/` + last 3 chars of `src` (`.webm` → `video/ebm`, query
   strings break); listeners added in an effect are never removed.
10. `ProgressBar`: no ARIA; `percent` not clamped/rounded; width must be absolute.
11. `Checkbox` `children` typed as `string`; `RadioButton` `style` goes to the hidden input.
12. `List`, `Input`, `TextArea`, `Fieldset`, `Range`, `Tabs`, `Tab` accept `as` in their types
    but force their element.
13. GlobalStyle: invalid `font-style: bold` descriptor; scrollbar arrow SVGs can't use the
    theme variable (default black).
14. `@react95/icons`: no `"sideEffects": false` (bundle bloat, §4); default variant may be
    monochrome.
15. Docs/story inaccuracies: "Contract → Code Examples" uses `borderRadius="$4"` (not a
    token); "Contract → Custom Theme" imports `@react95/core/themes/baseTheme` (not exported);
    `packages/cra-template*` still use the v7 API (`ThemeProvider`, `<GlobalStyle />`,
    styled-components, `ReactDOM.render`) — don't copy them.
16. `modern-clippy` 1.0.2 exports a `./style.css` that isn't in the package.

## 9. Testing (unverified recipes)

- Component modules import `.css` files: Node can't load them. Vitest: let Vite transform the
  package — `test: { server: { deps: { inline: [/@react95\/core/] } } }`. The repo's own
  browser tests also set `resolve.conditions: ['development']` because `@neodrag/react`
  exposes its ESM build only under `development`/`production` conditions.
- Jest: map styles (`moduleNameMapper: { '\\.css$': '<rootDir>/test/styleMock.js' }`) and handle
  ESM (`.mjs`) or let `require` resolve the CJS build (`cjs/*.cjs`, which `require`s CSS).
- Hover-driven UI (List submenus, Tooltip) needs a real pointer (`:hover`); the repo uses
  Playwright through `@vitest/browser` for that.

## 10. Migration notes

### v9 → v10 (2026-10-15)

- **Breaking:** all component CSS moved into cascade layers (`react95.global`,
  `react95.components`, `react95.composed`). Unlayered resets (Tailwind v3 preflight,
  normalize.css) now win over components — layer them and declare
  `@layer reset, react95;` before any CSS (`theming-and-css.md` §2).
- GlobalStyle: v9's `* { font-family: MS Sans Serif }` became `body { font-family }` +
  `button, input, select, textarea { font-family: inherit }` — your own `body` font now reaches
  React95 components.
- 10.0.6: `Modal` gets `aria-label={title}`. 10.0.3: Video controls got accessible names.
- Public API: published types of 9.8.7 and 10.0.6 differ only in internal recipe types;
  exports map and dependencies are identical.

### v8 → v9 (2024-09-20)

| v8                                                             | v9+                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `<ModalProvider>` / `ModalContext` around modals               | Removed — a global event emitter; `useModal()` + `ModalEvents` (9.6)                                                |
| `<Modal onClose={fn}>` (required)                              | `titleBarOptions={<TitleBar.Close onClick={fn} />}` and unmount in `fn`                                             |
| `onHelp={fn}`                                                  | `titleBarOptions={[<TitleBar.Help key="h" onClick={fn} />, …]}`                                                     |
| `title` required                                               | optional (defaults to `UNKNOWN.EXE`)                                                                                |
| `defaultPosition={{x, y}}`, `positionOffset` (react-draggable) | `dragOptions={{ defaultPosition: {x, y}, … }}` (@neodrag/react); no `positionOffset` — use `top`/`left` Frame props |
| —                                                              | `Modal.Minimize` (9.2), TitleBar preset options                                                                     |

### v7 (styled-components / xstyled) → v8+ (vanilla-extract)

| v7                                                      | v8+                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `<ThemeProvider theme="win95">`                         | `import '@react95/core/themes/win95.css'` (same theme names)                                     |
| `<GlobalStyle />` component                             | `import '@react95/core/GlobalStyle'`                                                             |
| peers `styled-components`, `@xstyled/styled-components` | not needed (remove)                                                                              |
| README asked for `import '@react95/icons/icons.css'`    | not needed — icons are SVG React components (`icons.css` is only an optional sprite-class sheet) |
| xstyled system props (numbers became px)                | Frame sprinkles: numbers are **not** px — `w="200px"`                                            |
| `Modal closeModal`, `ModalContext`                      | see v8 → v9 above                                                                                |
| Next.js `next-transpile-modules` + `next-fonts`         | not needed (fonts inlined in CSS; App Router template has an empty config)                       |

### Coming from the `react95` package (arturbien) — a different library

Rough mapping (names from that library are general knowledge, not verified here):
`Window` + `WindowHeader` + `WindowContent` → `Modal` (draggable) or `Frame` + `TitleBar` +
`Modal.Content`-like `Frame`; `AppBar`/`Toolbar` → `TaskBar` or a `Frame`; `MenuList` /
`MenuListItem` → `List` / `List.Item`; `Select` → `Dropdown`; `TextInput` → `Input`/`TextArea`;
`Radio` → `RadioButton`; `Tabs`/`Tab`/`TabBody` → `Tabs`/`Tab`; `Slider` → `Range`;
`GroupBox` → `Fieldset`; `Separator` → `List.Divider`; theming via styled-components
`ThemeProvider` → theme CSS files + CSS variables. There is no `Table`, `Hourglass`, `Counter`
or `ScrollView` equivalent.
