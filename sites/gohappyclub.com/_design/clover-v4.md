---
version: alpha
name: Clover-design-system
description: Clover v4, "Club". Built from the Go Happy Club logo. Flat blocks of orange, clover green, sunshine yellow and pale aqua, square corners, thick black outlines, overlapping rings, and wide heavy capitals, sitting on Clover's warm oat page with a touch of Meadow lavender kept in.

colors:
  background: "#F5F1EA"
  surface: "#FFFFFF"
  ink: "#111111"
  on-ink: "#FFFFFF"
  muted: "#4A4A45"
  primary: "#FF6620"
  primary-pressed: "#E8550F"
  secondary-mint: "#00D67A"
  tertiary-sunshine: "#FFDC00"
  accent-aqua: "#D4FFFF"
  accent-lavender: "#B8A9D9"
  forest: "#1F3B2D"
  hairline: "#111111"
  success: "#008A4E"
  danger: "#D7263D"

typography:
  display-hero:
    fontFamily: "Unbounded, ui-sans-serif, system-ui"
    fontSize: 64px
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: 0
  heading-1:
    fontFamily: "Unbounded, ui-sans-serif, system-ui"
    fontSize: 44px
    fontWeight: 800
    lineHeight: 1.0
    letterSpacing: 0
  heading-2:
    fontFamily: "Unbounded, ui-sans-serif, system-ui"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0
  stamp:
    fontFamily: "Unbounded, ui-sans-serif, system-ui"
    fontSize: 12px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 1px
  card-title:
    fontFamily: "Figtree, ui-sans-serif, system-ui"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "Figtree, ui-sans-serif, system-ui"
    fontSize: 15px
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: 0.5px
  caption:
    fontFamily: "Figtree, ui-sans-serif, system-ui"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.45

rounded:
  none: 0px
  micro: 2px
  full: 9999px

spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

shadows:
  none: "none"

motion:
  ease-snap: "cubic-bezier(0.2, 0.9, 0.3, 1.2)"
  duration-quick: 140ms
  duration-base: 260ms

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 20px
    border: "2px solid {colors.ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 20px
    border: "2px solid {colors.ink}"
  button-mint:
    backgroundColor: "{colors.secondary-mint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: 12px 20px
    border: "2px solid {colors.ink}"
  card-base:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
    border: "2px solid {colors.ink}"
  card-block:
    backgroundColor: "{colors.accent-aqua}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: 12px 14px
    border: "2px solid {colors.ink}"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.stamp}"
    rounded: "{rounded.full}"
    padding: 3px 12px
    border: "2px solid {colors.ink}"
---

# Clover — Design System (v4, Club)

> Flat color blocks, black rings and big wide capitals, straight from the Go Happy Club logo.

## 1. Overview

v4 branches from v3 (the "exciting" one) and takes its whole look from the Go Happy Club logo:

- **Color blocks, not gradients.** Layouts are built from flat rectangles of orange, clover green, sunshine yellow and pale aqua that butt right up against each other, like the logo's frame.
- **Square corners.** Everything is a hard rectangle. The only round things are rings and outlined badges.
- **Thick black lines.** 2px black borders on buttons, cards and inputs, and 3 to 4px black rings as decoration, overlapping like the logo's five ovals.
- **Wide heavy capitals.** Headlines use Unbounded at 800 weight, the closest free Google font to the logo's extended lettering. Body text stays Figtree.
- **Stamp details.** Small "EST. 2024" style labels in wide caps for dates, categories and locations.
- **Still Clover.** The warm oat page stays underneath, green becomes the clover color, and Meadow's lavender stays as a small fourth accent.

Compared with v3: violet is replaced by orange as the main color, shadows and the hover glow are gone (the logo is completely flat), and corners go from 6px to square.

## 2. Colors

- **Oat** (`#F5F1EA`): page background.
- **White** (`#FFFFFF`): cards, inputs, the logo's center field.
- **Ink** (`#111111`): text, every outline and ring.
- **Go Orange** (`#FF6620`): primary buttons and top bands. Black text only (white fails contrast).
- **Clover Green** (`#00D67A`): secondary blocks, success, the "go" moment.
- **Sunshine** (`#FFDC00`): highlights, sale and date blocks.
- **Pale Aqua** (`#D4FFFF`): calm feature panels.
- **Lavender** (`#B8A9D9`): small accents, kept from Meadow.

Use at most three block colors on one screen, always separated by edges, never blended.

## 3. Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Display hero | Unbounded | 64px | 800 | Uppercase, line height 0.95 |
| Heading 1 | Unbounded | 44px | 800 | Uppercase |
| Heading 2 | Unbounded | 28px | 700 | Uppercase |
| Stamp | Unbounded | 12px | 800 | Uppercase, 1px tracking |
| Card title | Figtree | 18px | 700 | |
| Body | Figtree | 16px | 400 | |
| Button | Figtree | 15px | 800 | Uppercase, 0.5px tracking |
| Caption | Figtree | 13px | 500 | |

## 4. Components

- **Primary button:** orange block, 2px black border, square corners, black uppercase label. Hover: snaps 2px right and down onto a black block behind it. No glow.
- **Secondary button:** white with the same black border.
- **Cards:** white, 2px black border, square corners, no shadow. Images inside sit in flat color blocks.
- **Block panels:** full-bleed aqua, green or yellow rectangles with no border, used for sections.
- **Badges:** outlined black pills in stamp type, like the rings.
- **Rings:** 3 to 4px black ovals, overlapping in a row, as a divider or hero decoration.

## 5. Motion

Quick and snappy (140ms) with a tiny overshoot. Nothing floats or glows.

## 6. Do and don't

- Do keep everything flat: no shadows, no gradients.
- Do let color blocks touch edge to edge.
- Don't round corners on cards or buttons.
- Don't put white text on orange or yellow.
