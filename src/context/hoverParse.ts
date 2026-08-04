/**
 * Build Order: Facts Layer, Slice 1. PURE (no `vscode`) so it is unit-testable.
 *
 * A language server's hover is markdown: usually a fenced code block holding the
 * signature, followed by the doc comment as prose. This splits those two apart.
 */
interface HoverInfo {
  signature?: string;
  doc?: string;
}

const FENCE = /```[\w-]*\n([\s\S]*?)```/;
const ALL_FENCES = /```[\w-]*\n[\s\S]*?```/g;

export function parseHover(markdown: string): HoverInfo {
  const firstFence = FENCE.exec(markdown);
  const signature = firstFence?.[1].trim();
  const doc = markdown.replace(ALL_FENCES, '').trim();

  return {
    signature: signature || undefined,
    doc: doc || undefined,
  };
}
