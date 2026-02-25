import type { WorkspaceContext } from './context.js';
import type { Logger } from './logger.js';
import { PassRegistry } from './pass-registry.js';
import { PassError } from './errors.js';

export interface PipelineOptions {
  passFilter?: string[];
}

export async function runPipeline(
  ctx: WorkspaceContext,
  registry: PassRegistry,
  logger: Logger,
  options: PipelineOptions = {},
): Promise<void> {
  const passes = registry.getOrdered();
  const filteredPasses = options.passFilter
    ? passes.filter((p) => options.passFilter!.includes(p.name))
    : passes;

  logger.info(`Running ${filteredPasses.length} analysis passes...`);

  for (const pass of filteredPasses) {
    const passLogger = logger.child(pass.name);
    passLogger.info(`Starting: ${pass.description}`);

    try {
      await pass.execute(ctx, passLogger);
      passLogger.info('Completed');
    } catch (err) {
      throw new PassError(
        `Pass "${pass.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
        pass.name,
        err instanceof Error ? err : undefined,
      );
    }
  }

  logger.info('Pipeline complete');
}
