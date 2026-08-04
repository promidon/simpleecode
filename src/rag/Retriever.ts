import type { ContextPacket } from '../context/ContextPacket';

/**
 * Retrieval boundary. The live implementation is deterministic: imports,
 * declarations, tests, and optionally gated sparse ranking. Future dense or
 * hybrid implementations must remain behind this interface.
 */
export interface RetrievedContext {
  sourceType: 'symbol' | 'file' | 'readme' | 'config' | 'test' | 'doc';
  path: string;
  range?: string;
  reasonIncluded: string;
  content: string;
  /** Privacy changes applied to this specific retrieved item. */
  redactions?: string[];
  truncated?: boolean;
}

export interface Retriever {
  /** Given a base packet, return extra context to enrich it. */
  retrieve(packet: ContextPacket): Promise<RetrievedContext[]>;
}
