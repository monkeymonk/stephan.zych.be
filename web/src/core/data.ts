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

/**
 * Lit property converter for JSON-object attributes. Same purpose as
 * jsonArrayAttribute, for structured objects instead of arrays. Returns
 * null on missing/invalid input so components can degrade gracefully.
 */
export const jsonObjectAttribute = {
  fromAttribute: (value: string | null): unknown | null => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  toAttribute: (value: unknown | null): string => JSON.stringify(value ?? null),
};
