# Start Screen Feature

The desktop launcher behind the terminal window: the icon grid a visitor sees
on `/` before (or after) the window is open.

## Components

### `<sz-start-screen>`

**Attributes:**
- `items`: JSON array of `StartScreenItem` (`{ id, label, icon, action, target }`),
  dumped from `content/data/startScreen.json` by the template
- `inactive`: boolean — set by the wiring while the terminal window is open, so
  the launcher stays out of the way

**Properties (not attributes):**
- `wallpaper`: string — current wallpaper URL, pushed in by the slideshow
  wiring. Used to sample backdrop tones so the icon labels stay legible over an
  arbitrary image.

**Actions dispatched:**
- `start-screen:launch` — an item was activated

## Usage
```html
<sz-start-screen items='[{"id":"cv","label":"CV","icon":"file","action":"navigate","target":"/cv/"}]'></sz-start-screen>
```
