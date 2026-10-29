---
version: alpha
name: Craft-design-system
description: Craft v2. Same scrapbook look as v1, but the main button is Heron's deep navy pill with cream text, which grounds the bright palette, and purple replaces orange-red as the pop color. Craft, a scrapbook for your notes. Warm paper white with an eighteen-color crayon-box palette in three strengths (deep, bright, pale), each with a grainy paper texture. Torn-paper collages, colored file folders with a thin ink outline, soft clay-like 3D letters, halftone clouds over sky blue, and a mix of an editorial serif, a clean grotesk and a typewriter mono. Handmade, playful and tidy at the same time.

colors:
  background: "#FCF7F4"
  surface: "#FFFFFF"
  ink: "#151515"
  on-ink: "#FFFFFF"
  muted: "#6B6560"
  primary: "#083C4C"
  primary-pressed: "#05303D"
  on-primary: "#FBFAF6"
  accent-purple: "#C7A1B6"
  secondary-teal: "#56ABB9"
  tertiary-yellow: "#E9C959"
  accent-green: "#4AA25E"
  accent-red: "#EE6B3A"
  accent-orange: "#EA9D51"
  deep-blue: "#528BAB"
  deep-moss: "#5D6F55"
  deep-plum: "#754054"
  deep-rust: "#B25620"
  deep-ochre: "#BB9030"
  paper-sky: "#DBEDF0"
  paper-lime: "#E5F0D5"
  paper-lilac: "#E7D8E8"
  paper-blush: "#EFCAC0"
  paper-apricot: "#F8D6AE"
  paper-butter: "#F6E9B7"
  stone: "#ECE9E3"
  hairline: "#D9D4CC"
  success: "#4AA25E"
  danger: "#A13732"

typography:
  display-hero:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: 72px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -1.5px
  heading-1:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -1px
  heading-2:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.4px
  card-title:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
  date-stamp:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 1.2px
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45

rounded:
  none: 0px
  tile: 14px
  panel: 24px
  full: 9999px

spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  section: 96px

shadows:
  panel: "0 12px 32px -12px rgba(21, 21, 21, 0.18)"
  paper: "0 1px 0 rgba(21, 21, 21, 0.08), 2px 3px 0 rgba(21, 21, 21, 0.06)"

motion:
  ease-paper: "cubic-bezier(0.3, 1.3, 0.5, 1)"
  duration-quick: 160ms
  duration-base: 300ms

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: 10px 20px
  button-pop:
    backgroundColor: "{colors.accent-purple}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: 10px 20px
    border: "1px solid {colors.ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: 10px 20px
    border: "1px solid {colors.ink}"
  card-base:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "{spacing.md}"
    border: "1px solid {colors.hairline}"
  card-folder:
    backgroundColor: "{colors.paper-sky}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm}"
    border: "1px solid {colors.ink}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.sm}"
    shadow: "{shadows.panel}"
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: 10px 14px
    border: "1px solid {colors.hairline}"
  badge:
    backgroundColor: "{colors.paper-butter}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.full}"
    padding: 2px 10px
---

# Craft — Design System (v2, navy button)

> A scrapbook for your notes: torn paper, colored folders, clay letters and clouds.

## 1. Overview

**What changed in v2:** the primary button is now Heron's navy pill (`#083C4C` with cream `#FBFAF6` text, no outline, 10px 20px). Navy is only for primary buttons and pressed states. Craft's purple (`#C7A1B6`) replaces the orange-red as the pop color for highlights and the pop button. Everything else is the same as v1.


Built from six images of the Craft brand: the collage wordmark, the clay 3D letters over sky, the settings panel, the torn-paper collage, the color chart and the folder grid. What they share:

- **Paper first.** Everything looks like a physical material: grainy colored paper, graph paper, notebook spirals, washi tape, halftone dots. Add a fine grain texture to large color areas.
- **A crayon box of color.** Six hues (blue, green, plum, red, orange, ochre) in three strengths: deep, bright and pale. Pale tints for big surfaces, bright for objects, deep for small accents and pressed states.
- **Thin ink lines.** Folders, buttons and tabs have a 1px near-black outline, like a fineliner drawing.
- **Tidy on top of messy.** Clean white panels with soft 24px corners float above the collage. The UI itself stays calm and organized.
- **Soft and tactile.** Hero type can be chunky clay letters or cut-paper shapes. Clouds and halftone sky are recurring backdrops.
- **Three voices of type.** An editorial serif with a lively italic for big statements, a clean grotesk for the interface, a mono for file names and labels.

## 2. Colors

| Family | Deep | Bright | Pale |
|---|---|---|---|
| Blue | `#528BAB` | `#56ABB9` | `#DBEDF0` |
| Green | `#5D6F55` | `#4AA25E` | `#E5F0D5` |
| Plum | `#754054` | `#C7A1B6` | `#E7D8E8` |
| Red | `#A13732` | `#EE6B3A` | `#EFCAC0` |
| Orange | `#B25620` | `#EA9D51` | `#F8D6AE` |
| Ochre | `#BB9030` | `#E9C959` | `#F6E9B7` |

- **Paper** (`#FCF7F4`): page background. **White** (`#FFFFFF`): panels and cards. **Stone** (`#ECE9E3`): quiet tiles.
- **Ink** (`#151515`): text and outlines. Text on every bright and pale color is ink, never white.
- **Primary** is Heron Navy (`#083C4C`), used for primary buttons only. Cream text reads on it at about 11:1.
- **Purple** (`#C7A1B6`) is the pop color: highlights, the cover pattern, one pop button per screen. Deep Plum (`#754054`) for its pressed state.
- **Bright Red** (`#EE6B3A`) steps back to an occasional accent alongside the other brights.

## 3. Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Display hero | Fraunces | 72px | 400 | Mix in italic words, "Space for *Notes*" |
| Heading 1 | Fraunces | 48px | 400 | |
| Heading 2 | Hanken Grotesk | 28px | 600 | |
| Card title | Hanken Grotesk | 18px | 600 | Folder names |
| Body | Hanken Grotesk | 16px | 400 | |
| Button | Hanken Grotesk | 15px | 600 | |
| Date stamp | Hanken Grotesk | 11px | 600 | Uppercase, 1.2px tracking, "APR 8, 2025" |
| Mono | JetBrains Mono | 13px | 500 | File names, "instant_sync.txt" |
| Caption | Hanken Grotesk | 13px | 400 | |

## 4. Components

- **Folders:** the signature card. A file-folder shape with a tab on the top left, 1px ink outline, square corners, filled with one bright or pale color. Small checkbox top left, title, then an uppercase date and an arrow along the bottom.
- **Panels:** white, 24px corners, soft drop shadow, holding a grid of tiles.
- **Tiles:** 14px corners, 1px hairline border, a pale fill or white, label in the top left.
- **Buttons:** pills. Primary is solid navy with cream text and no outline (from Heron). Secondary is white with a 1px ink outline. Pop is purple with a 1px ink outline, for one fun action per screen.
- **Color picker pill:** a white pill holding round swatches of pattern and color.
- **File chips:** a small rounded square icon tile in a pale color above a mono file name with a hollow dot.
- **Badges:** butter-yellow pills in mono.
- **Separators:** scalloped or wavy paper strips in a pale color instead of plain rules.

## 5. Layout

- Spacing scale: 8, 12, 16, 24, 40, 64, 96
- Grids of folders with generous gaps (40px+).
- Hero sections can be collages: overlapping torn shapes with a thin white paper edge.

## 6. Motion

Papery and light. Things settle with a tiny overshoot (300ms), folders tilt a degree or two on hover, clouds drift slowly.

## 7. Do and don't

- Do give large color areas a fine paper grain.
- Do use pale tints for big areas and bright colors for small objects.
- Do keep text ink-black on every color except navy, which takes cream.
- Don't use gradients, except halftone clouds and sky.
- Don't use thick borders. Outlines are always 1px.
