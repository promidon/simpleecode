import type { AcpChatAdapter } from '../acp/AcpChatAdapter';
import type { ContextPacket } from '../context/ContextPacket';
import type {
  DashboardPhase,
  DashboardState,
} from '../dashboard/DashboardPanel';
import type { FileIndexService } from '../indexing/FileIndex';
import type { SymbolIndexService } from '../indexing/SymbolIndex';
import type { VerifyResult } from '../rag/verifyAnswer';
import type { Logger } from '../utils/logger';
import type { ExplanationMode } from '../prompt/promptBuilder';
import type { Retriever } from '../rag/Retriever';

/**
 * The shared service container for the extension. Built once in `activate()`
 * and handed to the command layer and dashboard so they share one logger, one
 * ACP adapter, and one view of "the last packet".
 */
export interface SimpleeCodeApp {
  readonly logger: Logger;
  readonly adapter: AcpChatAdapter;
  readonly fileIndex: FileIndexService;
  readonly symbolIndex: SymbolIndexService;
  readonly retriever: Retriever;

  /** Build the current dashboard snapshot (active file + ACP + last packet). */
  getDashboardState(): Promise<DashboardState>;
  /** Push fresh state to the dashboard if it's open. */
  refreshDashboard(): void;
  /** Record the most recently built packet for the dashboard. */
  setLastPacket(packet: DashboardState['lastPacket'] | undefined): void;
  /** Record the most recently retrieved context for the dashboard (#9). */
  setRetrieved(retrieved: DashboardState['retrieved']): void;
  /** Record the verified facts from the language server (Facts Layer). */
  setFacts(facts: DashboardState['facts']): void;
  /** Record Claude's (possibly still streaming) answer for the dashboard (#14). */
  setAnswer(answer: DashboardState['answer']): void;
  /** Record what was missing/thin about the last packet's context (#21/notes #3). */
  setContextGaps(gaps: string[]): void;
  /** Record the exact packet last sent, so answers can be verified (#20). */
  setLastContext(packet: ContextPacket | undefined): void;
  /** Set the user-visible application lifecycle state. */
  setPhase(phase: DashboardPhase): void;
  /** Keep depth/mode synchronized across panel and sidebar. */
  setExplanationMode(mode: ExplanationMode): void;
  /** Check a pasted answer's file/symbol/line claims against ground truth (#20). */
  checkAnswer(answerText: string): VerifyResult;
}
