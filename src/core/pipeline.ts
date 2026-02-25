import type { WorkspaceContext } from './context.js';
import type { Logger } from './logger.js';
import type { PassRegistry } from './pass-registry.js';
import { PassError } from './errors.js';

export interface PipelineOptions {
  passFilter?: string[];
}

export async function runPipelineParallel(
  ctx: WorkspaceContext,
  registry: PassRegistry,
  logger: Logger,
): Promise<void> {
  const levels = registry.getLevels();
  const totalPasses = levels.reduce((sum, l) => sum + l.length, 0);
  logger.info(`Running ${totalPasses} analysis passes across ${levels.length} parallel levels...`);

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    logger.debug(`Level ${i}: [${level.map((p) => p.name).join(', ')}]`);

    const results = await Promise.allSettled(
      level.map(async (pass) => {
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
      }),
    );

    const failure = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failure) {
      throw failure.reason;
    }
  }

  logger.info('Pipeline complete');
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
