// Render a saved-comparison preview to a JPEG blob, sized for Timeline.
// The preview shows the before image with the after image clipped to the
// left of the slider position, plus an optional caption at the bottom.

import { loadImage } from './image';

export async function renderComparisonPreview(opts: {
  before: Blob;
  after: Blob;
  sliderPos: number;     // 0-100
  caption?: string;
  maxWidth?: number;
}): Promise<Blob> {
  const { before, after, sliderPos, caption, maxWidth = 720 } = opts;
  const beforeImg = await loadImage(before);
  const afterImg = await loadImage(after);

  const ratio = Math.min(1, maxWidth / beforeImg.width);
  const w = Math.round(beforeImg.width * ratio);
  const h = Math.round(beforeImg.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Before fills the full canvas.
  ctx.drawImage(beforeImg, 0, 0, w, h);

  // After image is drawn with cover-fit semantics to match before.
  const afterAspect = afterImg.width / afterImg.height;
  const canvasAspect = w / h;
  let dw: number, dh: number, dx: number, dy: number;
  if (afterAspect > canvasAspect) {
    dh = h;
    dw = h * afterAspect;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / afterAspect;
    dx = 0;
    dy = (h - dh) / 2;
  }

  // Clip to the slider area and draw after on top.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, (w * sliderPos) / 100, h);
  ctx.clip();
  ctx.drawImage(afterImg, dx, dy, dw, dh);
  ctx.restore();

  // Vertical divider line.
  const x = (w * sliderPos) / 100;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(x - 0.5, 0, 1, h);

  // Caption.
  if (caption) {
    const fontSize = Math.max(14, Math.round(w / 32));
    ctx.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, caption, w * 0.85);
    const padY = Math.round(fontSize * 0.5);
    const lineH = Math.round(fontSize * 1.25);
    const blockH = lines.length * lineH + padY * 2;
    const blockW = Math.min(w * 0.92, ctx.measureText(longest(lines)).width + padY * 4);
    const cx = w / 2;
    const cy = h - blockH / 2 - Math.round(h * 0.04);
    // Background pill.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, cx - blockW / 2, cy - blockH / 2, blockW, blockH, 12);
    ctx.fill();
    // Text.
    ctx.fillStyle = 'white';
    lines.forEach((line, i) => {
      const ty = cy - blockH / 2 + padY + i * lineH + lineH / 2;
      ctx.fillText(line, cx, ty);
    });
  }

  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85),
  );
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
