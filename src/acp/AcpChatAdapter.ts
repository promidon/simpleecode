/**
 * The single boundary between SimpleeCode and whatever provides ACP / Claude Code
 * chat transport. SimpleeCode owns context + dashboard + RAG; the adapter owns ONLY
 * connection and prompt transport. Nothing outside `src/acp/` should call ACP
 * commands directly — go through this interface.
 */

type AcpDelivery = 'agent' | 'command' | 'clipboard' | 'failed';

export interface AcpSendResult {
  /** How the prompt actually reached (or didn't reach) the agent. */
  delivery: AcpDelivery;
  /** Human-readable note for the dashboard / a toast. */
  detail: string;
  /** The agent's full answer, when the transport can capture it (`agent`). */
  answer?: string;
}

export interface AcpAvailability {
  available: boolean;
  /** Extension id we looked for (for the install hint). */
  extensionId: string;
  extensionInstalled: boolean;
  sendCommandPresent: boolean;
  detail: string;
}

/** The narrow contract shared by the process and command transports. */
export interface AcpTransportAdapter {
  /**
   * Hand a fully built prompt to the agent. `onChunk` fires with the answer so
   * far as it streams (only transports that capture answers call it).
   */
  sendPrompt(
    prompt: string,
    onChunk?: (textSoFar: string) => void,
  ): Promise<AcpSendResult>;
  /** Richer availability info for the dashboard. */
  describeAvailability(): Promise<AcpAvailability>;
}

/** Application-facing ACP boundary owned by the router. */
export interface AcpChatAdapter extends AcpTransportAdapter {
  /**
   * Stop the prompt currently in flight, if any. Safe to call when nothing is
   * running (a no-op). The session is kept alive so follow-ups still work.
   */
  cancel(): void;
  /**
   * Start a fresh conversation: drop the persisted session so the next prompt
   * carries no prior context. Safe to call any time (#5).
   */
  newConversation(): void;
}
