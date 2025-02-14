# Tmux Feature

Terminal multiplexer UI — tab bar and resizable pane splits.

## Components

### `<sz-tmux-bar>`
Tab bar with session name, navigation tabs, and widget slot.

**Properties:**
- `active-path`: string — current route path

**Slots:**
- `slot="widget"` — right-side widget area (clock is default)

**Actions dispatched:**
- `tmux:tab-switch` — payload: `{ path }`

**Actions listened:**
- `router:route-changed` — updates active tab highlight

**Keyboard:** Alt+1-9 switches tabs (with isInputFocused guard).

### `<sz-tmux-panes>`
Resizable split panes.

**Properties:**
- `config`: `{ direction: 'horizontal'|'vertical', panes: { component, size }[] }`

**Slots:**
- `slot="pane-N"` — content for pane N

**Actions dispatched:**
- `tmux:pane-focus` — payload: `{ index }`

**Keyboard:** Alt+h/j/k/l navigates panes.

**Mobile:** Forces vertical stacking.

## Usage
```html
<sz-tmux-bar active-path="/"></sz-tmux-bar>
<sz-tmux-panes>
  <div slot="pane-0">Main content</div>
</sz-tmux-panes>
```
