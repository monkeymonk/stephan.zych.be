// Utility for reading JSON data from <script type="application/json"> tags in the DOM.

export function readJsonData<T>(id: string, fallback: T): T {
  const el = document.getElementById(id);
  if (!el?.textContent) return fallback;
  try {
    const parsed = JSON.parse(el.textContent);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Lit property converter for JSON-array attributes. Lets templates pass
 * structured data into a component (e.g. nav='[{...}]') without the
 * component reaching into a global singleton.
 */
export const jsonArrayAttribute = {
  fromAttribute: (value: string | null): unknown[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  toAttribute: (value: unknown[]): string => JSON.stringify(value ?? []),
};
