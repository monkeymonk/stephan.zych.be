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
