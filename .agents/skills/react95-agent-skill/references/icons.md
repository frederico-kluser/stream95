# Icons — `@react95/icons` 2.8.0

1131 React components generated (with svgr) from 1131 Windows 95/98/IE4/Office 95/NetMeeting
`.ico` files in `packages/icons/src/icons/`. MIT. The index at the end of this file was
generated from the repo (commit `97bd045`) and checked to be identical to the published
2.8.0 package (`esm/react/*.js` — same 1131 names).

## Importing

Published `exports` map: `"."` → barrel (`esm/index.js`), `"./icons.css"`, `"./*"` →
`esm/react/*.js` (one module per icon; the subpath equals the component name).

```tsx
// Recommended: one module per icon (tree-shakes everywhere)
import { Computer } from '@react95/icons/Computer';
import { FolderOpen } from '@react95/icons/FolderOpen';

// Barrel: works, but bundles ALL 1131 icons unless you apply the fix below
import { Computer, FolderOpen } from '@react95/icons';
```

- Each module exports the component (`Computer`), its variant map (`computerData` —
  `{ '32x32_4': Svg, '16x16_4': Svg }`) and its props type (`ComputerProps`).
- CSS-sprite alternative: `import '@react95/icons/icons.css'` gives 1843 classes named
  `.<Name>_<variant>` (e.g. `<span className="Computer_32x32_4" />`): fixed width/height,
  `display: inline-block`, `background-image: url(./svg/<Name>_<variant>.svg)`.
- The package also contains `svg/` and `png/` folders (`<Name>_<variant>.svg|png`), but they
  are **not** in the exports map, so `@react95/icons/svg/…` can't be imported by bundlers that
  honor `exports` (copy the files instead).
- `@react95/core` depends on `@react95/icons` (^2.8.0), so it is always installed, but import
  it in your own `package.json` if you use it directly.

## Props

```ts
interface ComputerProps extends SVGProps<SVGSVGElement> {
  variant?: '32x32_4' | '16x16_4'; // union of THIS icon's variants
}
const Computer: React.MemoExoticComponent<(props: ComputerProps) => JSX.Element>; // displayName 'Computer'
```

| Prop                                                 | Type                         | Default                                         | Notes                                                                                                   |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `variant`                                            | union of the icon's variants | **the first variant of the `.ico`** (see index) | Picks which embedded image to render.                                                                   |
| `width`, `height`                                    | number \| string             | natural size of the variant                     | `viewBox` is set, so the pixel art scales; integer multiples look best (`shapeRendering="crispEdges"`). |
| `className`, `style`, `role`, `aria-*`, `onClick`, … | `SVGProps<SVGSVGElement>`    | —                                               | Spread on the `<svg>`.                                                                                  |

There is no `size`, `color` or `title` prop (colors are baked into `<path stroke>`s).

Variant names are `<width>x<height>_<bitsPerPixel>`:

| Variant                                                                                 | Icons that have it | Icons that default to it  |
| --------------------------------------------------------------------------------------- | ------------------ | ------------------------- |
| `32x32_4`                                                                               | 961                | 872                       |
| `16x16_4`                                                                               | 633                | 148                       |
| `32x32_1` (monochrome)                                                                  | 103                | 80                        |
| `24x24_4`                                                                               | 43                 | 5                         |
| `48x48_8`                                                                               | 40                 | 14                        |
| `48x48_4`                                                                               | 13                 | 2                         |
| `32x32_8`                                                                               | 12                 | —                         |
| `16x16_8`                                                                               | 12                 | 2                         |
| `10x10_4`                                                                               | 7                  | —                         |
| `16x16_1`                                                                               | 3                  | —                         |
| `64x64_1`                                                                               | 2                  | 2                         |
| `32x32_32`                                                                              | 2                  | 1                         |
| `16x16_32`, `24x24_32`, `48x48_32`, `128x128_32` (MsDos)                                | 1 each             | 1 (`16x16_32`)            |
| `91x36_4`, `98x30_4`, `64x64_4`, `256x96_4`, `22x22_4`, `14x14_4`, `12x12_4`, `32x16_1` | 1 each             | 1 each for the first four |

## Gotchas

1. **Always pass `variant`.** The default is whatever image comes first in the `.ico`:
   80 icons default to a 1-bit monochrome `32x32_1` (e.g. `WindowsExplorer`, `User2`–`User5`,
   `Freecell1`, `Progman13`) and 148 default to 16×16 (e.g. `Notepad`, `Logo`).
2. **Not every icon has `16x16_4`** (633 of 1131 do). Check the index. An unknown variant makes
   the component render `undefined` → React "Element type is invalid" crash (TypeScript
   catches it if you don't cast).
3. Sizes inside React95 components: `TitleBar`/`Modal` force icons to 16×16 and `List.Item`
   gives them `min-width: 16px` — the stories use `16x16_4` for title bars and Tree nodes and
   `32x32_4` for Start-menu items (`TaskBar` window buttons show icons at 20×20).
4. **Accessibility**: the SVGs carry no `<title>` or role. Next to text use
   `aria-hidden="true"`; alone and meaningful use `role="img" aria-label="…"` (as `Alert` does).
5. **Bundle size (verified):** a Rollup 4.65.1 probe over the published files, modelling
   `package.json` `sideEffects` like Vite does, gives the numbers below; the same probe with
   **Rolldown 1.2.15** (the bundler of Vite 8) gives the same picture (barrel 5.59 MB / 621 KB
   gzip with 1131 icons; subpath 1 icon; with the fix below `TaskBar` → 58.5 KB / 9.1 KB):

   | Entry                                                               | Icon modules bundled | Output (raw / gzip)             |
   | ------------------------------------------------------------------- | -------------------- | ------------------------------- |
   | `import { Computer } from '@react95/icons'`                         | 1131                 | 5.67 MB / 639 KB                |
   | `import { Computer } from '@react95/icons/Computer'`                | 1                    | 5.4 KB / 1.6 KB                 |
   | `import { Button } from '@react95/core'`                            | 0                    | 39.7 KB (core tree-shakes fine) |
   | `import { TaskBar } from '@react95/core'` (also Alert, Tree, Video) | 1131                 | 5.72 MB / 648 KB                |

   Cause: `@react95/icons` has no `"sideEffects": false` and every module ends with
   `Computer.displayName = 'Computer'`, so bundlers keep every module re-exported by the
   barrel — including the barrel imports inside core's `Alert`, `TaskBar`, `Tree`, `Video`.
   Fix for Vite (the `moduleSideEffects: false` transform result was verified in both probes —
   Rollup: TaskBar then pulls 1 icon, 53.5 KB / 8.7 KB gzip; Rolldown: 58.5 KB / 9.1 KB):

```ts
// vite.config.ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const react95IconsSideEffectFree = (): Plugin => ({
  name: 'react95-icons-side-effect-free',
  transform(code, id) {
    if (/[\\/]@react95[\\/]icons[\\/]/.test(id)) {
      return { code, map: null, moduleSideEffects: false };
    }
  },
});

export default defineConfig({ plugins: [react(), react95IconsSideEffectFree()] });
```

webpack/Next.js equivalents (unverified): a module rule
`{ test: /[\\/]node_modules[\\/]@react95[\\/]icons[\\/]/, sideEffects: false }`, or Next's
`experimental.optimizePackageImports: ['@react95/icons']` for imports in your own code.
Alternatively patch the package (`patch-package` / `pnpm patch`) to add `"sideEffects": false`.
6. In Next.js App Router, icons rendered from **Server Components** ship no client JS (they're
hook-free `React.memo` SVG components) — the official template renders icons in `page.tsx`.
7. Name clash: there is an icon called **`Tree`** and a core component `Tree`. Alias one:
`import { Tree as TreeIcon } from '@react95/icons/Tree'`. (No other icon name collides with a
core export; generic names like `Close`, `Help`, `Copy`, `Save`, `Settings`, `Star` exist
as icons.)

## Usage examples

```tsx
import { Computer } from '@react95/icons/Computer';
import { Mmsys113 } from '@react95/icons/Mmsys113';

<Computer variant="32x32_4" />                                    // natural 32×32
<Computer variant="16x16_4" aria-hidden="true" />                 // inline with text
<Computer variant="32x32_4" width={64} height={64} />            // 2× pixel art
<Mmsys113 variant="16x16_4" role="img" aria-label="Volume" />
<List.Item icon={<Computer variant="32x32_4" />}>My Computer</List.Item>
<Modal title="Volume" icon={<Mmsys113 variant="16x16_4" />} />
```

Pick an icon visually in Storybook: `https://react95.github.io/React95/?path=/story/icon--all`
(click an icon to copy `<Name variant="…"/>`); groups: `icon--internet-explorer-4`,
`icon--office-95`, `icon--net-meeting`.

Naming rule (from `scripts/makeIcons.mts`): the `.ico` file name without extension, split on
`_`, each part capitalized and joined — `mplayer_1_13.ico` → `Mplayer113`,
`awfext32_6049.ico` → `Awfext326049`, `windows_explorer.ico` → `WindowsExplorer`.
Names from DLL resources (`Shell3215`, `Progman24`, `Gcdef10031`, `Wmsui322220`, …) say
nothing about the picture — browse Storybook for those.

## Icons by category

Categories are a rough, name-based grouping made for this skill (only the three Storybook groups are official). Names that come from Windows DLL resources (e.g. `Shell3215`, `Progman24`, `Gcdef10031`) say nothing about the picture: open the Storybook "Icon" page to see them.

### Microsoft Office 95 (Storybook group "Office 95") (113)

`Artgalry128`, `Artgalry170`, `Artgalry171`, `Artgalry172`, `Artgalry173`, `Binder1263`, `Binder1264`, `Binder1265`, `Binder1266`, `Binder1267`, `Excel257`, `Excel258`, `Excel259`, `Excel260`, `Excel261`, `Excel262`, `Excel263`, `Excel264`, `Excel265`, `Excel266`, `Excel267`, `Excel268`, `Excel269`, `Fastboot101`, `Graph5257`, `Graph5Iconchart`, `Msoffice10`, `Msoffice11`, `Msoffice12`, `Msoffice13`, `Msoffice14`, `Msoffice15`, `Msoffice16`, `Msow0`, `Msow1`, `Msow10`, `Msow11`, `Msow12`, `Msow13`, `Msow2`, `Msow3`, `Msow4`, `Msow5`, `Msow6`, `Msow8`, `Msow9`, `Powerpnt1`, `Powerpnt2`, `Powerpnt3`, `Powerpnt4`, `Ppintl17925`, `Ppintl17926`, `Ppintl17933`, `Ppintl17934`, `Ppintl17939`, `Ppintl18176`, `Ppintl18177`, `Ppintl18178`, `Ppintl18179`, `Ppintl18181`, `Pptview98`, `Winword1`, `Winword2`, `Winword3`, `Winword4`, `Winword5`, `Winword6`, `Winword7`, `Wrdart32100`, `Wrdart321200`, `Wrdart321201`, `Wrdart321202`, `Wrdart321203`, `Wrdart321204`, `Wrdart321205`, `Wrdart321206`, `Wrdart321207`, `Wrdart321208`, `Wrdart321209`, `Wrdart321210`, `Wrdart321211`, `Wrdart321212`, `Wrdart321213`, `Wrdart321214`, `Wrdart321215`, `Wrdart321216`, `Wrdart321217`, `Wrdart321218`, `Wrdart321219`, `Wrdart321220`, `Wrdart321221`, `Wrdart321222`, `Wrdart321223`, `Wrdart321224`, `Wrdart321225`, `Wrdart321226`, `Wrdart321227`, `Wrdart321228`, `Wrdart321229`, `Wrdart321230`, `Wrdart321231`, `Wrdart321232`, `Wrdart321233`, `Wrdart321234`, `Wrdart321235`, `Wrdart321240`, `Wrdart321241`, `Wrdart321242`, `Wrdart321243`, `Wrdart321244`, `Wrdart321245`, `Wrdart321246`, `Wrdart321247`

### Internet Explorer 4 (Storybook group "Internet Explorer 4") (13)

`Icwconn1200`, `Icwconn1202`, `Ie`, `Iexplore32528`, `Iexplore32529`, `Iexplore32537`, `Iexplore32542`, `Iexplore32548`, `Iexplore32549`, `Iexplore32550`, `Iexplore32554`, `Runonce106`, `SetupPhoneicon`

### NetMeeting (Storybook group "NetMeeting") (34)

`Cb32102`, `Cb32104`, `Cb32106`, `Cb32107`, `Cb32108`, `Conf100`, `Conf135`, `Conf150`, `Conf153`, `Conf155`, `Conf156`, `Conf157`, `Conf603`, `Conf604`, `Conf605`, `Conf606`, `Conf607`, `Conf608`, `Conf609`, `Conf610`, `Conf611`, `Conf612`, `Conf613`, `Conf614`, `Conf615`, `Conf8500`, `Mnmshco1202`, `Wb32105`, `Wb32108`, `Wb32109`, `Wb32110`, `Wb32111`, `Wb32112`, `Wb32113`

### Branding, users & dialog glyphs (Logo, users, alerts, help bubbles) (41)

`Bulb`, `Circle`, `Close`, `Fave`, `Forbidden`, `Hand`, `Help`, `HelpBook`, `HelpPtr`, `InfoBubble`, `Issue`, `Key`, `Keys`, `Lock`, `Logo`, `Msrating102`, `Msrating103`, `Msrating104`, `Msrating105`, `Msrating106`, `Msrating107`, `Msrating108`, `Msrating109`, `Password100`, `Password1000`, `Password1010`, `Person116`, `QuestionBubble`, `Star`, `Tick`, `User`, `User1`, `User2`, `User3`, `User4`, `User5`, `User6`, `User7`, `Warning`, `What`, `Wintrust103`

### Computers, drives & hardware (100)

`Camera`, `Computer`, `Computer2`, `Computer3`, `Computer4`, `Computer5`, `ComputerFind`, `Defrag`, `Defrag1`, `Defrag2`, `Defrag3`, `Defrag4`, `Defrag5`, `Defrag6`, `Defrag7`, `Defrag8`, `Defrag9`, `Desktop`, `Dial`, `Dialer1`, `Dialer2`, `Dialmon200`, `Diskcopy1`, `Dpmodemx701`, `Drvspace1`, `Drvspace2`, `Drvspace3`, `Drvspace4`, `Drvspace5`, `Drvspace6`, `Drvspace7`, `Drvspace8`, `Format16`, `HardwareDiag`, `Imgscan10`, `Joy102`, `Joy108`, `Joy110`, `KeyboardMouse`, `Mcm3200`, `Mcm3201`, `Mcm3202`, `Mcm3203`, `Mcm401`, `Mcm502`, `McmEarth`, `McmPhone`, `Mdisp321`, `Memory`, `Mic`, `Mkcompat900`, `Phone`, `Phone2`, `Plugin`, `Plugin2`, `PowerOff`, `PowerOn`, `Powercfg205`, `Powercfg210`, `Powercfg211`, `Qfecheck111`, `ReaderCd`, `ReaderCd2`, `ReaderClosed`, `ReaderDisket`, `ReaderDisket2`, `ReaderDisketCasset`, `ReaderEject`, `ReaderNoshared`, `ReaderOpened`, `ReaderShared`, `Rsrcmtr100`, `Rsrcmtr121`, `Rsrcmtr122`, `Rsrcmtr123`, `Rsrcmtr124`, `Rsrcmtr125`, `Rsrcmtr126`, `Rsrcmtr127`, `Rsrcmtr128`, `Rsrcmtr129`, `Rsrcmtr130`, `Rsrcmtr131`, `Rsrcmtr132`, `Rsrcmtr133`, `Scandskw1`, `Sysmon1000`, `Systray200`, `Systray210`, `Systray220`, `Systray221`, `Systray300`, `Systray301`, `Systray302`, `Systray303`, `Systray304`, `Systray305`, `Systray306`, `Taskman100`, `Twunk32TwunkIcon`

### Printers & fax (40)

`Awfext326049`, `Awfext326050`, `Awfext326051`, `Awfext326052`, `Awfext326053`, `Awfxcg321301`, `Awfxcg321302`, `Awfxcg321303`, `Awfxcg321304`, `Awfxcg321305`, `Awfxex32109`, `Awfxex32113`, `Awfxex32114`, `Awfxex32115`, `Awfxex32116`, `Awfxex32117`, `Awfxex32118`, `Awfxex32119`, `Awfxex32120`, `Awfxex32121`, `Awfxex32Awfxex`, `Awfxex32Info`, `Awschd32400`, `Awschd32401`, `Awschd32402`, `Awsnto3249`, `Awsnto3250`, `Fax`, `FaxWarning`, `Faxcover108`, `Faxcover140`, `Faxcover2`, `Faxcover3`, `Job116`, `Print`, `Print2`, `Printer`, `PrinterCalendar`, `PrinterDrive`, `PrinterShared`

### Folders, files & documents (89)

`Attach`, `Bat`, `BatExec`, `BatExec2`, `BatWait`, `Data16`, `Detlicon`, `Doc`, `DocGris`, `Download`, `Expostrt128`, `FileCorrupted`, `FileDelete`, `FileFind`, `FileFind2`, `FileFind3`, `FileFont`, `FileFont2`, `FileIcons`, `FilePen`, `FilePencil`, `FilePick`, `FilePin`, `FileSettings`, `FileText`, `FileTextSettings`, `FileTransfer`, `Files`, `Filexfer128`, `Filexfer129`, `Filexfer130`, `FindArr`, `FindDc2`, `FindDoc`, `Fm20enu5`, `Folder`, `FolderExe`, `FolderExe2`, `FolderFile`, `FolderFont`, `FolderOpen`, `FolderPrint`, `FolderRename`, `FolderSettings`, `FolderSettings2`, `FolderShared`, `Fte128`, `HtmlPage`, `Listicon`, `LoaderBat`, `LrgIcon`, `Lst2icon`, `Moscudll128`, `Msfs321951`, `New`, `New16`, `Oidis400Seqfileicon`, `Oislb400DcScanIco`, `Oiui400Imgstamp`, `Oiui400Textstamp`, `Open`, `Packager`, `Packager1`, `ProdinvMyicon`, `Props`, `RecycleEmpty`, `RecycleFile`, `RecycleFilefolder`, `RecycleFolder`, `RecycleFull`, `Save`, `Shortcut`, `Shortcut2`, `Shscrap100`, `Syncui120`, `Syncui121`, `Syncui122`, `Syncui123`, `Syncui124`, `Syncui125`, `Syncui126`, `Syncui127`, `Syncui128`, `Syncui129`, `Syncui130`, `Syncui131`, `Syncui132`, `Syncui135`, `SysPackage`

### Network, Internet, mail & online services (224)

`Addrbook`, `Back`, `Bookmark`, `Chatshow3000`, `Confcp102`, `Confcp107`, `Confcp108`, `Confcp109`, `Confcp1100`, `Confcp116`, `Confcp118`, `Confcp120`, `Conflnk102`, `Conflnk103`, `Directcc1001`, `Directcc1002`, `Directcc1003`, `Directcc1004`, `Directcc1005`, `DirectccDirectcc`, `Earth`, `Globe`, `Icmui1200`, `Icmui1201`, `Icwdial101`, `Icwdial102`, `Inetcfg2300`, `Inetcfg2301`, `Inetcfg2302`, `Inetcfg2303`, `Inetcpl1301`, `Inetcpl1302`, `Inetcpl1303`, `Inetcpl1304`, `Inetcpl1305`, `Inetcpl1306`, `Inetcpl1307`, `Inetcpl1308`, `Inetcpl1309`, `Inetcpl1310`, `Inetcpl1311`, `Inetcpl1312`, `Inetcpl1313`, `Inetcpl1314`, `Inetcpl1315`, `Inetcpl1317`, `Inetcpl1318`, `Inetcpl1319`, `Inetcpl1320`, `Inetcpl1321`, `Inetcpl4432`, `Isign32100`, `Isign324001`, `Isign32IcoApp`, `Jgdwmie101`, `Mail`, `Mail2`, `Mail3`, `Mailnews12`, `Mailnews13`, `Mailnews14`, `Mailnews15`, `Mailnews16`, `Mailnews17`, `Mailnews18`, `Mailnews19`, `Mailnews2`, `Mailnews20`, `Mailnews21`, `Mailnews22`, `Mailnews23`, `Mailnews3`, `Mailnews6`, `Mailnews7`, `Mailnews8`, `Mailnews9`, `Mapi32451`, `Mapi32501`, `Mapi32801`, `Mapi32IconAttach`, `Mapisp32100`, `Message`, `MicrosoftExchange`, `MicrosoftNetwork`, `Mlcfg32129`, `Mprserv120`, `Mprserv121`, `Mprserv68`, `Mshtml32528`, `Mshtml32529`, `Mshtml32534`, `Mshtml32535`, `Mshtml32536`, `Mshtml32537`, `Mshtml32538`, `Mshtml32539`, `Mshtml32540`, `Mshtml32541`, `Mshtml32542`, `Mshtml32543`, `Mshtml32544`, `Mshtml32545`, `Mshtml32546`, `Mshtml32547`, `Mshtml32548`, `Mshtml32549`, `Mshtml32550`, `Mshtml32551`, `Mshtml32552`, `Mshtml32553`, `Msnp32FolderIcon`, `Msnp32ServerIcon`, `Msnp32WrkgrpIcon`, `Msnsetup1`, `Msnsign100`, `Msnsign4001`, `MsnsignIcoApp`, `Msnstart1`, `Msnstart100`, `Msnstart110`, `Msnstart120`, `Msnsvc3000`, `Netwatch101`, `Network`, `Network2`, `Network3`, `Nwnp32FolderIcon`, `Nwnp32PrinterIcon`, `Nwnp32ServerIcon`, `Nwnp32WrkgrpIcon`, `Rasapi32100`, `Rasapi32101`, `Rasapi32102`, `Rasapi32103`, `Rasapi32104`, `Rnaapp100`, `Rnaapp101`, `Rnaapp102`, `Rnaapp110`, `Rnaapp111`, `Rnaapp112`, `Rnaapp113`, `Rnaapp114`, `Rnanp100`, `Rnaui100`, `Rnaui101`, `Rnaui102`, `Rnaui103`, `Rnaui104`, `Rnaui105`, `Rnaui106`, `Sendmail2001`, `Shdocvw256`, `Shdocvw257`, `Shdocvw258`, `Shdocvw259`, `Shdocvw260`, `Shdocvw261`, `Shdocvw262`, `Shdocvw272`, `Shdocvw273`, `Shdocvw274`, `Shdocvw275`, `Signup`, `Svrworld`, `Textchat`, `Textchat2`, `Ulclient1002`, `Ulclient1235`, `Url102`, `Url103`, `Url104`, `Url105`, `Url1102`, `Url1103`, `Url1104`, `Url1105`, `Wab321010`, `Wab321011`, `Wab321012`, `Wab321013`, `Wab321014`, `Wab321015`, `Wab321016`, `Wab321017`, `Wab321018`, `Wab321019`, `Wab321020`, `WebLink`, `WebOpen`, `WebTxfr`, `Websrch`, `Wgpocpl128`, `Wininet32546`, `Winpopup1`, `Winpopup2`, `Winpopup3`, `Wmsui321000`, `Wmsui321001`, `Wmsui321306`, `Wmsui322219`, `Wmsui322220`, `Wmsui322221`, `Wmsui322223`, `Wmsui322224`, `Wmsui322225`, `Wmsui322226`, `Wmsui323911`, `Wmsui323912`, `Wmsui323919`, `Wmsui323920`, `Wmsui323924`, `Wmsui323926`, `Wmsui323929`, `Wmsui323934`, `Wmsui323935`, `Wmsui323936`, `Wmsui323938`, `Wmsui325084`, `Wmsui325085`, `Wmsui325086`, `Wmsui325087`, `Wmsui325900`, `Wmsui325901`

### Multimedia, sound & video (78)

`Actmovie303`, `Amovie2`, `CdExe`, `CdMusic`, `CdSearch`, `Cdplayer107`, `Cdplayer110`, `Cdplayer114`, `Mcdpkgtm3000`, `MediaAudio`, `MediaCd`, `MediaVideo`, `Mmsys100`, `Mmsys101`, `Mmsys102`, `Mmsys103`, `Mmsys104`, `Mmsys105`, `Mmsys106`, `Mmsys107`, `Mmsys108`, `Mmsys109`, `Mmsys110`, `Mmsys111`, `Mmsys112`, `Mmsys113`, `Mmsys114`, `Mmsys115`, `Mmsys116`, `Mmsys117`, `Mmsys118`, `Mmsys119`, `Mmsys120`, `Mmsys121`, `Mmsys123`, `Mmsys90`, `Mmsys99`, `Mplayer10`, `Mplayer11`, `Mplayer12`, `Mplayer13`, `Mplayer14`, `Mplayer15`, `Mplayer16`, `Mplayer110`, `Mplayer111`, `Mplayer112`, `Mplayer113`, `Mplayer114`, `Mplayer115`, `Mplayer116`, `Msacm3210`, `Msvfw32943`, `Mute`, `Playd16`, `Playp16`, `Quartz100`, `Quartz101`, `Quartz102`, `Quartz103`, `Quartz200`, `Quartz201`, `Quartz202`, `Quartz203`, `Quartz300`, `Quartz301`, `Raplayer801`, `Smmscrpt100`, `Sndrec3210`, `Sndrec3215`, `Sndrec3216`, `Sndvol32300`, `Sndvol32301`, `Sndvol32302`, `Sndvol32303`, `Sndvol32304`, `Unmute`, `Voxplay3000`

### Screen savers & display (18)

`BlankScreen100`, `CurvesAndColors100`, `D3FlowerBox100`, `D3FlyingObjectsIdApp`, `D3Maze100`, `D3PipesIdApp`, `D3Text100`, `Desk100`, `FlyingThroughSpace100`, `FlyingWindows100`, `Fullscrn`, `Lights100`, `Lights101`, `Lights102`, `Lights103`, `Lights99`, `MystifyYourMind100`, `ScrollingMarquee100`

### Games (4)

`Freecell1`, `Mshearts1`, `Sol1`, `Winmine1`

### Text formatting & toolbar glyphs (41)

`ArrowLeft`, `ArrowRight`, `BillAdd`, `Binoc`, `Bold`, `Brush`, `Centre`, `Columns`, `Copy`, `Cut`, `Delete`, `Font`, `Font2`, `FontBig`, `FontSml`, `FontWid`, `Fontext1`, `Fontext2`, `Fontext3`, `Fontext4`, `Fontview110`, `Fontview111`, `Italic`, `Justify`, `Left`, `NumPage`, `OrderAs`, `OrderDs`, `ParaBul`, `ParaNum`, `Paste`, `Pen`, `Pshbtn`, `Redo`, `Refresh`, `Right`, `Spellchk`, `TimerFont`, `Toupper`, `Underlne`, `Undo`

### Accessories & applications (Explorer, Notepad, Paint, Calculator, Help…) (55)

`Cachevu100`, `CalcSc`, `Calculator`, `Charmap1`, `Date`, `Explore`, `Explorer100`, `Explorer101`, `Explorer102`, `Explorer103`, `Explorer104`, `Explorer105`, `Explorer107`, `Explorer108`, `Imgadmin214`, `Imgedit10`, `Imgedit277`, `Imgthumb10`, `Jdbgmgr100`, `LogView`, `MsDos`, `MsawtAwtIcon`, `Mspaint`, `Notepad`, `Notepad1`, `Notepad2`, `Pbrush1`, `Quikview1`, `Quikview2`, `Quikview3`, `Quikview4`, `SccviewIcon`, `Time`, `Timedate`, `Timedate200`, `Tour1`, `Tree`, `Tssoft3210`, `Vvexe321`, `Wangimg128`, `Wangimg129`, `Wangimg130`, `WindowAbc`, `WindowAccessibility`, `WindowGraph`, `WindowsExplorer`, `Winfile1`, `Winfile2`, `Winfile3`, `Winfile4`, `Winhlp324000`, `Winhlp324001`, `Winhlp324002`, `Wordpad`, `Write1`

### System, Control Panel, setup & shell (generic DLL icon sets) (281)

`Access110`, `Access218`, `Access219`, `Access220`, `Access221`, `Access222`, `Access223`, `Access224`, `Access225`, `Access226`, `Access227`, `Access228`, `Access229`, `Access230`, `Accessibility`, `Appwiz1500`, `Appwiz1501`, `Appwiz1502`, `Appwiz1503`, `Ccapi104`, `Ccapi105`, `Ccapi106`, `Comctl32150`, `Comdlg32528`, `Comdlg32529`, `Comdlg32530`, `Comdlg32531`, `Comdlg32532`, `Comdlg32533`, `Comdlg32534`, `Comdlg32535`, `Comdlg32536`, `Comdlg32537`, `Comdlg32538`, `Comdlg32539`, `Controls3000`, `Coreui3000`, `Gcdef100`, `Gcdef10001`, `Gcdef10002`, `Gcdef10003`, `Gcdef10004`, `Gcdef10005`, `Gcdef10006`, `Gcdef10007`, `Gcdef10008`, `Gcdef10009`, `Gcdef10010`, `Gcdef10011`, `Gcdef10012`, `Gcdef10013`, `Gcdef10014`, `Gcdef10015`, `Gcdef10016`, `Gcdef10017`, `Gcdef10018`, `Gcdef10019`, `Gcdef10020`, `Gcdef10021`, `Gcdef10022`, `Gcdef10023`, `Gcdef10024`, `Gcdef10025`, `Gcdef10026`, `Gcdef10027`, `Gcdef10028`, `Gcdef10029`, `Gcdef10030`, `Gcdef10031`, `Gcdef10032`, `Gcdef10033`, `Gcdef10034`, `Gcdef10035`, `Gcdef10036`, `Gcdef10037`, `Gcdef10038`, `Gcdef10039`, `Gcdef10040`, `Gcdef10041`, `Gcdef10042`, `Gcdef10043`, `Gcdef10044`, `Gcdef10045`, `Gcdef10046`, `Gcdef10047`, `Gcdef10048`, `Gcdef10049`, `Gcdef10050`, `Gcdef10051`, `Gcdef10052`, `Gcdef10053`, `Gcdef10054`, `Gcdef10055`, `Gcdef10056`, `Gcdef10057`, `Gcdef10058`, `Gcdef10059`, `Gcdef10060`, `Gcdef10061`, `Gcdef10062`, `Gcdef10063`, `Gcdef10064`, `Gcdef101`, `Gcdef102`, `Gcdef103`, `Gcdef104`, `Gcdef105`, `Gcdef106`, `Gcdef107`, `Gcdef108`, `Gcdef109`, `Gcdef110`, `Gcdef111`, `Gcdef112`, `Gcdef113`, `Gcdef114`, `Gcdef115`, `Gcdef116`, `Gcdef117`, `Gcdef122`, `Gcdef124`, `Grpconv100`, `Grpconv101`, `Install`, `Internat151`, `Intl101`, `Isuninst1000`, `Main100`, `Main103`, `Main104`, `Main105`, `Main106`, `Main107`, `Main200`, `Main300`, `Main400`, `Main500`, `Main600`, `Mipac`, `Ole328`, `Optional3000`, `Progman1`, `Progman10`, `Progman11`, `Progman12`, `Progman13`, `Progman14`, `Progman15`, `Progman16`, `Progman17`, `Progman18`, `Progman19`, `Progman2`, `Progman20`, `Progman21`, `Progman22`, `Progman23`, `Progman24`, `Progman25`, `Progman26`, `Progman27`, `Progman28`, `Progman29`, `Progman3`, `Progman30`, `Progman31`, `Progman32`, `Progman33`, `Progman34`, `Progman35`, `Progman36`, `Progman37`, `Progman38`, `Progman39`, `Progman4`, `Progman40`, `Progman41`, `Progman42`, `Progman43`, `Progman44`, `Progman45`, `Progman46`, `Progman5`, `Progman6`, `Progman7`, `Progman8`, `Progman9`, `Regedit`, `Regedit100`, `Regedit101`, `Regedit102`, `Regedit201`, `Regedit202`, `Regedit203`, `Regedit204`, `Regedit205`, `Regedit206`, `Regwiz117`, `Regwiz122`, `Regwiz127`, `Regwiz129`, `Rundll1`, `Settings`, `Setupslt3000`, `Shell321`, `Shell3210`, `Shell3211`, `Shell3212`, `Shell3213`, `Shell32133`, `Shell32134`, `Shell32135`, `Shell32136`, `Shell32137`, `Shell32138`, `Shell32139`, `Shell3214`, `Shell32140`, `Shell32141`, `Shell32142`, `Shell32143`, `Shell32144`, `Shell32145`, `Shell32146`, `Shell32147`, `Shell32148`, `Shell3215`, `Shell32151`, `Shell32152`, `Shell32153`, `Shell32154`, `Shell32155`, `Shell32156`, `Shell3216`, `Shell32160`, `Shell32161`, `Shell32165`, `Shell32166`, `Shell32167`, `Shell32168`, `Shell32169`, `Shell3217`, `Shell32170`, `Shell3218`, `Shell3219`, `Shell322`, `Shell3220`, `Shell3221`, `Shell3222`, `Shell3223`, `Shell3224`, `Shell3225`, `Shell3226`, `Shell3227`, `Shell3228`, `Shell3229`, `Shell323`, `Shell3230`, `Shell3231`, `Shell3232`, `Shell3233`, `Shell3234`, `Shell3235`, `Shell3236`, `Shell3237`, `Shell3238`, `Shell3239`, `Shell324`, `Shell3240`, `Shell3241`, `Shell3242`, `Shell325`, `Shell326`, `Shell327`, `Shell328`, `Shell329`, `Swinst53000`, `Sysedit1`, `Sysedit2`, `Uninst1000`, `Uninstall`

## Complete alphabetical index (1131 components)

Format: `Component` — variants (the **first** one is the default `variant`) — source `.ico` in `packages/icons/src/icons/`.


### A

- `Access110` — **32x32_4**, 16x16_4 — access_110.ico
- `Access218` — **32x32_4** — access_218.ico
- `Access219` — **32x32_4** — access_219.ico
- `Access220` — **32x32_4** — access_220.ico
- `Access221` — **32x32_4** — access_221.ico
- `Access222` — **32x32_4** — access_222.ico
- `Access223` — **32x32_4** — access_223.ico
- `Access224` — **32x32_4** — access_224.ico
- `Access225` — **32x32_4** — access_225.ico
- `Access226` — **32x32_4** — access_226.ico
- `Access227` — **32x32_4** — access_227.ico
- `Access228` — **32x32_4** — access_228.ico
- `Access229` — **32x32_4** — access_229.ico
- `Access230` — **32x32_4** — access_230.ico
- `Accessibility` — **64x64_1** — accessibility.ico
- `Actmovie303` — **32x32_4**, 16x16_4 — actmovie_303.ico
- `Addrbook` — **16x16_4** — addrbook.ico
- `Amovie2` — **32x32_4**, 16x16_4 — amovie_2.ico
- `Appwiz1500` — **32x32_4**, 16x16_4 — appwiz_1500.ico
- `Appwiz1501` — **32x32_4** — appwiz_1501.ico
- `Appwiz1502` — **32x32_4** — appwiz_1502.ico
- `Appwiz1503` — **32x32_4** — appwiz_1503.ico
- `ArrowLeft` — **32x32_4** — arrow_left.ico
- `ArrowRight` — **32x32_4** — arrow_right.ico
- `Artgalry128` — **32x32_4** — artgalry_128.ico
- `Artgalry170` — **32x32_4** — artgalry_170.ico
- `Artgalry171` — **32x32_4** — artgalry_171.ico
- `Artgalry172` — **32x32_4** — artgalry_172.ico
- `Artgalry173` — **32x32_4** — artgalry_173.ico
- `Attach` — **16x16_4** — attach.ico
- `Awfext326049` — **32x32_4** — awfext32_6049.ico
- `Awfext326050` — **16x16_4** — awfext32_6050.ico
- `Awfext326051` — **32x32_4** — awfext32_6051.ico
- `Awfext326052` — **32x32_4** — awfext32_6052.ico
- `Awfext326053` — **32x32_4**, 16x16_4 — awfext32_6053.ico
- `Awfxcg321301` — **32x32_4**, 16x16_4 — awfxcg32_1301.ico
- `Awfxcg321302` — **32x32_4** — awfxcg32_1302.ico
- `Awfxcg321303` — **32x32_4** — awfxcg32_1303.ico
- `Awfxcg321304` — **32x32_4**, 16x16_4 — awfxcg32_1304.ico
- `Awfxcg321305` — **32x32_4** — awfxcg32_1305.ico
- `Awfxex32109` — **32x32_4**, 16x16_4 — awfxex32_109.ico
- `Awfxex32113` — **32x32_4** — awfxex32_113.ico
- `Awfxex32114` — **32x32_4** — awfxex32_114.ico
- `Awfxex32115` — **32x32_4** — awfxex32_115.ico
- `Awfxex32116` — **32x32_4** — awfxex32_116.ico
- `Awfxex32117` — **32x32_4** — awfxex32_117.ico
- `Awfxex32118` — **32x32_4** — awfxex32_118.ico
- `Awfxex32119` — **32x32_4** — awfxex32_119.ico
- `Awfxex32120` — **32x32_4** — awfxex32_120.ico
- `Awfxex32121` — **32x32_4** — awfxex32_121.ico
- `Awfxex32Awfxex` — **32x32_4**, 16x16_4 — awfxex32_awfxex.ico
- `Awfxex32Info` — **32x32_4** — awfxex32_info.ico
- `Awschd32400` — **32x32_4**, 16x16_4 — awschd32_400.ico
- `Awschd32401` — **32x32_4**, 16x16_4 — awschd32_401.ico
- `Awschd32402` — **32x32_4**, 16x16_4 — awschd32_402.ico
- `Awsnto3249` — **32x32_4**, 16x16_4 — awsnto32_49.ico
- `Awsnto3250` — **32x32_4**, 16x16_4 — awsnto32_50.ico

### B

- `Back` — **16x16_4** — back.ico
- `Bat` — **32x32_4**, 16x16_4 — bat.ico
- `BatExec` — **32x32_4**, 16x16_4 — bat_exec.ico
- `BatExec2` — **32x32_4**, 16x16_4 — bat_exec_2.ico
- `BatWait` — **32x32_4**, 16x16_4 — bat_wait.ico
- `BillAdd` — **32x32_4** — bill_add.ico
- `Binder1263` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — binder_1263.ico
- `Binder1264` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — binder_1264.ico
- `Binder1265` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — binder_1265.ico
- `Binder1266` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — binder_1266.ico
- `Binder1267` — **32x32_1**, 32x32_4 — binder_1267.ico
- `Binoc` — **16x16_4** — binoc.ico
- `BlankScreen100` — **32x32_4**, 16x16_4 — blank_screen_100.ico
- `Bold` — **16x16_4** — bold.ico
- `Bookmark` — **32x32_4**, 16x16_4 — bookmark.ico
- `Brush` — **32x32_4** — brush.ico
- `Bulb` — **32x32_4** — bulb.ico

### C

- `Cachevu100` — **32x32_4**, 16x16_4 — cachevu_100.ico
- `CalcSc` — **32x32_4**, 16x16_4 — calc_sc.ico
- `Calculator` — **32x32_4**, 16x16_4 — calculator.ico
- `Camera` — **32x32_4**, 16x16_4 — camera.ico
- `Cb32102` — **32x32_4** — cb32_102.ico
- `Cb32104` — **32x32_4** — cb32_104.ico
- `Cb32106` — **32x32_4** — cb32_106.ico
- `Cb32107` — **32x32_4** — cb32_107.ico
- `Cb32108` — **32x32_4** — cb32_108.ico
- `Ccapi104` — **32x32_4**, 16x16_4 — ccapi_104.ico
- `Ccapi105` — **32x32_4**, 16x16_4 — ccapi_105.ico
- `Ccapi106` — **32x32_4**, 16x16_4 — ccapi_106.ico
- `CdExe` — **32x32_4** — cd_exe.ico
- `CdMusic` — **32x32_4**, 16x16_4 — cd_music.ico
- `Cdplayer107` — **32x32_4**, 16x16_4 — cdplayer_107.ico
- `Cdplayer110` — **32x32_4** — cdplayer_110.ico
- `Cdplayer114` — **32x32_1** — cdplayer_114.ico
- `CdSearch` — **32x32_4** — cd_search.ico
- `Centre` — **16x16_4** — centre.ico
- `Charmap1` — **32x32_4**, 16x16_4 — charmap_1.ico
- `Chatshow3000` — **32x32_4**, 16x16_4 — chatshow_3000.ico
- `Circle` — **16x16_4** — circle.ico
- `Close` — **16x16_4** — close.ico
- `Columns` — **16x16_4** — columns.ico
- `Comctl32150` — **32x32_1** — comctl32_150.ico
- `Comdlg32528` — **32x32_4** — comdlg32_528.ico
- `Comdlg32529` — **32x32_4** — comdlg32_529.ico
- `Comdlg32530` — **32x32_4** — comdlg32_530.ico
- `Comdlg32531` — **32x32_4** — comdlg32_531.ico
- `Comdlg32532` — **32x32_4** — comdlg32_532.ico
- `Comdlg32533` — **32x32_4** — comdlg32_533.ico
- `Comdlg32534` — **32x32_4** — comdlg32_534.ico
- `Comdlg32535` — **32x32_4** — comdlg32_535.ico
- `Comdlg32536` — **91x36_4** — comdlg32_536.ico
- `Comdlg32537` — **98x30_4** — comdlg32_537.ico
- `Comdlg32538` — **32x32_4** — comdlg32_538.ico
- `Comdlg32539` — **32x32_4** — comdlg32_539.ico
- `Computer` — **32x32_4**, 16x16_4 — computer.ico
- `Computer2` — **32x32_4**, 16x16_4 — computer_2.ico
- `Computer3` — **32x32_4**, 16x16_4 — computer_3.ico
- `Computer4` — **32x32_4**, 16x16_4 — computer_4.ico
- `Computer5` — **32x32_4** — computer_5.ico
- `ComputerFind` — **32x32_4**, 16x16_4 — computer_find.ico
- `Conf100` — **32x32_4**, 16x16_4 — conf_100.ico
- `Conf135` — **32x32_4**, 16x16_4 — conf_135.ico
- `Conf150` — **16x16_4** — conf_150.ico
- `Conf153` — **32x32_4**, 16x16_4 — conf_153.ico
- `Conf155` — **32x32_4**, 16x16_4 — conf_155.ico
- `Conf156` — **32x32_4**, 16x16_4 — conf_156.ico
- `Conf157` — **32x32_4**, 16x16_4 — conf_157.ico
- `Conf603` — **16x16_4** — conf_603.ico
- `Conf604` — **16x16_4** — conf_604.ico
- `Conf605` — **16x16_4** — conf_605.ico
- `Conf606` — **16x16_4** — conf_606.ico
- `Conf607` — **16x16_4** — conf_607.ico
- `Conf608` — **16x16_4** — conf_608.ico
- `Conf609` — **16x16_4** — conf_609.ico
- `Conf610` — **16x16_4** — conf_610.ico
- `Conf611` — **16x16_4** — conf_611.ico
- `Conf612` — **16x16_4** — conf_612.ico
- `Conf613` — **16x16_4** — conf_613.ico
- `Conf614` — **16x16_4** — conf_614.ico
- `Conf615` — **16x16_4** — conf_615.ico
- `Conf8500` — **16x16_4** — conf_8500.ico
- `Confcp102` — **32x32_4**, 16x16_4 — confcp_102.ico
- `Confcp107` — **16x16_4** — confcp_107.ico
- `Confcp108` — **16x16_4** — confcp_108.ico
- `Confcp109` — **16x16_4** — confcp_109.ico
- `Confcp1100` — **32x32_4**, 16x16_4 — confcp_1100.ico
- `Confcp116` — **32x32_4**, 16x16_4 — confcp_116.ico
- `Confcp118` — **32x32_4** — confcp_118.ico
- `Confcp120` — **16x16_4** — confcp_120.ico
- `Conflnk102` — **32x32_4**, 16x16_4 — conflnk_102.ico
- `Conflnk103` — **32x32_4**, 16x16_4 — conflnk_103.ico
- `Controls3000` — **32x32_4**, 16x16_4 — controls_3000.ico
- `Copy` — **16x16_4** — copy.ico
- `Coreui3000` — **32x32_4**, 16x16_4 — coreui_3000.ico
- `CurvesAndColors100` — **32x32_4**, 16x16_4 — curves_and_colors_100.ico
- `Cut` — **16x16_4** — cut.ico

### D

- `D3FlowerBox100` — **32x32_1**, 32x32_4 — d3_flower_box_100.ico
- `D3FlyingObjectsIdApp` — **32x32_1**, 32x32_4 — d3_flying_objects_id_app.ico
- `D3Maze100` — **32x32_1**, 32x32_4 — d3_maze_100.ico
- `D3PipesIdApp` — **32x32_1**, 32x32_4 — d3_pipes_id_app.ico
- `D3Text100` — **32x32_1**, 32x32_4 — d3_text_100.ico
- `Data16` — **16x16_4** — data16.ico
- `Date` — **16x16_4** — date.ico
- `Defrag` — **32x32_4**, 16x16_4 — defrag.ico
- `Defrag1` — **32x32_4**, 16x16_4 — defrag_1.ico
- `Defrag2` — **32x32_4**, 16x16_4 — defrag_2.ico
- `Defrag3` — **32x32_4**, 16x16_4 — defrag_3.ico
- `Defrag4` — **32x32_4**, 16x16_4 — defrag_4.ico
- `Defrag5` — **32x32_4**, 16x16_4 — defrag_5.ico
- `Defrag6` — **32x32_4**, 16x16_4 — defrag_6.ico
- `Defrag7` — **32x32_4**, 16x16_4 — defrag_7.ico
- `Defrag8` — **32x32_4** — defrag_8.ico
- `Defrag9` — **32x32_4** — defrag_9.ico
- `Delete` — **16x16_4** — delete.ico
- `Desk100` — **32x32_4**, 16x16_4 — desk_100.ico
- `Desktop` — **32x32_4**, 16x16_4 — desktop.ico
- `Detlicon` — **16x16_4** — detlicon.ico
- `Dial` — **32x32_4** — dial.ico
- `Dialer1` — **32x32_4**, 16x16_4 — dialer_1.ico
- `Dialer2` — **32x32_4** — dialer_2.ico
- `Dialmon200` — **32x32_4** — dialmon_200.ico
- `Directcc1001` — **32x32_4** — directcc_1001.ico
- `Directcc1002` — **32x32_4** — directcc_1002.ico
- `Directcc1003` — **32x32_4** — directcc_1003.ico
- `Directcc1004` — **32x32_4** — directcc_1004.ico
- `Directcc1005` — **32x32_4**, 16x16_4 — directcc_1005.ico
- `DirectccDirectcc` — **32x32_4**, 16x16_4 — directcc_directcc.ico
- `Diskcopy1` — **32x32_4**, 16x16_4 — diskcopy_1.ico
- `Doc` — **16x16_4** — doc.ico
- `DocGris` — **16x16_4** — doc_gris.ico
- `Download` — **16x16_4** — download.ico
- `Dpmodemx701` — **32x32_4**, 16x16_4 — dpmodemx_701.ico
- `Drvspace1` — **32x32_4**, 16x16_4 — drvspace_1.ico
- `Drvspace2` — **32x32_4**, 16x16_4 — drvspace_2.ico
- `Drvspace3` — **32x32_4**, 16x16_4 — drvspace_3.ico
- `Drvspace4` — **32x32_4**, 16x16_4 — drvspace_4.ico
- `Drvspace5` — **32x32_4**, 16x16_4 — drvspace_5.ico
- `Drvspace6` — **32x32_4**, 16x16_4 — drvspace_6.ico
- `Drvspace7` — **32x32_4** — drvspace_7.ico
- `Drvspace8` — **32x32_4**, 16x16_4 — drvspace_8.ico

### E

- `Earth` — **32x32_4** — earth.ico
- `Excel257` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — excel_257.ico
- `Excel258` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — excel_258.ico
- `Excel259` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — excel_259.ico
- `Excel260` — **32x32_4**, 24x24_4, 16x16_4 — excel_260.ico
- `Excel261` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — excel_261.ico
- `Excel262` — **32x32_4**, 16x16_4 — excel_262.ico
- `Excel263` — **32x32_4**, 16x16_4, 48x48_8, 24x24_4 — excel_263.ico
- `Excel264` — **32x32_4**, 24x24_4, 16x16_4 — excel_264.ico
- `Excel265` — **32x32_4**, 24x24_4, 16x16_4 — excel_265.ico
- `Excel266` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — excel_266.ico
- `Excel267` — **32x32_4**, 24x24_4, 16x16_4 — excel_267.ico
- `Excel268` — **32x32_4**, 24x24_4, 16x16_4 — excel_268.ico
- `Excel269` — **32x32_4**, 24x24_4, 16x16_4 — excel_269.ico
- `Explore` — **32x32_4** — explore.ico
- `Explorer100` — **32x32_4**, 16x16_4 — explorer_100.ico
- `Explorer101` — **32x32_1**, 32x32_4, 16x16_4 — explorer_101.ico
- `Explorer102` — **32x32_4**, 16x16_4 — explorer_102.ico
- `Explorer103` — **32x32_4**, 16x16_4 — explorer_103.ico
- `Explorer104` — **16x16_4** — explorer_104.ico
- `Explorer105` — **32x32_4** — explorer_105.ico
- `Explorer107` — **32x32_4** — explorer_107.ico
- `Explorer108` — **32x32_4** — explorer_108.ico
- `Expostrt128` — **32x32_4**, 16x16_4 — expostrt_128.ico

### F

- `Fastboot101` — **32x32_4**, 16x16_4 — fastboot_101.ico
- `Fave` — **16x16_4** — fave.ico
- `Fax` — **32x32_4**, 16x16_4 — fax.ico
- `Faxcover108` — **32x32_4**, 32x32_1, 16x16_4, 16x16_1 — faxcover_108.ico
- `Faxcover140` — **32x32_4** — faxcover_140.ico
- `Faxcover2` — **32x32_4**, 32x32_1, 16x16_4, 16x16_1 — faxcover_2.ico
- `Faxcover3` — **32x32_4**, 32x32_1, 16x16_4, 16x16_1 — faxcover_3.ico
- `FaxWarning` — **32x32_4**, 16x16_4 — fax_warning.ico
- `FileCorrupted` — **32x32_4** — file_corrupted.ico
- `FileDelete` — **32x32_4** — file_delete.ico
- `FileFind` — **32x32_4**, 16x16_4 — file_find.ico
- `FileFind2` — **32x32_1**, 32x32_4, 16x16_4 — file_find2.ico
- `FileFind3` — **32x32_4** — file_find3.ico
- `FileFont` — **32x32_4**, 16x16_4 — file_font.ico
- `FileFont2` — **32x32_4**, 16x16_4 — file_font_2.ico
- `FileIcons` — **32x32_4** — file_icons.ico
- `FilePen` — **32x32_4**, 16x16_4 — file_pen.ico
- `FilePencil` — **32x32_4** — file_pencil.ico
- `FilePick` — **32x32_4** — file_pick.ico
- `FilePin` — **32x32_4**, 16x16_4 — file_pin.ico
- `Files` — **32x32_4**, 16x16_4 — files.ico
- `FileSettings` — **32x32_4**, 16x16_4 — file_settings.ico
- `FileText` — **32x32_4**, 16x16_4 — file_text.ico
- `FileTextSettings` — **32x32_4**, 16x16_4 — file_text_settings.ico
- `FileTransfer` — **32x32_4** — file_transfer.ico
- `Filexfer128` — **32x32_4**, 16x16_4 — filexfer_128.ico
- `Filexfer129` — **32x32_4** — filexfer_129.ico
- `Filexfer130` — **32x32_4** — filexfer_130.ico
- `FindArr` — **16x16_4** — find_arr.ico
- `FindDc2` — **16x16_4** — find_dc2.ico
- `FindDoc` — **16x16_4** — find_doc.ico
- `FlyingThroughSpace100` — **32x32_4**, 16x16_4 — flying_through_space_100.ico
- `FlyingWindows100` — **32x32_4**, 16x16_4 — flying_windows_100.ico
- `Fm20enu5` — **32x32_4** — fm20enu_5.ico
- `Folder` — **32x32_4**, 16x16_4 — folder.ico
- `FolderExe` — **32x32_4**, 16x16_4 — folder_exe.ico
- `FolderExe2` — **32x32_4**, 16x16_4 — folder_exe2.ico
- `FolderFile` — **32x32_4**, 16x16_4 — folder_file.ico
- `FolderFont` — **32x32_4**, 16x16_4 — folder_font.ico
- `FolderOpen` — **32x32_4**, 16x16_4 — folder_open.ico
- `FolderPrint` — **32x32_4**, 16x16_4 — folder_print.ico
- `FolderRename` — **32x32_4**, 16x16_4 — folder_rename.ico
- `FolderSettings` — **32x32_4**, 16x16_4 — folder_settings.ico
- `FolderSettings2` — **32x32_4** — folder_settings_2.ico
- `FolderShared` — **32x32_4**, 16x16_4 — folder_shared.ico
- `Font` — **32x32_4** — font.ico
- `Font2` — **16x16_4** — font2.ico
- `FontBig` — **16x16_4** — font_big.ico
- `Fontext1` — **32x32_4**, 16x16_4 — fontext_1.ico
- `Fontext2` — **32x32_4**, 16x16_4 — fontext_2.ico
- `Fontext3` — **32x32_4**, 16x16_4 — fontext_3.ico
- `Fontext4` — **32x32_4**, 16x16_4 — fontext_4.ico
- `FontSml` — **16x16_4** — font_sml.ico
- `Fontview110` — **32x32_4**, 16x16_4 — fontview_110.ico
- `Fontview111` — **32x32_4**, 16x16_4 — fontview_111.ico
- `FontWid` — **16x16_4** — font_wid.ico
- `Forbidden` — **32x32_4**, 16x16_4 — forbidden.ico
- `Format16` — **16x16_4** — format16.ico
- `Freecell1` — **32x32_1**, 32x32_4 — freecell_1.ico
- `Fte128` — **32x32_4**, 16x16_4 — fte_128.ico
- `Fullscrn` — **16x16_4** — fullscrn.ico

### G

- `Gcdef100` — **32x32_4**, 48x48_4, 16x16_4, 32x32_8, 48x48_8, 16x16_8 — gcdef_100.ico
- `Gcdef10001` — **32x32_4** — gcdef_10001.ico
- `Gcdef10002` — **32x32_4** — gcdef_10002.ico
- `Gcdef10003` — **32x32_4** — gcdef_10003.ico
- `Gcdef10004` — **32x32_4** — gcdef_10004.ico
- `Gcdef10005` — **32x32_4** — gcdef_10005.ico
- `Gcdef10006` — **32x32_4** — gcdef_10006.ico
- `Gcdef10007` — **32x32_4** — gcdef_10007.ico
- `Gcdef10008` — **32x32_4** — gcdef_10008.ico
- `Gcdef10009` — **32x32_4** — gcdef_10009.ico
- `Gcdef10010` — **32x32_4** — gcdef_10010.ico
- `Gcdef10011` — **32x32_4** — gcdef_10011.ico
- `Gcdef10012` — **32x32_4** — gcdef_10012.ico
- `Gcdef10013` — **32x32_4** — gcdef_10013.ico
- `Gcdef10014` — **32x32_4** — gcdef_10014.ico
- `Gcdef10015` — **32x32_4** — gcdef_10015.ico
- `Gcdef10016` — **32x32_4** — gcdef_10016.ico
- `Gcdef10017` — **32x32_4** — gcdef_10017.ico
- `Gcdef10018` — **32x32_4** — gcdef_10018.ico
- `Gcdef10019` — **32x32_4** — gcdef_10019.ico
- `Gcdef10020` — **32x32_4** — gcdef_10020.ico
- `Gcdef10021` — **32x32_4** — gcdef_10021.ico
- `Gcdef10022` — **32x32_4** — gcdef_10022.ico
- `Gcdef10023` — **32x32_4** — gcdef_10023.ico
- `Gcdef10024` — **32x32_4** — gcdef_10024.ico
- `Gcdef10025` — **32x32_4** — gcdef_10025.ico
- `Gcdef10026` — **32x32_4** — gcdef_10026.ico
- `Gcdef10027` — **32x32_4** — gcdef_10027.ico
- `Gcdef10028` — **32x32_4** — gcdef_10028.ico
- `Gcdef10029` — **32x32_4** — gcdef_10029.ico
- `Gcdef10030` — **32x32_4** — gcdef_10030.ico
- `Gcdef10031` — **32x32_4** — gcdef_10031.ico
- `Gcdef10032` — **32x32_4** — gcdef_10032.ico
- `Gcdef10033` — **32x32_4** — gcdef_10033.ico
- `Gcdef10034` — **32x32_4** — gcdef_10034.ico
- `Gcdef10035` — **32x32_4** — gcdef_10035.ico
- `Gcdef10036` — **32x32_4** — gcdef_10036.ico
- `Gcdef10037` — **32x32_4** — gcdef_10037.ico
- `Gcdef10038` — **32x32_4** — gcdef_10038.ico
- `Gcdef10039` — **32x32_4** — gcdef_10039.ico
- `Gcdef10040` — **32x32_4** — gcdef_10040.ico
- `Gcdef10041` — **32x32_4** — gcdef_10041.ico
- `Gcdef10042` — **32x32_4** — gcdef_10042.ico
- `Gcdef10043` — **32x32_4** — gcdef_10043.ico
- `Gcdef10044` — **32x32_4** — gcdef_10044.ico
- `Gcdef10045` — **32x32_4** — gcdef_10045.ico
- `Gcdef10046` — **32x32_4** — gcdef_10046.ico
- `Gcdef10047` — **32x32_4** — gcdef_10047.ico
- `Gcdef10048` — **32x32_4** — gcdef_10048.ico
- `Gcdef10049` — **32x32_4** — gcdef_10049.ico
- `Gcdef10050` — **32x32_4** — gcdef_10050.ico
- `Gcdef10051` — **32x32_4** — gcdef_10051.ico
- `Gcdef10052` — **32x32_4** — gcdef_10052.ico
- `Gcdef10053` — **32x32_4** — gcdef_10053.ico
- `Gcdef10054` — **32x32_4** — gcdef_10054.ico
- `Gcdef10055` — **32x32_4** — gcdef_10055.ico
- `Gcdef10056` — **32x32_4** — gcdef_10056.ico
- `Gcdef10057` — **32x32_4** — gcdef_10057.ico
- `Gcdef10058` — **32x32_4** — gcdef_10058.ico
- `Gcdef10059` — **32x32_4** — gcdef_10059.ico
- `Gcdef10060` — **32x32_4** — gcdef_10060.ico
- `Gcdef10061` — **32x32_4** — gcdef_10061.ico
- `Gcdef10062` — **32x32_4** — gcdef_10062.ico
- `Gcdef10063` — **32x32_4** — gcdef_10063.ico
- `Gcdef10064` — **32x32_4** — gcdef_10064.ico
- `Gcdef101` — **32x32_4** — gcdef_101.ico
- `Gcdef102` — **32x32_4** — gcdef_102.ico
- `Gcdef103` — **32x32_4** — gcdef_103.ico
- `Gcdef104` — **32x32_4** — gcdef_104.ico
- `Gcdef105` — **32x32_4** — gcdef_105.ico
- `Gcdef106` — **32x32_4** — gcdef_106.ico
- `Gcdef107` — **32x32_4** — gcdef_107.ico
- `Gcdef108` — **48x48_8** — gcdef_108.ico
- `Gcdef109` — **48x48_8** — gcdef_109.ico
- `Gcdef110` — **48x48_8** — gcdef_110.ico
- `Gcdef111` — **48x48_8** — gcdef_111.ico
- `Gcdef112` — **48x48_8** — gcdef_112.ico
- `Gcdef113` — **48x48_8** — gcdef_113.ico
- `Gcdef114` — **48x48_8** — gcdef_114.ico
- `Gcdef115` — **48x48_8** — gcdef_115.ico
- `Gcdef116` — **48x48_8** — gcdef_116.ico
- `Gcdef117` — **48x48_8** — gcdef_117.ico
- `Gcdef122` — **48x48_8** — gcdef_122.ico
- `Gcdef124` — **64x64_4** — gcdef_124.ico
- `Globe` — **32x32_4**, 16x16_4 — globe.ico
- `Graph5257` — **32x32_1**, 32x32_4 — graph5_257.ico
- `Graph5Iconchart` — **32x32_1**, 32x32_4 — graph5_iconchart.ico
- `Grpconv100` — **32x32_1**, 32x32_4 — grpconv_100.ico
- `Grpconv101` — **32x32_4** — grpconv_101.ico

### H

- `Hand` — **32x32_4**, 16x16_4 — hand.ico
- `HardwareDiag` — **32x32_4** — hardware_diag.ico
- `Help` — **16x16_4** — help.ico
- `HelpBook` — **32x32_4**, 16x16_4 — help_book.ico
- `HelpPtr` — **16x16_4** — help_ptr.ico
- `HtmlPage` — **16x16_8** — html_page.ico

### I

- `Icmui1200` — **32x32_4**, 16x16_4 — icmui_1200.ico
- `Icmui1201` — **32x32_4**, 16x16_4 — icmui_1201.ico
- `Icwconn1200` — **32x32_4**, 16x16_4, 48x48_4, 32x32_8, 48x48_8, 16x16_8 — icwconn1_200.ico
- `Icwconn1202` — **32x32_4**, 16x16_4 — icwconn1_202.ico
- `Icwdial101` — **32x32_4**, 32x32_1 — icwdial_101.ico
- `Icwdial102` — **32x32_4** — icwdial_102.ico
- `Ie` — **16x16_8**, 32x32_4, 32x32_8, 48x48_8, 16x16_4, 48x48_4 — ie.ico
- `Iexplore32528` — **32x32_4**, 32x32_8, 48x48_8, 16x16_4, 16x16_8, 48x48_4 — iexplore_32528.ico
- `Iexplore32529` — **16x16_4**, 32x32_4, 48x48_4, 32x32_8, 16x16_8, 48x48_8 — iexplore_32529.ico
- `Iexplore32537` — **32x32_4**, 16x16_4 — iexplore_32537.ico
- `Iexplore32542` — **32x32_4**, 16x16_4 — iexplore_32542.ico
- `Iexplore32548` — **32x32_4**, 16x16_4 — iexplore_32548.ico
- `Iexplore32549` — **32x32_4**, 16x16_4 — iexplore_32549.ico
- `Iexplore32550` — **32x32_4**, 16x16_4 — iexplore_32550.ico
- `Iexplore32554` — **32x32_4**, 16x16_4 — iexplore_32554.ico
- `Imgadmin214` — **32x32_4**, 16x16_4 — imgadmin_214.ico
- `Imgedit10` — **32x32_4** — imgedit_10.ico
- `Imgedit277` — **32x32_4** — imgedit_277.ico
- `Imgscan10` — **32x32_4** — imgscan_10.ico
- `Imgthumb10` — **32x32_4** — imgthumb_10.ico
- `Inetcfg2300` — **32x32_4** — inetcfg_2300.ico
- `Inetcfg2301` — **32x32_4** — inetcfg_2301.ico
- `Inetcfg2302` — **32x32_4** — inetcfg_2302.ico
- `Inetcfg2303` — **32x32_4** — inetcfg_2303.ico
- `Inetcpl1301` — **32x32_4**, 16x16_4 — inetcpl_1301.ico
- `Inetcpl1302` — **32x32_4** — inetcpl_1302.ico
- `Inetcpl1303` — **32x32_4** — inetcpl_1303.ico
- `Inetcpl1304` — **32x32_4**, 16x16_4 — inetcpl_1304.ico
- `Inetcpl1305` — **32x32_4**, 16x16_4 — inetcpl_1305.ico
- `Inetcpl1306` — **32x32_4**, 16x16_4 — inetcpl_1306.ico
- `Inetcpl1307` — **32x32_4** — inetcpl_1307.ico
- `Inetcpl1308` — **32x32_4** — inetcpl_1308.ico
- `Inetcpl1309` — **32x32_4** — inetcpl_1309.ico
- `Inetcpl1310` — **32x32_4** — inetcpl_1310.ico
- `Inetcpl1311` — **32x32_4** — inetcpl_1311.ico
- `Inetcpl1312` — **32x32_4**, 16x16_4 — inetcpl_1312.ico
- `Inetcpl1313` — **48x48_8**, 32x32_8, 16x16_8, 16x16_4, 32x32_4, 48x48_4 — inetcpl_1313.ico
- `Inetcpl1314` — **32x32_4** — inetcpl_1314.ico
- `Inetcpl1315` — **32x32_4** — inetcpl_1315.ico
- `Inetcpl1317` — **32x32_4**, 16x16_4 — inetcpl_1317.ico
- `Inetcpl1318` — **32x32_4** — inetcpl_1318.ico
- `Inetcpl1319` — **32x32_4** — inetcpl_1319.ico
- `Inetcpl1320` — **32x32_4** — inetcpl_1320.ico
- `Inetcpl1321` — **32x32_4**, 16x16_4 — inetcpl_1321.ico
- `Inetcpl4432` — **32x32_4** — inetcpl_4432.ico
- `InfoBubble` — **32x32_4** — info_bubble.ico
- `Install` — **32x32_4** — install.ico
- `Internat151` — **16x16_4** — internat_151.ico
- `Intl101` — **32x32_4**, 16x16_4 — intl_101.ico
- `Isign32100` — **32x32_4** — isign32_100.ico
- `Isign324001` — **32x32_4**, 32x32_1 — isign32_4001.ico
- `Isign32IcoApp` — **32x32_4**, 16x16_4 — isign32_ico_app.ico
- `Issue` — **32x32_4**, 16x16_4 — issue.ico
- `Isuninst1000` — **32x32_4** — isuninst_1000.ico
- `Italic` — **16x16_4** — italic.ico

### J

- `Jdbgmgr100` — **32x32_4** — jdbgmgr_100.ico
- `Jgdwmie101` — **32x32_4**, 32x32_8, 16x16_4 — jgdwmie_101.ico
- `Job116` — **16x16_4** — job116.ico
- `Joy102` — **32x32_4**, 48x48_4, 16x16_4, 32x32_8, 48x48_8, 16x16_8 — joy_102.ico
- `Joy108` — **16x16_4** — joy_108.ico
- `Joy110` — **32x32_4** — joy_110.ico
- `Justify` — **16x16_4** — justify.ico

### K

- `Key` — **32x32_4** — key.ico
- `KeyboardMouse` — **32x32_4** — keyboard_mouse.ico
- `Keys` — **32x32_4** — keys.ico

### L

- `Left` — **16x16_4** — left.ico
- `Lights100` — **32x32_4**, 16x16_4 — lights_100.ico
- `Lights101` — **16x16_4** — lights_101.ico
- `Lights102` — **16x16_4** — lights_102.ico
- `Lights103` — **16x16_4** — lights_103.ico
- `Lights99` — **256x96_4** — lights_99.ico
- `Listicon` — **16x16_4** — listicon.ico
- `LoaderBat` — **32x32_4**, 16x16_4 — loader_bat.ico
- `Lock` — **32x32_4**, 16x16_4 — lock.ico
- `Logo` — **16x16_4**, 32x32_4 — logo.ico
- `LogView` — **32x32_4** — log_view.ico
- `LrgIcon` — **16x16_4** — lrg_icon.ico
- `Lst2icon` — **16x16_4** — lst2icon.ico

### M

- `Mail` — **32x32_4**, 16x16_4 — mail.ico
- `Mail2` — **16x16_4** — mail2.ico
- `Mail3` — **16x16_4** — mail3.ico
- `Mailnews12` — **32x32_4**, 16x16_4 — mailnews_12.ico
- `Mailnews13` — **32x32_4**, 16x16_4 — mailnews_13.ico
- `Mailnews14` — **32x32_4**, 16x16_4 — mailnews_14.ico
- `Mailnews15` — **32x32_4**, 16x16_4 — mailnews_15.ico
- `Mailnews16` — **32x32_4** — mailnews_16.ico
- `Mailnews17` — **16x16_4** — mailnews_17.ico
- `Mailnews18` — **16x16_4** — mailnews_18.ico
- `Mailnews19` — **32x32_4**, 16x16_4 — mailnews_19.ico
- `Mailnews2` — **32x32_4**, 16x16_4 — mailnews_2.ico
- `Mailnews20` — **32x32_4**, 16x16_4 — mailnews_20.ico
- `Mailnews21` — **32x32_4** — mailnews_21.ico
- `Mailnews22` — **32x32_4**, 16x16_4 — mailnews_22.ico
- `Mailnews23` — **16x16_4** — mailnews_23.ico
- `Mailnews3` — **32x32_4**, 16x16_4 — mailnews_3.ico
- `Mailnews6` — **32x32_4** — mailnews_6.ico
- `Mailnews7` — **32x32_4**, 16x16_4 — mailnews_7.ico
- `Mailnews8` — **32x32_4**, 16x16_4 — mailnews_8.ico
- `Mailnews9` — **32x32_4** — mailnews_9.ico
- `Main100` — **32x32_4** — main_100.ico
- `Main103` — **32x32_4** — main_103.ico
- `Main104` — **32x32_4** — main_104.ico
- `Main105` — **32x32_4** — main_105.ico
- `Main106` — **32x32_4** — main_106.ico
- `Main107` — **32x32_4** — main_107.ico
- `Main200` — **32x32_1**, 32x32_4 — main_200.ico
- `Main300` — **32x32_4**, 16x16_4 — main_300.ico
- `Main400` — **32x32_4**, 16x16_4 — main_400.ico
- `Main500` — **32x32_4**, 16x16_4 — main_500.ico
- `Main600` — **32x32_4**, 16x16_4 — main_600.ico
- `Mapi32451` — **32x32_4** — mapi32_451.ico
- `Mapi32501` — **32x32_4**, 16x16_4 — mapi32_501.ico
- `Mapi32801` — **32x32_4**, 16x16_4, 48x48_4 — mapi32_801.ico
- `Mapi32IconAttach` — **32x32_4** — mapi32_icon_attach.ico
- `Mapisp32100` — **32x32_4** — mapisp32_100.ico
- `Mcdpkgtm3000` — **32x32_4**, 16x16_4 — mcdpkgtm_3000.ico
- `Mcm3200` — **32x32_4** — mcm_3200.ico
- `Mcm3201` — **32x32_4** — mcm_3201.ico
- `Mcm3202` — **32x32_4** — mcm_3202.ico
- `Mcm3203` — **32x32_4** — mcm_3203.ico
- `Mcm401` — **32x32_4** — mcm_401.ico
- `Mcm502` — **32x32_4** — mcm_502.ico
- `McmEarth` — **32x32_4** — mcm_earth.ico
- `McmPhone` — **32x32_4** — mcm_phone.ico
- `Mdisp321` — **32x32_4** — mdisp32_1.ico
- `MediaAudio` — **32x32_4**, 16x16_4 — media_audio.ico
- `MediaCd` — **32x32_4**, 16x16_4 — media_cd.ico
- `MediaVideo` — **32x32_4**, 16x16_4 — media_video.ico
- `Memory` — **32x32_4**, 16x16_4 — memory.ico
- `Message` — **16x16_4** — message.ico
- `Mic` — **32x32_4**, 16x16_4 — mic.ico
- `MicrosoftExchange` — **32x32_4**, 16x16_4 — microsoft_exchange.ico
- `MicrosoftNetwork` — **32x32_4**, 16x16_4 — microsoft_network.ico
- `Mipac` — **16x16_4** — mipac.ico
- `Mkcompat900` — **32x32_1**, 32x32_4 — mkcompat_900.ico
- `Mlcfg32129` — **32x32_4**, 16x16_4 — mlcfg32_129.ico
- `Mmsys100` — **32x32_4**, 16x16_4 — mmsys_100.ico
- `Mmsys101` — **32x32_4**, 16x16_4 — mmsys_101.ico
- `Mmsys102` — **32x32_1**, 32x32_4 — mmsys_102.ico
- `Mmsys103` — **32x32_4**, 16x16_4 — mmsys_103.ico
- `Mmsys104` — **32x32_4**, 16x16_4 — mmsys_104.ico
- `Mmsys105` — **32x32_4**, 16x16_4 — mmsys_105.ico
- `Mmsys106` — **32x32_4**, 16x16_4 — mmsys_106.ico
- `Mmsys107` — **32x32_4**, 16x16_4 — mmsys_107.ico
- `Mmsys108` — **32x32_4**, 16x16_4 — mmsys_108.ico
- `Mmsys109` — **32x32_4**, 16x16_4 — mmsys_109.ico
- `Mmsys110` — **32x32_4**, 16x16_4 — mmsys_110.ico
- `Mmsys111` — **32x32_4**, 16x16_4 — mmsys_111.ico
- `Mmsys112` — **32x32_4**, 16x16_4 — mmsys_112.ico
- `Mmsys113` — **32x32_4**, 16x16_4 — mmsys_113.ico
- `Mmsys114` — **32x32_4** — mmsys_114.ico
- `Mmsys115` — **32x32_4**, 16x16_4 — mmsys_115.ico
- `Mmsys116` — **32x32_4**, 16x16_4 — mmsys_116.ico
- `Mmsys117` — **32x32_4**, 16x16_4 — mmsys_117.ico
- `Mmsys118` — **32x32_4**, 16x16_4 — mmsys_118.ico
- `Mmsys119` — **32x32_4**, 16x16_4 — mmsys_119.ico
- `Mmsys120` — **32x32_4**, 16x16_4 — mmsys_120.ico
- `Mmsys121` — **32x32_4**, 16x16_4 — mmsys_121.ico
- `Mmsys123` — **32x32_4** — mmsys_123.ico
- `Mmsys90` — **32x32_4** — mmsys_90.ico
- `Mmsys99` — **32x32_4**, 16x16_4 — mmsys_99.ico
- `Mnmshco1202` — **32x32_4**, 16x16_4 — mnmshco__1202.ico
- `Moscudll128` — **32x32_4**, 16x16_4 — moscudll_128.ico
- `Mplayer10` — **32x32_4**, 16x16_4 — mplayer_10.ico
- `Mplayer11` — **32x32_4**, 16x16_4 — mplayer_11.ico
- `Mplayer110` — **32x32_4**, 16x16_4 — mplayer_1_10.ico
- `Mplayer111` — **32x32_4**, 16x16_4 — mplayer_1_11.ico
- `Mplayer112` — **32x32_4**, 16x16_4 — mplayer_1_12.ico
- `Mplayer113` — **32x32_4**, 16x16_4 — mplayer_1_13.ico
- `Mplayer114` — **32x32_4**, 16x16_4 — mplayer_1_14.ico
- `Mplayer115` — **32x32_4**, 16x16_4 — mplayer_1_15.ico
- `Mplayer116` — **32x32_4** — mplayer_1_16.ico
- `Mplayer12` — **32x32_4**, 16x16_4 — mplayer_12.ico
- `Mplayer13` — **32x32_4**, 16x16_4 — mplayer_13.ico
- `Mplayer14` — **32x32_4**, 16x16_4 — mplayer_14.ico
- `Mplayer15` — **32x32_4**, 16x16_4 — mplayer_15.ico
- `Mplayer16` — **32x32_4** — mplayer_16.ico
- `Mprserv120` — **48x48_4** — mprserv_120.ico
- `Mprserv121` — **48x48_4** — mprserv_121.ico
- `Mprserv68` — **32x32_4** — mprserv_68.ico
- `Msacm3210` — **32x32_4** — msacm32_10.ico
- `MsawtAwtIcon` — **32x32_4**, 16x16_4 — msawt_awt_icon.ico
- `MsDos` — **16x16_32**, 24x24_32, 32x32_32, 48x48_32, 128x128_32 — ms_dos.ico
- `Msfs321951` — **32x32_4** — msfs32_1951.ico
- `Mshearts1` — **32x32_4** — mshearts_1.ico
- `Mshtml32528` — **48x48_8**, 32x32_8, 16x16_8, 16x16_4, 32x32_4, 48x48_4 — mshtml_32528.ico
- `Mshtml32529` — **32x32_4**, 16x16_4 — mshtml_32529.ico
- `Mshtml32534` — **32x32_4** — mshtml_32534.ico
- `Mshtml32535` — **32x32_4** — mshtml_32535.ico
- `Mshtml32536` — **32x32_4**, 16x16_4 — mshtml_32536.ico
- `Mshtml32537` — **32x32_4**, 16x16_4 — mshtml_32537.ico
- `Mshtml32538` — **32x32_4** — mshtml_32538.ico
- `Mshtml32539` — **32x32_4** — mshtml_32539.ico
- `Mshtml32540` — **32x32_4**, 16x16_4 — mshtml_32540.ico
- `Mshtml32541` — **32x32_4**, 16x16_4 — mshtml_32541.ico
- `Mshtml32542` — **32x32_4**, 16x16_4 — mshtml_32542.ico
- `Mshtml32543` — **16x16_4** — mshtml_32543.ico
- `Mshtml32544` — **16x16_4** — mshtml_32544.ico
- `Mshtml32545` — **16x16_4** — mshtml_32545.ico
- `Mshtml32546` — **32x32_4**, 16x16_4 — mshtml_32546.ico
- `Mshtml32547` — **32x32_4**, 16x16_4 — mshtml_32547.ico
- `Mshtml32548` — **32x32_4**, 16x16_4 — mshtml_32548.ico
- `Mshtml32549` — **32x32_4**, 16x16_4 — mshtml_32549.ico
- `Mshtml32550` — **32x32_4**, 16x16_4 — mshtml_32550.ico
- `Mshtml32551` — **32x32_4**, 16x16_4 — mshtml_32551.ico
- `Mshtml32552` — **32x32_4** — mshtml_32552.ico
- `Mshtml32553` — **32x32_4** — mshtml_32553.ico
- `Msnp32FolderIcon` — **32x32_4**, 16x16_4 — msnp32_folder_icon.ico
- `Msnp32ServerIcon` — **32x32_4**, 16x16_4 — msnp32_server_icon.ico
- `Msnp32WrkgrpIcon` — **32x32_4**, 16x16_4 — msnp32_wrkgrp_icon.ico
- `Msnsetup1` — **32x32_4**, 16x16_4, 32x32_8, 16x16_8 — msnsetup_1.ico
- `Msnsign100` — **32x32_4** — msnsign_100.ico
- `Msnsign4001` — **32x32_4**, 32x32_1 — msnsign_4001.ico
- `MsnsignIcoApp` — **32x32_4**, 16x16_4 — msnsign_ico_app.ico
- `Msnstart1` — **32x32_4**, 16x16_4, 32x32_8, 16x16_8 — msnstart_1.ico
- `Msnstart100` — **32x32_4** — msnstart_100.ico
- `Msnstart110` — **32x32_4** — msnstart_110.ico
- `Msnstart120` — **32x32_4** — msnstart_120.ico
- `Msnsvc3000` — **32x32_4**, 16x16_4 — msnsvc_3000.ico
- `Msoffice10` — **32x32_4**, 24x24_4, 16x16_4, 48x48_4, 10x10_4 — msoffice_10.ico
- `Msoffice11` — **32x32_4**, 16x16_4 — msoffice_11.ico
- `Msoffice12` — **16x16_4**, 10x10_4, 24x24_4 — msoffice_12.ico
- `Msoffice13` — **24x24_4**, 16x16_4, 10x10_4 — msoffice_13.ico
- `Msoffice14` — **24x24_4**, 16x16_4, 10x10_4 — msoffice_14.ico
- `Msoffice15` — **24x24_4**, 16x16_4, 10x10_4 — msoffice_15.ico
- `Msoffice16` — **24x24_4**, 16x16_4, 10x10_4 — msoffice_16.ico
- `Msow0` — **32x32_4**, 24x24_4, 16x16_4 — msow_0.ico
- `Msow1` — **32x32_4**, 24x24_4, 16x16_4 — msow_1.ico
- `Msow10` — **32x32_4**, 24x24_4, 16x16_4 — msow_10.ico
- `Msow11` — **24x24_4**, 16x16_4 — msow_11.ico
- `Msow12` — **32x32_4**, 16x16_4 — msow_12.ico
- `Msow13` — **32x32_4**, 24x24_4, 16x16_4 — msow_13.ico
- `Msow2` — **32x32_4**, 24x24_4, 16x16_4 — msow_2.ico
- `Msow3` — **32x32_4**, 24x24_4, 16x16_4 — msow_3.ico
- `Msow4` — **32x32_4**, 24x24_4, 16x16_4 — msow_4.ico
- `Msow5` — **32x32_4**, 24x24_4, 16x16_4 — msow_5.ico
- `Msow6` — **32x32_4**, 24x24_4, 16x16_4 — msow_6.ico
- `Msow8` — **32x32_4**, 24x24_4, 16x16_4 — msow_8.ico
- `Msow9` — **32x32_4**, 24x24_4, 16x16_4 — msow_9.ico
- `Mspaint` — **32x32_4**, 16x16_4 — mspaint.ico
- `Msrating102` — **32x32_4** — msrating_102.ico
- `Msrating103` — **32x32_4** — msrating_103.ico
- `Msrating104` — **32x32_4** — msrating_104.ico
- `Msrating105` — **32x32_4** — msrating_105.ico
- `Msrating106` — **32x32_4**, 16x16_4 — msrating_106.ico
- `Msrating107` — **32x32_4** — msrating_107.ico
- `Msrating108` — **32x32_4**, 16x16_4 — msrating_108.ico
- `Msrating109` — **32x32_4**, 16x16_4 — msrating_109.ico
- `Msvfw32943` — **32x32_1**, 32x32_4 — msvfw32_943.ico
- `Mute` — **32x32_4**, 16x16_4 — mute.ico
- `MystifyYourMind100` — **32x32_4**, 16x16_4 — mystify_your_mind_100.ico

### N

- `Netwatch101` — **32x32_4**, 16x16_4 — netwatch_101.ico
- `Network` — **32x32_4**, 16x16_4 — network.ico
- `Network2` — **32x32_4**, 16x16_4 — network_2.ico
- `Network3` — **32x32_4**, 16x16_4 — network_3.ico
- `New` — **16x16_4** — new.ico
- `New16` — **16x16_4** — new16.ico
- `Notepad` — **16x16_4**, 32x32_4 — notepad.ico
- `Notepad1` — **16x16_4**, 32x32_4 — notepad_1.ico
- `Notepad2` — **32x32_4**, 16x16_4 — notepad_2.ico
- `NumPage` — **16x16_4** — num_page.ico
- `Nwnp32FolderIcon` — **32x32_4**, 16x16_4 — nwnp32_folder_icon.ico
- `Nwnp32PrinterIcon` — **32x32_4**, 16x16_4 — nwnp32_printer_icon.ico
- `Nwnp32ServerIcon` — **32x32_4**, 16x16_4 — nwnp32_server_icon.ico
- `Nwnp32WrkgrpIcon` — **32x32_4**, 16x16_4 — nwnp32_wrkgrp_icon.ico

### O

- `Oidis400Seqfileicon` — **32x32_4** — oidis400_seqfileicon.ico
- `Oislb400DcScanIco` — **32x32_4** — oislb400_dc_scan_ico.ico
- `Oiui400Imgstamp` — **32x32_4** — oiui400_imgstamp.ico
- `Oiui400Textstamp` — **32x32_4** — oiui400_textstamp.ico
- `Ole328` — **32x32_4** — ole32_8.ico
- `Open` — **16x16_4** — open.ico
- `Optional3000` — **32x32_4**, 16x16_4 — optional_3000.ico
- `OrderAs` — **16x16_4** — order_as.ico
- `OrderDs` — **16x16_4** — order_ds.ico

### P

- `Packager` — **32x32_1**, 32x32_4 — packager.ico
- `Packager1` — **32x32_1**, 32x32_4 — packager_1.ico
- `ParaBul` — **16x16_4** — para_bul.ico
- `ParaNum` — **16x16_4** — para_num.ico
- `Password100` — **32x32_4** — password_100.ico
- `Password1000` — **32x32_4** — password_1000.ico
- `Password1010` — **32x32_4** — password_1010.ico
- `Paste` — **16x16_4** — paste.ico
- `Pbrush1` — **32x32_4** — pbrush_1.ico
- `Pen` — **16x16_4** — pen.ico
- `Person116` — **16x16_4** — person116.ico
- `Phone` — **32x32_4** — phone.ico
- `Phone2` — **32x32_4**, 16x16_4 — phone_2.ico
- `Playd16` — **16x16_4** — playd16.ico
- `Playp16` — **16x16_4** — playp16.ico
- `Plugin` — **32x32_4**, 16x16_4 — plugin.ico
- `Plugin2` — **32x32_4**, 16x16_4 — plugin_2.ico
- `Powercfg205` — **32x32_4** — powercfg_205.ico
- `Powercfg210` — **32x32_4**, 16x16_4 — powercfg_210.ico
- `Powercfg211` — **32x32_4**, 16x16_4 — powercfg_211.ico
- `PowerOff` — **32x32_4**, 16x16_4 — power_off.ico
- `PowerOn` — **32x32_4**, 16x16_4 — power_on.ico
- `Powerpnt1` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — powerpnt_1.ico
- `Powerpnt2` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — powerpnt_2.ico
- `Powerpnt3` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — powerpnt_3.ico
- `Powerpnt4` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — powerpnt_4.ico
- `Ppintl17925` — **32x32_4** — ppintl_17925.ico
- `Ppintl17926` — **32x32_4** — ppintl_17926.ico
- `Ppintl17933` — **32x32_4** — ppintl_17933.ico
- `Ppintl17934` — **32x32_4** — ppintl_17934.ico
- `Ppintl17939` — **32x32_4**, 32x32_1 — ppintl_17939.ico
- `Ppintl18176` — **32x32_4**, 32x32_1 — ppintl_18176.ico
- `Ppintl18177` — **32x32_4**, 32x32_1 — ppintl_18177.ico
- `Ppintl18178` — **32x32_4**, 32x32_1 — ppintl_18178.ico
- `Ppintl18179` — **32x32_4**, 32x32_1 — ppintl_18179.ico
- `Ppintl18181` — **32x32_4**, 32x32_1 — ppintl_18181.ico
- `Pptview98` — **32x32_4**, 24x24_4, 16x16_4 — pptview_98.ico
- `Print` — **16x16_4** — print.ico
- `Print2` — **16x16_4** — print2.ico
- `Printer` — **32x32_4**, 16x16_4 — printer.ico
- `PrinterCalendar` — **32x32_4**, 16x16_4 — printer_calendar.ico
- `PrinterDrive` — **32x32_4**, 16x16_4 — printer_drive.ico
- `PrinterShared` — **32x32_4**, 16x16_4 — printer_shared.ico
- `ProdinvMyicon` — **32x32_1**, 32x32_4 — prodinv_myicon.ico
- `Progman1` — **32x32_1**, 32x32_4 — progman_1.ico
- `Progman10` — **32x32_1**, 32x32_4 — progman_10.ico
- `Progman11` — **32x32_1**, 32x32_4 — progman_11.ico
- `Progman12` — **32x32_1**, 32x32_4 — progman_12.ico
- `Progman13` — **32x32_1**, 32x32_4 — progman_13.ico
- `Progman14` — **32x32_1**, 32x32_4 — progman_14.ico
- `Progman15` — **32x32_1**, 32x32_4 — progman_15.ico
- `Progman16` — **32x32_1**, 32x32_4 — progman_16.ico
- `Progman17` — **32x32_1**, 32x32_4 — progman_17.ico
- `Progman18` — **32x32_1**, 32x32_4 — progman_18.ico
- `Progman19` — **32x32_1**, 32x32_4 — progman_19.ico
- `Progman2` — **32x32_1**, 32x32_4 — progman_2.ico
- `Progman20` — **32x32_1**, 32x32_4 — progman_20.ico
- `Progman21` — **32x32_1**, 32x32_4 — progman_21.ico
- `Progman22` — **32x32_1**, 32x32_4 — progman_22.ico
- `Progman23` — **32x32_1**, 32x32_4 — progman_23.ico
- `Progman24` — **32x32_1**, 32x32_4 — progman_24.ico
- `Progman25` — **32x32_1**, 32x32_4 — progman_25.ico
- `Progman26` — **32x32_1**, 32x32_4 — progman_26.ico
- `Progman27` — **32x32_1**, 32x32_4 — progman_27.ico
- `Progman28` — **32x32_1**, 32x32_4 — progman_28.ico
- `Progman29` — **32x32_1**, 32x32_4 — progman_29.ico
- `Progman3` — **32x32_1**, 32x32_4 — progman_3.ico
- `Progman30` — **32x32_1**, 32x32_4 — progman_30.ico
- `Progman31` — **32x32_1**, 32x32_4 — progman_31.ico
- `Progman32` — **32x32_1**, 32x32_4 — progman_32.ico
- `Progman33` — **32x32_1**, 32x32_4 — progman_33.ico
- `Progman34` — **32x32_1**, 32x32_4 — progman_34.ico
- `Progman35` — **32x32_1**, 32x32_4 — progman_35.ico
- `Progman36` — **32x32_1**, 32x32_4 — progman_36.ico
- `Progman37` — **32x32_1**, 32x32_4 — progman_37.ico
- `Progman38` — **32x32_1**, 32x32_4 — progman_38.ico
- `Progman39` — **32x32_1**, 32x32_4 — progman_39.ico
- `Progman4` — **32x32_1**, 32x32_4 — progman_4.ico
- `Progman40` — **32x32_1**, 32x32_4 — progman_40.ico
- `Progman41` — **32x32_1**, 32x32_4 — progman_41.ico
- `Progman42` — **32x32_1**, 32x32_4 — progman_42.ico
- `Progman43` — **32x32_1**, 32x32_4 — progman_43.ico
- `Progman44` — **32x32_1**, 32x32_4 — progman_44.ico
- `Progman45` — **32x32_1**, 32x32_4 — progman_45.ico
- `Progman46` — **32x32_1**, 32x32_4 — progman_46.ico
- `Progman5` — **32x32_1**, 32x32_4 — progman_5.ico
- `Progman6` — **32x32_1**, 32x32_4 — progman_6.ico
- `Progman7` — **32x32_1**, 32x32_4 — progman_7.ico
- `Progman8` — **32x32_1**, 32x32_4 — progman_8.ico
- `Progman9` — **32x32_1**, 32x32_4 — progman_9.ico
- `Props` — **16x16_4** — props.ico
- `Pshbtn` — **16x16_4** — pshbtn.ico

### Q

- `Qfecheck111` — **32x32_4** — qfecheck_111.ico
- `Quartz100` — **32x32_4**, 16x16_4 — quartz_100.ico
- `Quartz101` — **32x32_4**, 16x16_4 — quartz_101.ico
- `Quartz102` — **32x32_4**, 16x16_4 — quartz_102.ico
- `Quartz103` — **32x32_4**, 16x16_4 — quartz_103.ico
- `Quartz200` — **32x32_4**, 16x16_4 — quartz_200.ico
- `Quartz201` — **32x32_4**, 16x16_4 — quartz_201.ico
- `Quartz202` — **32x32_4**, 16x16_4 — quartz_202.ico
- `Quartz203` — **32x32_4**, 16x16_4 — quartz_203.ico
- `Quartz300` — **32x32_4**, 16x16_4 — quartz_300.ico
- `Quartz301` — **32x32_4**, 16x16_4 — quartz_301.ico
- `QuestionBubble` — **32x32_32** — question_bubble.ico
- `Quikview1` — **32x32_4** — quikview_1.ico
- `Quikview2` — **32x32_4** — quikview_2.ico
- `Quikview3` — **32x32_4** — quikview_3.ico
- `Quikview4` — **32x32_4** — quikview_4.ico

### R

- `Raplayer801` — **32x32_4** — raplayer_801.ico
- `Rasapi32100` — **32x32_4** — rasapi32_100.ico
- `Rasapi32101` — **32x32_4** — rasapi32_101.ico
- `Rasapi32102` — **32x32_4** — rasapi32_102.ico
- `Rasapi32103` — **32x32_4** — rasapi32_103.ico
- `Rasapi32104` — **32x32_4**, 16x16_4 — rasapi32_104.ico
- `ReaderCd` — **32x32_4**, 16x16_4 — reader_cd.ico
- `ReaderCd2` — **32x32_4** — reader_cd_2.ico
- `ReaderClosed` — **32x32_4**, 16x16_4 — reader_closed.ico
- `ReaderDisket` — **32x32_4**, 16x16_4 — reader_disket.ico
- `ReaderDisket2` — **32x32_4**, 16x16_4 — reader_disket2.ico
- `ReaderDisketCasset` — **32x32_4**, 16x16_4 — reader_disket_casset.ico
- `ReaderEject` — **32x32_4**, 16x16_4 — reader_eject.ico
- `ReaderNoshared` — **32x32_4**, 16x16_4 — reader_noshared.ico
- `ReaderOpened` — **32x32_4**, 16x16_4 — reader_opened.ico
- `ReaderShared` — **32x32_4**, 16x16_4 — reader_shared.ico
- `RecycleEmpty` — **32x32_4**, 16x16_4 — recycle_empty.ico
- `RecycleFile` — **32x32_4** — recycle_file.ico
- `RecycleFilefolder` — **32x32_4** — recycle_filefolder.ico
- `RecycleFolder` — **32x32_4** — recycle_folder.ico
- `RecycleFull` — **32x32_4**, 16x16_4 — recycle_full.ico
- `Redo` — **16x16_4** — redo.ico
- `Refresh` — **16x16_4** — refresh.ico
- `Regedit` — **32x32_4**, 16x16_4 — regedit.ico
- `Regedit100` — **32x32_4**, 16x16_4 — regedit_100.ico
- `Regedit101` — **32x32_4**, 16x16_4 — regedit_101.ico
- `Regedit102` — **32x32_4** — regedit_102.ico
- `Regedit201` — **16x16_4** — regedit_201.ico
- `Regedit202` — **16x16_4** — regedit_202.ico
- `Regedit203` — **16x16_4** — regedit_203.ico
- `Regedit204` — **16x16_4** — regedit_204.ico
- `Regedit205` — **16x16_4** — regedit_205.ico
- `Regedit206` — **16x16_4** — regedit_206.ico
- `Regwiz117` — **32x32_4** — regwiz_117.ico
- `Regwiz122` — **32x32_4** — regwiz_122.ico
- `Regwiz127` — **32x32_4** — regwiz_127.ico
- `Regwiz129` — **32x32_4** — regwiz_129.ico
- `Right` — **16x16_4** — right.ico
- `Rnaapp100` — **32x32_4** — rnaapp_100.ico
- `Rnaapp101` — **32x32_4**, 16x16_4 — rnaapp_101.ico
- `Rnaapp102` — **32x32_4**, 16x16_4 — rnaapp_102.ico
- `Rnaapp110` — **16x16_4** — rnaapp_110.ico
- `Rnaapp111` — **16x16_4** — rnaapp_111.ico
- `Rnaapp112` — **16x16_4** — rnaapp_112.ico
- `Rnaapp113` — **16x16_4** — rnaapp_113.ico
- `Rnaapp114` — **16x16_4** — rnaapp_114.ico
- `Rnanp100` — **32x32_4**, 16x16_4 — rnanp_100.ico
- `Rnaui100` — **32x32_4**, 16x16_4 — rnaui_100.ico
- `Rnaui101` — **32x32_4**, 16x16_4 — rnaui_101.ico
- `Rnaui102` — **32x32_4**, 16x16_4 — rnaui_102.ico
- `Rnaui103` — **32x32_4**, 16x16_4 — rnaui_103.ico
- `Rnaui104` — **32x32_4** — rnaui_104.ico
- `Rnaui105` — **32x32_4** — rnaui_105.ico
- `Rnaui106` — **32x32_4** — rnaui_106.ico
- `Rsrcmtr100` — **32x32_4**, 16x16_4 — rsrcmtr_100.ico
- `Rsrcmtr121` — **16x16_4** — rsrcmtr_121.ico
- `Rsrcmtr122` — **16x16_4** — rsrcmtr_122.ico
- `Rsrcmtr123` — **16x16_4** — rsrcmtr_123.ico
- `Rsrcmtr124` — **16x16_4** — rsrcmtr_124.ico
- `Rsrcmtr125` — **16x16_4** — rsrcmtr_125.ico
- `Rsrcmtr126` — **16x16_4** — rsrcmtr_126.ico
- `Rsrcmtr127` — **16x16_4** — rsrcmtr_127.ico
- `Rsrcmtr128` — **16x16_4** — rsrcmtr_128.ico
- `Rsrcmtr129` — **16x16_4** — rsrcmtr_129.ico
- `Rsrcmtr130` — **16x16_4** — rsrcmtr_130.ico
- `Rsrcmtr131` — **16x16_4** — rsrcmtr_131.ico
- `Rsrcmtr132` — **16x16_4** — rsrcmtr_132.ico
- `Rsrcmtr133` — **16x16_4** — rsrcmtr_133.ico
- `Rundll1` — **32x32_1**, 32x32_4 — rundll_1.ico
- `Runonce106` — **32x32_4**, 16x16_4 — runonce_106.ico

### S

- `Save` — **16x16_4** — save.ico
- `Scandskw1` — **32x32_4**, 16x16_4 — scandskw_1.ico
- `SccviewIcon` — **32x32_4**, 16x16_4 — sccview_icon.ico
- `ScrollingMarquee100` — **32x32_4**, 16x16_4 — scrolling_marquee_100.ico
- `Sendmail2001` — **32x32_4**, 16x16_4 — sendmail_2001.ico
- `Settings` — **32x32_4**, 16x16_4 — settings.ico
- `SetupPhoneicon` — **32x32_4**, 16x16_4 — setup_phoneicon.ico
- `Setupslt3000` — **32x32_4**, 16x16_4 — setupslt_3000.ico
- `Shdocvw256` — **32x32_4**, 16x16_4 — shdocvw_256.ico
- `Shdocvw257` — **48x48_8**, 32x32_8, 16x16_8, 16x16_4, 32x32_4, 48x48_4 — shdocvw_257.ico
- `Shdocvw258` — **32x32_4**, 16x16_4 — shdocvw_258.ico
- `Shdocvw259` — **32x32_4**, 16x16_4 — shdocvw_259.ico
- `Shdocvw260` — **32x32_4**, 16x16_4 — shdocvw_260.ico
- `Shdocvw261` — **16x16_4** — shdocvw_261.ico
- `Shdocvw262` — **32x32_4**, 16x16_4 — shdocvw_262.ico
- `Shdocvw272` — **32x32_4**, 16x16_4 — shdocvw_272.ico
- `Shdocvw273` — **16x16_4** — shdocvw_273.ico
- `Shdocvw274` — **16x16_4** — shdocvw_274.ico
- `Shdocvw275` — **16x16_4** — shdocvw_275.ico
- `Shell321` — **32x32_4**, 16x16_4 — shell32_1.ico
- `Shell3210` — **32x32_4**, 16x16_4 — shell32_10.ico
- `Shell3211` — **32x32_4**, 16x16_4 — shell32_11.ico
- `Shell3212` — **32x32_4**, 16x16_4 — shell32_12.ico
- `Shell3213` — **32x32_4**, 16x16_4 — shell32_13.ico
- `Shell32133` — **32x32_4**, 16x16_4 — shell32_133.ico
- `Shell32134` — **32x32_1**, 32x32_4, 16x16_4 — shell32_134.ico
- `Shell32135` — **32x32_4**, 16x16_4 — shell32_135.ico
- `Shell32136` — **32x32_4**, 16x16_4 — shell32_136.ico
- `Shell32137` — **32x32_4**, 16x16_4 — shell32_137.ico
- `Shell32138` — **32x32_4**, 16x16_4 — shell32_138.ico
- `Shell32139` — **32x32_4**, 16x16_4 — shell32_139.ico
- `Shell3214` — **32x32_4**, 16x16_4 — shell32_14.ico
- `Shell32140` — **32x32_4**, 16x16_4 — shell32_140.ico
- `Shell32141` — **32x32_4**, 16x16_4 — shell32_141.ico
- `Shell32142` — **32x32_4** — shell32_142.ico
- `Shell32143` — **32x32_4** — shell32_143.ico
- `Shell32144` — **32x32_4** — shell32_144.ico
- `Shell32145` — **32x32_4** — shell32_145.ico
- `Shell32146` — **32x32_4** — shell32_146.ico
- `Shell32147` — **32x32_4**, 16x16_4 — shell32_147.ico
- `Shell32148` — **32x32_4** — shell32_148.ico
- `Shell3215` — **32x32_4**, 16x16_4 — shell32_15.ico
- `Shell32151` — **32x32_4**, 16x16_4 — shell32_151.ico
- `Shell32152` — **32x32_4**, 16x16_4 — shell32_152.ico
- `Shell32153` — **32x32_4**, 16x16_4 — shell32_153.ico
- `Shell32154` — **32x32_4**, 16x16_4 — shell32_154.ico
- `Shell32155` — **32x32_4**, 16x16_4 — shell32_155.ico
- `Shell32156` — **32x32_4**, 16x16_4 — shell32_156.ico
- `Shell3216` — **32x32_4**, 16x16_4 — shell32_16.ico
- `Shell32160` — **32x32_4**, 16x16_4 — shell32_160.ico
- `Shell32161` — **32x32_4** — shell32_161.ico
- `Shell32165` — **32x32_4**, 16x16_4 — shell32_165.ico
- `Shell32166` — **32x32_4** — shell32_166.ico
- `Shell32167` — **32x32_4**, 16x16_4 — shell32_167.ico
- `Shell32168` — **32x32_4**, 16x16_4 — shell32_168.ico
- `Shell32169` — **32x32_4**, 16x16_4 — shell32_169.ico
- `Shell3217` — **32x32_4**, 16x16_4 — shell32_17.ico
- `Shell32170` — **32x32_4**, 16x16_4 — shell32_170.ico
- `Shell3218` — **32x32_4**, 16x16_4 — shell32_18.ico
- `Shell3219` — **32x32_4**, 16x16_4 — shell32_19.ico
- `Shell322` — **32x32_4**, 16x16_4 — shell32_2.ico
- `Shell3220` — **32x32_4**, 16x16_4 — shell32_20.ico
- `Shell3221` — **32x32_4**, 16x16_4 — shell32_21.ico
- `Shell3222` — **32x32_4**, 16x16_4 — shell32_22.ico
- `Shell3223` — **32x32_4**, 16x16_4 — shell32_23.ico
- `Shell3224` — **32x32_4**, 16x16_4 — shell32_24.ico
- `Shell3225` — **32x32_4**, 16x16_4 — shell32_25.ico
- `Shell3226` — **32x32_4**, 16x16_4 — shell32_26.ico
- `Shell3227` — **32x32_4**, 16x16_4 — shell32_27.ico
- `Shell3228` — **32x32_4**, 16x16_4 — shell32_28.ico
- `Shell3229` — **32x32_4**, 16x16_4 — shell32_29.ico
- `Shell323` — **32x32_4**, 16x16_4 — shell32_3.ico
- `Shell3230` — **32x32_4**, 16x16_4 — shell32_30.ico
- `Shell3231` — **32x32_4** — shell32_31.ico
- `Shell3232` — **32x32_4**, 16x16_4 — shell32_32.ico
- `Shell3233` — **32x32_4**, 16x16_4 — shell32_33.ico
- `Shell3234` — **32x32_4**, 16x16_4 — shell32_34.ico
- `Shell3235` — **32x32_4**, 16x16_4 — shell32_35.ico
- `Shell3236` — **32x32_4**, 16x16_4 — shell32_36.ico
- `Shell3237` — **32x32_4**, 16x16_4 — shell32_37.ico
- `Shell3238` — **32x32_4**, 16x16_4 — shell32_38.ico
- `Shell3239` — **32x32_4**, 16x16_4 — shell32_39.ico
- `Shell324` — **32x32_4**, 16x16_4 — shell32_4.ico
- `Shell3240` — **16x16_4**, 32x32_4 — shell32_40.ico
- `Shell3241` — **32x32_4**, 16x16_4 — shell32_41.ico
- `Shell3242` — **32x32_4**, 16x16_4 — shell32_42.ico
- `Shell325` — **32x32_4**, 16x16_4 — shell32_5.ico
- `Shell326` — **32x32_4**, 16x16_4 — shell32_6.ico
- `Shell327` — **32x32_4**, 16x16_4 — shell32_7.ico
- `Shell328` — **32x32_4**, 16x16_4 — shell32_8.ico
- `Shell329` — **32x32_4**, 16x16_4 — shell32_9.ico
- `Shortcut` — **32x32_4**, 16x16_4 — shortcut.ico
- `Shortcut2` — **32x32_4** — shortcut2.ico
- `Shscrap100` — **32x32_4**, 16x16_4 — shscrap_100.ico
- `Signup` — **32x32_4**, 16x16_4 — signup.ico
- `Smmscrpt100` — **32x32_4**, 16x16_4 — smmscrpt_100.ico
- `Sndrec3210` — **32x32_4**, 16x16_4 — sndrec32_10.ico
- `Sndrec3215` — **32x32_4**, 16x16_4 — sndrec32_15.ico
- `Sndrec3216` — **32x32_4**, 16x16_4 — sndrec32_16.ico
- `Sndvol32300` — **32x32_4**, 16x16_4 — sndvol32_300.ico
- `Sndvol32301` — **32x32_4** — sndvol32_301.ico
- `Sndvol32302` — **32x32_4** — sndvol32_302.ico
- `Sndvol32303` — **32x32_4**, 16x16_4 — sndvol32_303.ico
- `Sndvol32304` — **32x32_4**, 16x16_4 — sndvol32_304.ico
- `Sol1` — **32x32_4**, 16x16_4 — sol_1.ico
- `Spellchk` — **16x16_4** — spellchk.ico
- `Star` — **32x32_4**, 16x16_4 — star.ico
- `Svrworld` — **16x16_4** — svrworld.ico
- `Swinst53000` — **32x32_4**, 16x16_4 — swinst5_3000.ico
- `Syncui120` — **32x32_4**, 16x16_4 — syncui_120.ico
- `Syncui121` — **32x32_4** — syncui_121.ico
- `Syncui122` — **32x32_4** — syncui_122.ico
- `Syncui123` — **32x32_4** — syncui_123.ico
- `Syncui124` — **32x32_4** — syncui_124.ico
- `Syncui125` — **32x32_4** — syncui_125.ico
- `Syncui126` — **32x32_4** — syncui_126.ico
- `Syncui127` — **32x32_4** — syncui_127.ico
- `Syncui128` — **32x32_4** — syncui_128.ico
- `Syncui129` — **32x32_4** — syncui_129.ico
- `Syncui130` — **32x32_4** — syncui_130.ico
- `Syncui131` — **32x32_4** — syncui_131.ico
- `Syncui132` — **32x32_4** — syncui_132.ico
- `Syncui135` — **32x32_4**, 16x16_4 — syncui_135.ico
- `Sysedit1` — **32x32_4** — sysedit_1.ico
- `Sysedit2` — **64x64_1** — sysedit_2.ico
- `Sysmon1000` — **32x32_4** — sysmon_1000.ico
- `SysPackage` — **32x32_4**, 16x16_4 — sys_package.ico
- `Systray200` — **32x32_4**, 16x16_4 — systray_200.ico
- `Systray210` — **16x16_4** — systray_210.ico
- `Systray220` — **16x16_4** — systray_220.ico
- `Systray221` — **16x16_4** — systray_221.ico
- `Systray300` — **32x32_4**, 16x16_4 — systray_300.ico
- `Systray301` — **32x32_4**, 16x16_4 — systray_301.ico
- `Systray302` — **32x32_4**, 16x16_4 — systray_302.ico
- `Systray303` — **32x32_4**, 16x16_4 — systray_303.ico
- `Systray304` — **32x32_4**, 16x16_4 — systray_304.ico
- `Systray305` — **32x32_4** — systray_305.ico
- `Systray306` — **16x16_4**, 32x32_4 — systray_306.ico

### T

- `Taskman100` — **32x32_4** — taskman_100.ico
- `Textchat` — **32x32_4**, 16x16_4 — textchat.ico
- `Textchat2` — **32x32_4**, 16x16_4 — textchat_2.ico
- `Tick` — **16x16_4** — tick.ico
- `Time` — **16x16_4** — time.ico
- `Timedate` — **32x32_4**, 16x16_4 — timedate.ico
- `Timedate200` — **32x32_4**, 16x16_4 — timedate_200.ico
- `TimerFont` — **32x32_4** — timer_font.ico
- `Toupper` — **16x16_4** — toupper.ico
- `Tour1` — **32x32_4** — tour_1.ico
- `Tree` — **32x32_4**, 16x16_4 — tree.ico
- `Tssoft3210` — **32x32_4** — tssoft32_10.ico
- `Twunk32TwunkIcon` — **32x32_4** — twunk_32_twunk_icon.ico

### U

- `Ulclient1002` — **32x32_4**, 16x16_4 — ulclient_1002.ico
- `Ulclient1235` — **32x32_4** — ulclient_1235.ico
- `Underlne` — **16x16_4** — underlne.ico
- `Undo` — **16x16_4** — undo.ico
- `Uninst1000` — **32x32_4** — uninst_1000.ico
- `Uninstall` — **32x32_4** — uninstall.ico
- `Unmute` — **32x32_4**, 16x16_4 — unmute.ico
- `Url102` — **32x32_4**, 16x16_4 — url_102.ico
- `Url103` — **32x32_4** — url_103.ico
- `Url104` — **32x32_4** — url_104.ico
- `Url105` — **32x32_4** — url_105.ico
- `Url1102` — **32x32_4**, 16x16_4 — url_1_102.ico
- `Url1103` — **32x32_4** — url_1_103.ico
- `Url1104` — **32x32_4** — url_1_104.ico
- `Url1105` — **32x32_4** — url_1_105.ico
- `User` — **32x32_4**, 16x16_4 — user.ico
- `User1` — **32x32_4**, 22x22_4, 16x16_4, 14x14_4, 12x12_4, 10x10_4 — user_1.ico
- `User2` — **32x32_1**, 32x32_4 — user_2.ico
- `User3` — **32x32_1**, 32x32_4 — user_3.ico
- `User4` — **32x32_1**, 32x32_4 — user_4.ico
- `User5` — **32x32_1**, 32x32_4 — user_5.ico
- `User6` — **32x32_1**, 32x32_4, 16x16_4 — user_6.ico
- `User7` — **32x32_1**, 32x32_4 — user_7.ico

### V

- `Voxplay3000` — **32x32_4**, 16x16_4 — voxplay_3000.ico
- `Vvexe321` — **32x32_4** — vvexe32_1.ico

### W

- `Wab321010` — **32x32_4** — wab32_1010.ico
- `Wab321011` — **32x32_4**, 16x16_4 — wab32_1011.ico
- `Wab321012` — **32x32_4**, 16x16_4 — wab32_1012.ico
- `Wab321013` — **32x32_4**, 16x16_4 — wab32_1013.ico
- `Wab321014` — **32x32_4** — wab32_1014.ico
- `Wab321015` — **32x32_4** — wab32_1015.ico
- `Wab321016` — **32x32_4** — wab32_1016.ico
- `Wab321017` — **32x32_4** — wab32_1017.ico
- `Wab321018` — **32x32_4** — wab32_1018.ico
- `Wab321019` — **32x32_4** — wab32_1019.ico
- `Wab321020` — **32x32_4** — wab32_1020.ico
- `Wangimg128` — **32x32_4**, 16x16_4 — wangimg_128.ico
- `Wangimg129` — **32x32_4**, 16x16_4 — wangimg_129.ico
- `Wangimg130` — **32x32_4**, 16x16_4 — wangimg_130.ico
- `Warning` — **32x32_4** — warning.ico
- `Wb32105` — **32x32_4**, 16x16_4 — wb32_105.ico
- `Wb32108` — **32x32_4** — wb32_108.ico
- `Wb32109` — **32x32_4** — wb32_109.ico
- `Wb32110` — **32x32_4** — wb32_110.ico
- `Wb32111` — **32x32_4** — wb32_111.ico
- `Wb32112` — **32x32_4** — wb32_112.ico
- `Wb32113` — **32x32_4** — wb32_113.ico
- `WebLink` — **16x16_4** — web_link.ico
- `WebOpen` — **16x16_4** — web_open.ico
- `Websrch` — **16x16_4** — websrch.ico
- `WebTxfr` — **16x16_4** — web_txfr.ico
- `Wgpocpl128` — **32x32_4** — wgpocpl_128.ico
- `What` — **16x16_4** — what.ico
- `WindowAbc` — **32x32_4** — window_abc.ico
- `WindowAccessibility` — **32x32_4**, 16x16_4 — window_accessibility.ico
- `WindowGraph` — **32x32_4** — window_graph.ico
- `WindowsExplorer` — **32x32_1**, 32x32_4, 16x16_4 — windows_explorer.ico
- `Winfile1` — **32x32_1**, 32x32_4 — winfile_1.ico
- `Winfile2` — **32x32_1**, 32x32_4 — winfile_2.ico
- `Winfile3` — **32x32_1**, 32x32_4 — winfile_3.ico
- `Winfile4` — **32x32_1**, 32x32_4 — winfile_4.ico
- `Winhlp324000` — **32x32_4**, 16x16_4 — winhlp32_4000.ico
- `Winhlp324001` — **32x32_4**, 16x16_4 — winhlp32_4001.ico
- `Winhlp324002` — **32x32_4**, 16x16_4 — winhlp32_4002.ico
- `Wininet32546` — **32x32_4**, 16x16_4 — wininet_32546.ico
- `Winmine1` — **32x32_4**, 16x16_4 — winmine_1.ico
- `Winpopup1` — **32x32_4**, 16x16_4 — winpopup_1.ico
- `Winpopup2` — **32x32_4**, 16x16_4 — winpopup_2.ico
- `Winpopup3` — **32x32_4**, 16x16_4 — winpopup_3.ico
- `Wintrust103` — **32x32_4** — wintrust_103.ico
- `Winword1` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — winword_1.ico
- `Winword2` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — winword_2.ico
- `Winword3` — **32x32_4**, 32x32_1 — winword_3.ico
- `Winword4` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — winword_4.ico
- `Winword5` — **32x32_4**, 24x24_4, 16x16_4, 48x48_8 — winword_5.ico
- `Winword6` — **32x32_4**, 16x16_4, 48x48_8 — winword_6.ico
- `Winword7` — **32x32_4**, 16x16_4, 48x48_8 — winword_7.ico
- `Wmsui321000` — **32x32_4**, 16x16_4 — wmsui32_1000.ico
- `Wmsui321001` — **32x32_4**, 16x16_4 — wmsui32_1001.ico
- `Wmsui321306` — **32x32_4**, 32x32_1, 32x16_1 — wmsui32_1306.ico
- `Wmsui322219` — **32x32_4**, 32x32_1, 16x16_4 — wmsui32_2219.ico
- `Wmsui322220` — **32x32_4**, 16x16_4 — wmsui32_2220.ico
- `Wmsui322221` — **32x32_4**, 16x16_4 — wmsui32_2221.ico
- `Wmsui322223` — **32x32_4**, 16x16_4 — wmsui32_2223.ico
- `Wmsui322224` — **32x32_4**, 16x16_4 — wmsui32_2224.ico
- `Wmsui322225` — **32x32_4**, 16x16_4 — wmsui32_2225.ico
- `Wmsui322226` — **32x32_4**, 16x16_4 — wmsui32_2226.ico
- `Wmsui323911` — **32x32_4**, 16x16_4 — wmsui32_3911.ico
- `Wmsui323912` — **32x32_4**, 16x16_4 — wmsui32_3912.ico
- `Wmsui323919` — **32x32_4**, 16x16_4 — wmsui32_3919.ico
- `Wmsui323920` — **32x32_4**, 16x16_4 — wmsui32_3920.ico
- `Wmsui323924` — **32x32_4**, 16x16_4 — wmsui32_3924.ico
- `Wmsui323926` — **32x32_4**, 16x16_4 — wmsui32_3926.ico
- `Wmsui323929` — **16x16_4** — wmsui32_3929.ico
- `Wmsui323934` — **16x16_4**, 32x32_4 — wmsui32_3934.ico
- `Wmsui323935` — **16x16_4** — wmsui32_3935.ico
- `Wmsui323936` — **16x16_4** — wmsui32_3936.ico
- `Wmsui323938` — **32x32_4** — wmsui32_3938.ico
- `Wmsui325084` — **32x32_4** — wmsui32_5084.ico
- `Wmsui325085` — **32x32_4** — wmsui32_5085.ico
- `Wmsui325086` — **32x32_4** — wmsui32_5086.ico
- `Wmsui325087` — **32x32_4** — wmsui32_5087.ico
- `Wmsui325900` — **32x32_4**, 16x16_4 — wmsui32_5900.ico
- `Wmsui325901` — **32x32_4**, 16x16_4 — wmsui32_5901.ico
- `Wordpad` — **32x32_4**, 16x16_4 — wordpad.ico
- `Wrdart32100` — **32x32_4** — wrdart32_100.ico
- `Wrdart321200` — **32x32_4** — wrdart32_1200.ico
- `Wrdart321201` — **32x32_4** — wrdart32_1201.ico
- `Wrdart321202` — **32x32_4** — wrdart32_1202.ico
- `Wrdart321203` — **32x32_4** — wrdart32_1203.ico
- `Wrdart321204` — **32x32_4** — wrdart32_1204.ico
- `Wrdart321205` — **32x32_4** — wrdart32_1205.ico
- `Wrdart321206` — **32x32_4** — wrdart32_1206.ico
- `Wrdart321207` — **32x32_4** — wrdart32_1207.ico
- `Wrdart321208` — **32x32_4** — wrdart32_1208.ico
- `Wrdart321209` — **32x32_4** — wrdart32_1209.ico
- `Wrdart321210` — **32x32_4** — wrdart32_1210.ico
- `Wrdart321211` — **32x32_4** — wrdart32_1211.ico
- `Wrdart321212` — **32x32_4** — wrdart32_1212.ico
- `Wrdart321213` — **32x32_4** — wrdart32_1213.ico
- `Wrdart321214` — **32x32_4** — wrdart32_1214.ico
- `Wrdart321215` — **32x32_4** — wrdart32_1215.ico
- `Wrdart321216` — **32x32_4** — wrdart32_1216.ico
- `Wrdart321217` — **32x32_4** — wrdart32_1217.ico
- `Wrdart321218` — **32x32_4** — wrdart32_1218.ico
- `Wrdart321219` — **32x32_4** — wrdart32_1219.ico
- `Wrdart321220` — **32x32_4** — wrdart32_1220.ico
- `Wrdart321221` — **32x32_4** — wrdart32_1221.ico
- `Wrdart321222` — **32x32_4** — wrdart32_1222.ico
- `Wrdart321223` — **32x32_4** — wrdart32_1223.ico
- `Wrdart321224` — **32x32_4** — wrdart32_1224.ico
- `Wrdart321225` — **32x32_4** — wrdart32_1225.ico
- `Wrdart321226` — **32x32_4** — wrdart32_1226.ico
- `Wrdart321227` — **32x32_4** — wrdart32_1227.ico
- `Wrdart321228` — **32x32_4** — wrdart32_1228.ico
- `Wrdart321229` — **32x32_4** — wrdart32_1229.ico
- `Wrdart321230` — **32x32_4** — wrdart32_1230.ico
- `Wrdart321231` — **32x32_4** — wrdart32_1231.ico
- `Wrdart321232` — **32x32_4** — wrdart32_1232.ico
- `Wrdart321233` — **32x32_4** — wrdart32_1233.ico
- `Wrdart321234` — **32x32_4** — wrdart32_1234.ico
- `Wrdart321235` — **32x32_4** — wrdart32_1235.ico
- `Wrdart321240` — **32x32_4**, 32x32_1 — wrdart32_1240.ico
- `Wrdart321241` — **32x32_4**, 32x32_1 — wrdart32_1241.ico
- `Wrdart321242` — **32x32_4**, 32x32_1 — wrdart32_1242.ico
- `Wrdart321243` — **32x32_4**, 32x32_1 — wrdart32_1243.ico
- `Wrdart321244` — **32x32_4**, 32x32_1 — wrdart32_1244.ico
- `Wrdart321245` — **32x32_4**, 32x32_1 — wrdart32_1245.ico
- `Wrdart321246` — **32x32_4**, 32x32_1 — wrdart32_1246.ico
- `Wrdart321247` — **32x32_4**, 32x32_1 — wrdart32_1247.ico
- `Write1` — **32x32_4**, 16x16_4 — write_1.ico
