import { stripCommentsAndStrings } from './structureFacts';

/**
 * Construct recognition: teach the language constructs USED inside a selected
 * line or block — the parts a declaration-anatomy or keyword lookup can't see.
 * PURE and deterministic: every note is a fixed language truth, found by exact
 * pattern, never inferred.
 *
 * Coverage follows the Swift book's chapters: optional binding and chaining
 * (The Basics, Optional Chaining), operators (Basic Operators), string
 * interpolation (Strings), collection literals (Collection Types), loops and
 * switches (Control Flow), closures and capture lists (Closures), property
 * observers (Properties), casting (Type Casting), try forms (Error Handling),
 * Task/async let (Concurrency), macros (Macros).
 */
interface ConstructRule {
  /** Pattern applied to comment/string-stripped code. */
  pattern: RegExp;
  note: string | ((m: RegExpMatchArray) => string);
}

const SWIFT_RULES: ConstructRule[] = [
  {
    pattern: /\bguard\s+(let|var)\s+(\w+)/,
    note: (m) =>
      `guard ${m[1]} ${m[2]} — optional binding with an early exit: if the optional is nil, leave now; below the guard, ${m[2]} is a normal non-optional value.`,
  },
  {
    pattern: /\bif\s+(let|var)\s+(\w+)/,
    note: (m) =>
      `if ${m[1]} ${m[2]} — optional binding: the block runs only when the optional has a value, and inside it ${m[2]} is unwrapped and safe.`,
  },
  {
    pattern: /\bfor\s+\w+\s+in\b/,
    note: 'for … in — a loop: takes each element of the collection, one at a time.',
  },
  {
    pattern: /\bswitch\s/,
    note: 'switch — matches the value against cases; Swift requires every possibility to be covered.',
  },
  {
    pattern: /\?\?/,
    note: '?? — nil-coalescing: use the left value if it exists, otherwise the fallback on the right.',
  },
  {
    pattern: /\w\?\./,
    note: '?. — optional chaining: continue only if the value exists; otherwise the whole expression is nil. No crash.',
  },
  {
    pattern: /\bas\?/,
    note: 'as? — safe cast: the value as that type, or nil if it isn’t one.',
  },
  {
    pattern: /\bas!/,
    note: 'as! — forced cast: crashes if the value isn’t that type.',
  },
  {
    pattern: /\btry\?/,
    note: 'try? — if this throws an error, the result becomes nil instead of crashing or propagating.',
  },
  {
    pattern: /\btry!/,
    note: 'try! — if this throws an error, the app crashes here.',
  },
  {
    pattern: /\btry\s+(?![?!])/,
    note: 'try — calls something that can throw; the error travels to the nearest catch (or out of a throwing function).',
  },
  {
    pattern: /\bawait\s/,
    note: 'await — pauses here until the async work finishes; the thread is freed meanwhile.',
  },
  {
    pattern: /\basync\s+let\s+(\w+)/,
    note: (m) =>
      `async let ${m[1]} — starts this work immediately IN PARALLEL; the value is awaited later, where it’s used.`,
  },
  {
    pattern: /\bTask\s*(\{|\()/,
    note: 'Task { … } — starts a new piece of async work from synchronous code.',
  },
  {
    pattern: /\[\s*(weak|unowned)\s+self\s*\]/,
    note: (m) =>
      `[${m[1]} self] — a capture list: the closure holds self ${m[1] === 'weak' ? 'weakly (self can become nil — no retain cycle)' : 'without keeping it alive (crashes if self is gone — use only when self must outlive the closure)'}.`,
  },
  {
    pattern: /\{\s*[\w\s,()]*\bin\b/,
    note: 'A closure: a block of code passed around like a value. Before `in`: its inputs. After: its body.',
  },
  {
    pattern: /\$\d/,
    note: '$0, $1, … — shorthand closure arguments: the first, second, … input, unnamed.',
  },
  {
    pattern: /\bwillSet\b/,
    note: 'willSet — runs just BEFORE the property changes; `newValue` is the incoming value.',
  },
  {
    pattern: /\bdidSet\b/,
    note: 'didSet — runs just AFTER the property changes; `oldValue` is the previous value.',
  },
  {
    pattern: /\bdefer\s*\{/,
    note: 'defer — this block runs when the current scope exits, no matter how (even on early return or error).',
  },
  {
    pattern: /\.\.\./,
    note: '... — closed range (both ends included) or, after a parameter type, "any number of values".',
  },
  {
    pattern: /\.\.</,
    note: '..< — half-open range: start included, end excluded. Fits array indexes.',
  },
  {
    pattern: /!==|===/,
    note: '=== / !== — identity: the very SAME object (classes only), not just equal contents.',
  },
  {
    // Spaced form only (`x ? a : b`) so optional types like `Int?` don't match.
    pattern: /\w\s+\?\s+[^:\n]+\s:/,
    note: 'a ? b : c — the ternary: if the condition is true use b, otherwise c.',
  },
  {
    pattern: /#available/,
    note: '#available — runs the branch only when the OS is new enough.',
  },
  {
    pattern: /\bthrow\s+\w/,
    note: 'throw — raises an error; execution jumps to the nearest catch.',
  },
  // Swift 6.0 book: Error Handling → "Specifying the Error Type".
  {
    pattern: /\bthrows\(\s*(\w+)\s*\)/,
    note: (m) =>
      `throws(${m[1]}) — typed throws: this can only throw ${m[1]} errors, and the compiler enforces it. Plain throws allows any error.`,
  },
  // Swift 5.9 book: Control Flow → if/switch as expressions.
  {
    pattern: /=\s*(if|switch)[\s(]/,
    note: (m) =>
      `= ${m[1]} … — ${m[1]} used as an EXPRESSION: whichever branch runs, its value is what gets assigned.`,
  },
  // Swift 6.2 book: Control Flow → Patterns (`if case`).
  {
    pattern: /\b(if|guard|for)\s+case\b/,
    note: (m) =>
      `${m[1]} case — pattern matching outside a switch: runs only when the value matches that case shape (works with associated values).`,
  },
  // Book: Memory Safety — the exclusivity rule, taught where it shows.
  {
    pattern: /\binout\b/,
    note: 'inout — the function edits the caller’s OWN variable. Memory-safety rule: while it’s being edited, nothing else may read or write it (so the same variable can’t be passed inout twice).',
  },
];

/** Rules for the ORIGINAL (unstripped) text — string contents matter here. */
const SWIFT_RAW_RULES: ConstructRule[] = [
  {
    pattern: /"[^"]*\\\([^)]*\)[^"]*"/,
    note: '\\( … ) inside a string — string interpolation: the expression’s value is written into the text.',
  },
  {
    pattern: /"""/,
    note: '""" — a multiline string: everything until the closing """ is the text, line breaks included.',
  },
];

/**
 * Notes for every recognized construct in the selection, in rule order.
 * Deduplicated; capped so a big block doesn't drown the explanation.
 */
export function constructNotes(
  text: string,
  languageId: string,
  max = 8,
): string[] {
  if (languageId !== 'swift') {
    return [];
  }
  const stripped = stripCommentsAndStrings(text);
  const notes: string[] = [];
  const apply = (rules: ConstructRule[], source: string) => {
    for (const rule of rules) {
      if (notes.length >= max) {
        return;
      }
      const m = source.match(rule.pattern);
      if (m) {
        notes.push(typeof rule.note === 'string' ? rule.note : rule.note(m));
      }
    }
  };
  apply(SWIFT_RULES, stripped);
  apply(SWIFT_RAW_RULES, text);
  return notes;
}
