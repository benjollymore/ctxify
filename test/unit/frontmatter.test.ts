import { describe, it, expect } from 'vitest';
import { replaceFrontmatter } from '../../src/utils/frontmatter.js';

describe('replaceFrontmatter', () => {
  it('replaces existing frontmatter while preserving body', () => {
    const content = `---
repo: myrepo
type: overview
language: javascript
---

# myrepo

Some agent-written content here.`;

    const result = replaceFrontmatter(content, {
      repo: 'myrepo',
      type: 'overview',
      language: 'typescript',
      framework: 'express',
    });

    expect(result).toContain('language: typescript');
    expect(result).toContain('framework: express');
    expect(result).toContain('# myrepo');
    expect(result).toContain('Some agent-written content here.');
    expect(result).not.toContain('language: javascript');
  });

  it('adds frontmatter to file without one', () => {
    const content = '# No frontmatter\n\nJust a body.';
    const result = replaceFrontmatter(content, { type: 'overview', repo: 'test' });

    expect(result).toMatch(/^---\n/);
    expect(result).toContain('type: overview');
    expect(result).toContain('repo: test');
    expect(result).toContain('# No frontmatter');
    expect(result).toContain('Just a body.');
  });

  it('handles empty content', () => {
    const result = replaceFrontmatter('', { type: 'index' });

    expect(result).toMatch(/^---\n/);
    expect(result).toContain('type: index');
  });

  it('preserves content immediately after closing ---', () => {
    const content = `---
old: data
---
# Title`;

    const result = replaceFrontmatter(content, { new: 'data' });

    expect(result).toContain('new: data');
    expect(result).toContain('\n# Title');
    expect(result).not.toContain('old: data');
  });
});
