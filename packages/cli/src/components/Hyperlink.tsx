import React from 'react';
import { Text } from 'ink';

interface HyperlinkProps {
  url: string;
  label?: string;
  color?: string;
}

export function Hyperlink({ url, label, color = 'cyan' }: HyperlinkProps) {
  const display = label || shortenUrl(url);
  const ansi = `\x1b]8;;${url}\x07${display}\x1b]8;;\x07`;
  return <Text color={color as any}>{ansi}</Text>;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean);
    const hash = u.hash;
    if (pathParts.length >= 2) {
      const id = pathParts[pathParts.length - 1];
      const shortHash = hash.length > 20 ? hash.slice(0, 20) + '...' : hash;
      return `${u.host}/.../${id}${shortHash}`;
    }
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  } catch {
    return url;
  }
}
