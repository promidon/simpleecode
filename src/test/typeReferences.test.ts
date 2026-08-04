import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { referencedTypeNames } from '../rag/typeReferences';

test('finds the Swift types a selection uses', () => {
  const code = `
    if filter.capturesNote {
      noteActions.create(title: text)
    } else {
      _ = ReminderActions.create(title: text, listId: filter.captureListId())
    }
    let vm = SinglyViewModel(store: store)
  `;
  const names = referencedTypeNames(code);
  assert.ok(names.includes('ReminderActions'));
  assert.ok(names.includes('SinglyViewModel'));
});

test('excludes types the code declares itself', () => {
  const code = `
    struct ContentView: View {
      var body: some View { Text("hi") }
    }
    extension ContentView { func reset() {} }
  `;
  const names = referencedTypeNames(code);
  assert.ok(!names.includes('ContentView'));
  assert.ok(names.includes('View'));
  assert.ok(names.includes('Text'));
});

test('excludes standard-library noise', () => {
  const names = referencedTypeNames('let s: String = ""; let u: URL; let x = CustomThing()');
  assert.ok(!names.includes('String'));
  assert.ok(!names.includes('URL'));
  assert.ok(names.includes('CustomThing'));
});

test('orders by frequency then name, and caps the list', () => {
  const code = 'Beta Beta Alpha Beta Alpha Gamma';
  assert.deepEqual(referencedTypeNames(code), ['Beta', 'Alpha', 'Gamma']);
  assert.equal(referencedTypeNames(code, 2).length, 2);
});

test('works for TypeScript too', () => {
  const code = `
    export class FileIndex {}
    const retriever = new DeterministicRetriever(fileIndex);
    const guard: PrivacyConfig = readPrivacyConfig();
  `;
  const names = referencedTypeNames(code);
  assert.ok(!names.includes('FileIndex'));
  assert.ok(names.includes('DeterministicRetriever'));
  assert.ok(names.includes('PrivacyConfig'));
});
