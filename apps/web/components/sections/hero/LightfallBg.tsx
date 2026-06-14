'use client';

import React, { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

export interface LightfallProps {
  className?: string;
  dpr?: number;
  paused?: boolean;
  colors?: string[];
  backgroundColor?: string;
  speed?: number;
  streakCount?: number;
  streakWidth?: number;
  streakLength?: number;
  glow?: number;
  density?: number;
  twinkle?: number;
  zoom?: number;
  backgroundGlow?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  mouseRadius?: number;
  mouseDampening?: number;
  mixBlendMode?: string;
}

type RGB = [number, number, number];

const MAX_COLORS = 8;

const hexToRGB = (hex: string): RGB => {
  const c = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [r, g, b];
};

const prepColors = (input?: string[]) => {
  const base = (input && input.length ? input : ['#A6C8FF', '#5227FF', '#FF9FFC']).slice(0, MAX_COLORS);
  const count = base.length;
  const arr: RGB[] = [];
  for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
  const avg: RGB = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    avg[0] += arr[i][0];
    avg[1] += arr[i][1];
    avg[2] += arr[i][2];
  }
  avg[0] /= count;
  avg[1] /= count;
  avg[2] /= count;
  return { arr, count, avg };
};

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec3  uBgColor;
uniform vec3  uMouseColor;
uniform float uSpeed;
uniform int   uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void mainImage(out vec4 o, vec2 C) {
  vec2 r = iResolution.xy;
  vec2 uv0 = (C + C - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.28318530718 / angRings);

  vec2 c0 = sceneC(C, r);
  vec2 cdx = sceneC(C + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(C + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  C = c0;

  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O = vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0), 0.0);

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mN = (iMouse + iMouse - r) / r.x;
    float md = length(uv0 - mN);
    mGlow = exp(-md * md / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    O.rgb += uMouseColor * mGlow * 0.25;
  }

  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float ic = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 Pp = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h = fract(8663.0 * ic);
    vec3 col = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2 inner = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2 sm = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y), 3.0)) * col * weight;
    C.x += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  o = vec4(colr, uOpacity);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;

const Lightfall: React.FC<LightfallProps> = props => {
  const {
    className,
    dpr,
    mouseInteraction = true,
    mixBlendMode
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const programRef = useRef<Program | null>(null);
  // Re-render the static frame after a uniform change (reduced-motion only).
  const renderStaticRef = useRef<(() => void) | null>(null);
  // Latest props for the init closure + animation loop to read live, without
  // tearing down the GL context on every change.
  const latest = useRef(props);
  latest.current = props;

  // ── INIT: create the GL context once. Only `dpr` (renderer) and
  //    `mouseInteraction` (listener) are structural enough to re-create. ─────
  // biome-ignore lint/correctness/useExhaustiveDependencies: other props are
  // read via `latest.current` (init values) and flow through the sync effect.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const p0 = latest.current;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const autoDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const renderer = new Renderer({
      // Cap the auto DPR at 2 — the fragment shader is heavy (39-iter loop ×3
      // per pixel); rendering at DPR 3 triples the cost for little visible gain.
      dpr: dpr ?? Math.min(autoDpr, 2),
      alpha: true,
      // The shader already antialiases via smoothstep; MSAA on a fullscreen
      // pass is wasted GPU.
      antialias: false
    });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const { arr, count, avg } = prepColors(p0.colors);
    const uniforms = {
      iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] },
      iTime: { value: 0 },
      uColor0: { value: arr[0] },
      uColor1: { value: arr[1] },
      uColor2: { value: arr[2] },
      uColor3: { value: arr[3] },
      uColor4: { value: arr[4] },
      uColor5: { value: arr[5] },
      uColor6: { value: arr[6] },
      uColor7: { value: arr[7] },
      uColorCount: { value: count },
      uBgColor: { value: hexToRGB(p0.backgroundColor ?? '#0A29FF') },
      uMouseColor: { value: avg },
      uSpeed: { value: p0.speed ?? 0.5 },
      uStreakCount: { value: Math.max(1, Math.min(16, Math.round(p0.streakCount ?? 2))) },
      uStreakWidth: { value: p0.streakWidth ?? 1 },
      uStreakLength: { value: p0.streakLength ?? 1 },
      uGlow: { value: p0.glow ?? 1 },
      uDensity: { value: p0.density ?? 0.6 },
      uTwinkle: { value: p0.twinkle ?? 1 },
      uZoom: { value: p0.zoom ?? 3 },
      uBgGlow: { value: p0.backgroundGlow ?? 0.5 },
      uOpacity: { value: p0.opacity ?? 1 },
      uMouseEnabled: { value: mouseInteraction ? 1 : 0 },
      uMouseStrength: { value: p0.mouseStrength ?? 0.5 },
      uMouseRadius: { value: p0.mouseRadius ?? 1 }
    };

    const program = new Program(gl, { vertex, fragment, uniforms });
    programRef.current = program;
    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height);
      uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const renderOnce = () => {
      try {
        renderer.render({ scene: mesh });
      } catch (e) {
        console.error(e);
      }
    };

    // Only animate while the hero is actually on screen.
    let visible = true;
    const io = new IntersectionObserver(
      entries => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 }
    );
    io.observe(container);

    const mouseTarget: [number, number] = [0, 0];
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scale = renderer.dpr || 1;
      mouseTarget[0] = (e.clientX - rect.left) * scale;
      mouseTarget[1] = (rect.height - (e.clientY - rect.top)) * scale;
      if ((latest.current.mouseDampening ?? 0.15) <= 0) {
        uniforms.iMouse.value = [mouseTarget[0], mouseTarget[1]];
      }
    };
    if (mouseInteraction) {
      canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    let raf = 0;
    let lastTime = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      // Skip GPU work when off-screen, paused, or the tab is hidden.
      if (!visible || latest.current.paused || (typeof document !== 'undefined' && document.hidden)) {
        lastTime = t;
        return;
      }
      uniforms.iTime.value = t * 0.001;
      const damp = latest.current.mouseDampening ?? 0.15;
      if (damp > 0) {
        if (!lastTime) lastTime = t;
        const dt = (t - lastTime) / 1000;
        lastTime = t;
        const factor = Math.min(1, 1 - Math.exp(-dt / Math.max(1e-4, damp)));
        const cur = uniforms.iMouse.value as number[];
        cur[0] += (mouseTarget[0] - cur[0]) * factor;
        cur[1] += (mouseTarget[1] - cur[1]) * factor;
      } else {
        lastTime = t;
      }
      renderOnce();
    };

    if (prefersReducedMotion) {
      // Honour reduced-motion: paint one static frame, no animation loop.
      renderStaticRef.current = renderOnce;
      renderOnce();
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      renderStaticRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      if (mouseInteraction) canvas.removeEventListener('pointermove', onPointerMove);
      ro.disconnect();
      io.disconnect();
      if (canvas.parentElement === container) container.removeChild(canvas);
      const remove = (obj: unknown) => {
        const fn = obj && (obj as Record<string, unknown>).remove;
        if (typeof fn === 'function') (fn as () => void).call(obj);
      };
      remove(program);
      remove(geometry);
      remove(mesh);
      // Free the GPU context immediately instead of waiting for GC.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      programRef.current = null;
    };
  }, [dpr, mouseInteraction]);

  // ── SYNC: push prop changes to existing uniforms (cheap; no GL teardown). ──
  useEffect(() => {
    const program = programRef.current;
    if (!program) return;
    const u = program.uniforms as Record<string, { value: unknown }>;
    const { arr, count, avg } = prepColors(props.colors);
    for (let i = 0; i < MAX_COLORS; i++) u[`uColor${i}`].value = arr[i];
    u.uColorCount.value = count;
    u.uBgColor.value = hexToRGB(props.backgroundColor ?? '#0A29FF');
    u.uMouseColor.value = avg;
    u.uSpeed.value = props.speed ?? 0.5;
    u.uStreakCount.value = Math.max(1, Math.min(16, Math.round(props.streakCount ?? 2)));
    u.uStreakWidth.value = props.streakWidth ?? 1;
    u.uStreakLength.value = props.streakLength ?? 1;
    u.uGlow.value = props.glow ?? 1;
    u.uDensity.value = props.density ?? 0.6;
    u.uTwinkle.value = props.twinkle ?? 1;
    u.uZoom.value = props.zoom ?? 3;
    u.uBgGlow.value = props.backgroundGlow ?? 0.5;
    u.uOpacity.value = props.opacity ?? 1;
    u.uMouseEnabled.value = mouseInteraction ? 1 : 0;
    u.uMouseStrength.value = props.mouseStrength ?? 0.5;
    u.uMouseRadius.value = props.mouseRadius ?? 1;
    // If we're in static (reduced-motion) mode, repaint the single frame.
    renderStaticRef.current?.();
  }, [
    props.colors,
    props.backgroundColor,
    props.speed,
    props.streakCount,
    props.streakWidth,
    props.streakLength,
    props.glow,
    props.density,
    props.twinkle,
    props.zoom,
    props.backgroundGlow,
    props.opacity,
    mouseInteraction,
    props.mouseStrength,
    props.mouseRadius
  ]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden absolute ${className ?? ''}`}
      style={{
        ...(mixBlendMode && { mixBlendMode: mixBlendMode as React.CSSProperties['mixBlendMode'] })
      }}
    />
  );
};

export default Lightfall;
