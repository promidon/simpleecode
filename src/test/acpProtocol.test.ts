import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  agentTextFromUpdate,
  cancelNotification,
  initializeRequest,
  newSessionRequest,
  parseMessage,
  promptRequest,
  rejectPermissionResult,
  stopReasonOf,
} from '../acp/acpProtocol';

test('parseMessage rejects non-JSON-RPC lines', () => {
  assert.equal(parseMessage('not json'), undefined);
  assert.equal(parseMessage('{"foo": 1}'), undefined);
  assert.ok(parseMessage('{"jsonrpc":"2.0","id":1,"result":{}}'));
});

test('request builders carry the protocol essentials', () => {
  const init = initializeRequest(1);
  assert.equal(init.method, 'initialize');
  const caps = (init.params as { clientCapabilities: { fs: Record<string, boolean> } })
    .clientCapabilities;
  assert.equal(caps.fs.readTextFile, false);
  assert.equal(caps.fs.writeTextFile, false);

  const session = newSessionRequest(2, '/work');
  assert.deepEqual(session.params, { cwd: '/work', mcpServers: [] });

  const prompt = promptRequest(3, 'sess-1', 'explain this');
  assert.deepEqual(prompt.params, {
    sessionId: 'sess-1',
    prompt: [{ type: 'text', text: 'explain this' }],
  });
});

test('cancelNotification is a session/cancel notification with no id', () => {
  const cancel = cancelNotification('sess-1');
  assert.equal(cancel.method, 'session/cancel');
  assert.equal(cancel.id, undefined); // notifications carry no id
  assert.deepEqual(cancel.params, { sessionId: 'sess-1' });
});

test('agentTextFromUpdate reads message chunks and ignores other updates', () => {
  const chunk = {
    sessionId: 's',
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Hello' },
    },
  };
  assert.equal(agentTextFromUpdate(chunk), 'Hello');

  const thought = {
    sessionId: 's',
    update: {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'hmm' },
    },
  };
  assert.equal(agentTextFromUpdate(thought), undefined);
  assert.equal(agentTextFromUpdate(undefined), undefined);
});

test('rejectPermissionResult picks a reject option, else cancels', () => {
  const options = [
    { optionId: 'a', kind: 'allow_once' },
    { optionId: 'r', kind: 'reject_once' },
  ];
  assert.deepEqual(rejectPermissionResult(options), {
    outcome: { outcome: 'selected', optionId: 'r' },
  });
  assert.deepEqual(rejectPermissionResult([{ optionId: 'a', kind: 'allow_once' }]), {
    outcome: { outcome: 'cancelled' },
  });
  assert.deepEqual(rejectPermissionResult(undefined), {
    outcome: { outcome: 'cancelled' },
  });
});

test('stopReasonOf degrades to "unknown"', () => {
  assert.equal(stopReasonOf({ stopReason: 'end_turn' }), 'end_turn');
  assert.equal(stopReasonOf({}), 'unknown');
  assert.equal(stopReasonOf(undefined), 'unknown');
});
