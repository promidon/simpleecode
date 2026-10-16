import type { ContextPacket } from '../context/ContextPacket';
import type { PrivacyConfig } from '../privacy/privacyGuard';
import type { FileIndexReader } from '../indexing/FileIndex';

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
  version?: number;
}

export interface Retriever {
  /** Given a base packet, return extra context to enrich it. */
  retrieve(packet: ContextPacket, config: PrivacyConfig, sparseSearch: boolean, index?: FileIndexReader): Promise<RetrievedContext[]>;
}
