export type TiltMode = 'windowed' | 'maximized' | 'fullscreen';

interface TiltConfig {
  tiltMax: number;
  translateMax: number;
  perspective: number;
  smoothing: number;
}

const DEFAULT_CONFIG: TiltConfig = {
  tiltMax: 6,
  translateMax: 12,
  perspective: 1200,
  smoothing: 0.08,
};

const MODE_INTENSITY: Record<TiltMode, { tilt: number; translate: number }> = {
  windowed: { tilt: 1.0, translate: 1.0 },
  maximized: { tilt: 0.4, translate: 0 },
  fullscreen: { tilt: 0, translate: 0 },
};

const EPSILON = 0.01;

export class SpatialTilt {
  private target: HTMLElement;
  private config: TiltConfig;
  private mode: TiltMode = 'windowed';
  private enabled = false;
  private frozen = false;
  private rafId = 0;
  private reducedMotion = false;

  private currentX = 0;
  private currentY = 0;

  private targetX = 0;
  private targetY = 0;

  private onPointerMove = this.handlePointerMove.bind(this);
  private onPointerLeave = this.handlePointerLeave.bind(this);

  private mqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private onReducedMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
    if (e.matches) {
      this.disable();
    } else {
      this.enable();
    }
  };

  constructor(target: HTMLElement, config?: Partial<TiltConfig>) {
    this.target = target;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reducedMotion = this.mqReducedMotion.matches;
    this.mqReducedMotion.addEventListener('change', this.onReducedMotionChange);
  }

  enable(): void {
    if (this.enabled || this.reducedMotion) return;
    this.enabled = true;
    document.addEventListener('pointermove', this.onPointerMove);
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    this.startLoop();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    document.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.stopLoop();
    this.resetProperties();
  }

  freeze(): void {
    this.frozen = true;
  }

  unfreeze(): void {
    this.frozen = false;
    this.startLoop();
  }

  setMode(mode: TiltMode): void {
    this.mode = mode;
    if (mode === 'fullscreen') {
      this.targetX = 0;
      this.targetY = 0;
    }
    this.startLoop();
  }

  destroy(): void {
    this.disable();
    this.mqReducedMotion.removeEventListener('change', this.onReducedMotionChange);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.frozen) return;
    const intensity = MODE_INTENSITY[this.mode];
    if (intensity.tilt === 0 && intensity.translate === 0) return;

    this.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
    this.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    this.startLoop();
  }

  private handlePointerLeave(): void {
    this.targetX = 0;
    this.targetY = 0;
    this.startLoop();
  }

  private startLoop(): void {
    if (this.rafId || !this.enabled) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick = (): void => {
    this.rafId = 0;
    if (!this.enabled) return;

    if (!this.frozen) {
      const s = this.config.smoothing;
      this.currentX += (this.targetX - this.currentX) * s;
      this.currentY += (this.targetY - this.currentY) * s;
    }

    const intensity = MODE_INTENSITY[this.mode];
    const tiltX = -this.currentY * this.config.tiltMax * intensity.tilt;
    const tiltY = this.currentX * this.config.tiltMax * intensity.tilt;
    const translateX = this.currentX * this.config.translateMax * intensity.translate;
    const translateY = this.currentY * this.config.translateMax * intensity.translate;

    this.target.style.setProperty('--sz-tilt-x', `${tiltX}deg`);
    this.target.style.setProperty('--sz-tilt-y', `${tiltY}deg`);
    this.target.style.setProperty('--sz-translate-x', `${translateX}px`);
    this.target.style.setProperty('--sz-translate-y', `${translateY}px`);

    const isIdle =
      Math.abs(this.currentX - this.targetX) < EPSILON &&
      Math.abs(this.currentY - this.targetY) < EPSILON;

    if (isIdle) {
      this.currentX = this.targetX;
      this.currentY = this.targetY;
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  private resetProperties(): void {
    this.target.style.removeProperty('--sz-tilt-x');
    this.target.style.removeProperty('--sz-tilt-y');
    this.target.style.removeProperty('--sz-translate-x');
    this.target.style.removeProperty('--sz-translate-y');
    this.currentX = 0;
    this.currentY = 0;
    this.targetX = 0;
    this.targetY = 0;
  }
}
