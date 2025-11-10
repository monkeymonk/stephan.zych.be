// Single shared clock so every time display (tmux footer, contact card, …)
// stays in sync. Ticks each second; only notifies when the minute changes.
// Time is Brussels (the site owner's timezone), matching the contact card.

export interface ClockTime {
  hh: string;
  mm: string;
}

type Listener = (time: ClockTime) => void;

function format(): ClockTime {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Brussels',
    }).format(new Date());
    const [hh, mm] = s.split(':');
    return { hh, mm };
  } catch {
    return { hh: '--', mm: '--' };
  }
}

class Clock {
  private listeners = new Set<Listener>();
  private timer?: number;
  private current: ClockTime = format();

  get time(): ClockTime {
    return this.current;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.listeners.size === 1) this.start();
    fn(this.current);
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private start(): void {
    this.timer = window.setInterval(() => {
      const next = format();
      if (next.hh !== this.current.hh || next.mm !== this.current.mm) {
        this.current = next;
        this.listeners.forEach((fn) => fn(this.current));
      }
    }, 1000);
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export const clock = new Clock();
