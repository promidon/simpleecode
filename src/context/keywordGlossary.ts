import { parseDeclaration } from './parseDeclaration';
import { explainSignature } from './explainSignature';

/**
 * The keyword glossary + declaration anatomy. PURE, and 100% deterministic:
 * every sentence here is a fixed, curated truth about the language or a
 * well-known framework contract — the kind of thing a textbook states, not
 * something inferred. Same selection → same explanation, on any machine,
 * with no language server and no LLM.
 *
 * Two entry points:
 * - `keywordDefinition("struct")`      → what the keyword means.
 * - `explainDeclarationLine("struct HereApp: App {")` → the whole line,
 *   decomposed: attributes, modifiers, keyword, name, conformances — and WHY
 *   this kind was the right choice when a known framework contract says so.
 */

// --- keyword definitions -----------------------------------------------------

const SWIFT_KEYWORDS: Record<string, string> = {
  struct:
    'Makes a value type. Every copy is independent — change one copy, the others stay the same. Compare: class, which shares one object.',
  class:
    'Makes a reference type. Everyone holds the SAME object — change it in one place, every holder sees the change. Compare: struct, which copies.',
  enum: 'A type with a fixed menu of cases. A value must be exactly one of those cases — nothing else compiles.',
  protocol:
    'A contract. It lists what a type must provide. A type that adopts it promises all of it, and the compiler checks.',
  actor:
    'Like a class, but concurrency-safe: only one task can touch its data at a time, so no data races.',
  extension:
    'Adds abilities to a type that already exists, without editing the original.',
  func: 'Declares a function — a named, reusable block of work.',
  var: 'A variable. Its value can change later.',
  let: 'A constant. Set once, it never changes — the compiler enforces it.',
  guard:
    'An early exit. If the condition fails, leave now. Past the guard, the condition is guaranteed true.',
  if: 'Runs the block only when the condition is true.',
  else: 'The path taken when the `if` condition was false.',
  switch:
    'Picks one branch by matching a value against cases. Swift requires every possible case to be covered.',
  case: 'One option in an enum, or one match in a switch.',
  for: 'A loop: runs the block once per element.',
  while: 'A loop: keeps running as long as the condition stays true.',
  repeat: 'A loop that runs its block first, then checks the condition.',
  return: 'Ends the function and hands back this value.',
  init: 'The initializer — the code that builds a new value of this type.',
  deinit: 'Runs just before a class object is destroyed. Clean-up lives here.',
  self: 'The current instance — "this very object/value."',
  static: 'Belongs to the type itself, not to instances. One shared per type.',
  final: 'No subclassing allowed. This class is the end of the line.',
  private: 'Visible only inside this declaration (and same-file extensions).',
  fileprivate: 'Visible anywhere in this file, nowhere else.',
  internal: 'Visible anywhere in this module (the default).',
  public: 'Visible to other modules that import this one.',
  open: 'Public AND subclassable/overridable from other modules.',
  override: 'Replaces the superclass version of this member.',
  throws: 'This function can fail by throwing an error. Callers must use `try`.',
  try: 'Calls something that can throw. Pair with catch, `try?` (nil on error) or `try!` (crash on error).',
  catch: 'Handles an error thrown in the `do` block above.',
  async: 'This function can pause and resume. Callers must `await` it.',
  await: 'Pauses here until the async work finishes. The thread is freed meanwhile.',
  defer: 'Schedules this block to run when the current scope exits, no matter how.',
  typealias: 'A new name for an existing type. Nothing new is created.',
  some: 'An opaque type: "one specific type that fits, but its name stays hidden."',
  any: 'A box that can hold ANY type fitting the protocol. Flexible, but slower and less checked than `some`.',
  mutating: 'This method may change the struct/enum it belongs to.',
  weak: 'Holds the object without keeping it alive. Becomes nil when the object goes away — prevents retain cycles.',
  lazy: 'Not created until the first time it is used.',
  inout: 'The function can change the caller’s own variable, not a copy.',
  subscript: 'Lets values be read/written with bracket syntax, like `thing[key]`.',
  where: 'An extra condition that narrows when this applies.',
  nil: 'No value. Only optionals (`Type?`) can hold nil.',
  import: 'Makes a module/framework available in this file.',
  // Control flow (book: Control Flow)
  break: 'Leaves the loop or switch right now.',
  continue: 'Skips the rest of this loop pass and starts the next one.',
  fallthrough: 'In a switch: after this case, ALSO run the next case. Swift never does this by itself.',
  do: 'Starts a block. With `catch` below it, errors thrown inside are handled there.',
  in: 'In a for loop: "take each element from". In a closure: separates the inputs from the body.',
  // Inheritance (book: Inheritance)
  super: 'The superclass’s version — `super.foo()` calls the parent’s foo.',
  // Error handling (book: Error Handling)
  rethrows: 'Only throws if a closure the caller passed in throws.',
  // ARC (book: Automatic Reference Counting)
  unowned: 'Holds the object without keeping it alive, like weak — but NOT optional. If the object is gone, using this crashes. Only when the object always outlives us.',
  // Type casting (book: Type Casting)
  is: 'A type check: true when the value is that type.',
  as: 'A type conversion. Plain `as` for always-safe casts; `as?` gives nil on failure; `as!` crashes on failure.',
  // Properties (book: Properties)
  get: 'The read side of a computed property: runs to produce the value.',
  set: 'The write side of a computed property: runs when a new value is assigned.',
  willSet: 'A property observer: runs just BEFORE the value changes (`newValue` holds the incoming one).',
  didSet: 'A property observer: runs just AFTER the value changes (`oldValue` holds the previous one).',
  // Protocols and generics (book: Protocols, Generics)
  associatedtype: 'A placeholder type inside a protocol. The adopting type decides what it really is.',
  indirect: 'Lets an enum case contain the enum’s own type (recursive data, like a tree).',
  // Concurrency (book: Concurrency)
  nonisolated: 'Opts this member out of the actor’s protection — callable without await, so it must not touch protected state.',
  isolated: 'This parameter’s actor protects the whole function.',
  // Access control (book: Access Control)
  package: 'Visible to other modules in the same package, but not outside it.',
  // Advanced operators (book: Advanced Operators)
  operator: 'Declares a custom operator symbol.',
  precedencegroup: 'Defines how tightly a custom operator binds, and its grouping direction.',
  prefix: 'This operator goes before its value, like -x.',
  postfix: 'This operator goes after its value.',
  infix: 'This operator goes between two values, like a + b.',
  convenience: 'A secondary initializer. It must call a designated init of the same class.',
  required: 'Every subclass must provide this initializer too.',
  dynamic: 'Dispatched through the Objective-C runtime (needed for some KVO/older APIs).',
};

/**
 * Operators and sigils — exact-token lookup for selections like `??` or `as?`.
 * Book chapters: Basic Operators, Optional Chaining, Type Casting, Error
 * Handling, Advanced Operators.
 */
const SWIFT_OPERATORS: Record<string, string> = {
  '??': 'Nil-coalescing: use the left value if it exists, otherwise fall back to the right one.',
  '?.': 'Optional chaining: continue only if the value exists; otherwise the whole expression becomes nil. Nothing crashes.',
  '!': 'Force unwrap: "I promise this optional has a value." If it is nil, the app CRASHES here.',
  '?': 'Marks an optional type (`Int?` = an Int or nil), or the safe forms `as?` / `try?`.',
  '...': 'Closed range: includes both ends (1...5 is 1,2,3,4,5). After a parameter type, it means variadic: any number of values.',
  '..<': 'Half-open range: includes the start, excludes the end (0..<5 is 0,1,2,3,4). Fits array indexes.',
  '->': 'What the function gives back comes after this arrow.',
  '==': 'Equal in value.',
  '!=': 'Not equal in value.',
  '===': 'The SAME object (identity, classes only) — not just equal contents.',
  '!==': 'Not the same object.',
  '&&': 'AND — true only when both sides are true. Stops early if the left is false.',
  '||': 'OR — true when either side is true. Stops early if the left is true.',
  'as?': 'Safe cast: the value as that type, or nil if it isn’t one.',
  'as!': 'Forced cast: crashes if the value isn’t that type.',
  'try?': 'Calls something that can throw; an error becomes nil instead of propagating.',
  'try!': 'Calls something that can throw; an error CRASHES the app.',
  '&': 'Before an argument: pass-by-reference for an inout parameter (the function edits your variable). Between numbers: bitwise AND.',
  '~=': 'Pattern match — what switch cases use under the hood.',
  '+=': 'Add and assign: a += 1 means a = a + 1.',
  '%': 'Remainder after division (5 % 2 is 1).',
  // Advanced Operators (book chapter)
  '&+': 'Overflow addition: at the type’s limit it wraps around instead of crashing (for UInt8, 255 &+ 1 is 0).',
  '&-': 'Overflow subtraction: wraps around instead of crashing (for UInt8, 0 &- 1 is 255).',
  '&*': 'Overflow multiplication: wraps around instead of crashing.',
  '<<': 'Shifts bits left. Each step doubles the number.',
  '>>': 'Shifts bits right. Each step halves the number.',
  '|': 'Bitwise OR: a result bit is 1 when either input bit is 1.',
  '^': 'Bitwise XOR: a result bit is 1 when the input bits differ.',
  '~': 'Bitwise NOT: flips every bit.',
};

const TS_OPERATORS: Record<string, string> = {
  '??': 'Nullish coalescing: use the left value unless it is null/undefined, then the right.',
  '?.': 'Optional chaining: continue only if the value exists; otherwise the expression is undefined.',
  '===': 'Strict equality: same value AND same type. Prefer this over ==.',
  '!==': 'Strict inequality.',
  '=>': 'Arrow function: inputs => result.',
  '...': 'Spread/rest: expands an array/object, or collects remaining arguments.',
  '&&': 'AND — stops early if the left side is falsy.',
  '||': 'OR — stops early if the left side is truthy.',
  '!': 'NOT — flips true/false. After a value in TS: "trust me, it’s not null."',
};

const TS_KEYWORDS: Record<string, string> = {
  const: 'A constant binding. The name can’t be reassigned (object contents can still change).',
  let: 'A block-scoped variable. It can be reassigned.',
  var: 'An old-style variable, function-scoped. Prefer let/const.',
  function: 'Declares a function — a named, reusable block of work.',
  class: 'A blueprint for objects: shared behavior, per-instance data. Instances are references.',
  interface: 'A contract describing a shape. It exists only at compile time — the checker enforces it, then it disappears.',
  type: 'Names a type. Compile-time only, like interface.',
  enum: 'A fixed set of named values.',
  extends: 'Inherits from a class, or narrows a type.',
  implements: 'Promises this class satisfies that interface. The checker verifies.',
  export: 'Makes this available to other files that import it.',
  import: 'Brings in what another file/module exports.',
  async: 'This function returns a Promise and can use await inside.',
  await: 'Pauses here until the Promise settles, then hands back its value.',
  return: 'Ends the function and hands back this value.',
  new: 'Creates an instance of a class.',
  this: 'The current object.',
  static: 'Belongs to the class itself, not to instances.',
  readonly: 'Can be set once (at declaration or in the constructor), then never again.',
  throw: 'Raises an error; the nearest catch handles it.',
  yield: 'Hands out one value from a generator, pausing until asked for the next.',
};

export function keywordDefinition(
  word: string,
  languageId: string,
): string | undefined {
  if (languageId === 'swift') {
    return SWIFT_KEYWORDS[word];
  }
  if (/^(java|type)script/.test(languageId)) {
    return TS_KEYWORDS[word];
  }
  return undefined;
}

/** Swift's `#` freestanding macros (book: Macros) — prefix lookup. */
const SWIFT_HASH: Record<string, string> = {
  '#available': 'Checks at runtime whether the OS is new enough for the code inside.',
  '#Preview': 'A macro that builds an Xcode canvas preview of this view.',
  '#Predicate': 'A macro that turns this expression into a database/query predicate.',
  '#selector': 'References an Objective-C method by name, checked by the compiler.',
  '#warning': 'Makes the compiler print this warning at build time.',
  '#error': 'Makes the compiler FAIL the build with this message.',
};

/**
 * Exact-token lookup for operator/sigil selections like `??`, `as?`, `->`,
 * `$0`, or `#Preview` — things the identifier path can't match.
 */
export function syntaxDefinition(
  token: string,
  languageId: string,
): string | undefined {
  if (languageId === 'swift') {
    if (/^\$\d+$/.test(token)) {
      return `Shorthand closure argument: ${token} is argument number ${Number(token.slice(1)) + 1} of the closure, unnamed.`;
    }
    if (token.startsWith('#')) {
      return (
        SWIFT_HASH[token] ??
        'A freestanding macro: the compiler expands it into real code at build time.'
      );
    }
    return SWIFT_OPERATORS[token];
  }
  if (/^(java|type)script/.test(languageId)) {
    return TS_OPERATORS[token];
  }
  return undefined;
}

// --- curated framework/protocol contracts (fixed truths, not inference) ------

const SWIFT_CONFORMANCES: Record<string, string> = {
  App: 'the SwiftUI entry-point contract — it must provide `body`, the app’s scenes. This is where the app starts.',
  Scene: 'a top-level piece of the app’s UI world (like a window group).',
  View: 'a piece of UI. It must provide `body` — what to draw.',
  ViewModifier: 'a reusable change applied to views.',
  ObservableObject:
    'an object views can watch. When its @Published values change, watching views re-draw.',
  Codable: 'can be converted to/from data like JSON, automatically.',
  Encodable: 'can be converted TO data like JSON.',
  Decodable: 'can be built FROM data like JSON.',
  Identifiable: 'has a stable `id`, so lists can tell items apart.',
  Hashable: 'can be used in Sets and as Dictionary keys.',
  Equatable: 'two values can be compared with ==.',
  Comparable: 'values can be ordered with < and >.',
  Error: 'can be thrown and caught as an error.',
  CaseIterable: 'the enum lists all its cases in `allCases`.',
  Sendable: 'safe to pass between concurrent tasks.',
  RawRepresentable: 'each case maps to a raw value (like a String or Int).',
  CustomStringConvertible: 'provides its own printed description.',
  PreviewProvider: 'supplies the Xcode canvas preview.',
};

/** SwiftUI kinds that REQUIRE value types — the "why a struct" fixed truth. */
const SWIFTUI_VALUE_TYPE_CONTRACTS = new Set([
  'App', 'Scene', 'View', 'ViewModifier', 'Widget', 'PreviewProvider',
]);

const SWIFT_ATTRIBUTES: Record<string, string> = {
  '@main': 'marks the program’s entry point — launching the app starts HERE.',
  '@State':
    'view-owned state. SwiftUI stores it outside the struct so it survives re-draws; changing it re-draws the view.',
  '@Binding': 'a live connection to state OWNED SOMEWHERE ELSE. Read and write pass through.',
  '@StateObject': 'this view CREATES and owns the observable object; it survives re-draws.',
  '@ObservedObject': 'watches an observable object owned elsewhere.',
  '@EnvironmentObject': 'pulls a shared object out of the environment set by an ancestor view.',
  '@Environment': 'reads a value from the view environment (color scheme, dismiss, …).',
  '@Published': 'when this value changes, the ObservableObject announces it and watching views re-draw.',
  '@MainActor': 'always runs on the main thread — required for UI work.',
  '@Observable': 'macro: makes this class observable — views watching it re-draw when its data changes.',
  '@escaping': 'the closure may be stored and called LATER, after the function returns.',
  '@discardableResult': 'callers may ignore the returned value without a warning.',
  '@available': 'limits this to certain OS versions.',
  '@objc': 'exposed to the Objective-C runtime.',
  '@preconcurrency':
    'eases strict-concurrency checking for this older API/import while migrating to Swift 6 concurrency.',
};

const SWIFT_MODIFIERS = new Set([
  'final', 'static', 'private', 'fileprivate', 'internal', 'public', 'open',
  'override', 'mutating', 'convenience', 'required', 'lazy', 'weak',
]);

// --- declaration anatomy -------------------------------------------------------

/**
 * Decompose a declaration into taught parts. Returns undefined when the text
 * holds no recognizable declaration (the caller falls back to other paths).
 * Swift is fully covered; TS/JS gets keyword + name + heritage basics.
 */
export function explainDeclarationLine(
  text: string,
  languageId: string,
): string | undefined {
  if (languageId === 'swift') {
    return explainSwiftDeclaration(text);
  }
  if (/^(java|type)script/.test(languageId)) {
    return explainTsDeclaration(text);
  }
  return undefined;
}

function explainSwiftDeclaration(text: string): string | undefined {
  const decl = parseDeclaration(text, 'swift');
  if (!decl) {
    return undefined;
  }
  const bullets: string[] = [];

  // Attributes — anywhere before the keyword (same line or the lines above).
  const before = text.slice(0, Math.max(text.indexOf(decl.kind), 0));
  for (const m of before.matchAll(/@\w+/g)) {
    const note = SWIFT_ATTRIBUTES[m[0]];
    bullets.push(`• ${m[0]} — ${note ?? 'an attribute: an extra instruction to the compiler or framework.'}`);
  }

  // Modifiers between attributes and the kind keyword.
  const modifierText = before.replace(/@\w+(\([^)]*\))?/g, '');
  for (const word of modifierText.split(/\s+/)) {
    if (SWIFT_MODIFIERS.has(word) && SWIFT_KEYWORDS[word]) {
      bullets.push(`• ${word} — ${SWIFT_KEYWORDS[word]}`);
    }
  }

  // The kind keyword itself.
  bullets.push(`• ${decl.kind} — ${SWIFT_KEYWORDS[decl.kind]}`);

  // The name.
  bullets.push(`• ${decl.name} — the name this code gives it.`);

  // Generic parameters.
  const generics = decl.signature.match(/<([^>]+)>/);
  if (generics) {
    bullets.push(`• <${generics[1]}> — placeholder type(s), filled in with real types when used.`);
  }

  // Conformances / superclass after the colon.
  const conformances = conformanceList(decl.signature);
  for (const name of conformances) {
    const note = SWIFT_CONFORMANCES[name];
    bullets.push(
      note
        ? `• : ${name} — adopts ${name}: ${note}`
        : `• : ${name} — adopts ${name}: promises everything ${name} requires.`,
    );
  }

  // Function specifics: plain-words signature + effect keywords.
  if (decl.kind === 'func') {
    const plain = explainSignature(decl.signature);
    if (plain) {
      bullets.push(`• In plain words: ${plain}`);
    }
    if (/\basync\b/.test(decl.signature)) {
      bullets.push(`• async — ${SWIFT_KEYWORDS.async}`);
    }
    if (/\bthrows\b/.test(decl.signature)) {
      bullets.push(`• throws — ${SWIFT_KEYWORDS.throws}`);
    }
  }

  // The "why this kind" fixed truths.
  const why = whySwiftKind(decl.kind, conformances);
  if (why) {
    bullets.push(`• Why ${decl.kind}? ${why}`);
  }

  return [decl.signature, '', ...bullets].join('\n');
}

/** Split the `: A, B` clause of a type declaration (not a func return arrow). */
function conformanceList(signature: string): string[] {
  if (signature.startsWith('func')) {
    return [];
  }
  const m = signature.match(/:\s*(.+)$/);
  if (!m) {
    return [];
  }
  return m[1]
    .split(/\bwhere\b/)[0]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Z]\w*(<.*>)?$/.test(s))
    .map((s) => s.replace(/<.*>/, ''));
}

function whySwiftKind(kind: string, conformances: string[]): string | undefined {
  const swiftUi = conformances.find((c) => SWIFTUI_VALUE_TYPE_CONTRACTS.has(c));
  if (kind === 'struct' && swiftUi) {
    return (
      `SwiftUI is designed around ${swiftUi} types being structs (value types). ` +
      'SwiftUI throws these values away and rebuilds them on every update — structs make that cheap and safe, and nothing can secretly share or mutate them. A class would fight that model: shared references break the rebuild-and-compare cycle.'
    );
  }
  if (kind === 'class' && conformances.includes('ObservableObject')) {
    return 'This one is a class ON PURPOSE: many views need to watch ONE shared object. A struct would give each view its own copy, and they would drift apart.';
  }
  if (kind === 'actor') {
    return 'Shared mutable state touched from concurrent code — an actor makes that safe without manual locks.';
  }
  return undefined;
}

function explainTsDeclaration(text: string): string | undefined {
  const m = text.match(
    /\b(class|interface|type|enum|function|const|let|var)\s+([A-Za-z_$]\w*)/,
  );
  if (!m) {
    return undefined;
  }
  const [, kind, name] = m;
  const bullets = [
    `• ${kind} — ${TS_KEYWORDS[kind]}`,
    `• ${name} — the name this code gives it.`,
  ];
  if (/\bexport\b/.test(text)) {
    bullets.unshift(`• export — ${TS_KEYWORDS.export}`);
  }
  const ext = text.match(/\bextends\s+([A-Za-z_$][\w.]*)/);
  if (ext) {
    bullets.push(`• extends ${ext[1]} — inherits everything ${ext[1]} has, then adds to it.`);
  }
  const impl = text.match(/\bimplements\s+([A-Za-z_$][\w.,\s]*)/);
  if (impl) {
    bullets.push(`• implements ${impl[1].trim()} — promises to satisfy that contract; the checker verifies.`);
  }
  const firstLine = text.trim().split('\n')[0].replace(/\s*\{.*$/, '');
  return [firstLine, '', ...bullets].join('\n');
}
