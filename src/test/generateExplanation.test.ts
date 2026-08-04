import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateExplanation, explainSelection } from '../context/generateExplanation';

const SWIFT = `import SwiftUI

/// The root surface of here.
/// Shows the orb.
struct RootView: View {
    @State private var orbState: OrbState = .resting

    /// One soft pulse when the orb glows.
    private func fireTestHapticIfGlowing() {}
}`;

test('generateExplanation uses the code structure and the /// doc comments', () => {
  const out = generateExplanation(SWIFT, 'swift', 'RootView.swift');
  assert.ok(out);
  assert.ok(out.includes('RootView.swift — 3 declarations.'));
  assert.ok(out.includes('RootView (struct)'));
  assert.ok(out.includes('The root surface of here. Shows the orb.')); // joined ///
  assert.ok(out.includes('orbState (var)'));
  assert.ok(out.includes('A value of type OrbState.')); // plain words when no doc
  assert.ok(out.includes('fireTestHapticIfGlowing (func)'));
  assert.ok(out.includes('One soft pulse when the orb glows.')); // method doc
});

test('generateExplanation outlines Python structure', () => {
  const py = 'def handle(url):\n    pass\n\nclass Store:\n    pass';
  const out = generateExplanation(py, 'python', 'app.py');
  assert.ok(out?.includes('handle (function)'));
  assert.ok(out?.includes('Store (class)'));
});

test('generateExplanation returns undefined when there is no declaration', () => {
  assert.equal(generateExplanation('total = a + b', 'swift', 'f.swift'), undefined);
});

test('generateExplanation ignores languages it does not self-parse', () => {
  assert.equal(generateExplanation('const x = 1', 'typescript', 'f.ts'), undefined);
});

test('explainSelection explains a single selected identifier from its declaration', () => {
  const out = explainSelection('orbState', SWIFT, 'swift', 'RootView.swift');
  assert.ok(out?.startsWith('orbState (var)'));
  assert.ok(out?.includes('A value of type OrbState.'));
});

test('explainSelection returns undefined for a word not declared in the file (caller asks the LSP)', () => {
  assert.equal(explainSelection('OrbState', SWIFT, 'swift', 'RootView.swift'), undefined);
});

test('explainSelection explains a Swift import line', () => {
  const out = explainSelection('import SwiftUI', SWIFT, 'swift', 'RootView.swift');
  assert.ok(out?.includes('import SwiftUI'));
  assert.ok(out?.includes('SwiftUI module/framework'));
});

test('explainSelection explains a Python import line', () => {
  const out = explainSelection('from os import path', '', 'python', 'app.py');
  assert.ok(out?.includes('path'));
  assert.ok(out?.includes('os module'));
});

test('explainSelection outlines a larger selection of declarations', () => {
  const out = explainSelection(SWIFT, SWIFT, 'swift', 'RootView.swift');
  assert.ok(out?.includes('RootView (struct)'));
});
