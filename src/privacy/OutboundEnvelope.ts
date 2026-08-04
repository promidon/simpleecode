import type {
  ContextPacket,
  ExplanationTask,
  PrivacyScope,
} from '../context/ContextPacket';
import type { RetrievedContext } from '../rag/Retriever';
import { scopeIncludesRelatedFiles } from './privacyScope';

export interface OutboundEnvelope {
  readonly prompt: string;
  readonly task: ExplanationTask;
  readonly privacyScope: PrivacyScope;
  readonly filePath?: string;
  readonly totalBytes: number;
  readonly truncated: boolean;
  readonly redactions: string[];
  readonly includedSources: string[];
  readonly channel: string;
}

/** The single review/send record. The exact `prompt` here is handed to ACP. */
export function buildOutboundEnvelope(
  packet: ContextPacket,
  prompt: string,
  retrieved: RetrievedContext[],
  channel: string,
): OutboundEnvelope {
  const includedRetrieved = scopeIncludesRelatedFiles(packet.privacyScope)
    ? retrieved
    : [];
  const redactions = [...(packet.meta?.redactions ?? [])];
  for (const item of includedRetrieved) {
    for (const note of item.redactions ?? []) {
      redactions.push(`${item.path}: ${note}`);
    }
  }
  return {
    prompt,
    task: packet.task,
    privacyScope: packet.privacyScope,
    filePath: packet.filePath,
    totalBytes: Buffer.byteLength(prompt, 'utf8'),
    truncated:
      Boolean(packet.meta?.truncated) ||
      includedRetrieved.some((item) => item.truncated),
    redactions,
    includedSources: [
      packet.filePath ?? '(untitled buffer)',
      ...includedRetrieved.map((item) => item.path),
    ],
    channel,
  };
}
