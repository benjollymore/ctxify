import { describe, it, expect } from 'vitest';
import { resolveInteractiveOptions } from '../../src/cli/commands/init-interactive.js';
import type { SkillScope } from '../../src/core/config.js';

describe('resolveInteractiveOptions', () => {
  it('builds single-repo options from answers', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agents: ['claude'],
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.mode).toBe('single-repo');
    expect(result.agents).toEqual(['claude']);
    expect(result.repos).toEqual([{ path: '.', name: 'my-app' }]);
  });

  it('builds multi-repo options with selected repos', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agents: ['claude'],
      confirmedMode: 'multi-repo',
      repos: [
        { path: 'api', name: 'api' },
        { path: 'web', name: 'web' },
      ],
    });

    expect(result.mode).toBe('multi-repo');
    expect(result.repos).toHaveLength(2);
  });

  it('sets agents to undefined when not provided', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.agents).toBeUndefined();
  });

  it('passes through monoRepoOptions', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      confirmedMode: 'mono-repo',
      repos: [{ path: 'packages/a', name: 'a' }],
      monoRepoOptions: { manager: 'pnpm', packageGlobs: ['packages/*'] },
    });

    expect(result.monoRepoOptions).toEqual({ manager: 'pnpm', packageGlobs: ['packages/*'] });
  });

  it('preserves workspaceRoot in output', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/some/custom/path',
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'app' }],
    });

    expect(result.workspaceRoot).toBe('/some/custom/path');
  });

  it('includes all repo fields when provided', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      confirmedMode: 'mono-repo',
      repos: [
        { path: 'packages/core', name: 'core', language: 'typescript', description: 'Core lib' },
        { path: 'packages/cli', name: 'cli', language: 'typescript' },
      ],
      monoRepoOptions: { manager: 'pnpm', packageGlobs: ['packages/*'] },
    });

    expect(result.repos[0]).toEqual({
      path: 'packages/core',
      name: 'core',
      language: 'typescript',
      description: 'Core lib',
    });
    expect(result.repos[1].language).toBe('typescript');
  });

  it('supports multiple agents', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agents: ['claude', 'cursor', 'copilot'],
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.agents).toEqual(['claude', 'cursor', 'copilot']);
  });

  it('passes through agentScopes when provided', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agents: ['claude', 'cursor'],
      agentScopes: { claude: 'global', cursor: 'workspace' },
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.agentScopes).toEqual({ claude: 'global', cursor: 'workspace' });
  });

  it('sets agentScopes to undefined when not provided', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agents: ['claude'],
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.agentScopes).toBeUndefined();
  });
});
