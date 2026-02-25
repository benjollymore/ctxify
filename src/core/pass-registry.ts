import type { AnalysisPass } from '../passes/types.js';
import { CtxifyError } from './errors.js';

export class PassRegistry {
  private passes = new Map<string, AnalysisPass>();

  register(pass: AnalysisPass): void {
    if (this.passes.has(pass.name)) {
      throw new CtxifyError(`Pass "${pass.name}" is already registered`);
    }
    this.passes.set(pass.name, pass);
  }

  get(name: string): AnalysisPass | undefined {
    return this.passes.get(name);
  }

  getAll(): AnalysisPass[] {
    return Array.from(this.passes.values());
  }

  /**
   * Returns passes grouped into levels for parallel execution.
   * Passes within the same level have no dependencies on each other
   * and can run concurrently.
   */
  getLevels(): AnalysisPass[][] {
    const ordered = this.getOrdered();
    const levels: AnalysisPass[][] = [];
    const assigned = new Map<string, number>();

    for (const pass of ordered) {
      let level = 0;
      for (const dep of pass.dependencies) {
        const depLevel = assigned.get(dep);
        if (depLevel !== undefined) {
          level = Math.max(level, depLevel + 1);
        }
      }
      assigned.set(pass.name, level);

      while (levels.length <= level) {
        levels.push([]);
      }
      levels[level].push(pass);
    }

    return levels;
  }

  getOrdered(): AnalysisPass[] {
    const ordered: AnalysisPass[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new CtxifyError(`Circular dependency detected involving pass "${name}"`);
      }

      const pass = this.passes.get(name);
      if (!pass) {
        throw new CtxifyError(`Unknown pass dependency: "${name}"`);
      }

      visiting.add(name);
      for (const dep of pass.dependencies) {
        visit(dep);
      }
      visiting.delete(name);
      visited.add(name);
      ordered.push(pass);
    };

    for (const name of this.passes.keys()) {
      visit(name);
    }

    return ordered;
  }
}

export function createDefaultRegistry(): PassRegistry {
  return new PassRegistry();
}
