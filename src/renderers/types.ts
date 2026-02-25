import type { WorkspaceContext } from '../core/context.js';

export interface Renderer {
  outputPath: string;
  render(ctx: WorkspaceContext): string;
}

export interface MultiRenderer {
  outputPathTemplate: string;
  renderAll(ctx: WorkspaceContext): Map<string, string>;
}
