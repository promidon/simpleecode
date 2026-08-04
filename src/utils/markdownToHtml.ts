/**
 * Build Order P0 #3. Render a safe subset of Markdown to HTML for the dashboard
 * answer card, so a dyslexic reader sees clean headings, bullets, and code —
 * not raw `**bold**`, `#`, and backticks.
 *
 * PURE (no `vscode`) so it is unit-testable.
 *
 * Safety is the point of doing this locally instead of trusting the model:
 * every piece of source text is HTML-escaped first, and only a fixed set of
 * tags is ever emitted (h3/h4, p, ul/ol/li, strong, em, code, pre, blockquote,
 * a). Links are restricted to http/https. So a model answer can never inject
 * markup into the webview.
 *
 * Supported: headings (`#`..`######`), bullet lists (`-` `*` `+`), numbered
 * lists, fenced code blocks, blockquotes, `**bold**`, `*italic*`, `` `code` ``,
 * and `[text](https://…)`. Underscores are left alone on purpose so `snake_case`
 * and `__dunder__` identifiers are never mangled.
 */
export function markdownToHtml(md: string): string {
  const lines = (md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const para: string[] = [];
  let i = 0;

  const flushParagraph = (): void => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para.length = 0;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — collect verbatim until the closing fence (or EOF).
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence if present
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const tag = heading[1].length <= 3 ? 'h3' : 'h4';
      out.push(`<${tag}>${inline(heading[2].trim())}</${tag}>`);
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*[-*+]\s+/, '')));
        i++;
      }
      out.push(`<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, '')));
        i++;
      }
      out.push(`<ol>${items.map((t) => `<li>${t}</li>`).join('')}</ol>`);
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushParagraph();
  return out.join('\n');
}

/** Inline spans. Code spans are pulled out first so emphasis can't reach inside. */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.length >= 2 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : emphasize(escapeHtml(part)),
    )
    .join('');
}

/** Links (http/https only), then bold, then italic — on already-escaped text. */
function emphasize(escaped: string): string {
  let s = escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, url: string) => {
      const clean = url.trim();
      return /^https?:\/\//i.test(clean)
        ? `<a href="#" data-url="${clean.replace(/"/g, '&quot;')}">${label}</a>`
        : label; // drop non-http links, keep the visible text
    },
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
