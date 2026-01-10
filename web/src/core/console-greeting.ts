// A little something for the curious who pop open DevTools. Prints a themed
// banner + greeting once, and exposes a tiny `sz.*` API of playful commands.
// Pure side-effect module — import once from the app entry.

const LINKS = {
  site: 'https://stephan.zych.be',
  repo: 'https://github.com/monkeymonk/stephan.zych.be',
  github: 'https://github.com/monkeymonk',
  linkedin: 'https://linkedin.com/in/stephanzych',
  email: 'stephan@zych.be',
  coffee: 'https://buymeacoffee.com/monkeymonk',
};

// Catppuccin Mocha — keep in sync with the theme palette.
const C = {
  accent: '#89b4fa',
  green: '#a6e3a1',
  mauve: '#cba6f7',
  text: '#cdd6f4',
  sub: '#a6adc8',
  base: '#1e1e2e',
};

const BANNER = String.raw`
   ███████╗███████╗
   ██╔════╝╚══███╔╝
   ███████╗  ███╔╝     Stéphan Zych
   ╚════██║ ███╔╝      lead dev · frontend architect · Brussels
   ███████║███████╗
   ╚══════╝╚══════╝`;

let opened = false;

const open = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

/** Print the greeting. Idempotent — safe to call more than once. */
export function printConsoleGreeting(): void {
  if (opened) return;
  opened = true;

  /* eslint-disable no-console */
  console.log(
    `%c${BANNER}`,
    `color:${C.accent};font-family:monospace;font-size:12px;line-height:1.15;text-shadow:0 0 12px ${C.accent}66`,
  );
  console.log(
    '%cWell, well — a fellow inspector of elements. 👀',
    `color:${C.green};font-size:13px;font-weight:700`,
  );
  console.log(
    '%cYou found the console. Either you\'re a recruiter doing due diligence,\nor you\'re procrastinating. Respect either way.',
    `color:${C.text};font-size:12px`,
  );
  console.log(
    `%cSince you\'re here, try a command:%c\n  sz.hire()    %c— why you might want to\n%c  sz.source()  %c— peek at how this site is built\n%c  sz.coffee()  %c— fuel the next side project\n%c  sz.help()    %c— the full list`,
    `color:${C.mauve};font-size:12px;font-weight:700`,
    `color:${C.accent};font-family:monospace`, `color:${C.sub}`,
    `color:${C.accent};font-family:monospace`, `color:${C.sub}`,
    `color:${C.accent};font-family:monospace`, `color:${C.sub}`,
    `color:${C.accent};font-family:monospace`, `color:${C.sub}`,
  );
  /* eslint-enable no-console */
}

interface SzApi {
  hire(): string;
  source(): string;
  coffee(): string;
  contact(): string;
  help(): string;
}

const banner = (msg: string, color = C.accent) =>
  // eslint-disable-next-line no-console
  console.log(`%c${msg}`, `color:${color};font-size:12px`);

const sz: SzApi = {
  hire() {
    banner('Fifteen years shipping maintainable, fast web platforms.', C.green);
    banner('Ex-CTO, co-founder (acquired), now lead dev. I like hard problems\nand boring, reliable solutions. Let\'s talk:', C.text);
    banner(`  ${LINKS.email}  ·  ${LINKS.linkedin}`, C.accent);
    open(`mailto:${LINKS.email}?subject=Let%27s%20talk`);
    return 'Opening your mail client… 📬';
  },
  source() {
    banner('This whole site is a terminal. Built with Eleventy + Lit + esbuild,\nno framework runtime. Have a read:', C.text);
    open(LINKS.repo);
    return LINKS.repo;
  },
  coffee() {
    open(LINKS.coffee);
    return 'Thank you, genuinely. ☕';
  },
  contact() {
    open(`mailto:${LINKS.email}`);
    return LINKS.email;
  },
  help() {
    banner('sz.hire()    — the pitch\nsz.source()  — this site\'s source\nsz.coffee()  — buy me a coffee\nsz.contact() — say hello', C.sub);
    return 'There you go.';
  },
};

/** Attach the `sz` global so console explorers can poke around. */
export function installConsoleApi(): void {
  Object.defineProperty(window, 'sz', { value: Object.freeze(sz), writable: false, configurable: true });
}
