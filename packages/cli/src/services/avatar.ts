import terminalImage from 'terminal-image';

export async function renderAvatar(url: string, width = 16): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await terminalImage.buffer(buffer, { width, preserveAspectRatio: true, preferNativeRender: false });
  } catch { return null; }
}