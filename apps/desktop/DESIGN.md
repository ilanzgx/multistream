---
name: Multistream
description: High-performance desktop multi-stream client with unified chat and local processing
colors:
  primary: "#ffffff"
  primary-foreground: "#14161a"
  surface-shell: "#191b1f"
  surface-main: "#1f2227"
  surface-panel: "#14161a"
  surface-input: "#0f1115"
  surface-card: "#181a1f"
  surface-active: "#2a2d33"
  border-subtle: "#1f2227"
  border-base: "#2a2d33"
  border-hover: "#3a3f4b"
  text-primary: "#ffffff"
  text-secondary: "#e0e0e0"
  text-muted: "#9ca3af"
  text-dim: "#787774"
  platform-twitch: "#9146ff"
  platform-kick: "#53fc18"
  platform-youtube: "#ff0000"
  platform-custom: "#6366f1"
  status-live: "#e11d48"
  status-recording: "#ef4444"
  status-success: "#16a34a"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.text-secondary}"
  button-outline:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  input-text:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Multistream

## Overview

**Creative North Star: "The Mission Control Studio"**

Multistream is designed as an ultra-focused, high-density broadcast monitoring cockpit. In a live environment where users watch multiple active streams concurrently, UI chrome must completely recede into the dark background, allowing broadcast video content and rapid real-time chat to command 100% of the user's attention.

The visual language rejects decorative excess, bright saturated panels, and distracting drop shadows. Instead, it relies on disciplined tonal dark layering (`#0f1115` through `#1f2227`), precision 1px structural borders (`#2a2d33`), razor-sharp micro-interactions, and instant layout adaptability through FLIP animations. The atmosphere is quiet, utilitarian, and engineered for high-performance viewing marathons without eye strain.

**Key Characteristics:**
- **Zero Distraction Shell:** Deep dark palette that dissolves behind video tiles and highlights only upon mouse proximity or active state.
- **Tonal Depth Over Drop Shadows:** Surface hierarchy is communicated through subtle lightness stepping and 1px borders rather than heavy ambient blurs.
- **Micro-Mechanical Feedback:** Hover expansions, rotation transforms, and FLIP grid animations deliver tactile confirmation with zero layout lag.
- **Protected Platform Sanctity:** Platform brand colors (Twitch purple, Kick neon green, YouTube crimson) are strictly isolated to platform identification and never leak into generic actions.

## Colors

The palette is rooted in neutral deep charcoals, stepped systematically to distinguish shell, panels, inputs, and active selections.

### Primary
- **High-Contrast Pure White** (`#ffffff`): Reserved exclusively for primary confirmations (dialog CTA buttons, empty state action, active segmented controls, slider thumbs, and primary title typography).

### Secondary
- **Slate Highlight** (`#e0e0e0` / `oklch(0.922 0 0)`): Used for primary text on dark cards, top banner notifications, and elevated button hover states.

### Neutral
- **Deep Void / Media Background** (`#0f1115`): The deepest dark layer. Used for empty chat states, thumbnail aspect containers, text inputs, search fields, and tooltip preview backgrounds.
- **Panel & Surface Base** (`#14161a`): Primary surface for the left followed channels sidebar, right chat/controls sidebar, dialog shells, and action button tiles.
- **Inner Card & Tour Surface** (`#181a1f`): Grouping surface inside modals, onboarding tour preview cards, and platform tile backgrounds.
- **Outer Shell Wrapper** (`#191b1f`): The root application viewport container behind all sidebars.
- **Main Stream Grid Canvas** (`#1f2227`): The underlying backdrop supporting stream tiles in `StreamGrid.vue`.
- **Active / Hover Surface** (`#2a2d33`): Active tab triggers, selected language buttons, scrollbar thumbs, and hover card states.
- **Primary Structural Border** (`#2a2d33`): Standard 1px divider for panels, dialog boundaries, inputs, and card containers.
- **Subtle Inner Border** (`#1f2227` / `#262930`): Sub-dividers, section headers, and tab bar edges.
- **Interactive Hover Border** (`#3a3f4b`): Feedback border applied on hover to inputs, buttons, and stream suggestion cards.

### Platform Accents
- **Twitch Purple** (`#9146ff`): Twitch stream icons, auth modals, chat message indicators, and followed avatar rings.
- **Kick Neon Green** (`#53fc18`): Kick stream badges, auth triggers, and chat send actions.
- **YouTube Red** (`#ff0000`): YouTube stream badges and channel shelf icons.
- **Custom Embed Indigo** (`#6366f1`): Custom stream protocols and copy-link triggers.

### Status Accents
- **Live Broadcast Pulse** (`#e11d48` / `#ef4444`): Live badges, viewer counter dots, and recording indicator rings.
- **Destructive Red** (`oklch(0.704 0.191 22.216)` / `rgb(239, 68, 68)`): Stream close button hover, confirmation delete actions, and recording stop states.
- **Active Transcription Green** (`#16a34a` / `#22c55e`): Whisper AI loopback status pill and switch toggle active track.

### Named Rules
**The Receding Frame Rule.** The UI shell (`#14161a` / `#0f1115`) must never compete with video content. Static chrome stays flat and muted; control buttons and toolbars appear only when hovered or focused.

**The Platform Sanctity Rule.** Platform colors (`#9146ff`, `#53fc18`, `#ff0000`, `#6366f1`) belong exclusively to platform identity. Never use Twitch purple or Kick green for generic app buttons or standard UI states.

**The Pure White Rarity Rule.** Pure white background fill (`bg-white`) is strictly rationed for primary CTA buttons and slider controls. Never use white cards or bright modal backgrounds.

## Typography

Multistream uses the clean, modern system sans-serif stack for instantaneous loading and maximum legibility across operating systems, paired with tabular monospace numerals for technical data.

**Display Font:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`  
**Body Font:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`  
**Mono/Telemetry Font:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

**Character:** Crisp, functional, and compact. High contrast against dark surfaces with zero typographic decoration.

### Hierarchy
- **Display** (Bold 700, `text-2xl` to `text-3xl` / 24–30px, line-height 1.2): Empty state hero heading and major welcome titles.
- **Headline** (Semibold 600, `text-lg` to `text-xl` / 18–20px, line-height 1.25): Modal dialog titles and offline stream channel names.
- **Title** (Medium 500 / Semibold 600, `text-sm` to `text-base` / 14–16px, line-height 1.3): Section headers, toast titles, channel cards, and dialog section titles.
- **Body** (Regular 400, `text-sm` / 14px, line-height 1.5): Chat message text, modal descriptions, input values, and transcript captions.
- **Label / Fine Print** (Medium 500, `text-xs` / 12px, line-height 1.2): Tooltips, category chips, stream categories, viewer counts, and button text.
- **Micro Telemetry** (Semibold 600 / Mono, `text-[8px]` to `text-[10px]`, tracking-widest, uppercase): Status badges, diagnostics keys, language tags, and keyboard shortcut labels.

### Named Rules
**The Tabular Telemetry Rule.** Timers, viewer numbers, bitrates, and audio inference metrics must always specify `tabular-nums` (and `font-mono` when technical) to eliminate horizontal jitter during live updates.

## Layout

The desktop interface uses a strict 3-column docked shell:

1. **Left Navigation (`FollowedChannelsSidebar.vue`):** Collapsible drawer toggling between compact mode (`w-14` / 56px) and expanded mode (`w-56` / 224px) with smooth 300ms transitions. Houses online status polling (every 30s) and platform filter pills.
2. **Center Canvas (`main.flex-1`):** Holds either the interactive `StreamGrid` or the centered `EmptyState`.
   - **Normal Grid:** Dynamic CSS Grid classes (`grid-cols-1` to `grid-cols-4`, `grid-rows-1` to `grid-rows-3`) with strict `gap-0.5` (2px).
   - **Focused Stream Mode:** Asymmetric grid (`display: grid; gap: 2px; gridTemplateColumns: 25% 75%`). Non-focused tiles stack along the left 25% column while the focused stream spans the full 75% right column.
   - **FLIP Transitions:** Stream focus and reorder transitions calculate bounding rect deltas and animate smoothly with `transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)`.
   - **Drag & Drop:** Draggable cells via top handle (`GripVertical`), target drop cell highlighted with `bg-blue-500/10 ring-2 ring-blue-500`.
3. **Right Control Deck (`SidebarPanel.vue`):** Retractable side panel (`w-80` / 320px expanded, `w-0` collapsed) housing chat feeds, transcription logs, and the 5-column utility action button dock.

## Elevation & Depth

Multistream avoids layered drop shadows in the primary layout, relying instead on tonal dark stepping (`#0f1115` deepest inset < `#14161a` panel surface < `#181a1f` card < `#1f2227` stream canvas) separated by 1px borders (`#2a2d33`).

### Shadow Vocabulary
- **Modal Containers:** `shadow-lg` (bounded soft ambient elevation).
- **Floating Dock Controls:** `shadow-xl shadow-black/30`, intensifying to `shadow-black/50` on hover.
- **Hovercards & Tooltips:** `shadow-xl shadow-black/50` with `border border-[#2a2d33]`.
- **Toasts:** `shadow-lg shadow-black/50` at `z-[9999]`.

### Named Rules
**The Anti-Occlusion Rule.** To prevent catastrophic WebView2/Chromium GPU black-screen crashes over video iframes, modal dialogs must never mount full-screen dark overlay backdrops. Instead, `DialogOverlay` remains `bg-transparent` while `#app` is dimmed globally using `filter: brightness(0.35)` in CSS.

**The Flat Frame Rule.** Stream cells, sidebars, and panels rest completely flat. Elevation shadows appear only on detached floating overlays (tooltips, toasts, and the collapsed sidebar dock tab).

## Shapes

Form geometry favors clean, compact rounded rectangles that maximize video viewport area while maintaining soft tactile targets.

- **Base Radius:** `--radius: 0.625rem` (10px).
- **Stream Grid Tiles:** `rounded-sm` (4px) with `overflow-hidden`.
- **Inputs & Standard Controls:** `rounded-md` (8px / `calc(var(--radius) - 2px)`).
- **Dialogs & Large Containers:** `rounded-lg` (10px / `var(--radius)`).
- **Action Buttons & Cards:** `rounded-xl` (12px / `calc(var(--radius) + 4px)`).
- **Pills, Switches & Avatars:** `rounded-full` (9999px).

## Components

### Buttons
- **Primary CTA (`Button.vue` / `EmptyState.vue`):** White fill (`bg-white`), dark text (`text-[#14161a]`), `rounded-xl`, `font-semibold`. Hover: `hover:bg-gray-100 hover:scale-105 duration-200`.
- **Panel Action Buttons (`SidebarPanel.vue`):** `h-11 w-full rounded-xl border border-[#2a2d33] bg-[#14161a] hover:bg-[#1c1f24] hover:border-[#3a3f4b] transition-all duration-200`. Icons scale or rotate on hover (`group-hover:scale-110`, `group-hover:rotate-90`).
- **Stream Overlay Controls (`BaseStream.vue`):** `size-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/80 hover:scale-110`. Hidden by default (`opacity-0 translate-x-2`), revealing on group hover (`opacity-100 translate-x-0`).

### Text Inputs & Rich Chat Editor
- **Inputs (`Input.vue`):** `h-9 rounded-md border border-[#2a2d33] bg-[#0f1115] px-3 py-1 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20`.
- **Chat Editor (`ChatRichInput.vue`):** Contenteditable block `min-h-[38px] max-h-[120px] rounded-md border border-[#2a2d33] bg-[#1a1d24] text-white text-sm px-3 py-2 leading-relaxed`.
- **Inline Emotes:** Rendered as `<img>` scaled to `height: 1.5em; vertical-align: middle; margin: 0 0.125rem` with selection highlighting `bg-blue-500/40`.

### Modals & Dialogs (`DialogContent.vue`)
- **Container:** `bg-[#14161a] border border-[#2a2d33] rounded-lg p-6 shadow-lg sm:max-w-lg md:max-w-xl`.
- **Header:** `text-lg font-semibold text-white` paired with `text-sm text-gray-400`.
- **Close Button:** `absolute top-4 right-4 rounded-lg p-1.5 text-white/60 hover:text-white hover:bg-white/10`.

### Stream Video Containers (`BaseStream.vue`)
- **Shell:** `relative h-full w-full bg-[#0f1115] overflow-hidden rounded-sm group`.
- **Loading Skeleton:** Full overlay (`bg-[#0f1115]`) with dynamic platform indeterminate progress bar (`animate-[progress_2s_ease-in-out_infinite]`), responsive avatar circle, and telemetry diagnostics.
- **Watch Timer Badge:** Docked `bottom-3 left-1/2 -translate-x-1/2`, pill shape (`bg-black/60 backdrop-blur-md border border-white/10 text-[9px] text-white/70 tabular-nums`).

### Followed Channels Sidebar (`FollowedChannelsSidebar.vue`)
- **Filter Bar:** Uppercase pill `ALL` (`bg-[#1f2227] text-white` active) and platform icon pills (`Twitch w-3.5 h-3.5 text-[#9146FF] bg-[#9146ff]/10`).
- **Channel Item:** 28px avatar (`w-7 h-7 rounded-full`) wrapped in `.avatar-border` (purple ring when followed), platform badge at `-bottom-1 -right-1`, channel name, and live pulse dot (`size-1.5 bg-rose-500`) with viewer count.
- **Hovercard Tooltip:** `w-64 bg-[#0f1115] border-[#2a2d33] rounded-lg shadow-xl shadow-black/50 overflow-hidden` featuring 16:9 video preview and metadata.

### Unified & Native Chat Feeds (`UnifiedChat.vue`, `UnifiedChatMessage.vue`)
- **Channel Strip:** 3px vertical colored line (`w-[3px] opacity-70`) identifying the broadcasting channel.
- **Author Badges:** Inline SVG badges for Broadcaster (Crown, red), Moderator (Sword, green), VIP (Gem, pink), and Subscriber (Star, purple).
- **Floating Scroll Resume Button:** Centered at `bottom-4` (`bg-[#1f232b]/95 backdrop-blur-sm border border-white/10 text-white text-xs px-3 py-1.5 rounded-full shadow-lg`).

### Emote Picker Popover (`EmotePicker.vue`)
- **Popover Body:** `w-72 bg-[#0f1115] border border-[#2a2d33] rounded-md shadow-lg shadow-black/50 p-2`.
- **Emote Grid:** 8 items per row, 36px row height, 200px scrollable viewport.
- **Iframe Focus Guard:** Automatically blurs active iframe and closes popover when clicking into video feeds.

### Live Transcription Overlay (`TranscriptionOverlay.vue`)
- **Docking:** `absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[80%] pointer-events-none z-50 flex flex-col items-center gap-1`.
- **Opacity Ladder:** Most recent line 100% opacity, previous line 60%, older lines 30%.
- **Style:** `bg-black/75 text-white text-sm px-3 py-1 rounded backdrop-blur-sm break-words text-wrap: balance`.

### Toast Notification System (`Toast.vue`, `BaseCustomToast.vue`)
- **Card Shell:** Fixed at `z-[9999]`, `w-89 bg-[#14161a] border border-[#2a2d33] rounded-xl px-4 py-3.5 shadow-lg shadow-black/50`.
- **Transitions:** `TransitionGroup` with 0.3s cubic bezier curves and height collapsing.
- **Progress Bar:** `h-1.5 bg-[#0f1115] rounded-full border border-[#2a2d33]/50` filled with `bg-white`.

### Settings Tabs & Segmented Controls (`SettingsDialog.vue`)
- **Segmented Quality Controls:** Container `bg-[#14161a] border border-[#2a2d33]/60 p-1.5 rounded-xl`. Active option `bg-white text-black font-semibold rounded-md shadow-sm`, inactive `text-gray-400 hover:text-white hover:bg-white/5`.
- **Language Grid:** 10 supported locale cards with flag SVGs and localized names.

### Onboarding Tour Card (`OnboardingTour.vue`)
- **Container Stability:** Fixed `h-[480px]` with `min-h-[64px]` header eliminating layout shift during step transitions.
- **Keyboard Shortcut Display:** `size-8 text-xs font-semibold text-white bg-[#1e2127] border border-[#3a3f4b] rounded-lg shadow-xs flex items-center justify-center`.
- **Progress Indicator:** Elongated active pill `bg-white w-4 h-1.5 rounded-full` alongside inactive dots `bg-gray-600 w-1.5 h-1.5 rounded-full`.

### Suggested Streams & Discovery Cards (`SuggestedStreams.vue`)
- **Category Filter Chips:** `flex-none inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors`. Active `bg-white/10 text-white border-white/20`, inactive `bg-[#14161a] border-[#2a2d33] text-gray-400`.
- **Discovery Card:** `w-40 rounded-xl bg-[#14161a] border border-[#2a2d33] hover:border-[#3a3f4b] hover:-translate-y-1 duration-300`, thumbnail aspect-video with bottom gradient fade, live red badge, and viewer counter.

### Switch Toggles (`Switch.vue`)
- **Track:** `h-6 w-11 rounded-full border transition-all duration-200`. Active: `bg-green-600 border-green-500/50`. Inactive: `bg-[#2a2d33] border-[#3a3f4b]`.
- **Thumb:** `size-4 rounded-full bg-white shadow-md`. Slides `translate-x-6` when active, `translate-x-1` when inactive.

### Sliders (`Slider.vue`)
- **Track:** `h-1.5 bg-[#2a2d33] rounded-full`.
- **Range:** `bg-white h-full absolute`.
- **Thumb:** `size-4 rounded-full bg-white border shadow-sm hover:ring-4 ring-white/20`.

## Do's and Don'ts

### Do:
- **Do** preserve the dark tonal hierarchy: `#0f1115` for deep inputs/video insets, `#14161a` for panels, `#181a1f` for cards, and `#1f2227` for the stream grid canvas.
- **Do** use `border-[#2a2d33]` for standard borders and `border-[#3a3f4b]` on hover interactions.
- **Do** keep stream action controls hidden at rest, revealing on hover with smooth translation (`opacity-0 translate-x-2` -> `opacity-100 translate-x-0`).
- **Do** apply `tabular-nums` to all timers, viewer counts, and live numbers.
- **Do** use `filter: brightness(0.35)` on `#app` to dim the interface for dialogs rather than dark overlay divs.
- **Do** isolate platform colors (`#9146ff`, `#53fc18`, `#ff0000`, `#6366f1`) to stream badges, avatar indicators, and platform filters.

### Don't:
- **Don't** introduce bright backgrounds, light mode dialogs, or saturated non-brand colors.
- **Don't** add heavy drop shadows to regular panels, cards, or stream grid frames.
- **Don't** use opaque or semi-transparent backdrop overlays directly over video iframes (prevents WebView2 GPU crashes).
- **Don't** use platform brand colors for generic action buttons (e.g. green or purple "Save" or "Add" buttons).
- **Don't** hardcode user-facing copy in components; always route UI text through `vue-i18n` keys.
- **Don't** remove iframes abruptly from the DOM; always route stream closures through the two-phase Graveyard mechanism.
