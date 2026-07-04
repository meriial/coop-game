# Presentations

This document explains how slides, step sequences, polls, and backgrounds are structured, and how to create a new presentation.

## Concepts

The presentation layer has three moving parts:

| File | What it controls |
|---|---|
| `frontend/src/config/presentationConfig.ts` | Step order, poll definitions, sound hints |
| `frontend/src/components/SlideRenderer.tsx` | Slide content (React components) |
| `frontend/src/components/slide-kit.tsx` | Component library used inside slides |

The server only tracks `stepIndex` — it knows nothing about slides. All content lives in the frontend.

## Step sequence

`presentationSteps` in `presentationConfig.ts` is an ordered array of steps. The presenter's Next/Back buttons advance `stepIndex` server-side; the frontend renders whatever step is at that index.

```typescript
export const presentationSteps: PresentationStep[] = [
  { type: 'game',    gameId: 'periodic-match' },
  { type: 'slide',   slideIndex: 0 },
  { type: 'poll',    slideIndex: 1, pollId: 'role_preference' },
  { type: 'results', slideIndex: 1, pollIds: ['role_preference', 'workshop_feel'] },
  { type: 'slide',   slideIndex: 2 },
  { type: 'game',    gameId: 'pixel-heart' },
];
```

Each step type:

| Type | Required fields | What renders |
|---|---|---|
| `slide` | `slideIndex` | `slides[slideIndex]` from `SlideRenderer.tsx` |
| `poll` | `slideIndex`, `pollId` | The slide + a live poll overlay |
| `results` | `slideIndex`, `pollIds` | The slide + aggregated results for those poll IDs |
| `game` | `gameId` | Full-screen game component |

`slideIndex` is an index into the `slides` array in `SlideRenderer.tsx`. Poll steps and results steps still display a slide in the background — typically a "Quick Poll" or transition slide.

## Adding slides

Open `frontend/src/components/SlideRenderer.tsx`. Add a new function component and append it to the `slides` array:

```tsx
// 1. Write the component
function MyNewSlide() {
  return (
    <Slide bg="dot" accent="indigo">
      <Stack gap="lg" align="center">
        <H1>Hello</H1>
        <Subtext>world</Subtext>
      </Stack>
    </Slide>
  );
}

// 2. Add to the array — the index here becomes the slideIndex you use in presentationConfig.ts
const slides = [
  // ...existing slides...
  <MyNewSlide />,  // e.g. index 23
];
```

Then reference it in `presentationConfig.ts`:

```typescript
{ type: 'slide', slideIndex: 23 }
```

## Slide kit reference

All components are exported from `frontend/src/components/slide-kit.tsx`.

### `<Slide>` — root wrapper

Every slide must start with `<Slide>`. It sets the background pattern and accent color for all descendant components.

```tsx
<Slide bg="dot" accent="indigo">
  {/* content */}
</Slide>
```

**`bg`** — background pattern:

| Value | Pattern |
|---|---|
| `"dot"` | Radial dot grid |
| `"line"` | Crosshatch grid (48px cells) |
| `"pixel"` | Dense crosshatch grid (18px cells) |

**`accent`** — color theme (inherited by all child components via React context):

| Value | Color |
|---|---|
| `"indigo"` | Indigo/violet |
| `"pink"` | Pink/rose |
| `"emerald"` | Emerald/green |

### Layout

**`<Content>`** — constrained max-width column for content-heavy slides:
```tsx
<Slide bg="line" accent="indigo">
  <Content>
    <Header label="Section" heading="Title Here" />
    <BulletList>…</BulletList>
  </Content>
</Slide>
```

**`<Stack gap align>`** — vertical flex column:
```tsx
<Stack gap="lg" align="center">
  <H1>Title</H1>
  <Subtext>subtitle</Subtext>
</Stack>
```

- `gap`: `"sm"` (16px) | `"md"` (32px) | `"lg"` (40px), default `"md"`
- `align`: `"start"` | `"center"`, default `"start"`

### Typography

| Component | Size | Use for |
|---|---|---|
| `<H1>` | ~9rem bold white | Primary headline |
| `<H2>` | ~7.5rem bold white | Secondary headline |
| `<Label>` | Small uppercase, accent color | Section label (used inside `<Header>`) |
| `<Subtext>` | 6rem, slate-400 | Subtitle or supporting line |
| `<Header label heading>` | Label + H2 combo | Content slide headers |

### Lists

**`<BulletList>` + `<BulletListItem icon label sub>`** — animated icon list:
```tsx
import { Zap } from 'lucide-react';

<BulletList>
  <BulletListItem icon={Zap} label="WebSockets" sub="real-time, persistent" />
  <BulletListItem icon={Database} label="Durable Objects" sub="shared state" />
</BulletList>
```

**`<IconGrid>` + `<IconGridItem icon label>`** — 2-column icon grid:
```tsx
<IconGrid>
  <IconGridItem icon={Sparkles} label="Confetti on victory" />
  <IconGridItem icon={Bot} label="Auto-bot fills cells" />
</IconGrid>
```

### Decorative

**`<IconBadge icon>`** — large rounded icon badge using the current accent:
```tsx
<IconBadge icon={Heart} />
```

**`<Tag>` + `<TagRow>`** — pill tags, optionally with a per-tag accent override:
```tsx
<TagRow>
  <Tag>TypeScript</Tag>
  <Tag accent="emerald">Cloudflare</Tag>
  <Tag accent="pink">Durable Objects</Tag>
</TagRow>
```

## Polls

Poll definitions live in `POLL_QUESTIONS` in `presentationConfig.ts`. Three types:

```typescript
// Multiple choice — renders a button grid
{ type: 'choice', question: '…', options: ['A', 'B', 'C'], showLiveResults: true }

// Single-axis slider (left/right labels)
{ type: 'slider1d', question: '…', leftLabel: 'Frontend', rightLabel: 'Backend' }

// Two-axis triangular slider (three pole labels)
{ type: 'slider2d', question: '…', labels: ['Games', 'Arts', 'Physical'] }
```

`showLiveResults: true` shows a live bar chart to participants as votes come in.

To use a poll:
1. Add an entry to `POLL_QUESTIONS` with a unique key.
2. Add a `{ type: 'poll', slideIndex: N, pollId: 'your_key' }` step.
3. Optionally add a `{ type: 'results', slideIndex: N, pollIds: ['your_key', …] }` step to show aggregated results.

## Creating a new presentation

The platform supports one active `presentationSteps` array at a time. To run a different presentation, replace the content in both files:

1. **Replace `presentationConfig.ts`** — define your `POLL_QUESTIONS` and `presentationSteps`. Keep the `PresentationStep` type and `stepHasSound` function; update `stepHasSound` to return `true` for any game in your sequence that uses audio (currently only `"periodic-match"` does).

2. **Replace `SlideRenderer.tsx`** — write your slide components, build the `slides` array. The `SlideRenderer` function itself is unchanged; only the array and component functions change.

3. **Redeploy** — `pnpm deploy` rebuilds the frontend and pushes it to Cloudflare.

There is no runtime "pick a presentation" mechanism — content is compiled into the frontend bundle.

### Running two presentations in parallel

The server supports arbitrary room IDs. Both presentations share the same Worker and game engines but have completely isolated state:

- Room A connects to `/room/workshop-a`
- Room B connects to `/room/workshop-b`

The frontend currently hardcodes `roomId = 'main'`. To run a second room, fork the frontend and change the room ID in the WebSocket connection call. Both rooms can be deployed as separate `frontend/dist` builds under different paths, or served by two separate Workers.

## `stepHasSound`

```typescript
export function stepHasSound(step: PresentationStep): boolean {
  return step.type === 'game' && step.gameId === 'periodic-match';
}
```

The frontend uses this to show a "this step has audio" warning to the presenter. If you add a new game that plays sounds, add its `gameId` here.
