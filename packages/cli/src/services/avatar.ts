import { Jimp, intToRGBA } from 'jimp';

const PIXEL = '\u2584';

export async function renderAvatar(url: string, width = 24): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return renderImageToAnsi(buffer, width);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function renderImageToAnsi(buffer: Buffer, targetWidth: number): Promise<string | null> {
  const image = await Jimp.fromBuffer(buffer);
  const { width: origW, height: origH } = image;

  const ratio = origH / origW;
  const w = targetWidth;
  const h = Math.max(2, Math.round(w * ratio));

  image.resize({ w, h });

  const lines: string[] = [];
  for (let y = 0; y < h - 1; y += 2) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const top = intToRGBA(image.getPixelColor(x, y));
      const bot = intToRGBA(image.getPixelColor(x, y + 1));

      if (top.a === 0) {
        line += `\x1b[0m\x1b[38;2;${bot.r};${bot.g};${bot.b}m${PIXEL}\x1b[0m`;
      } else {
        line += `\x1b[48;2;${top.r};${top.g};${top.b}m\x1b[38;2;${bot.r};${bot.g};${bot.b}m${PIXEL}\x1b[0m`;
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}
