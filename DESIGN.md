---
name: Voli Weekend
description: The cheapest weekend flights from Bari and Brindisi, each deal issued as a boarding pass.
colors:
  price-blue: "#1d5fbf"
  price-blue-tint: "#dbe7f8"
  ink: "#0a0a0a"
  ink-control: "#141414"
  ink-hover: "#333333"
  card-stock: "#ffffff"
  apron-grey: "#f2f4f7"
  raised-grey: "#e9ecf1"
  hairline: "#dde1e7"
  control-stroke: "#c9ced6"
  muted-ink: "#5d636c"
  stale-amber: "#d97706"
  stale-ink: "#92400e"
  stale-wash: "#fffbeb"
typography:
  display:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  price:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
    fontFeature: "tnum"
rounded:
  track: "3px"
  segment: "4px"
  control: "6px"
  card: "8px"
spacing:
  hair: "2px"
  xs: "6px"
  gap: "12px"
  md: "16px"
  pad: "24px"
  column: "1100px"
  control-height: "36px"
  touch-height: "44px"
  notch: "9px"
components:
  pass-card:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px 24px"
  pass-stub:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.price-blue}"
    padding: "16px 24px"
    width: "224px"
  button-book:
    backgroundColor: "{colors.ink-control}"
    textColor: "{colors.card-stock}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "{spacing.control-height}"
  button-book-hover:
    backgroundColor: "{colors.ink-hover}"
  button-secondary:
    backgroundColor: "{colors.raised-grey}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "{spacing.control-height}"
  button-secondary-hover:
    backgroundColor: "{colors.hairline}"
  segmented:
    backgroundColor: "{colors.raised-grey}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.control}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.segment}"
    padding: "0 12px"
  select:
    backgroundColor: "{colors.card-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 32px 0 10px"
    height: "{spacing.control-height}"
  stale-note:
    backgroundColor: "{colors.stale-wash}"
    textColor: "{colors.stale-ink}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
---

# Design System: Voli Weekend

## Overview

**Creative North Star: "The Boarding Pass"**

Every deal is issued as a boarding pass: white card stock laid on a cool grey-blue apron, the route printed in oversized IATA codes, the price carried on a tear-off stub separated by a dashed perforation and two semicircular notches. The page reads like a short stack of passes handed across a counter, ranked cheapest first, so that one glance answers whether there is a weekend worth booking.

The palette is an achromatic ledger with a single voice. Chrome, controls, and the primary action are near-black ink; everything structural is a cool grey. The only colour on the page is the price blue, and it lands where the money is: the stub amount and the price in the headline finding. Depth is entirely tonal; there are no shadows anywhere. Geist with tabular figures keeps times, prices, and hours aligned like printed fields.

Density is operational, not editorial: a 48px top bar, one sentence of finding, a single row of standard filters, then the passes at full column width. On a phone the stub drops beneath the pass and the perforation turns horizontal.

**Key Characteristics:**
- White card stock (8px corners) on a cool grey-blue apron, flat, no shadows.
- Oversized IATA codes at 700; origin in muted ink, destination in full ink.
- A notched, dashed-perforation stub that carries the price in the one hue.
- A Friday-to-Monday stay axis whose filled length is the time spent at the destination.
- Ink-black primary action; the stub nudges 4px along the perforation when Prenota is about to be pressed.
- Tabular figures everywhere.

## Colors

An achromatic ledger: ink and cool greys do all the structural work, and a single saturated blue marks the price.

### Primary
- **Price Blue** (price-blue): the price, and only the price. Used on the stub amount and its euro unit, and on the price inside the headline finding sentence. Also used, functionally, as the keyboard focus ring.
- **Price Blue Tint** (price-blue-tint): text selection background only.

### Neutral
- **Ink** (ink): all body text, destination IATA codes, headings.
- **Control Ink** (ink-control): the Prenota button fill, the stay-axis fill, and the `accent-color` of the range slider and checkbox. Ink, not hue, carries every action.
- **Ink Hover** (ink-hover): Prenota hover fill.
- **Card Stock** (card-stock): pass cards, the empty state, selected segments, select fields, and the mobile filter panel.
- **Apron Grey** (apron-grey): page ground and top bar; also fills the notches, so the cut reads as a hole through the card.
- **Raised Grey** (raised-grey): segmented-control trough, secondary button, stay-axis track.
- **Hairline** (hairline): the dashed perforation; secondary button hover.
- **Control Stroke** (control-stroke): select borders, the day ticks on the stay axis, and the neutral source-freshness dot.
- **Muted Ink** (muted-ink): labels, legends, origin IATA code, route arrow, country, leg metadata, stay-axis day names. Holds above 5:1 on both card stock and apron.

### Chart series (Storico prezzi only)
- **Wizz Magenta** (#b0127a, token `--wizz`): the Wizz Air series in the history charts, beside Price Blue for Ryanair. The one exception to the One Voice Rule: two airlines on the same price chart must be told apart at a glance, and a magenta far from the blue stays readable on card stock (above 6:1). Never used outside chart lines, bands, dots and their legend swatches.

### Tertiary (status)
- **Stale Amber** (stale-amber): the freshness dot of a source whose data is stale.
- **Stale Ink** (stale-ink) on **Stale Wash** (stale-wash): stale source labels and the stale-data note under the title. Status only; never decorative.

### Named Rules
**The One Voice Rule.** Price Blue appears only on prices (plus the focus ring and selection, which are functional). Not on the brand mark, links, buttons, filters, icons, or the stay axis. If a new element wants colour, it gets ink.

**The Ink Action Rule.** Every action, fill, and control accent is ink (`ink-control`), never the hue. The button that books is black so the price stays the only blue thing.

**The Honest Amber Rule.** Amber exists only to say a data source is stale. A fresh page carries no amber at all.

## Typography

**Display Font:** Geist (with Inter, system-ui, sans-serif)
**Body Font:** Geist (same stack)

**Character:** One family, three weights (400, 500, 700), always with tabular figures. Scale and weight do the hierarchy; the IATA codes and the price are set heavy and tight like printed boarding-pass fields, everything else stays quiet at 400-500.

### Hierarchy
- **Display** (700, 52px desktop / 36px under 720px, line-height 1, -0.03em): IATA codes on the pass. Origin in muted ink, destination in full ink.
- **Price** (700, 30px, line-height 1, -0.02em): the stub amount, in Price Blue; the euro unit follows at 500, 18px.
- **Headline** (500, 24px, 1.2, -0.01em): the page h1.
- **Title** (500, 16px, 1.3): destination city; the finding sentence sits at 16px/400 with bold destination, max 70ch.
- **Body** (400, 14px, 1.5): leg times (times at 500), buttons, controls.
- **Label** (400, 12px, muted ink): field legends, leg names (Andata/Ritorno), weekend dates, price notes, source freshness. Stay-axis day names drop to 11px. Sentence case, no tracking.

### Named Rules
**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body and inherited everywhere; times, prices, and hours must align in columns.

**The Printed Field Rule.** Only two things are set at 700 and tight negative tracking: IATA codes and the price amount. Bold elsewhere is limited to the destination name inside the finding sentence.

## Layout

A single 1100px column, centred, with 24px side padding (16px under 720px). The top bar is 48px tall on the apron, with the brand left and source freshness right. Below it: title row (6px internal gap, 20px below), a filter row of standard controls aligned to a common baseline (12px vertical, 16px horizontal gaps), a one-line fare note, then the pass list with 12px between passes.

Each pass is a two-column grid: the main body (flexible) and a fixed 224px stub. The main body splits into the route block (min 220px, 0.8fr) and the leg block (1.4fr), 24px apart, vertically centred. Controls share one 36px height; touch targets on mobile reach 44px.

Under 720px: passes go single-column with the stub beneath the body; the stub becomes a three-row grid with the Prenota button spanning the right side; filters collapse into a card-stock `details` panel with a summary line of the active filters; source freshness switches to short labels and shows a dot only for stale sources.

## Elevation & Depth

Completely flat. No `box-shadow` anywhere in the system. Depth is tonal: white card stock sits on the grey-blue apron, recessed controls sit in a raised-grey trough, and the selected segment returns to card stock. The notches are filled with the apron colour so they read as holes cut through the card, not as shapes laid on it.

### Named Rules
**The Card Stock Rule.** Surfaces separate from the page by tone alone (card-stock on apron-grey). If something needs to feel lifted, change its tone, not its shadow.

## Shapes

Gently rounded: 8px on cards and the empty state, 6px on controls and buttons, 4px on the inner selected segment, 3px pill ends on the stay track, full circles on freshness dots and notches. The signature silhouette is the pass itself: a rounded card interrupted by a 1.5px dashed perforation in hairline grey, with two 9px-radius semicircular notches cut at either end of it (top and bottom on desktop; left and right edges on mobile, where the perforation runs horizontally). Icons are thin inline SVG strokes (1.5-1.6px, round caps) in currentColor: the route arrow, the external-link arrow on Prenota, the select chevron, and the ticket-shaped brand mark.

## Components

### Buttons
Ink-solid and plain; the action is black so the price stays blue.
- **Shape:** gently rounded (6px), 36px high, 14px horizontal padding, 500 weight body size.
- **Primary (Prenota):** control-ink fill, white text, a trailing 11px external-link arrow. Pinned to the bottom of the stub; 44px high and 18px padding on mobile.
- **Hover / Focus:** fill steps to ink-hover over 150ms; `:active` scales to 0.97; focus shows the 2px Price Blue ring at 2px offset.
- **Secondary (Mostra altre):** raised-grey fill, ink text, no border; hover goes to hairline.

### Segmented controls
- **Style:** a raised-grey trough (6px radius, 3px inset, 2px between segments) holding muted-ink options 30px high.
- **State:** the selected option becomes a card-stock tile (4px radius) with ink text at 500; hover lifts unselected text to ink. On mobile segments stretch to equal widths.

### Inputs / Fields
- **Select:** card-stock fill, 1px control-stroke border, 6px radius, 36px high, a muted 10x6 chevron drawn in SVG; border darkens to muted ink on hover. 160px wide on desktop, half-width on mobile.
- **Range and checkbox:** native controls tinted with `accent-color: ink-control`; the current maximum is echoed in the label at 500.
- **Labels:** 12px muted legend above every field, 6px gap.

### Navigation (top bar)
- **Style:** 48px bar on the apron, no border. Brand: ticket-shaped mark in ink (28x20, 24x17 on mobile) plus "Voli Weekend" at 500.
- **Source freshness:** label-size list; source name at 500 ink, age in muted ink, a 7px control-stroke dot. A stale source turns its dot amber and its text stale-ink.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** card stock on apron.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none; only the internal dashed perforation.
- **Internal Padding:** 18px 24px on the pass body (16px on mobile); 16px 24px on the stub; 32px 24px on the empty state.

### Boarding Pass (signature)
The ranked result. Route block: origin IATA (muted) - thin arrow - destination IATA (ink), then city at 500 and country/stop type muted. Leg block: a two-row definition list (Andata/Ritorno label column 64px, times at 500, metadata muted), then the stay axis. Stub: weekend dates (label), price in Price Blue, a muted price note, Prenota at the bottom. When Prenota is hovered or focused, the whole stub slides 4px right (3px down on mobile) along the perforation over 280ms on `cubic-bezier(.16, 1, .3, 1)`, as if starting to tear off. Loading placeholders are blank card-stock passes at 150px min height.

### Stay Axis (signature)
A 6px raised-grey track spanning Friday 00:00 to Monday 00:00, with 1px control-stroke ticks at the day boundaries and ven / sab / dom labels beneath. An ink fill is positioned at arrival and sized to the hours spent at the destination; position is when you are there, length is how long. A label beside it states the hours ("22 h a Tirana"). Max 300px wide on desktop.

### Stale note
A stale-wash pill (6px radius, 6px 10px padding, 13px stale-ink) under the finding, shown only when a source is stale.

## Do's and Don'ts

### Do:
- **Do** set every price in Price Blue (price-blue) and nothing else in that hue except the focus ring and text selection.
- **Do** make every action and control accent ink (ink-control), including slider and checkbox `accent-color`.
- **Do** separate surfaces by tone: card stock (#ffffff) on apron (#f2f4f7), raised grey for troughs.
- **Do** keep tabular figures on for all text that carries numbers.
- **Do** set IATA codes and the price amount at 700 with tight negative tracking; keep the rest at 400-500.
- **Do** fill the stub notches with the page ground so they read as cuts through the card.
- **Do** keep every control at 36px and every mobile touch target at 44px.
- **Do** honour `prefers-reduced-motion` by removing transitions, including the stub nudge.

### Don't:
- **Don't** add box-shadows; the system is flat.
- **Don't** use Price Blue on the brand mark, buttons, links, filters, icons, or the stay axis.
- **Don't** use amber for anything except a stale data source.
- **Don't** introduce a second hue or a second type family.
- **Don't** set text in uppercase or add tracked labels above titles; labels are sentence-case 12px muted ink.
- **Don't** use icon fonts or emoji glyphs as icons; icons are thin inline SVG strokes in currentColor.
