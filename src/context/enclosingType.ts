/**
 * Nested-type detection (book: Nested Types). PURE brace-walking over the
 * file text — no language server. Finds which named types enclose a given
 * offset, so a selected `struct Inner` can teach "this lives inside Outer;
 * its full name is Outer.Inner."
 */
const TYPE_DECL_AT_END =
  /(?:struct|class|enum|actor|protocol|extension)\s+([A-Za-z_]\w*)[^{}]*$/;

/**
 * Names of the type declarations enclosing `offset`, outermost first.
 * The declaration that STARTS at/after the offset is not included — selecting
 * `struct Inner` reports only its containers.
 */
export function enclosingTypePath(fileText: string, offset: number): string[] {
  const code = maskCommentsAndStrings(fileText);
  const stack: Array<string | undefined> = [];
  let segmentStart = 0;

  for (let i = 0; i < Math.min(offset, code.length); i++) {
    const ch = code[i];
    if (ch === '{') {
      const segment = code.slice(segmentStart, i);
      stack.push(TYPE_DECL_AT_END.exec(segment)?.[1]);
      segmentStart = i + 1;
    } else if (ch === '}') {
      stack.pop();
      segmentStart = i + 1;
    }
  }
  return stack.filter((name): name is string => name !== undefined);
}

/**
 * Blank out comment and string CONTENTS while preserving every offset and
 * newline, so brace counting can't be fooled by a `{` inside text.
 */
export function maskCommentsAndStrings(text: string): string {
  return text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"/g,
    (match) => match.replace(/[^\n]/g, ' '),
  );
}
