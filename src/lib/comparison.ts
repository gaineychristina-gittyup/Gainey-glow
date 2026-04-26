// Render a side-by-side comparison preview to a JPEG blob, sized for
// Timeline. Before on the left, After on the right, each labeled with its
// (typically date-based) caption, with an optional combined caption strip
// at the bottom.

import { loadImage } from './image';

export interface PreviewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export async function renderComparisonPreview(opts: {
  before: Blob;
  after: Blob;
  caption?: string;
  beforeLabel?: string;
  afterLabel?: string;
  maxWidth?: number;
  // The following fields are accepted for backwards compatibility with
  // older call sites but unused by the side-by-side renderer.
  sliderPos?: number;
  beforeTransform?: PreviewTransform;
  afterTransform?: PreviewTransform;
  liveWidth?: number;
}): Promise<Blob> {
  const { before, after, caption, beforeLabel, afterLabel, maxWidth = 960 } = opts;
  const beforeImg = await loadImage(before);
  const afterImg = await loadImage(after);

  // Each panel is half the canvas. Use the taller-aspect of the two as the
  // panel's height ratio so neither image is wildly cropped.
  const panelW = Math.round(maxWidth / 2);
  const aspectBefore = beforeImg.width / beforeImg.height;
  const aspectAfter = afterImg.width / afterImg.height;
  const panelAspect = Math.min(aspectBefore, aspectAfter);
  const panelH = Math.round(panelW / panelAspect);
  const w = panelW * 2;
  const h = panelH;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Background.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  drawCover(ctx, beforeImg, 0, 0, panelW, panelH);
  drawCover(ctx, afterImg, panelW, 0, panelW, panelH);

  // Center divider.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(panelW - 1, 0, 2, h);

  // Per-panel labels.
  if (beforeLabel) drawLabel(ctx, beforeLabel, 12, 12, 'left');
  if (afterLabel) drawLabel(ctx, afterLabel, w - 12, 12, 'right');

  if (caption) drawCaption(ctx, caption, w, h);

  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85),
  );
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const aspect = img.width / img.height;
  const target = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (aspect > target) {
    dh = h;
    dw = h * aspect;
    dx = x + (w - dw) / 2;
    dy = y;
  } else {
    dw = w;
    dh = w / aspect;
    dx = x;
    dy = y + (h - dh) / 2;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right',
) {
  const padX = 10;
  const padY = 6;
  ctx.font = `600 14px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const th = 16;
  const boxW = tw + padX * 2;
  const boxH = th + padY * 2;
  const bx = align === 'left' ? x : x - boxW;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundedRect(ctx, bx, y, boxW, boxH, 999);
  ctx.fill();
  ctx.fillStyle = '#831843';
  ctx.textAlign = 'left';
  ctx.fillText(text, bx + padX, y + padY);
}

function drawCaption(ctx: CanvasRenderingContext2D, caption: string, w: number, h: number) {
  const fontSize = Math.max(14, Math.round(w / 36));
  ctx.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, caption, w * 0.85);
  const padY = Math.round(fontSize * 0.5);
  const lineH = Math.round(fontSize * 1.3);
  const blockH = lines.length * lineH + padY * 2;
  const blockW = Math.min(w * 0.92, ctx.measureText(longest(lines)).width + padY * 4);
  const cx = w / 2;
  const cy = h - blockH / 2 - Math.round(h * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundedRect(ctx, cx - blockW / 2, cy - blockH / 2, blockW, blockH, 12);
  ctx.fill();
  ctx.fillStyle = 'white';
  lines.forEach((line, i) => {
    const ty = cy - blockH / 2 + padY + i * lineH + lineH / 2;
    ctx.fillText(line, cx, ty);
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => (a.length > b.length ? a : b), '');
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
