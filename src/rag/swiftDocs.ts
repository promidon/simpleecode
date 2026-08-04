/**
 * Build Order #10, Tier 1. Deterministic Swift documentation + learning links.
 * PURE (no `vscode` import) so it is unit-testable.
 *
 * Important: we do NOT guess exact API doc paths — those 404. Instead we use
 * SEARCH urls that always resolve, plus a fixed set of trusted learning
 * resources. No AI, no fetching, no hallucinated links.
 */
export interface DocLink {
  title: string;
  url: string;
  reason: string;
}

/** Fixed, always-valid Swift learning resources (shown for any Swift file). */
const LEARNING_LINKS: readonly DocLink[] = [
  {
    title: 'Develop in Swift (Apple)',
    url: 'https://developer.apple.com/tutorials/develop-in-swift',
    reason: 'Apple’s official Swift tutorials',
  },
  {
    title: 'Swift.org documentation',
    url: 'https://www.swift.org/documentation/',
    reason: 'The Swift language reference',
  },
  {
    title: 'W3Schools Swift',
    url: 'https://www.w3schools.com/swift/default.asp',
    reason: 'Beginner-friendly Swift basics',
  },
  {
    title: '100 Days of SwiftUI',
    url: 'https://www.hackingwithswift.com/100',
    reason: 'Hands-on SwiftUI course',
  },
];

const SWIFT_LANGUAGE_IDS = new Set(['swift']);

/**
 * Links for the given symbol + language. Returns `[]` for non-Swift files.
 * When a symbol is present, prepends symbol-specific SEARCH links (which always
 * resolve) before the general learning links.
 */
export function swiftDocLinks(
  symbol: string | undefined,
  languageId: string | undefined,
): DocLink[] {
  if (!languageId || !SWIFT_LANGUAGE_IDS.has(languageId)) {
    return [];
  }

  const links: DocLink[] = [];
  const clean = symbol?.trim();
  if (clean) {
    const q = encodeURIComponent(clean);
    links.push(
      {
        title: `Apple docs: “${clean}”`,
        url: `https://developer.apple.com/search/?q=${q}&type=Documentation`,
        reason: 'Official API reference (search)',
      },
      {
        title: `Hacking with Swift: “${clean}”`,
        url: `https://www.hackingwithswift.com/search?q=${q}`,
        reason: 'Examples & explanations (search)',
      },
    );
  }
  links.push(...LEARNING_LINKS);
  return links;
}
