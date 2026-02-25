import { describe, it, expect } from 'vitest';
import { heading, codeBlock, table, bulletList, yamlFrontmatter } from '../../src/utils/markdown.js';

describe('markdown utilities', () => {
  describe('heading', () => {
    it('should create an h1', () => {
      expect(heading(1, 'Title')).toBe('# Title');
    });

    it('should create an h2', () => {
      expect(heading(2, 'Subtitle')).toBe('## Subtitle');
    });

    it('should create an h3', () => {
      expect(heading(3, 'Section')).toBe('### Section');
    });

    it('should create an h6', () => {
      expect(heading(6, 'Deep')).toBe('###### Deep');
    });
  });

  describe('codeBlock', () => {
    it('should create a code block with language', () => {
      const result = codeBlock('const x = 1;', 'typescript');
      expect(result).toBe('```typescript\nconst x = 1;\n```');
    });

    it('should create a code block without language', () => {
      const result = codeBlock('hello world');
      expect(result).toBe('```\nhello world\n```');
    });

    it('should handle multi-line content', () => {
      const result = codeBlock('line1\nline2\nline3', 'js');
      expect(result).toBe('```js\nline1\nline2\nline3\n```');
    });
  });

  describe('table', () => {
    it('should create a markdown table', () => {
      const result = table(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']]);
      const lines = result.split('\n');

      expect(lines[0]).toBe('| Name | Age |');
      expect(lines[1]).toBe('| --- | --- |');
      expect(lines[2]).toBe('| Alice | 30 |');
      expect(lines[3]).toBe('| Bob | 25 |');
    });

    it('should handle single column', () => {
      const result = table(['Item'], [['apple'], ['banana']]);
      const lines = result.split('\n');

      expect(lines[0]).toBe('| Item |');
      expect(lines[1]).toBe('| --- |');
      expect(lines[2]).toBe('| apple |');
      expect(lines[3]).toBe('| banana |');
    });

    it('should handle empty rows', () => {
      const result = table(['Col'], []);
      const lines = result.split('\n');

      expect(lines[0]).toBe('| Col |');
      expect(lines[1]).toBe('| --- |');
      // No body rows, so just the header + separator
      expect(lines).toHaveLength(3); // header, separator, empty string from trailing split
    });
  });

  describe('bulletList', () => {
    it('should create a bullet list', () => {
      const result = bulletList(['first', 'second', 'third']);
      expect(result).toBe('- first\n- second\n- third');
    });

    it('should handle a single item', () => {
      const result = bulletList(['only']);
      expect(result).toBe('- only');
    });

    it('should handle empty list', () => {
      const result = bulletList([]);
      expect(result).toBe('');
    });
  });

  describe('yamlFrontmatter', () => {
    it('should create YAML frontmatter with string values', () => {
      const result = yamlFrontmatter({ title: 'My Doc', author: 'Jane' });
      expect(result).toBe('---\ntitle: My Doc\nauthor: Jane\n---');
    });

    it('should handle numeric and boolean values', () => {
      const result = yamlFrontmatter({ count: 42, draft: true });
      expect(result).toBe('---\ncount: 42\ndraft: true\n---');
    });

    it('should handle null and undefined values', () => {
      const result = yamlFrontmatter({ empty: null, missing: undefined });
      expect(result).toBe('---\nempty: \nmissing: \n---');
    });

    it('should handle array values', () => {
      const result = yamlFrontmatter({ tags: ['a', 'b', 'c'] });
      expect(result).toBe('---\ntags: [a, b, c]\n---');
    });

    it('should handle object values as JSON', () => {
      const result = yamlFrontmatter({ meta: { key: 'value' } });
      expect(result).toBe('---\nmeta: {"key":"value"}\n---');
    });
  });
});
