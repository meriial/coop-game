import { useEffect, useRef } from 'react';
import type { BgConfig } from '@workshop/protocol';
import '../backgrounds/register';
import { get as getBackground, list as listBackgrounds } from '../backgrounds/registry';

/**
 * Full-screen animated background. The animation runs locally (canvas + rAF);
 * only `config` is synced. Honours prefers-reduced-motion by drawing one static
 * frame. Sits behind the stage content (z-0).
 */
export function SlideBackground({ config }: { config: BgConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bg = getBackground(config.backgroundId) ?? listBackgrounds()[0];
    if (!bg) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      bg.render(ctx, { width, height, t, strategyId: config.strategyId, params: config.params });
    };

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    if (reduceMotion) {
      // Single static frame; redraw once more on the next tick after layout settles.
      draw(start);
      raf = requestAnimationFrame((n) => draw(n));
    } else {
      let last = 0;
      const FRAME_MS = 1000 / 30; // ~30fps is plenty for a barely-perceptible field
      const loop = (now: number) => {
        if (now - last >= FRAME_MS) {
          last = now;
          draw(now);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [config.backgroundId, config.strategyId, config.params]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 w-full h-full -z-10 pointer-events-none"
    />
  );
}
