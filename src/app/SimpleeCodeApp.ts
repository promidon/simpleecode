import type { DashboardPhase, DashboardState } from '../dashboard/DashboardPanel';
import type { FileIndexService } from '../indexing/FileIndex';
import type { SymbolIndexService } from '../indexing/SymbolIndex';
import type { Logger } from '../utils/logger';
import type { ExplanationService } from '../explanation/ExplanationService';

export interface SimpleeCodeApp {
  readonly logger: Logger;
  readonly fileIndex: FileIndexService;
  readonly symbolIndex: SymbolIndexService;
  readonly explanation: ExplanationService;
  getDashboardState(): Promise<DashboardState>;
  refreshDashboard(): void;
  setPhase(phase: DashboardPhase): void;
  checkAnswer(text: string): ReturnType<ExplanationService['checkAnswer']>;
}
