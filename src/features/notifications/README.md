# Notifications Feature

Toast notification system.

## Components

### `<sz-notifications>`
Listens for `notify:show` actions and displays toast notifications.

**Actions listened:**
- `notify:show` — payload: `{ text, type?, duration? }`

## Usage
```html
<sz-notifications></sz-notifications>
```

Trigger from anywhere:
```ts
actions.dispatch('notify:show', { text: 'Hello!' });
```
