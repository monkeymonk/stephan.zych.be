// Build-time CSS generator for colour themes. content/data/themes.json is the
// single source of truth (shared with the SSH TUI); this turns one theme
// entry into the `[data-theme="<name>"] { --sz-...: ...; }` block the old
// hand-written web/src/assets/themes/*.css files used to be. Lives in lib/
// rather than the data dir for the usual reason: dir.data is shared content,
// never build code.

const themes = require('../../content/data/themes.json');

// Palette key -> literal value, or role literal/key -> `var(--sz-<key>)` when
// it names a palette entry, else the literal value as-is (e.g. an rgba()).
function roleValue(value, colors) {
  return Object.prototype.hasOwnProperty.call(colors, value) ? `var(--sz-${value})` : value;
}

// CSS for one theme's `[data-theme="<name>"] { ... }` block: palette vars
// (with any note emitted as a comment just above its variable), then roles
// (shared merged with the theme's own overrides).
function themeCss(theme, sharedRoles) {
  const lines = [`[data-theme="${theme.name}"] {`];
  const notes = theme.notes || {};
  for (const [key, value] of Object.entries(theme.colors)) {
    if (notes[key]) {
      lines.push(`  /* ${notes[key]} */`);
    }
    lines.push(`  --sz-${key}: ${value};`);
  }
  const roles = Object.assign({}, sharedRoles, theme.roles || {});
  for (const [role, value] of Object.entries(roles)) {
    lines.push(`  --sz-${role}: ${roleValue(value, theme.colors)};`);
  }
  lines.push('}');
  return lines.join('\n');
}

module.exports = { themes, themeCss };
