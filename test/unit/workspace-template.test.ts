import { describe, it, expect } from 'vitest';
import { generateWorkspaceTemplate } from '../../src/templates/workspace.js';
import type { RepoTemplateData } from '../../src/templates/index-md.js';

describe('generateWorkspaceTemplate', () => {
  const repos: RepoTemplateData[] = [
    {
      name: 'api',
      path: 'api',
      language: 'typescript',
      framework: 'express',
      keyDirs: [],
      entryPoints: [],
      dependencies: [],
      devDependencies: [],
      scripts: {},
    },
    {
      name: 'web',
      path: 'web',
      language: 'typescript',
      framework: 'react',
      keyDirs: [],
      entryPoints: [],
      dependencies: [],
      devDependencies: [],
      scripts: {},
    },
  ];

  it('generates workspace template with correct frontmatter', () => {
    const result = generateWorkspaceTemplate(repos, '/my-workspace', 'api', {
      generatedAt: '2025-01-01T00:00:00.000Z',
      ctxifyVersion: '0.7.0',
    });

    expect(result).toContain('type: workspace');
    expect(result).toContain('primary_repo: api');
    expect(result).toContain('- api');
    expect(result).toContain('- web');
    expect(result).toContain('ctxify_version: 0.7.0');
  });

  it('generates repo table', () => {
    const result = generateWorkspaceTemplate(repos, '/my-workspace', 'api');

    expect(result).toContain('| api | typescript | express |');
    expect(result).toContain('| web | typescript | react |');
  });

  it('uses workspace basename as title', () => {
    const result = generateWorkspaceTemplate(repos, '/home/user/my-workspace', 'api');
    expect(result).toContain('# my-workspace');
  });

  it('includes all standard sections', () => {
    const result = generateWorkspaceTemplate(repos, '/ws', 'api');
    expect(result).toContain('## Repos');
    expect(result).toContain('## Relationships');
    expect(result).toContain('## Commands');
    expect(result).toContain('## Workflows');
  });

  it('handles repos with missing language/framework', () => {
    const sparseRepos: RepoTemplateData[] = [
      {
        name: 'lib',
        path: 'lib',
        language: '',
        framework: '',
        keyDirs: [],
        entryPoints: [],
        dependencies: [],
        devDependencies: [],
        scripts: {},
      },
    ];
    const result = generateWorkspaceTemplate(sparseRepos, '/ws', 'lib');
    expect(result).toContain('| lib | -- | -- |');
  });
});
