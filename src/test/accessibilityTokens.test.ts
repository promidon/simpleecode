import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

test('filled buttons and tinted links meet WCAG AA text contrast', () => {
  const css = readFileSync(join(process.cwd(), 'media', 'dashboard.css'), 'utf8');
  assert.match(css, /--accent: #005fb8;/);
  assert.match(css, /--accent-fill: #005fb8;/);
  assert.match(css, /body\.vscode-dark[\s\S]*--accent: #75baff;/);
  assert.match(css, /body\.vscode-dark[\s\S]*--accent-fill: #0067c5;/);

  assert.ok(contrast('#ffffff', '#005fb8') >= 4.5);
  assert.ok(contrast('#ffffff', '#0067c5') >= 4.5);
  assert.ok(contrast('#005fb8', blend('#005fb8', '#ffffff', 0.12)) >= 4.5);
  assert.ok(contrast('#75baff', blend('#75baff', '#1c1c1e', 0.16)) >= 4.5);
});

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function blend(foreground: string, background: string, alpha: number): string {
  const fg = rgb(foreground);
  const bg = rgb(background);
  return `#${fg
    .map((value, index) =>
      Math.round(value * alpha + bg[index] * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}
