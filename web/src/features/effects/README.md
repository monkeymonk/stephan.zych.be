# Effects Feature

Visual effects triggered via the action bus.

## Components

### `<sz-effect-matrix>`
Matrix rain animation (green falling characters). Quits on `q` or `Escape`.

**Actions listened:**
- `effect:matrix`

### `<sz-effect-confetti>`
Confetti celebration animation.

**Actions listened:**
- `effect:confetti`

**Reduced motion:** Effects are skipped when `prefers-reduced-motion: reduce`.

## Usage
```html
<sz-effect-matrix></sz-effect-matrix>
<sz-effect-confetti></sz-effect-confetti>
```
