# React95 components reference — `@react95/core` 10.0.6

Verified against the React95 monorepo at commit `97bd045` (2026-10-20) and the published
`@react95/core@10.0.6` tarball (`esm/`, `types/`). Source paths below are relative to
`packages/core/components/`. "Unverified" marks anything not provable from that code.

> This is the **React95 org** library (`@react95/core`, vanilla-extract CSS). It is **not** the
> older `react95` npm package by arturbien (styled-components, `<Window>`, `<AppBar>`…).
> None of `Window`, `AppBar`, `ThemeProvider`, `ModalProvider`, `styleReset` exist here.

## Conventions used in this file

- **Frame props** = the ~150 style props of `Frame` (`w`, `h`, `p`, `m`, `bgColor`, `boxShadow`,
  `display`, …). Full list and value rules: `frame-and-layout.md`. Short version: values are
  CSS strings (`"200px"`, `"100%"`) or theme tokens (`"$4"`, `"$material"`, `"$out"`);
  **numbers are not converted to px** (`w={200}` is invalid CSS → ignored).
- Frame props compile to _unlayered_ atomic classes + inline CSS variables, so they **override**
  the component's own (layered) styles.
- **`as`**: some components are polymorphic and honor `as`; others force their element even
  though the TS type accepts `as`. Each section says which.
- **ref**: every component forwards a ref; the table says to which element.
- No provider is required for any component (no ThemeProvider / ModalProvider in v9+).
  You only need the CSS: `import '@react95/core/GlobalStyle'` + one theme
  (`import '@react95/core/themes/win95.css'`). See `theming-and-css.md`.

## Import map

Every name below is exported from the barrel `@react95/core`. Subpaths come from the
`exports` map in `package.json`; the barrel's `.d.ts` does **not** re-export prop types, so
import types from the subpath (`import type { ModalProps } from '@react95/core/Modal'`).
TypeScript needs `"moduleResolution": "bundler"` (or `node16`/`nodenext`) for subpaths.

| Component                                   | Barrel                    | Subpath                                                        | Types exported by the subpath                                                  | Root element / ref                        | `as` honored     |
| ------------------------------------------- | ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- | ---------------- |
| Alert                                       | `Alert`                   | `@react95/core/Alert`                                          | `AlertProps`, `AlertType`                                                      | `div` (window)                            | no               |
| Avatar                                      | `Avatar`                  | `@react95/core/Avatar`                                         | `AvatarProps`                                                                  | `div`                                     | yes              |
| Button                                      | `Button`                  | `@react95/core/Button`                                         | `ButtonProps`                                                                  | `button`                                  | yes              |
| Checkbox                                    | `Checkbox`                | `@react95/core/Checkbox`                                       | `CheckboxProps`, `LabelProps`                                                  | ref → `input`; root `label`               | no               |
| Cursor (class map)                          | `Cursor`                  | `@react95/core/Cursor`                                         | —                                                                              | n/a                                       | n/a              |
| Dropdown                                    | `Dropdown`                | `@react95/core/Dropdown`                                       | `DropdownProps`                                                                | ref → `select`; root `div`                | no               |
| Fieldset                                    | `Fieldset`                | `@react95/core/Fieldset`                                       | `FieldSetProps` (capital S)                                                    | `fieldset`                                | no               |
| Frame                                       | `Frame`                   | `@react95/core/Frame`                                          | `FrameProps`, `Polymorphic`, `InferredElement`, `fixedForwardRef`              | `div`                                     | yes              |
| Input                                       | `Input`                   | `@react95/core/Input`                                          | `InputProps`                                                                   | `input`                                   | no               |
| List (+ `List.Item`, `List.Divider`)        | `List`                    | `@react95/core/List`                                           | `ListProps`, `ListStatics`                                                     | `ul`                                      | no               |
| List.Item                                   | (`List.Item`)             | `@react95/core/ListItem` → `ListItem`                          | `ListItemProps`                                                                | `li`                                      | no               |
| List.Divider                                | (`List.Divider`)          | `@react95/core/ListDivider` → **`Divider`**                    | `DividerProps`                                                                 | `li`                                      | no               |
| Modal (+ `Modal.Content`, `Modal.Minimize`) | `Modal`                   | `@react95/core/Modal`                                          | `ModalProps`, `ModalButtons`, `ModalMenu`, `ModalDefaultPosition`              | `div` (window)                            | no               |
| ProgressBar                                 | `ProgressBar`             | `@react95/core/ProgressBar`                                    | `ProgressBarProps`                                                             | `div`                                     | yes              |
| RadioButton                                 | `RadioButton`             | `@react95/core/RadioButton`                                    | `RadioButtonProps`                                                             | ref → `input`; root `label`               | no               |
| Range                                       | `Range`                   | `@react95/core/Range`                                          | `RangeProps`                                                                   | `input type="range"`                      | no               |
| Tabs                                        | `Tabs`                    | `@react95/core/Tabs`                                           | `TabsProps`                                                                    | ref → `ol` (renders `ol` + panel `div`)   | no               |
| Tab                                         | `Tab`                     | `@react95/core/Tab`                                            | `TabProps`                                                                     | `li`                                      | no               |
| TaskBar                                     | `TaskBar`                 | `@react95/core/TaskBar`                                        | `TaskBarProps`                                                                 | `div` (fixed bar)                         | no               |
| TextArea                                    | `TextArea`                | `@react95/core/TextArea`                                       | `TextAreaProps`                                                                | `textarea`                                | no               |
| TitleBar (+ statics)                        | `TitleBar`                | `@react95/core/TitleBar`                                       | `TitleBarProps`, `TitleBarBackgroundProps`, `OptionProps`, `OptionReturnType`  | `div`                                     | yes              |
| Tooltip                                     | `Tooltip`                 | `@react95/core/Tooltip`                                        | `TooltipProps`                                                                 | `div`                                     | no (not a Frame) |
| Tree                                        | `Tree`                    | `@react95/core/Tree`                                           | `TreeProps` (`NodeProps` is **not** exported: use `TreeProps['data'][number]`) | ref → `ul` (renders optional root + `ul`) | no               |
| Video                                       | `Video`                   | `@react95/core/Video`                                          | `VideoProps`, `VideoRefs`                                                      | ref → `VideoRefs` object                  | no               |
| useModal / ModalEvents                      | `useModal`, `ModalEvents` | **barrel only**                                                | —                                                                              | —                                         | —                |
| contract / tokens                           | `contract`, `tokens`      | `@react95/core/contract`; `@react95/core/themes/tokens/<name>` | —                                                                              | —                                         | —                |

Side-effect CSS subpaths: `@react95/core/GlobalStyle`, `@react95/core/themes/<name>.css`.
Every component module imports its own compiled CSS file, so importing a component is enough
to get its styles (your bundler must handle `.css` imports from `node_modules`).

---

## Frame

Source: `Frame/Frame.tsx`, `Frame/Frame.css.ts`, `Frame/props.ts`. Stories: `frame--*`.

The layout/box primitive most other components are built on (exceptions: Checkbox,
RadioButton, Tooltip and the TaskBar's window buttons are plain elements). Full prop
catalogue and value rules are in `frame-and-layout.md`.

| Prop                 | Type                      | Default | Notes                                                                       |
| -------------------- | ------------------------- | ------- | --------------------------------------------------------------------------- |
| `as`                 | `ElementType`             | `'div'` | Polymorphic; props of that element are accepted and forwarded.              |
| style props          | see `frame-and-layout.md` | —       | Tokens `$…` or raw CSS strings; responsive objects on layout/spacing props. |
| `className`, `style` |                           | —       | Merged with the generated classes / inline vars.                            |
| any other prop       |                           | —       | Forwarded to the DOM element.                                               |

```tsx
import { Frame } from '@react95/core';

<Frame w="200px" h="100px" bgColor="$material" boxShadow="$out" p="$4">
  <Frame h="100%" bgColor="white" boxShadow="$in" />
</Frame>;
```

Gotchas: no `opacity`, `transform`, `cursor`, `overflowX/Y`, `maxW/maxH` shorthands, `inset`…
(use `style`/`className`). Unknown props go to the DOM as attributes.

---

## Button

Source: `Button/Button.tsx`, `Button/Button.css.ts`. Story: `button--simple`.

| Prop                                       | Type                              | Default    | Notes                                                                                       |
| ------------------------------------------ | --------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `as`                                       | `ElementType`                     | `'button'` | Honored: `<Button as="a" href="…">` works (used by the official Next.js template).          |
| `children`                                 | `ReactNode`                       | —          | Label.                                                                                      |
| `disabled`                                 | `boolean`                         | —          | Native; greys text (`materialTextDisabled`).                                                |
| `type`                                     | `'button' \| 'submit' \| 'reset'` | not set    | HTML default inside a `<form>` is **submit** — pass `type="button"` for non-submit buttons. |
| …`ButtonHTMLAttributes<HTMLButtonElement>` |                                   |            | `onClick`, `aria-*`, …                                                                      |
| …Frame props                               |                                   |            | e.g. `w="100px"`, `px="$8"`.                                                                |

ref → the `<button>` (or the `as` element). No variants/sizes exist (no `primary`, `size`,
`variant` props). Look: padding 7px 20px 5px, 12px text, bevel box-shadow, dotted focus
outline, pressed (`:active`) inset.

```tsx
import { Button } from '@react95/core';

<Button onClick={() => console.log('clicked')}>Ok</Button>
<Button disabled>Cancel</Button>
<Button as="a" href="https://github.com/React95/React95">GitHub</Button>
```

---

## Input

Source: `Input/Input.tsx`, `Input/Input.css.ts`. Story: `input--simple`.

`InputProps = InputHTMLAttributes<HTMLInputElement> & Omit<FrameProps, 'as'>`.
Always renders `<input>` (the `as` prop is overwritten). ref → `<input>`.

| Prop                                                     | Type   | Default | Notes                                           |
| -------------------------------------------------------- | ------ | ------- | ----------------------------------------------- |
| `value` / `defaultValue` / `onChange`                    | native | —       | Controlled or uncontrolled, like a plain input. |
| `placeholder`, `disabled`, `readOnly`, `type`, `name`, … | native | —       |                                                 |
| …Frame props                                             |        |         | e.g. `w="100%"`, `fontFamily="monospace"`.      |

Styling: white field (`inputBackground`), sunken `shadow-input`, Win95 I-beam cursor
(`Cursor.Text` class baked in). No special disabled background (only the browser's).
Give it an accessible name (`aria-label` or a `<label>`). The HTML `size` attribute can't be
set (Frame's `size` style prop swallows it) — size the field with `w="180px"`.

```tsx
import { Input } from '@react95/core';

const [name, setName] = useState('');
<Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} w="180px" />;
```

## TextArea

Source: `TextArea/TextArea.tsx` (reuses Input's style). Story: `textarea--simple`.

`TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FrameProps, 'as'>`.
Always `<textarea>`; ref → `<textarea>`. Same look as `Input`.

```tsx
import { TextArea } from '@react95/core';

<TextArea aria-label="Message" rows={10} cols={50} value={text} onChange={(e) => setText(e.target.value)} />;
```

---

## Checkbox

Source: `Checkbox/Checkbox.tsx`, `Checkbox/Checkbox.css.ts`. Stories: `checkbox--*`.

Renders `<label class> <input type="checkbox" class(opacity:0)> <span icon/> <span text/> </label>`.

| Prop                                                                          | Type                          | Default | Goes to   | Notes                                       |
| ----------------------------------------------------------------------------- | ----------------------------- | ------- | --------- | ------------------------------------------- |
| `children`                                                                    | `string`                      | —       | text span | Typed as **string only** (not ReactNode).   |
| `label`                                                                       | `string`                      | —       | text span | Used when there are no children.            |
| `disabled`                                                                    | `boolean`                     | `false` | input     | Label text greys out via `:has(:disabled)`. |
| `style`                                                                       | `CSSProperties`               | —       | **label** |                                             |
| `className`                                                                   | `string`                      | —       | **label** |                                             |
| `checked` / `defaultChecked` / `onChange` / `name` / `value` / `readOnly` / … | `HTMLProps<HTMLInputElement>` | —       | input     |                                             |

ref → the `<input>`. Not a Frame (no style props). The label is `display: inline-block`
(height 15px, 20px left padding) — stack several with a flex column wrapper.

```tsx
import { Checkbox, Frame } from '@react95/core';

const [checked, setChecked] = useState(true);
<Frame display="flex" flexDirection="column">
  <Checkbox checked={checked} onChange={() => setChecked(!checked)}>
    Working
  </Checkbox>
  <Checkbox readOnly checked>
    Checked
  </Checkbox>
  <Checkbox readOnly disabled checked>
    Checked and Disabled
  </Checkbox>
</Frame>;
```

Gotcha: a `checked` checkbox without `onChange` needs `readOnly` (React warning otherwise) —
the stories always pair them.

## RadioButton

Source: `RadioButton/RadioButton.tsx`, `RadioButton/RadioButton.css.ts`. Stories:
`radiobutton--simple`, `radiobutton--playground`.

`RadioButtonProps = InputHTMLAttributes<HTMLInputElement>`; renders
`<label> <input type="radio"/> <span icon/> <span text>{children}</span> </label>`.

| Prop                                                                                 | Type        | Default | Goes to   | Notes                                                |
| ------------------------------------------------------------------------------------ | ----------- | ------- | --------- | ---------------------------------------------------- |
| `children`                                                                           | `ReactNode` | —       | text span | The visible label (absolutely positioned at 18px).   |
| `className`                                                                          | `string`    | —       | **label** | (Since 9.8.5 the input keeps its own class.)         |
| `disabled`                                                                           | `boolean`   | —       | input     | Disabled images + greyed text.                       |
| `name`, `value`, `checked`, `defaultChecked`, `onChange`, `readOnly`, **`style`**, … | native      | —       | **input** | `style` lands on the invisible input, not the label. |

ref → the `<input>`. Label is `display: block` with `margin-bottom: 10px`.

```tsx
import { RadioButton, Frame } from '@react95/core';

const [selected, setSelected] = useState('one');
const onChange = (e: React.ChangeEvent<HTMLInputElement>) => setSelected(e.target.value);

<Frame display="flex" flexDirection="column">
  <RadioButton name="opt" value="one" checked={selected === 'one'} onChange={onChange}>
    One
  </RadioButton>
  <RadioButton name="opt" value="two" checked={selected === 'two'} onChange={onChange}>
    Two
  </RadioButton>
  <RadioButton readOnly disabled value="three">
    Disabled
  </RadioButton>
</Frame>;
```

---

## Dropdown

Source: `Dropdown/Dropdown.tsx`, `Dropdown/Dropdown.css.ts`. Story: `dropdown--simple`.

Renders `<div class="wrapper (width:200px)" style=…><select>…<option/>…</select></div>`
(Win95 caret drawn by the wrapper's `::after`).

| Prop                                                                           | Type                           | Default                                                                                        | Goes to     | Notes                                                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `options`                                                                      | `Array<string \| number>`      | `['', 'C:\\Documents and Settings', 'C:\\Documents and Settings\\Documents', 'iexplorer.exe']` | `<option>`s | **Always pass it** — the default is demo data. Each option's value = its label = the item; items must be unique (used as React keys). |
| Frame props (`width`, `w`, `m`, …)                                             |                                | —                                                                                              | **wrapper** | Wrapper default width is 200px (Frame `w` overrides it).                                                                              |
| `className`                                                                    | `string`                       | —                                                                                              | **wrapper** |                                                                                                                                       |
| `style`                                                                        | `CSSProperties`                | —                                                                                              | **select**  | Inconsistent with `className`.                                                                                                        |
| `value`, `defaultValue`, `onChange`, `name`, `disabled`, `aria-label`, `id`, … | `HTMLProps<HTMLSelectElement>` | —                                                                                              | select      |                                                                                                                                       |
| `children`                                                                     |                                | —                                                                                              | ignored     | `<option>` children are discarded; only `options` render.                                                                             |

ref → the `<select>`. No separate label/value pairs, no option groups: map your own values
(e.g. keep a lookup from label → id) or render a native `<select>` styled yourself.

```tsx
import { Dropdown } from '@react95/core';

const [theme, setTheme] = useState('win95');
<Dropdown
  aria-label="Theme"
  options={['win95', 'matrix', 'rose']}
  value={theme}
  onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
  w="250px"
/>;
```

---

## Range

Source: `Range/Range.tsx`, `Range/Range.css.ts`. Story: `range--simple`.

`RangeProps = InputHTMLAttributes<HTMLInputElement> & Omit<FrameProps, 'as'>`. Always
`<input type="range">` (`as` and `type` are overwritten); width 100% by default; Win95 track
and thumb via `::-webkit-slider-*` / `::-moz-range-*`. ref → `<input>`.

```tsx
import { Range } from '@react95/core';

<Range
  aria-label="Volume"
  min={0}
  max={100}
  step={1}
  value={volume}
  onChange={(e) => setVolume(Number(e.target.value))}
  style={{ width: 100 }}
/>;
```

With no `value`/`defaultValue` the browser starts it halfway (story asserts `50`).

---

## Fieldset

Source: `Fieldset/Fieldset.tsx`. Story: `fieldset--simple`.

| Prop                                                      | Type        | Default | Notes                                              |
| --------------------------------------------------------- | ----------- | ------- | -------------------------------------------------- |
| `legend`                                                  | `string`    | —       | Rendered as `<legend>` (names the group for a11y). |
| `disabled`                                                | `boolean`   | —       | Native: disables every control inside.             |
| `children`                                                | `ReactNode` | —       |                                                    |
| …`HTMLProps<HTMLFieldSetElement>` & Frame props (no `as`) |             |         | e.g. `width="300px"`, `mt="$8"`.                   |

Always `<fieldset>`; ref → `<fieldset>`. Groove top/left, solid bottom/right border.

```tsx
import { Fieldset, Checkbox, Frame } from '@react95/core';

<Fieldset legend="Connection Settings" width="300px">
  <Frame display="flex" flexDirection="column">
    <Checkbox readOnly checked={false}>
      Disable Remote Keyboard & Pointer
    </Checkbox>
    <Checkbox readOnly checked>
      Remove Desktop Wallpaper
    </Checkbox>
  </Frame>
</Fieldset>;
```

---

## ProgressBar

Source: `ProgressBar/ProgressBar.tsx`. Story: `progressbar--simple`.

| Prop                           | Type              | Default   | Notes                                                                                                       |
| ------------------------------ | ----------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `percent`                      | `number`          | `0`       | Rendered verbatim as `${percent}%` (not clamped, not rounded — round it yourself).                          |
| `width`                        | Frame width value | `'150px'` | Use an **absolute length**: the same width is reused by the inner layers, so `%` widths misalign the label. |
| `as`                           | `ElementType`     | `'div'`   | Honored.                                                                                                    |
| …Frame props / HTML attributes |                   |           | Forwarded to the outer `div`.                                                                               |

ref → outer `div` (20px high). Structure: white bar with label + clipped blue (`progress`
color) bar with an inverted label. No ARIA role — add it yourself:

```tsx
import { ProgressBar } from '@react95/core';

<ProgressBar
  width="200px"
  percent={Math.round(p)}
  role="progressbar"
  aria-valuenow={Math.round(p)}
  aria-valuemin={0}
  aria-valuemax={100}
/>;
```

---

## Avatar

Source: `Avatar/Avatar.tsx`, `Avatar/Avatar.css.ts`. Stories: `avatar--simple|circle|letters`.

| Prop                            | Type             | Default  | Notes                                                            |
| ------------------------------- | ---------------- | -------- | ---------------------------------------------------------------- |
| `src`                           | `string`         | —        | If `src` or `srcSet` is set, renders `<img>` (children ignored). |
| `srcSet`                        | `string`         | —        |                                                                  |
| `alt`                           | `string`         | —        | Goes to the `<img>`.                                             |
| `circle`                        | `boolean`        | —        | Round, with a 1px bevel border instead of the inset shadow.      |
| `size`                          | Frame size value | `'48px'` | Sets width **and** height.                                       |
| `children`                      | `ReactNode`      | —        | Shown when there's no image (e.g. initials).                     |
| `as`                            | `ElementType`    | `'div'`  | Honored.                                                         |
| …Frame props / other attributes |                  |          | `className` is merged; `id` etc. reach the wrapper.              |

ref → wrapper `div`. Wrapper: flex-centered, bold, `material` background, inset shadow.

```tsx
import { Avatar, Frame } from '@react95/core';

<Avatar src="https://github.com/React95.png" alt="React95 logo" size="48px" />
<Avatar srcSet="https://github.com/React95.png 1x" alt="photo" circle />
<Frame display="inline-flex" gap="8px"><Avatar>SQ</Avatar><Avatar circle>RO</Avatar></Frame>
```

---

## List, List.Item, List.Divider

Source: `List/List.tsx`, `List/ListItem.tsx`, `List/ListDivider.tsx`, `List/List.css.ts`.
Stories: `list--with-icons`, `list--simple`.

`List` — `ListProps = HTMLAttributes<HTMLUListElement> & Frame props`. Always `<ul>`
(raised `material` panel, 2px padding, `shadow-out`). ref → `<ul>`. Statics: `List.Item`,
`List.Divider` (also importable as `ListItem` from `@react95/core/ListItem` and `Divider`
from `@react95/core/ListDivider`).

`List.Item` props:

| Prop           | Type                              | Default | Notes                                                                                  |
| -------------- | --------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `icon`         | `ReactElement`                    | —       | Rendered before children; any `svg` inside gets `margin-right: 10px; min-width: 16px`. |
| `children`     | `ReactNode`                       | `[]`    | Text, and optionally a nested `<List>` = submenu.                                      |
| `onClick` etc. | `LiHTMLAttributes<HTMLLIElement>` | —       | Items are plain `li` (not focusable buttons).                                          |
| …Frame props   |                                   |         |                                                                                        |

`List.Divider` — an `<li>` etched separator (`LiHTMLAttributes` + Frame props).

Behavior (all CSS):
- Hover highlights an item (`headerBackground` background, `materialTextInvert` text).
- Items **without an svg** get `padding-inline-start: 26px` so text aligns with iconed items.
- An item containing a `<ul>` shows a right caret and opens the nested list on **hover**
  (`:has(ul):hover > ul`), positioned at `left: 97%`, z-index `--r95-zIndex-taskbar`.
  Requires `:has()` support. Keyboard users cannot open submenus.

```tsx
import { List } from '@react95/core';
import { FolderExe2 } from '@react95/icons/FolderExe2';
import { FolderExe } from '@react95/icons/FolderExe';
import { Computer3 } from '@react95/icons/Computer3';

<List width="200px">
  <List.Item icon={<FolderExe2 variant="32x32_4" />}>
    <List width="200px">
      <List.Item icon={<FolderExe variant="16x16_4" />}>Accessories</List.Item>
      <List.Item icon={<FolderExe variant="16x16_4" />}>StartUp</List.Item>
    </List>
    Programs
  </List.Item>
  <List.Divider />
  <List.Item icon={<Computer3 variant="32x32_4" />} onClick={shutDown}>
    Shut Down...
  </List.Item>
</List>;
```

---

## TitleBar (+ OptionsBox, Option, Help, Close, Maximize, Minimize, Restore)

Source: `TitleBar/TitleBar.tsx`, `TitleBar/TitleBar.css.ts`. Stories:
`titlebar--simple|inactive|complete`.

`TitleBar` props (`TitleBarProps<TAs>`):

| Prop                                            | Type           | Default         | Notes                                                                                                                        |
| ----------------------------------------------- | -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `title`                                         | `string`       | `'UNKNOWN.EXE'` | Bold-looking white text (drawn with white `text-shadow` on transparent text — the `headerText` token does **not** color it). |
| `icon`                                          | `ReactElement` | —               | Rendered first; every `svg` in the bar is forced to 16×16 (`margin-inline-end: 4px`).                                        |
| `active`                                        | `boolean`      | `true`          | `true`: `headerBackground`/`headerText`; `false`: `headerNotActiveBackground`/`headerNotActiveText`.                         |
| `children`                                      | `ReactNode`    | —               | Put options in `<TitleBar.OptionsBox>`.                                                                                      |
| `as`                                            | `ElementType`  | `'div'`         | Honored.                                                                                                                     |
| …`HTMLAttributes` (minus `color`) & Frame props |                |                 | e.g. `width="300px"`, `mb={0}`.                                                                                              |

ref → bar `div` (20px high, 2px padding, flex, `user-select: none`).

Statics (all forward refs to a `<button>`; `OptionProps = ButtonHTMLAttributes & Frame props`, `as` honored):

| Static                | What it renders                                                             | Accessible name                 |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| `TitleBar.OptionsBox` | Flex `div` container for options (`as` honored).                            | —                               |
| `TitleBar.Option`     | Generic 17×14px title-bar button (Button look); put text or an icon inside. | give `aria-label` for icon-only |
| `TitleBar.Help`       | Option with `?` glyph `<img alt="help">`                                    | `help`                          |
| `TitleBar.Close`      | `×` glyph                                                                   | `close`                         |
| `TitleBar.Maximize`   | maximize glyph                                                              | `maximize`                      |
| `TitleBar.Minimize`   | minimize glyph (only calls **your** `onClick`)                              | `minimize`                      |
| `TitleBar.Restore`    | restore glyph                                                               | `restore`                       |

None of the preset options does anything by itself: wire `onClick`.
For a minimize that really minimizes a Modal to the TaskBar use `Modal.Minimize`.

```tsx
import { TitleBar } from '@react95/core';
import { Doc } from '@react95/icons/Doc';
import { Star } from '@react95/icons/Star';

<TitleBar title="untitled - Paint" icon={<Doc variant="16x16_4" />} width="300px">
  <TitleBar.OptionsBox>
    <TitleBar.Option as="a" href="https://github.com/React95/React95" aria-label="React95 on GitHub">
      <Star variant="16x16_4" />
    </TitleBar.Option>
    <TitleBar.Help onClick={showHelp} />
    <TitleBar.Minimize onClick={minimize} />
    <TitleBar.Close onClick={close} />
  </TitleBar.OptionsBox>
</TitleBar>
<TitleBar active={false} title="Inactive window" width="200px" />
```

---

## Modal (+ Modal.Content, Modal.Minimize) — the draggable window

Source: `Modal/Modal.tsx`, `Modal/Modal.css.ts`, `shared/*`. Stories: `modal--simple`,
`modal--multiple`, `modal--minimize`, `hooks-usemodal--*`.

A "Modal" is a non-modal **window**: `position: fixed; top: 50px` (left = its static
position), raised `material` panel, TitleBar as drag handle, optional menu bar and footer
buttons. **It is open while it is mounted** — there is no `open`/`onClose` prop; close it by
unmounting it (conditional rendering) from a `TitleBar.Close` handler.

| Prop                                     | Type                                                                | Default                     | Notes                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                                  | `string`                                                            | — (bar shows `UNKNOWN.EXE`) | Also the dialog's `aria-label` (10.0.6) and the TaskBar button text.                                                                                                                               |
| `icon`                                   | `ReactElement`                                                      | —                           | Title bar (forced 16×16) + TaskBar button (20×20) icon; a `16x16_4` variant renders crispest (stories use both 16 and 32 variants).                                                                |
| `titleBarOptions`                        | `ReactElement \| ReactElement[]`                                    | —                           | Wrapped in `TitleBar.OptionsBox`. Arrays need `key`s.                                                                                                                                              |
| `buttons`                                | `Array<{ value: string; onClick(event: MouseEvent): void }>`        | `[]`                        | Footer `Button`s (min-width 70px, 6px gap); `value` is label **and** React key → unique.                                                                                                           |
| `buttonsAlignment`                       | `justifyContent` value                                              | `'flex-end'`                | e.g. `'center'`, `'space-between'`.                                                                                                                                                                |
| `menu`                                   | `Array<{ name: string; list: ReactElement }>` (`list` = a `<List>`) | `[]`                        | Menu bar. A name opens its list on mousedown; mousedown outside the menu bar closes it. Clicking an item does **not** close the menu (close it in the item's handler, e.g. by closing the window). |
| `dragOptions`                            | `Omit<DragOptions, 'handle'>` from `@neodrag/react` 2.3             | —                           | `defaultPosition`, `bounds`, `axis`, `grid`, `position` (controlled), `disabled`, `cancel`, `threshold`, `onDragStart/onDrag/onDragEnd`, …`handle` is forced to `'.draggable'` (the TitleBar).     |
| `hasWindowButton`                        | `boolean`                                                           | `true`                      | Whether the TaskBar shows a button for this window.                                                                                                                                                |
| `id`                                     | `string`                                                            | `nanoid()`                  | Registry id used by `useModal`/TaskBar. **Not** rendered as the DOM `id`.                                                                                                                          |
| `children`                               | `ReactNode`                                                         | —                           | Usually a `Modal.Content`.                                                                                                                                                                         |
| `className`, `style`, `aria-*`, `data-*` |                                                                     | —                           | Forwarded (`className` merged; your `aria-label` beats the title).                                                                                                                                 |
| …Frame props (no `as`)                   |                                                                     |                             | `width="300px"`, `height="220px"`, `top`, `left`, `zIndex`…                                                                                                                                        |

Overwritten by the component (your values are ignored): `role="dialog"`, `aria-current`
(set on the active window), `aria-hidden` (true while minimized), `onMouseDown` (focuses the
window), `ref` target.

ref → the window `div` (via `useImperativeHandle`).

**Modal.Content** — `HTMLAttributes<HTMLDivElement> & FrameProps`; a Frame with
`flex-grow: 1; display: flex; flex-direction: column; padding: 6px; margin-block-start: 4px;
margin-inline-end: 1px`. ref → `div`. Typical: `<Modal.Content boxShadow="$in" bgColor="white">`.

**Modal.Minimize** — a `TitleBar.Minimize` whose click minimizes the **active** window (the one
you just pressed) to its TaskBar button and clears the active window. Your `onClick` is
replaced. Put it in `titleBarOptions`.

Window states (all driven by the global modal event bus, see `useModal`):
- **active**: the last window focused (mount, mousedown, TaskBar click, `focus(id)`) gets
  `aria-current="true"`, an active TitleBar and `z-index: var(--r95-zIndex-modal)` (2).
  Inactive windows have no z-index (DOM order), so only the top window is raised — there is no
  full most-recently-used stacking.
- **minimized**: `display: none` + `aria-hidden`; restored by its TaskBar button or `restore(id)`.

```tsx
import { useState } from 'react';
import { Button, List, Modal, TitleBar } from '@react95/core';
import { Computer } from '@react95/icons/Computer';

export function BrowseWindow() {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      {open && (
        <Modal
          title="Browse"
          icon={<Computer variant="16x16_4" />}
          dragOptions={{ defaultPosition: { x: 0, y: 20 }, bounds: 'body' }}
          titleBarOptions={[<Modal.Minimize key="minimize" />, <TitleBar.Close key="close" onClick={close} />]}
          menu={[
            {
              name: 'File',
              list: (
                <List width="200px">
                  <List.Item onClick={close}>Exit</List.Item>
                </List>
              ),
            },
            {
              name: 'Edit',
              list: (
                <List width="200px">
                  <List.Item>Copy</List.Item>
                </List>
              ),
            },
          ]}
          buttons={[
            { value: 'Ok', onClick: close },
            { value: 'Cancel', onClick: close },
          ]}
        >
          <Modal.Content width="300px" height="160px" boxShadow="$in" bgColor="white">
            Simple modal
          </Modal.Content>
        </Modal>
      )}
    </>
  );
}
```

Gotchas:
- Render a `<TaskBar />` **earlier in the tree** than windows that mount in the same commit:
  windows announce themselves in `useEffect` on a plain event emitter with no replay, and
  React runs effects in tree order — a window placed before the TaskBar is never listed (all
  multi-window stories put `<TaskBar />` first).
- `position: fixed` + a neodrag `transform`: a window inside a transformed/filtered ancestor
  is positioned relative to it and clipped; nested windows move with their parent. Render
  windows near the root (or `createPortal(…, document.body)`).
- `defaultPosition` is an offset from the CSS position (top 50px, left = static position).
  Pass `top="0px" left="0px"` (Frame props) to make it absolute screen coordinates.
- No focus trap, no Escape handling, no `aria-modal`: it's a window, not a modal dialog.
- Duplicate `id`s collide in the registry (minimize/restore hit both).

## useModal() and ModalEvents — programmatic window control

Source: `shared/use-modal.ts`, `shared/modal-types.ts`, `shared/emitter.ts`. Barrel-only
exports: `import { useModal, ModalEvents } from '@react95/core'`. Stories: `hooks-usemodal--*`.

A module-level singleton emitter (`modals`) connects every `Modal`, `Modal.Minimize`,
`TaskBar` and `useModal()` caller on the page. No provider. All returned functions are stable
(`useCallback` with `[]`).

| Function    | Signature                                                                                 | Emits                                    | Effect                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `add`       | `(modal: { id: string; title: string; hasButton: boolean; icon?: ReactElement }) => void` | `AddModal`                               | Adds/updates a TaskBar button (Modals call this on mount and on title/`hasWindowButton` change).                                                                                                                                                 |
| `remove`    | `(id: string) => void`                                                                    | `RemoveModal`                            | Removes the TaskBar button only — the Modal stays mounted/visible (stories pair it with `minimize(id)` to "close" without unmounting). If a TaskBar is mounted and the removed window was active, the TaskBar focuses the last remaining window. |
| `minimize`  | `(id: string) => void`                                                                    | `MinimizeModal`                          | Hides the window (`display:none`).                                                                                                                                                                                                               |
| `restore`   | `(id: string) => void`                                                                    | `RestoreModal`                           | Shows it again (does not focus).                                                                                                                                                                                                                 |
| `focus`     | `(id: string) => void`                                                                    | `ModalVisibilityChanged`                 | Makes `id` the active window; any unknown id (stories use `'no-id'`) leaves none active.                                                                                                                                                         |
| `toggle`    | `(id: string, isActive: boolean) => void`                                                 | Minimize, or Restore + VisibilityChanged | `isActive ? minimize : restore + focus`.                                                                                                                                                                                                         |
| `subscribe` | `(event: ModalEvents, cb: (data: Partial<ModalWindow>) => void) => () => void`            | —                                        | Returns the unsubscribe function.                                                                                                                                                                                                                |

`ModalEvents` (string enum): `AddModal = 'add-modal'`, `RemoveModal = 'remove-modal'`,
`ModalVisibilityChanged = 'modal-visibility-changed'`, `MinimizeModal = 'minimize-modal'`,
`RestoreModal = 'restore-modal'`, `FocusModal = 'focus-modal'` (declared, never emitted).

```tsx
import { useEffect } from 'react';
import { Button, Modal, ModalEvents, TaskBar, TitleBar, useModal } from '@react95/core';

function Desktop() {
  const { minimize, restore, focus, remove, add, subscribe } = useModal();

  useEffect(() => subscribe(ModalEvents.MinimizeModal, ({ id }) => console.log('minimized', id)), [subscribe]);

  const hide = () => {
    minimize('notes');
    focus('no-id');
  };
  const show = () => {
    restore('notes');
    focus('notes');
  };
  const closeToTray = () => {
    minimize('notes');
    remove('notes');
    focus('no-id');
  };

  return (
    <>
      <TaskBar />
      <Button onClick={hide}>Minimize</Button>
      <Button onClick={show}>Restore</Button>
      <Modal
        id="notes"
        title="Notes"
        titleBarOptions={[<Modal.Minimize key="m" />, <TitleBar.Close key="c" onClick={closeToTray} />]}
      >
        <Modal.Content width="300px" bgColor="white" boxShadow="$in">
          …
        </Modal.Content>
      </Modal>
    </>
  );
}
```

Re-adding a removed window: `add({ id, title, icon, hasButton: true }); restore(id); focus(id);`.

---

## Alert

Source: `Alert/Alert.tsx`. Stories: `alert--simple|warning|info|question|with-sound`.

A `Modal` with an icon and a message. `AlertProps = ModalProps & { message; hasSound?; type? }`.

| Prop               | Type                                           | Default                                                                                    | Notes                                                                                                                                                        |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `message`          | `string`                                       | — (required)                                                                               | Body text.                                                                                                                                                   |
| `type`             | `'error' \| 'info' \| 'question' \| 'warning'` | `'error'`                                                                                  | Icon: error → `User4`, info → `User5`, question → `User3`, warning → `User2` (32×32, `role="img"`, `aria-label` "Error"/"Information"/"Question"/"Warning"). |
| `hasSound`         | `boolean`                                      | `false`                                                                                    | Plays the Windows chord (inlined mp3) on mount; if the browser blocks autoplay it only `console.warn`s.                                                      |
| `buttons`          | `ModalButtons[]`                               | `[{ value: 'OK', onClick: () => {} }]`                                                     | **The default OK does nothing** — always pass your own.                                                                                                      |
| `hasWindowButton`  | `boolean`                                      | `false`                                                                                    | No TaskBar button by default.                                                                                                                                |
| `buttonsAlignment` |                                                | `'center'`                                                                                 |                                                                                                                                                              |
| `dragOptions`      |                                                | `{ defaultPosition: { x: innerWidth/2 - 150, y: innerHeight/2 - 100 } }` merged with yours | Your `defaultPosition` wins. Centering assumes the Alert's static left is the viewport's left.                                                               |
| everything else    | `ModalProps`                                   |                                                                                            | `title`, `titleBarOptions`, `icon`, Frame props…                                                                                                             |

ref → the window `div`. Internally also passes `height="120"`, which is unitless and
therefore has no effect (see Frame value rules).

```tsx
import { useState } from 'react';
import { Alert, Button, TitleBar } from '@react95/core';

const [show, setShow] = useState(false);
const close = () => setShow(false);

<Button onClick={() => setShow(true)}>Trigger Alert</Button>;
{
  show && (
    <Alert
      title="Windows Networking"
      type="error"
      message="The Windows password you typed is incorrect."
      titleBarOptions={<TitleBar.Close key="close" onClick={close} />}
      buttons={[{ value: 'OK', onClick: close }]}
    />
  );
}
```

---

## TaskBar

Source: `TaskBar/TaskBar.tsx`, `TaskBar/Clock.tsx`, `TaskBar/WindowButton.tsx`,
`TaskBar/useModalWindows.ts`. Stories: `taskbar--simple`, `taskbar--clock`.

Fixed 28px bar at the bottom of the viewport (`position: fixed; bottom/left/right: 0;
z-index: var(--r95-zIndex-taskbar)` = 3): **Start** button (Logo icon) + one button per
registered Modal + a clock.

| Prop            | Type                                  | Default | Notes                                                                   |
| --------------- | ------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `list`          | `ReactElement` (a `<List>`)           | —       | Start menu content; shown above the bar while Start is pressed.         |
| `className`     | `string`                              | —       | Applied to the bar.                                                     |
| everything else | (typed `HTMLAttributes & FrameProps`) | —       | **Silently ignored** — the component only reads `list` and `className`. |

ref → the bar `div`. No `children`, no custom tray area, no way to open the Start menu
programmatically.

Behavior:
- Start toggles the menu; clicking **anywhere inside the menu area** closes it (put actions in
  `List.Item onClick`). Clicking outside does **not** close it.
- Window buttons follow open order; label = Modal `title` (single line clamp, max 150px);
  clicking the active window's button minimizes it, otherwise restores + focuses it.
- Clock: `HH:MM` (24h, local time), refreshed every second; hovering 1s shows a Tooltip with
  the date (`DD Month YYYY`, English month names).
- The bar covers page content: reserve `padding-bottom: 28px` on your desktop/root.

```tsx
import { useState } from 'react';
import { List, Modal, TaskBar, TitleBar } from '@react95/core';
import { WindowsExplorer } from '@react95/icons/WindowsExplorer';

function App() {
  const [explorer, setExplorer] = useState(false);
  return (
    <>
      <TaskBar
        list={
          <List>
            <List.Item icon={<WindowsExplorer variant="32x32_4" />} onClick={() => setExplorer(true)}>
              Windows Explorer
            </List.Item>
          </List>
        }
      />
      {explorer && (
        <Modal
          title="Windows Explorer"
          icon={<WindowsExplorer variant="16x16_4" />}
          width="300px"
          height="200px"
          titleBarOptions={<TitleBar.Close onClick={() => setExplorer(false)} />}
        />
      )}
    </>
  );
}
```

SSR: the clock text is computed during render (`new Date()`), so server and client can
differ (time zone/minute) → hydration warning. Render the TaskBar client-only in SSR apps.

---

## Tabs and Tab

Source: `Tabs/Tabs.tsx`, `Tabs/Tab.tsx`, `Tabs/Tabs.css.ts`. Story: `tabs-tab--simple`.

`Tabs` renders a fragment: an `<ol>` tab strip (receives `ref`, `className` and Frame props)
followed by a panel `div` (`padding: 12px`, `shadow-out`, `material` background) that shows the
active `Tab`'s children and only receives `width`/`w` from the Tabs props.

| `Tabs` prop                                       | Type                                                 | Default           | Notes                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `children`                                        | `ReactElement<TabProps> \| ReactElement<TabProps>[]` | — (required)      | Direct `<Tab>` elements only (no fragments/wrappers — titles are read from `child.props`). At least one.  |
| `defaultActiveTab`                                | `string` (a Tab `title`)                             | first Tab's title | **Read only on mount** — uncontrolled. Change `key` to reset (`<Tabs key={tab} defaultActiveTab={tab}>`). |
| `onChange`                                        | `(title: string, event: MouseEvent) => void`         | —                 | Fired on click of a non-disabled tab.                                                                     |
| …`HTMLAttributes<HTMLOListElement>` & Frame props |                                                      |                   | Go to the `<ol>`; `width`/`w` also size the panel.                                                        |

| `Tab` prop                                     | Type        | Default      | Notes                                                                    |
| ---------------------------------------------- | ----------- | ------------ | ------------------------------------------------------------------------ |
| `title`                                        | `string`    | — (required) | Label, identity and React key → unique. Not rendered as an HTML `title`. |
| `disabled`                                     | `boolean`   | —            | Blocks switching (no visual style).                                      |
| `children`                                     | `ReactNode` | —            | Panel content (rendered by Tabs, not by Tab).                            |
| `activeTab`, `onClick`                         |             |              | Injected by `Tabs`; your values are overwritten.                         |
| …`HTMLAttributes<HTMLLIElement>` & Frame props |             |              | On the tab `li`.                                                         |

ref (`Tab`) → `li`. No `role="tablist"/"tab"`, no keyboard support.

```tsx
import { Tabs, Tab, Fieldset, Checkbox } from '@react95/core';

<Tabs width="350px" defaultActiveTab="General" onChange={(title) => console.log(title)}>
  <Tab title="General">
    <Fieldset legend="Logon validation">
      <Checkbox readOnly checked>
        Log on to Windows NT domain
      </Checkbox>
    </Fieldset>
  </Tab>
  <Tab title="Compatibility">
    <p>Select the compatibility mode…</p>
  </Tab>
</Tabs>;
```

Inactive tab content is **unmounted** (state inside a tab resets when you switch).

---

## Tree

Source: `Tree/Tree.tsx`, `Tree/Node.tsx`, `Tree/Tree.css.ts`. Story: `tree--simple`.

| `Tree` prop                                       | Type                          | Default                               | Notes                                                                                           |
| ------------------------------------------------- | ----------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `data`                                            | `NodeProps[]`                 | — (required by type; `[]` at runtime) | Top-level nodes.                                                                                |
| `root`                                            | `Omit<NodeProps, 'children'>` | —                                     | Optional root row rendered **above** the list (e.g. "My Computer"); its `className` is ignored. |
| …Frame props & `HTMLAttributes<HTMLUListElement>` |                               |                                       | Applied to the top `<ul>`.                                                                      |

Node data shape (`NodeProps`, not exported — use `TreeProps['data'][number]`):

| Field                               | Type                                                                                | Required | Notes                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `id`                                | `number`                                                                            | yes      | React key among siblings (must be unique per level).             |
| `label`                             | `string`                                                                            | yes      | Focusable `<label tabIndex=0>`.                                  |
| `icon`                              | `ReactElement`                                                                      | no       | Default: leaf → `Bat`; folder → `Folder` / `FolderOpen` (16×16). |
| `children`                          | `NodeProps[]`                                                                       | no       | Non-empty → folder with a `+`/`-` box.                           |
| `onClick`                           | `(event: MouseEvent \| KeyboardEvent, node: { id, icon, label, children }) => void` | no       | Fired on label click and on Space.                               |
| other `li` attributes / Frame props |                                                                                     | no       | On the node `<li>` (`id`/`children` excluded).                   |

Behavior: folders start **collapsed** (state is internal and uncontrolled — no
`expanded`/`selected` props, no selection highlight). Toggle: click the `+/-` box,
double-click the label, or press **Space** on the focused label (Space also calls `onClick`).
Enter does nothing. No `role="tree"`/`aria-expanded`.

`Tree.icons` static — icon **components** for file types: `FILE_MEDIA` (MediaCd),
`FILE_TEXT` (FileText), `FILE_UNKNOWN` (Bat), `FILE_FONT` (FileFont2), `FILE_PEN` (FilePen),
`FILE_SETTINGS` (FileSettings), `FILE_TEXT_SETTINGS` (FileTextSettings), `FILE_EXECUTABLE`
(BatExec). Use them as JSX: `<Tree.icons.FILE_TEXT variant="16x16_4" />`.

```tsx
import { useState } from 'react';
import { Tree, Frame } from '@react95/core';
import type { TreeProps } from '@react95/core/Tree';
import { Explorer100 } from '@react95/icons/Explorer100';

const { icons } = Tree;
const data: TreeProps['data'] = [
  {
    id: 0,
    label: 'Applications',
    children: [{ id: 1, label: 'virus.exe', icon: <icons.FILE_EXECUTABLE variant="16x16_4" /> }],
  },
  {
    id: 2,
    label: 'Music',
    children: [
      { id: 3, label: 'Indie', children: [{ id: 4, label: 'Weezer', icon: <icons.FILE_MEDIA variant="16x16_4" /> }] },
    ],
  },
  { id: 5, label: 'config.cfg', icon: <icons.FILE_SETTINGS variant="16x16_4" /> },
];

function Explorer() {
  const [selected, setSelected] = useState<string>();
  // `node` typed optional: NodeProps.onClick also intersects the <li> onClick type
  const select = (_e: unknown, node?: { label: string }) => setSelected(node?.label);
  const withClick = (nodes: TreeProps['data']): TreeProps['data'] =>
    nodes.map((n) => ({ ...n, onClick: select, children: n.children && withClick(n.children) }));

  return (
    <>
      <Tree
        data={withClick(data)}
        root={{ id: 6, label: 'My Computer', icon: <Explorer100 variant="16x16_4" />, onClick: select }}
      />
      <Frame role="status" boxShadow="$in" px="$4" py="$2" mt="$12">
        {selected ?? 'Click a file'}
      </Frame>
    </>
  );
}
```

---

## Tooltip

Source: `Tooltip/Tooltip.tsx`, `Tooltip/Tooltip.css.ts`. Story: `tooltip--simple`.

| Prop                              | Type          | Default                                | Notes                                             |
| --------------------------------- | ------------- | -------------------------------------- | ------------------------------------------------- |
| `text`                            | `string`      | today's date, e.g. `"05 January 2026"` | Tip content (string only).                        |
| `delay`                           | `number` (ms) | `1000`                                 | Hover time before showing; leaving cancels/hides. |
| `children`                        | `ReactNode`   | —                                      | The hover target.                                 |
| …`HTMLAttributes<HTMLDivElement>` |               |                                        | **Not** a Frame (no style props).                 |

ref → wrapper `div` (`inline-block; position: relative; white-space: nowrap`). The tip is
absolutely positioned 20px **above** the wrapper (yellow dotted Win95 background,
z-index `--r95-zIndex-taskbar`); it may be clipped by `overflow: hidden` ancestors.
Mouse-only: your `onMouseEnter`/`onMouseLeave` are overwritten; no focus/keyboard trigger,
no `role="tooltip"`/`aria-describedby`.

```tsx
import { Tooltip } from '@react95/core';

<Tooltip text="Shows the desktop" delay={500}>
  <span>Hover me</span>
</Tooltip>;
```

---

## Video

Source: `Video/Video.tsx`, `Video/Video.css.ts`. Stories: `video--from-url|from-file|playback`.

A media-player window: TitleBar (Mplayer icon, title = name + " (Opening)" until loaded),
`<video>`, LCD-style counter (React95Video-Numbers font from GlobalStyle), Play/Pause, Stop,
Fullscreen buttons and a seek `Range`.

| Prop         | Type                          | Default              | Notes                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | `string`                      | — (required)         | One `<source>`; its `type` is `video/` + the **last 3 characters** of the URL (`.mp4` → `video/mp4`; `.webm` → `video/ebm` ✗; query strings break it). Prefer `.mp4`. (Runtime also accepts `string[]`, but the type says `string` — unverified/undocumented.) |
| `name`       | `string`                      | file name from `src` | Title text.                                                                                                                                                                                                                                                    |
| `videoProps` | `HTMLProps<HTMLVideoElement>` | —                    | Spread on `<video>`: `muted`, `autoPlay`, `loop`, `poster`, `playsInline`…                                                                                                                                                                                     |
| …Frame props |                               |                      | For the window (e.g. `w="320px"`, `marginBottom="$4"`); `padding`, `boxShadow`, `bgColor` are forced.                                                                                                                                                          |

ref → `VideoRefs`: `{ video, progress, wrapper, playpause, stop, fullScreen }`, each a
`RefObject` (`ref.current.video.current?.play()`).

```tsx
import { Video } from '@react95/core';

<Video w="320px" src="https://media.w3.org/2010/05/sintel/trailer_hd.mp4" name="Sintel" videoProps={{ muted: true }} />;
```

Playback with sound is blocked by browsers until a user gesture (Video just warns and keeps
the Play button in sync). Controls are disabled until `loadeddata`.

---

## Cursor (Win95 cursor classes)

Source: `Cursor/Cursor.css.ts`. Story: `cursor--simple`. Import:
`import { Cursor } from '@react95/core'` or `'@react95/core/Cursor'`.

`Cursor` is an object of 32 class names (unlayered CSS, `cursor: url(<png data URI>), <fallback>`):
`Auto, Text, VerticalText, Help, Crosshair, Pointer, Progress, Wait, Alias, Copy, Move, None,
NoDrop, NotAllowed, Grab, Grabbing, ColResize, RowResize, NResize, EResize, SResize, WResize,
NsResize, EwResize, NeResize, NwResize, SeResize, SwResize, NeswResize, NwseResize, ZoomIn,
ZoomOut`. Details in `theming-and-css.md`.

```tsx
<button className={Cursor.Pointer}>Click me</button>
<Frame className={Cursor.Wait}>Loading…</Frame>
```

---

## contract and tokens (pointer)

`import { contract, tokens } from '@react95/core'` — `contract.colors.material` is the string
`"var(--r95-color-material)"`; `tokens.win95` (etc.) are the raw values of each theme. Full
reference: `theming-and-css.md`.

## Things that do NOT exist in v10 (don't generate them)

`ThemeProvider`, `<GlobalStyle />` component, `ModalProvider`, `ModalContext`, Modal
`onClose`/`onHelp`/`closeModal`/`defaultPosition`/`positionOffset` props, `Icon` component,
`Window`, `WindowHeader`, `AppBar`, `Toolbar`, `Select`, `Table`, `Menu`, `Hourglass`,
`Counter`, `styleReset` (the last ones belong to the unrelated `react95` package).
