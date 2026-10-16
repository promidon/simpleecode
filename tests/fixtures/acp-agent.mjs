// Synthetic ACP server for lifecycle tests. No network or workspace access.
import { createInterface } from 'node:readline';
const sessionId = 'fixture-' + process.pid;
const emit = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
let count = 0;
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    const reply = () => emit({ id: message.id, result: { protocolVersion: 1, agentCapabilities: {} } });
    if (process.argv.includes('--delay-init')) { setTimeout(reply, 2500); } else { reply(); }
  }
  if (message.method === 'session/new') { emit({ id: message.id, result: { sessionId } }); }
  if (message.method === 'session/prompt') {
    count++;
    const prompt = message.params.prompt[0].text;
    if (prompt.includes('FIXTURE_EXIT')) { process.exit(0); }
    const chunk = text => emit({ method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } });
    chunk(`Fixture answer, turn ${count}. `);
    if (prompt.includes('FIXTURE_WAIT')) {
      setTimeout(() => { chunk('Late result.'); emit({ id: message.id, result: { stopReason: 'end_turn' } }); }, 2500);
    } else { emit({ id: message.id, result: { stopReason: 'end_turn' } }); }
  }
  if (message.method === 'session/cancel') {
    // Deliberately ignore cancellation: the client must reject late output.
  }
});
