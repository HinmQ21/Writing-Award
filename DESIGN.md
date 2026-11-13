---
name: Writing Award
description: "One essay. One little piece of happiness."
colors:
  bg: "#fff9f2"
  surface: "#fffdf9"
  sidebar: "#fffcf7"
  text: "#453a33"
  muted: "#6c6259"
  border: "#e9e2d8"
  border-strong: "#b6aaa0"
  peach: "#f3a18c"
  peach-soft: "#fbede3"
  lavender: "#b0a0e8"
  primary: "#70588f"
  primary-hover: "#665184"
  primary-soft: "#eee7f6"
  mint: "#dceedb"
  success: "#4e6d4d"
  scene: "#edf0e4"
  blue-soft: "#eaf0f4"
  blue: "#54758e"
  error: "#a74438"
  error-soft: "#fff0e9"
  white: "#fff"
  on-primary: "#fff"
  on-error: "#fff"
  toast-bg: "#453a33"
  toast-text: "#fff"
  scrim: "rgb(53 46 42 / 42%)"
  spinner-track: "rgb(255 255 255 / 35%)"
typography:
  display:
    fontFamily: "Nunito, sans-serif"
    fontSize: "clamp(27px, 2.4vw, 36px)"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Nunito, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-.015em"
  title:
    fontFamily: "Nunito, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
  editor:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.8
  supporting:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "30px"
  circle: "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  button-secondary-hover:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.success}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  button-text:
    textColor: "{colors.primary}"
    padding: "5px 0"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.circle}"
    height: "44px"
    width: "44px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0 14px"
  essay-editor:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.editor}"
    rounded: "{rounded.md}"
  nav-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "0 16px"
  world-badge:
    backgroundColor: "{colors.peach-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "7px 11px"
  surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  achievement-chip:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.success}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  scene-controls:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "2px 4px"
---

# Design System: Writing Award

## Overview

**Creative North Star: "One essay. One little piece of happiness."**

Writing Award makes daily effort tangible through Capy's lasting toy cottage and the worlds that follow it. Ivory paper, rounded lettering and soft physical materials give the working interface a gentle, welcoming mood. English guidance encourages returning to write; the visual reward is construction rather than a grade. The interface language changed at the user's request on 2026-11-13; stored essays retain their original content, and Vietnamese font coverage is kept for multilingual drafts.

The interface stays calm around the dimensional scene. Warm borders and tonal surfaces organize controls, while ambient light, rounded geometry and actual earned pieces carry the playful character. This is the shipped procedural Phase 1 world: the cottage, tree and capybara are rendered in Three.js; no raster scene artwork or finished GLB asset is implied. The supplied design document and concept image establish the identity; current source establishes the exact tokens.

**Key Characteristics:**

- Ivory and warm brown make a legible reading ground.
- Dark lavender marks action, selection and focus; pastels support progress and warmth.
- Nunito headings pair with Nunito Sans reading and controls.
- Quiet bordered surfaces surround a softly lit, tangible toy world.
- Earned construction persists, with bounded celebration and reduced-motion support.

## Colors

### Appearance modes

The user requested light and dark appearance on 2026-11-10. Light retains the original supplied palette. Dark uses warm plum surfaces, cream reading text, muted peach/brown supporting text and soft lavender actions. Remap semantic roles; do not invert the scene or recolor the materials mechanically. The frontmatter records light defaults; `.impeccable/design.json` carries the exact dark overrides from `src/styles.css`.

| Role | Light | Dark |
| --- | --- | --- |
| Page ground | `#fff9f2` | `#211e24` |
| Surface | `#fffdf9` | `#2a262e` |
| Sidebar | `#fffcf7` | `#252128` |
| Reading text | `#453a33` | `#f1e7dc` |
| Supporting text | `#6c6259` | `#c5b7ad` |
| Primary / focus | `#70588f` | `#c6b2ed` |
| On primary | `#fff` | `#30253e` |
| Selection | `#eee7f6` | `#3c304b` |
| Achievement surface | `#dceedb` | `#2e4035` |
| Error text / action | `#a74438` | `#ffb5a7` |
| On error action | `#fff` | `#45201a` |

Default preference is **Theo hệ thống** (`system`), with explicit **Sáng** / **Tối** choices in Settings and a 44px quick-toggle button in the top bar on desktop/mobile. `writing-award:theme:v1` stores the preference separately from essays/progress and syncs across tabs. A blocking bootstrap applies it before React loads; native controls, browser chrome, dialogs, shadows, selection, caret and spinner colors follow the resolved theme. A blocked store still permits appearance changes for the current session.

Three.js adjusts hemisphere/key/fill light and ground in place. Theme changes retain camera rotation, zoom and the existing scene; earned geometry keeps its own pastel materials. Do not rebuild scene geometry or clear drafts when appearance changes.

The palette combines warm paper and peach with lavender, mint and a small blue support role; operational foregrounds are deeper than their pastel surfaces. Frontmatter names preserve the CSS token names from `src/styles.css`.

### Primary

- **Deep Lavender** (`primary`): save actions, selected navigation, links, caret and keyboard focus.
- **Pressed Lavender** (`primary-hover`): primary-button hover, maintaining white foreground text.
- **Lavender Paper** (`primary-soft`): selected radios and navigation, secondary buttons, inactive progress segments and small icon grounds.
- **Pastel Lavender** (`lavender`): earned progress segments and celebration details.

### Secondary

- **Warm Peach** (`peach`): small brand and celebration accents.
- **Peach Paper** (`peach-soft`): cottage badges, friendly notes, peach statistics and journal-row hover.
- **Mint Paper** (`mint`): achievement chips, written-essay statistics, selection highlight and secondary-button hover.
- **Leaf Green** (`success`): ready word counts, earned-state labels and positive icons on light grounds.

### Tertiary

- **Blue Paper** (`blue-soft`) and **Slate Blue** (`blue`): freeze statistics and cool weather context.
- **Clay Red** (`error`) and **Blush Notice** (`error-soft`): recoverable errors, destructive action and error notices. Clay Red also appears as a warm icon accent in the streak statistic.

### Neutral

- **Ivory** (`bg`): the page field.
- **Warm Porcelain** (`surface`): writing, world, journal, dialog and floating-control surfaces.
- **Navigation Cream** (`sidebar`): desktop rail and mobile header/navigation.
- **Warm Brown** (`text`): headings and primary reading text.
- **Muted Brown** (`muted`): supporting copy, inactive controls and metadata.
- **Paper Edge** (`border`): dividers and quiet container boundaries.
- **Strong Paper Edge** (`border-strong`): editable field boundaries and the off switch.
- **Sage Ground** (`scene`): the diorama stage and WebGL fallback.
- **White** (`white`): primary/destructive button text, switch thumb and toast text.

The scene has its own material palette in `src/Scene.tsx`: cream walls, rose roof, honey trim, brown timber, sage foliage, pink flowers, pale water and gold rewards. These are object materials, not interchangeable interface foregrounds.

**The Pastel Ground Rule.** Use deep lavender, warm brown or leaf green for operational text; use pale lavender, peach and mint as supporting grounds or object color.

## Typography

**Display Font:** Nunito, with sans-serif fallback. Self-hosted Vietnamese and Latin faces at weights 700 and 800.

**Body Font:** Nunito Sans, with sans-serif fallback. Self-hosted Vietnamese and Latin faces at weights 400 and 600. Controls inherit this family unless the writing CTA explicitly uses Nunito.

**Character:** Rounded headings feel approachable without turning essays into children's handwriting. Reading text remains clear and regular; headings use balanced wrapping. There is no separate mono face or fixed mathematical type ratio.

### Hierarchy

- **Display:** the responsive page heading uses `display`; at the mobile breakpoint it is 29px, and at the narrowest breakpoint 27px.
- **Headline:** section headings use `headline`; writing and world headings adapt modestly by breakpoint, while dialog titles use 24–27px.
- **Title:** smaller headings use `title`; journal-entry titles use Nunito at weight 700.
- **Body:** saved essay reading uses `body`, preserved line breaks and a maximum measure of 70ch. Essay input uses `editor` so long English text remains comfortable to edit.
- **Supporting:** page descriptions use `supporting`. The writing-panel description has a slightly looser line height of 1.7.
- **Label:** buttons use `label`. Navigation uses 14px; metadata is commonly 11–12px. Mobile form labels and controls increase where needed. Labels retain sentence case.
- **Numbers:** progress, word counts and statistics use tabular numerals; statistics use Nunito at 27px/800 with line height 1.2, increasing to 28px on mobile.

**The Clear Reading Rule.** Keep essay text in Nunito Sans at 16px; preserve the separate rounded heading voice for orientation and reward.

## Layout

The shared spacing scale is a 4/8px rhythm with the seven steps in frontmatter. Real components also use optical adjustments and 20px mobile gutters; do not force those observed values onto a fictional uniform grid.

The desktop shell uses a fixed 220px rail, an 82px top bar, and a centered main region capped at 1480px. Main padding is 38px 40px 22px. Home pairs a wider scene column with the writing form using `minmax(0, 1.65fr) minmax(330px, 1fr)` and a 24px gap. Three compact statistics sit below the world panel. This is the home surface's composition, not a mandatory layout for every route.

- At 1279px and below, the rail becomes 190px, main horizontal padding becomes 28px, and the home columns use a 1.3-to-1 relationship with an 18px gap.
- Between 761px and 1050px, the rail becomes an 88px icon rail with accessible link names. Piece lists use two columns.
- At 760px and below, the rail is replaced by a 72px brand header and fixed bottom navigation. Main content uses 20px gutters and reserves `106px + env(safe-area-inset-bottom)` at the bottom. Home is a single column: scene and statistics, then form. A visible writing shortcut keeps today's action reachable.
- At 374px and below, main/header gutters become 14px and the stage shrinks to 300px.
- At 1600px and above, the stage grows to 420px, main top padding to 48px, and the writing panel to 32px internal padding.

The regular scene stage is 349px high, 340px on mobile. Collection uses three world cards, switching to one on mobile; its piece list moves from three to two to one column. Journal tools stack on mobile. Settings content caps at 860px. Dialogs use viewport-relative width and height caps; essay dialogs expand to 760px. Route state is expressed through hash navigation for home, collection, journal and settings.

## Elevation & Depth

Interface depth is a hybrid of tonal layering and restrained borders. Standard world, writing and journal containers rest without a shadow. Floating scene controls, the locked-world emblem and toast use the diffuse float shadow; modal dialogs use the larger ambient shadow. The scene supplies most of the physical depth through rounded solids, a raised island, high-roughness materials, soft cast shadows and warm light with lavender fill.

### Shadow Vocabulary

- **Float:** `0 8px 24px rgb(69 58 51 / 10%)`, for controls and transient foreground elements.
- **Modal:** `0 24px 80px rgb(69 58 51 / 20%)`, for native dialogs above the dimmed backdrop.
- **Editor focus:** `0 0 0 2px var(--color-primary-soft)`, paired with the deep-lavender border. This is focus feedback rather than structural elevation.

**The Quiet Frame Rule.** Let the toy scene carry physical richness; keep working containers bordered and calm rather than adding clay shadows to every interface surface.

State transitions use 150ms for controls and 240ms for normal entrances, with the source's outward easing where specified. The earned piece settles into its actual model position over 850ms; confetti is a bounded 1600ms accent with staggered starts. Reduced motion removes dialog, toast and confetti animation, button press movement, key transitions and the earned-piece drop.

## Shapes

The core corner scale is gently rounded: small details and task options use `sm`; fields, buttons, statistics and navigation use `md`; main surfaces and dialogs use `lg`. Pill silhouettes are limited to compact badges, switches and the scene-control tray. Icon buttons, status dots and thumbs are circular. Progress segments use a small 3px radius so the 21 earned steps remain discrete.

Borders are thin and warm. Forms use the stronger boundary; panels use the quieter boundary. World containers clip their scene to the surface corners. The scene's rounded boxes, soft foliage, arched doorway and tiled roof express the toy language in geometry; those object shapes do not require every page control to become sculptural.

## Components

### Buttons

Clear, friendly actions with a quiet press response.

- Regular buttons have the medium corner, 12px 18px padding, a 46px minimum height and a 9px icon gap. Primary uses deep lavender with white text; hover uses pressed lavender.
- Secondary uses lavender paper with deep-lavender text, changing to mint and leaf green on hover. Destructive action uses clay red with white text. Text actions use lavender and underline on hover.
- The full-width writing CTA uses Nunito 800 at 15px and a 50px minimum height; on mobile this becomes 16px and 52px. It owns the primary writing action.
- Buttons move down 1px while active. Disabled buttons use opacity .55 and a not-allowed cursor. Keyboard focus is a 3px deep-lavender outline with a 4px offset unless the component defines its own focus container.
- Circular icon buttons are 44px square. Scene buttons are 40px wide and 44px high, narrowing to 38px at the smallest breakpoint while retaining height.

### Chips

Compact state labels with readable foregrounds, not extra page headings.

- World badges use peach paper and warm brown within a compact pill.
- Achievement state uses mint, leaf-green text and the small corner. Locked-world state uses lavender paper and deep lavender.
- The demo badge uses peach paper and muted brown. State remains explicit in copy and icons rather than relying on color alone.

### Cards / Containers

Quiet paper frames for work and retained progress.

- World, writing, collection and journal containers use warm porcelain, a 1px paper-edge border and the large corner.
- The writing panel's default padding is 26px 24px 21px; collection cards use 20px 20px 24px. Shared spacing values guide new surfaces; local optical adjustments remain local.
- Statistics use the medium corner and peach, blue or mint grounds. Their value and supporting copy remain separate levels.
- Collection-card active and hover states change the border to deep lavender. Locked previews are desaturated and faded, with an explicit lock emblem and text. Locked card opacity is retained so its description remains readable.
- Native dialogs use the modal shadow and warm porcelain over `rgb(53 46 42 / 42%)`. They have an explicit close control, Escape/backdrop dismissal, contained keyboard focus and focus restoration.

### Inputs / Fields

Warm, readable fields with recoverable feedback.

- Search and select fields use warm porcelain, the strong border, medium corners and a 48px minimum height. Search caps at 420px on desktop and fills the mobile width; mobile input/select text is 16px.
- The essay editor groups textarea, draft status and live word count inside one medium-corner border. The textarea is 230px high with 160px minimum, vertically resizable, and uses 16px text with line height 1.8. It grows to 250px on mobile and 273px on large desktop.
- Focus shifts the editor border to deep lavender with its soft halo. Search uses a 2px lavender outline with 2px offset. Errors use clay-red border and inline text while retaining the draft; ready word count uses leaf green with a check icon.
- Native task radios appear as small-corner options. Selection combines deep-lavender border/text, lavender-paper fill and a check. Paste/upload tabs use a lavender underline and text for the selected state, with arrow-key navigation.
- Upload supports Word `.docx`, TXT and Markdown, with the allowed formats and 5 MB limit visible beside the file picker. After a successful import, switch to the editable text panel and announce the source filename plus review guidance in a wrapping status paragraph. Retain the previous draft on failed/empty imports; keep submission disabled during parsing. Word decoding runs in a disposable worker, canceled when replaced or the form unmounts. Preserve the light/dark semantic tokens for import status and errors.
- Upload uses a dashed strong border and offers a file button as well as drop. The shipped supported formats and size are written beside it; optional dragging is never the sole input path.

### Navigation

Stable orientation through the same lavender selected state.

- Desktop links have 48px minimum height, medium corners, 12px icon gap and 14px labels. Current-page links add lavender-paper fill, deep-lavender text and a small indicator; hover uses the same soft fill. Lucide outline icons are paired with labels or accessible names.
- Mobile bottom links stack icon and 11px semibold label, with 55px minimum height and safe-area padding. The active link keeps the lavender-paper state. The mobile header retains the compact Capy brand.
- Settings rows use thin dividers, generous vertical padding and aligned controls. The switch is 52px by 32px, with a 24px white thumb; active changes the track to lavender and moves the thumb 20px.

### Living World and Earned Piece

The signature is an actual piece joining a lasting model.

The wide stage contains a procedural orthographic diorama and a floating pill tray for rotate, zoom and reset. Desktop drag is optional. Labeled buttons provide the equivalent actions; mobile single-finger movement stays page scrolling, and native pinch zoom remains available. Rain changes the scene light and ground with explicit supporting text.

The 21-step segmented track corresponds to visible construction. A successful reward first shows the actual earned geometry in a centered, bounds-fitted preview, then places it in the full world when celebration is dismissed. The preview uses 210px by 190px space with large corners. Reduced motion shows the settled construction immediately. A textual WebGL fallback preserves progress and explains how to retry; loading and failure remain legible without the canvas.

## Do's and Don'ts

### Do:

- **Do** use deep lavender for action, selection and focus, with pastel grounds supporting the state.
- **Do** use Nunito for rounded headings and Nunito Sans for essays and controls, retaining Vietnamese and Latin coverage.
- **Do** start from the shared spacing and corner scales, then preserve documented optical adjustments.
- **Do** keep visible controls, keyboard focus and text labels alongside scene interaction and color states.
- **Do** show the actual earned piece and keep a settled reduced-motion alternative.
- **Do** label demonstration progress and supported input formats in the same calm visual voice.

### Don't:

- **Don't** use pale lavender as operational text on ivory.
- **Don't** turn the working interface into a score dashboard or replace the supplied pastel toy identity with a generic marketing palette.
- **Don't** add thick clay borders or layered sculptural shadows to ordinary writing and navigation surfaces.
- **Don't** make dragging or animation the only way to understand or operate the scene.
- **Don't** imply raster scene artwork, production GLB fidelity or physical-device verification that this procedural Phase 1 build does not supply.
