# Frame & layout — `@react95/core` 10.0.6

Source: `components/Frame/Frame.tsx`, `Frame.css.ts`, `props.ts` (rainbow-sprinkles 0.17
runtime, read in `rainbow-sprinkles@0.17.3/createRuntimeFn`). Stories: `frame--*`.

## 1. What Frame is

`Frame` is a polymorphic box (`as`, default `div`) whose style props become **atomic,
unlayered CSS classes + inline CSS variables** (rainbow-sprinkles "dynamic properties"):
`<Frame w="200px">` renders `class="r95_… " style="--r95_…: 200px"` and the class does
`width: var(--r95_…)`. Most React95 components are Frames, so they accept the same props
(see `components.md` for which ones).

```tsx
import { Frame } from '@react95/core';
import type { FrameProps } from '@react95/core/Frame';

<Frame as="section" display="flex" gap="$8" p="$8" bgColor="$material" boxShadow="$out">
  …
</Frame>;
```

- Non-style props pass through to the element; `className`/`style` are merged.
- Inline `style={{ width: 10 }}` beats a Frame prop for the same property (inline wins).
- Frame props are unlayered → they beat every component's own CSS (which is in
  `@layer react95.*`). E.g. `<Button p="$2">` really changes the padding.
- `ref` types follow `as` (`HTMLDivElement` by default).
- Style-prop names shadow same-named HTML attributes: `size`, `width`, `height`, `color`,
  `display`… are consumed as CSS. `<Input size={10} />` does **not** set the input's `size`
  attribute (it becomes an invalid CSS width/height), and `<Frame as="img" width="64">`
  produces CSS `width: 64` (invalid) instead of an attribute — use units (`"64px"`) or `style`.

## 2. Value rules (verified in the runtime code)

| You write                                                                                          | Result                                                    | Valid?                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `w="200px"`, `w="100%"`, `h="calc(100vh - 28px)"`, `bgColor="#008080"`, `border="1px solid black"` | value used verbatim                                       | yes                                                      |
| `p="$8"`, `bgColor="$material"`, `boxShadow="$out"`, `zIndex="$taskbar"`                           | token → `var(--r95-…)` from that property's scale         | yes                                                      |
| `p="$4 $8"`, `margin="0 $4"`                                                                       | every `$token` inside the string is replaced              | yes                                                      |
| `flexGrow={1}`, `zIndex={10}`, `fontWeight={700}`, `lineHeight={1.5}`                              | number stringified                                        | yes (unitless properties)                                |
| `w={200}`, `p={4}`, `height="120"`                                                                 | `width: 200` — numbers are **not** px-suffixed            | **no** (ignored)                                         |
| `w="$100"`, `p="$23"`                                                                              | not in the space scale (`$0`–`$22` only) → literal `$100` | **no**                                                   |
| `borderRadius="$4"`, `bg="$material"`, `top="$4"`, `fontSize="$12"`                                | property has no token scale → literal `$…`                | **no**                                                   |
| `m="-$4"`                                                                                          | negative tokens aren't supported                          | **no** — use `"-4px"` or `calc(-1 * var(--r95-space-4))` |
| `w={{ mobile: '100%', tablet: '70%', desktop: '400px' }}`                                          | responsive (see below)                                    | yes, on layout/spacing props only                        |
| `color={{ mobile: … }}`                                                                            | object on a non-responsive prop                           | **no** (runtime error by code analysis)                  |

Token scales by property:

| Scale    | Tokens                                                                                                                                                                                                                                                                                                                                                                                                          | Properties                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| space    | `$0` … `$22` (= 0–22px)                                                                                                                                                                                                                                                                                                                                                                                         | `gap`, `width`/`height`/`min*`/`max*`, all `margin*`, all `padding*` (and their shorthands)                                       |
| colors   | `$anchor`, `$anchorVisited`, `$borderDark`, `$borderDarkest`, `$borderLight`, `$borderLighter`, `$borderLightest`, `$canvas`, `$canvasText`, `$headerBackground`, `$headerNotActiveBackground`, `$headerNotActiveText`, `$headerText`, `$material`, `$materialText`, `$materialTextDisabled`, `$materialTextDisabledShadow`, `$materialTextInvert`, `$progress`, `$inputBackground`, `$inputBackgroundDisabled` | `color`, `backgroundColor`/`bgColor`, `borderColor`, `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor` |
| shadows  | `$out` (raised), `$in` (sunken), `$input` (field)                                                                                                                                                                                                                                                                                                                                                               | `boxShadow`                                                                                                                       |
| zIndices | `$modal` (2), `$tooltip` (3), `$taskbar` (3)                                                                                                                                                                                                                                                                                                                                                                    | `zIndex`                                                                                                                          |

Responsive conditions (only the display & box-model group): `mobile` = default (no media
query), `tablet` = `@media screen and (min-width: 768px)`, `desktop` =
`@media screen and (min-width: 1024px)`. Shorthand and longhand together: the longhand wins
(`width` beats `w`).

## 3. Complete prop catalogue

**Display & box model** (responsive objects allowed):

| Props                                                                                                                                                                                                                                            | Values                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `display`, `overflow`, `boxSizing`                                                                                                                                                                                                               | any CSS value                                                                                                                                                               |
| `grid`, `gridArea`, `gridAutoColumns`, `gridAutoFlow`, `gridAutoRows`, `gridColumn`, `gridColumnEnd`, `gridColumnStart`, `gridRow`, `gridRowEnd`, `gridRowStart`, `gridTemplate`, `gridTemplateAreas`, `gridTemplateColumns`, `gridTemplateRows` | any CSS value                                                                                                                                                               |
| `flex`, `flexBasis`, `flexDirection`, `flexFlow`, `flexGrow`, `flexShrink`, `flexWrap`                                                                                                                                                           | any CSS value                                                                                                                                                               |
| `justifyContent`, `justifyItems`, `justifySelf`, `alignContent`, `alignItems`, `alignSelf`                                                                                                                                                       | any CSS value                                                                                                                                                               |
| `gap`                                                                                                                                                                                                                                            | space token or CSS                                                                                                                                                          |
| `width`, `maxWidth`, `minWidth`, `height`, `maxHeight`, `minHeight`                                                                                                                                                                              | space token or CSS                                                                                                                                                          |
| `margin`, `marginBlock`, `marginBlockEnd`, `marginBlockStart`, `marginBottom`, `marginInline`, `marginInlineEnd`, `marginInlineStart`, `marginLeft`, `marginRight`, `marginTop`                                                                  | space token or CSS                                                                                                                                                          |
| `padding`, `paddingBlock`, `paddingBlockEnd`, `paddingBlockStart`, `paddingBottom`, `paddingInline`, `paddingInlineEnd`, `paddingInlineStart`, `paddingLeft`, `paddingRight`, `paddingTop`                                                       | space token or CSS                                                                                                                                                          |
| Shorthands                                                                                                                                                                                                                                       | `size` (height+width), `h`, `w`, `minH`, `minW`, `m`, `mt`, `mr`, `mb`, `ml`, `mx`/`marginX`, `my`/`marginY`, `p`, `pt`, `pr`, `pb`, `pl`, `px`/`paddingX`, `py`/`paddingY` |

**Positioning**: `position`, `top`, `right`, `bottom`, `left`, `pointerEvents` — any CSS value (no tokens).

**Colors**: `backgroundColor` (shorthand `bgColor`), `color` — color tokens or any CSS color.

**Background**: `background` (shorthand `bg`), `backgroundAttachment`, `backgroundImage`,
`backgroundPosition`, `backgroundRepeat`, `backgroundSize`, `backgroundOrigin`,
`backgroundClip` — any CSS value (**no tokens**; use `bgColor` for theme colors).

**Borders**: `border`, `borderStyle`, `borderWidth`, `borderColor`_, `borderTop`,
`borderTopColor`_, `borderTopStyle`, `borderTopWidth`, `borderRight`, `borderRightColor`_,
`borderRightStyle`, `borderRightWidth`, `borderBottom`, `borderBottomColor`_,
`borderBottomStyle`, `borderBottomWidth`, `borderLeft`, `borderLeftColor`_,
`borderLeftStyle`, `borderLeftWidth` (_ = color tokens allowed).

**Radius & border image**: `borderRadius`, `borderTopLeftRadius`, `borderTopRightRadius`,
`borderBottomLeftRadius`, `borderBottomRightRadius`, `borderImage`, `borderImageOutset`,
`borderImageRepeat`, `borderImageSlice`, `borderImageSource`, `borderImageWidth` — any CSS value.

**Shadow**: `boxShadow` — `$out` / `$in` / `$input` or any CSS box-shadow.

**Outline**: `outline`, `outlineColor`, `outlineStyle`, `outlineWidth` — any CSS value.

**Font**: `font`, `fontFamily`, `fontStyle`, `fontSize`, `fontWeight`, `fontVariant`, `fontSizeAdjust` — any CSS value.

**Text**: `color`, `direction`, `letterSpacing`, `lineHeight`, `textAlign`, `textDecoration`,
`textIndent`, `textShadow`, `textTransform`, `verticalAlign`, `whiteSpace`, `wordSpacing`, `wordBreak`.

**Stacking**: `zIndex` — `$modal`/`$tooltip`/`$taskbar` or a number/string.

**Not available** (use `style`/`className`): `opacity`, `transform`, `transition`, `animation`,
`cursor` (use `Cursor.*` classes), `overflowX`/`overflowY`, `inset`, `aspectRatio`, `objectFit`,
`visibility`, `userSelect`, `filter`, `maxW`/`maxH` shorthands (use `maxWidth`/`maxHeight`).
Unknown props are forwarded as DOM attributes (no styling effect).

## 4. Win95 surfaces cheat-sheet

| Look                                    | Frame props                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raised panel / window body              | `bgColor="$material" boxShadow="$out" p="$2"`                                                                                                                |
| Sunken well / status segment            | `boxShadow="$in" px="$4" py="$2"`                                                                                                                            |
| White content area (Notepad, list view) | `bgColor="$inputBackground" boxShadow="$in"` (Modal.Content does the padding)                                                                                |
| Text field look                         | `bgColor="$inputBackground" boxShadow="$input"`                                                                                                              |
| Etched separator                        | `<List.Divider />` inside lists; elsewhere `borderTop="1px solid" borderTopColor="$borderDark" borderBottom="1px solid" borderBottomColor="$borderLightest"` |
| Title bar                               | `<TitleBar title="…" active />`                                                                                                                              |
| Classic desktop                         | `bgColor="#008080"` (no theme token for the desktop)                                                                                                         |
| LCD digits                              | `fontFamily="'React95Video-Numbers', monospace" bgColor="$canvas" color="$canvasText"`                                                                       |

## 5. Layout recipes

All snippets assume `import '@react95/core/GlobalStyle'` + one theme CSS are loaded once at
the app root, and icons imported per file (`@react95/icons/<Name>`, see `icons.md`).

### 5.1 Win95 desktop shell (desktop icons + windows + taskbar)

```tsx
import { useState } from 'react';
import { Frame, List, Modal, TaskBar, TitleBar } from '@react95/core';
import { Computer } from '@react95/icons/Computer';
import { Notepad } from '@react95/icons/Notepad';
import { RecycleEmpty } from '@react95/icons/RecycleEmpty';

const APPS = [
  { id: 'computer', label: 'My Computer', Icon: Computer },
  { id: 'notepad', label: 'Notepad', Icon: Notepad },
  { id: 'recycle', label: 'Recycle Bin', Icon: RecycleEmpty },
] as const;
type AppId = (typeof APPS)[number]['id'];

export function Desktop() {
  const [open, setOpen] = useState<AppId[]>([]);
  const launch = (id: AppId) => setOpen((o) => (o.includes(id) ? o : [...o, id]));
  const close = (id: AppId) => setOpen((o) => o.filter((x) => x !== id));

  return (
    <Frame position="fixed" top="0px" left="0px" w="100vw" h="100vh" bgColor="#008080">
      {/* TaskBar BEFORE the windows: windows register with it on mount */}
      <TaskBar
        list={
          <List>
            {APPS.map(({ id, label, Icon }) => (
              <List.Item key={id} icon={<Icon variant="32x32_4" />} onClick={() => launch(id)}>
                {label}
              </List.Item>
            ))}
          </List>
        }
      />

      <Frame
        as="ul"
        display="grid"
        gridAutoFlow="column"
        gridTemplateRows="repeat(auto-fill, 76px)"
        gap="$8"
        p="$12"
        m="$0"
        h="calc(100% - 28px)"
        style={{ listStyle: 'none' }}
      >
        {APPS.map(({ id, label, Icon }) => (
          <li key={id}>
            <Frame
              as="button"
              type="button"
              onDoubleClick={() => launch(id)}
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap="$4"
              w="72px"
              bgColor="transparent"
              border="none"
              color="#ffffff"
              fontFamily="inherit"
              fontSize="12px"
            >
              <Icon variant="32x32_4" aria-hidden="true" />
              {label}
            </Frame>
          </li>
        ))}
      </Frame>

      {APPS.filter((a) => open.includes(a.id)).map(({ id, label, Icon }, i) => (
        <Modal
          key={id}
          id={id}
          title={label}
          icon={<Icon variant="16x16_4" />}
          top="0px"
          left="0px"
          width="320px"
          height="220px"
          dragOptions={{ defaultPosition: { x: 80 + i * 24, y: 60 + i * 24 }, bounds: 'body' }}
          titleBarOptions={[<Modal.Minimize key="min" />, <TitleBar.Close key="close" onClick={() => close(id)} />]}
        >
          <Modal.Content bgColor="white" boxShadow="$in">
            {label}
          </Modal.Content>
        </Modal>
      ))}
    </Frame>
  );
}
```

### 5.2 Draggable windows (Modal + @neodrag/react)

- The window is `position: fixed; top: 50px` with left at its static position; neodrag moves
  it with a CSS `transform`. `defaultPosition` is an **offset** from that origin — add
  `top="0px" left="0px"` to make it screen coordinates (as above).
- Drag handle = the TitleBar (class `draggable`, forced). Don't use `className="draggable"`
  inside windows (it would become a handle too).
- Useful `dragOptions` (`@neodrag/react` 2.3.1 `DragOptions`, minus `handle`):
  `defaultPosition {x,y}`; `bounds: 'body' | 'parent' | selector | element | {top,right,bottom,left}`
  (default: unbounded); `position {x,y}` (controlled — pair with `onDragEnd`);
  `axis: 'both'|'x'|'y'|'none'`; `grid: [x, y]`; `disabled`; `cancel` (selector that never
  starts a drag); `threshold {delay, distance}` (default distance 3px);
  `onDragStart`/`onDrag`/`onDragEnd({ offsetX, offsetY, rootNode, currentNode, event })`;
  `defaultClassDragging` (`neodrag-dragging`), `defaultClassDragged` (`neodrag-dragged`).
- Persisting positions (controlled):

```tsx
const [pos, setPos] = useState({ x: 100, y: 80 });
<Modal
  title="Persisted"
  top="0px"
  left="0px"
  dragOptions={{
    position: pos,
    bounds: 'body',
    onDragEnd: ({ offsetX, offsetY }) => setPos({ x: offsetX, y: offsetY }),
  }}
>
  <Modal.Content>…</Modal.Content>
</Modal>;
```

- Stacking: only the active window gets `z-index: var(--r95-zIndex-modal)` (2); others are
  in DOM order. The TaskBar is 3. Raise both via the variables if your page has higher layers.
- Keep windows out of transformed/filtered/`contain` ancestors (fixed positioning breaks).
- Maximize/restore is not built in. Pattern (unverified): keep `maximized` state and remount
  with `key`, passing `top="0px" left="0px" width="100vw" height="calc(100vh - 28px)"` and
  `dragOptions={{ disabled: true }}` when maximized.

### 5.3 Static window (not draggable, not in the TaskBar)

Useful for docs, overlays, or embedding a window in page flow:

```tsx
import type { ReactNode } from 'react';
import { Frame, TitleBar } from '@react95/core';

export function Window({
  title,
  icon,
  children,
  width = '320px',
}: {
  title: string;
  icon?: React.ReactElement;
  children: ReactNode;
  width?: string;
}) {
  return (
    <Frame
      role="group"
      aria-label={title}
      w={width}
      bgColor="$material"
      boxShadow="$out"
      p="$2"
      display="flex"
      flexDirection="column"
    >
      <TitleBar title={title} icon={icon} mb="$2">
        <TitleBar.OptionsBox>
          <TitleBar.Close onClick={() => {}} />
        </TitleBar.OptionsBox>
      </TitleBar>
      <Frame bgColor="$inputBackground" boxShadow="$in" p="$6" flexGrow={1}>
        {children}
      </Frame>
    </Frame>
  );
}
```

### 5.4 Title bar with buttons

```tsx
<TitleBar title="Untitled - Notepad" icon={<Notepad variant="16x16_4" />} active={isActive}>
  <TitleBar.OptionsBox>
    <TitleBar.Minimize onClick={onMinimize} />
    <TitleBar.Maximize onClick={onMaximize} />
    <TitleBar.Close onClick={onClose} />
  </TitleBar.OptionsBox>
</TitleBar>;
```

Options are 17×14px buttons with 2px gaps; add a text option with `<TitleBar.Option>_</TitleBar.Option>`.

### 5.5 Status bar

```tsx
<Frame display="flex" gap="$2" mt="$2">
  <Frame flexGrow={1} boxShadow="$in" px="$4" py="$2">
    12 object(s)
  </Frame>
  <Frame w="120px" boxShadow="$in" px="$4" py="$2">
    1.44MB (Disk free space)
  </Frame>
</Frame>;
```

### 5.6 Taskbar + Start menu

- `<TaskBar list={<List>…</List>} />` — the list opens above the bar at its left edge;
  clicking anything inside the menu area closes it; nested `<List>`s are hover submenus.
- `list` is typed `ReactElement`, so you can pass a wrapper, e.g. a Win95 side banner:

```tsx
// import { Settings } from '@react95/icons/Settings'; (also Printer, Computer)
<TaskBar
  list={
    <Frame display="flex" bgColor="$material" boxShadow="$out" p="$2">
      <Frame
        w="22px"
        mr="$2"
        bg="linear-gradient(to top, #000080, #1084d0)"
        color="#ffffff"
        display="flex"
        alignItems="flex-end"
        justifyContent="center"
        fontWeight="bold"
        fontSize="16px"
      >
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: 4 }}>Windows95</span>
      </Frame>
      <List boxShadow="none" p="$0" w="180px">
        <List.Item icon={<Settings variant="32x32_4" />}>
          <List w="180px">
            <List.Item icon={<Printer variant="16x16_4" />}>Printers</List.Item>
          </List>
          Settings
        </List.Item>
        <List.Divider />
        <List.Item icon={<Computer variant="32x32_4" />} onClick={shutDown}>
          Shut Down...
        </List.Item>
      </List>
    </Frame>
  }
/>;
```

- Reserve space: the bar is `position: fixed`, 28px high — give your desktop
  `h="calc(100vh - 28px)"` or `pb="28px"`.
- Only `list`/`className` props are read; you can't add tray icons or restyle via Frame props.

### 5.7 Menu bar

Use the Modal `menu` prop (`[{ name: 'File', list: <List>…</List> }]`). Menus open on
mousedown and close on mousedown outside the menu bar — close explicitly after an action.
For a page-level menu bar, build it with `Frame as="ul" display="flex"` + `List` dropdowns.

### 5.8 Tabbed dialog (Properties)

```tsx
<Modal
  title="Display Properties"
  icon={<Desktop variant="16x16_4" />}
  hasWindowButton={false}
  titleBarOptions={[<TitleBar.Help key="help" />, <TitleBar.Close key="close" onClick={close} />]}
  buttons={[
    { value: 'OK', onClick: apply },
    { value: 'Cancel', onClick: close },
    { value: 'Apply', onClick: apply },
  ]}
>
  <Modal.Content>
    <Tabs width="360px" defaultActiveTab="Background">
      <Tab title="Background">
        <Fieldset legend="Wallpaper">…</Fieldset>
      </Tab>
      <Tab title="Screen Saver">…</Tab>
      <Tab title="Appearance">…</Tab>
    </Tabs>
  </Modal.Content>
</Modal>;
```

Give the panel a fixed size (wrap Tabs in `<Frame h="300px">`) so switching tabs doesn't
resize the window; inactive tabs are unmounted.

### 5.9 Tree explorer (two panes)

```tsx
<Modal
  title="Exploring - C:\"
  icon={<Explorer100 variant="16x16_4" />}
  top="0px"
  left="0px"
  width="560px"
  height="360px"
  dragOptions={{ defaultPosition: { x: 60, y: 40 } }}
  titleBarOptions={<TitleBar.Close onClick={close} />}
>
  <Frame display="grid" gridTemplateColumns="200px 1fr" gap="$2" flexGrow={1} minHeight="0px" mx="$2">
    <Frame bgColor="$inputBackground" boxShadow="$in" p="$4" overflow="auto">
      <Tree data={folders} root={{ id: -1, label: 'Desktop', icon: <Desktop variant="16x16_4" /> }} />
    </Frame>
    <Frame
      bgColor="$inputBackground"
      boxShadow="$in"
      p="$4"
      overflow="auto"
      display="grid"
      gridTemplateColumns="repeat(auto-fill, minmax(72px, 1fr))"
      gap="$8"
      alignContent="start"
    >
      {files.map((f) => (
        <Frame key={f.name} display="flex" flexDirection="column" alignItems="center" gap="$2" textAlign="center">
          <FileText variant="32x32_4" aria-hidden="true" />
          {f.name}
        </Frame>
      ))}
    </Frame>
  </Frame>
  <Frame display="flex" gap="$2" m="$2">
    <Frame flexGrow={1} boxShadow="$in" px="$4" py="$2">
      {files.length} object(s)
    </Frame>
  </Frame>
</Modal>;
```

### 5.10 Progress dialog

```tsx
import { useEffect, useState } from 'react';
import { Modal, ProgressBar } from '@react95/core';
import { Filexfer128 } from '@react95/icons/Filexfer128';

export function CopyDialog({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setP((v) => Math.min(100, v + 2)), 100);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (p === 100) onDone();
  }, [p, onDone]);

  return (
    <Modal
      title="Copying..."
      icon={<Filexfer128 variant="16x16_4" />}
      hasWindowButton={false}
      buttons={[{ value: 'Cancel', onClick: onDone }]}
      dragOptions={{ defaultPosition: { x: 200, y: 120 } }}
    >
      <Modal.Content width="320px" gap="$8">
        <span>Copying 'SETUP.EXE' to 'C:\WINDOWS'</span>
        <ProgressBar
          width="300px"
          percent={p}
          role="progressbar"
          aria-valuenow={p}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </Modal.Content>
    </Modal>
  );
}
```

### 5.11 Transparent backgrounds (OBS browser-source overlays)

- GlobalStyle sets **no** `html`/`body` background, so the page is transparent where your app
  doesn't paint. Remove template CSS that paints the root (create-vite's starter `index.css`
  sets an opaque `:root` background) and add
  `html, body { background: transparent; overflow: hidden; }`.
- OBS's default Browser Source custom CSS already sets a transparent body (general OBS
  knowledge, not from this repo). Size the source (e.g. 1920×1080) and lay out absolutely.
- Prefer static windows (5.3) or Modals with `dragOptions={{ disabled: true }}` + explicit
  `top`/`left`; skip the TaskBar unless you want it on stream.
- Everything React95 needs is inlined (fonts, cursors, sounds) — no network fetches, good for
  offline overlays. Clippy agents load their sprite/sound chunks lazily (see `clippy.md`).
- `Alert hasSound` and Video playback are subject to the browser's autoplay policy
  (unverified inside OBS's CEF).

### 5.12 Responsive layout

```tsx
<Frame display={{ mobile: 'block', tablet: 'flex' }} w="100%" gap="$4" p="$4" bgColor="$material" boxShadow="$out">
  <Frame
    w={{ mobile: '100%', tablet: '50%' }}
    mb={{ mobile: '$4', tablet: '$0' }}
    bgColor="white"
    boxShadow="$in"
    p="$2"
  >
    Panel 1
  </Frame>
  <Frame w={{ mobile: '100%', tablet: '50%' }} bgColor="white" boxShadow="$in" p="$2">
    Panel 2
  </Frame>
</Frame>;
```

Windows (`Modal`) are fixed-position and sized in px; on small screens constrain them with
`maxWidth="100vw"` and `bounds: 'body'`.
