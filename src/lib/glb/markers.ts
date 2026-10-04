// CAD-style damage marker textures (cached per color)
import * as THREE from 'three';

const cache = new Map<number, THREE.CanvasTexture>();

export function markerTexture(colorHex: number): THREE.CanvasTexture {
  const hit = cache.get(colorHex);
  if (hit) return hit;

  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const c = `#${colorHex.toString(16).padStart(6, '0')}`;

  const halo = ctx.createRadialGradient(cx, cy, SIZE * 0.18, cx, cy, SIZE * 0.5);
  halo.addColorStop(0, `${c}55`);
  halo.addColorStop(0.55, `${c}1a`);
  halo.addColorStop(1, `${c}00`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, SIZE * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, SIZE * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();

  const hi = ctx.createRadialGradient(cx - SIZE * 0.05, cy - SIZE * 0.06, SIZE * 0.02, cx, cy, SIZE * 0.22);
  hi.addColorStop(0, 'rgba(255,255,255,0.45)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(cx, cy, SIZE * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, SIZE * 0.22, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(20,20,20,0.55)';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(colorHex, tex);
  return tex;
}
