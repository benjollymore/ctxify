import type { WorkspaceContext } from '../core/context.js';
import type { Logger } from '../core/logger.js';

export interface AnalysisPass {
  name: string;
  description: string;
  dependencies: string[];
  configKeys: string[];
  execute(ctx: WorkspaceContext, logger: Logger): Promise<void>;
}
