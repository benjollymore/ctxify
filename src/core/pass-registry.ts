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
