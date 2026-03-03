import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assembleFromRawDir,
  extractEvalKey,
  extractCodeBlocks,
  keyToFilenameStem,
} from '../../eval/assembly.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-assembly-'));
}

function makeJsonlTranscript(messages: { role: string; content: unknown }[]): string {
  return messages.map((m) => JSON.stringify(m)).join('\n');
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('extractEvalKey', () => {
  it('extracts key from eval-key marker', () => {
    const text = '<!-- eval-key: trpc-add-bun-adapter:baseline:0 -->\n\nSome content';
    expect(extractEvalKey(text)).toBe('trpc-add-bun-adapter:baseline:0');
  });

  it('returns null when no marker present', () => {
    expect(extractEvalKey('just some text')).toBeNull();
  });

  it('extracts key with special characters', () => {
    const text = '<!-- eval-key: my-task:with-context:2 -->';
    expect(extractEvalKey(text)).toBe('my-task:with-context:2');
  });
});

describe('keyToFilenameStem', () => {
  it('replaces colons with underscores', () => {
    expect(keyToFilenameStem('task-a:baseline:0')).toBe('task-a_baseline_0');
  });

  it('handles keys without colons', () => {
    expect(keyToFilenameStem('simple')).toBe('simple');
  });
});

describe('extractCodeBlocks', () => {
  it('extracts single code block', () => {
    const text = 'Some explanation\n\n```typescript\nconst x = 1;\n```\n\nMore text';
    expect(extractCodeBlocks(text)).toBe('const x = 1;');
  });

  it('extracts multiple code blocks joined with double newline', () => {
    const text = '```ts\nconst a = 1;\n```\n\nMiddle\n\n```ts\nconst b = 2;\n```';
    expect(extractCodeBlocks(text)).toBe('const a = 1;\n\nconst b = 2;');
  });

  it('falls back to last 5000 chars when no code blocks', () => {
    const text = 'No code blocks here, just plain text explaining things.';
    expect(extractCodeBlocks(text)).toBe(text);
  });

  it('falls back for text longer than 5000 chars', () => {
    const text = 'x'.repeat(6000);
    expect(extractCodeBlocks(text)).toBe('x'.repeat(5000));
  });

  it('skips empty code blocks', () => {
    const text = '```ts\n\n```\n\n```ts\nconst a = 1;\n```';
    expect(extractCodeBlocks(text)).toBe('const a = 1;');
  });
});

describe('assembleFromRawDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const keys = ['task-a:baseline:0', 'task-a:with-context:0', 'task-b:baseline:0'];

  it('assembles plain text files with eval-key markers', () => {
    for (const key of keys) {
      writeFileSync(
        join(tmpDir, `${keyToFilenameStem(key)}.txt`),
        `<!-- eval-key: ${key} -->\n\nHere is the code:\n\n\`\`\`ts\nconst x = "${key}";\n\`\`\`\n`,
      );
    }

    const result = assembleFromRawDir(tmpDir, keys, { extractCode: true });
    expect(result.found).toBe(3);
    expect(result.missing).toEqual([]);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].key).toBe('task-a:baseline:0');
    expect(result.items[0].output).toContain('const x =');
  });

  it('assembles JSONL transcripts', () => {
    const transcript = makeJsonlTranscript([
      { role: 'user', content: '<!-- eval-key: task-a:baseline:0 -->\n\nDo the task' },
      { role: 'assistant', content: 'Here is my answer:\n\n```ts\nconst result = 42;\n```' },
    ]);

    writeFileSync(join(tmpDir, 'transcript.jsonl'), transcript);

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: true });
    expect(result.found).toBe(1);
    expect(result.items[0].key).toBe('task-a:baseline:0');
    expect(result.items[0].output).toBe('const result = 42;');
  });

  it('extracts last assistant message from JSONL', () => {
    const transcript = makeJsonlTranscript([
      { role: 'user', content: '<!-- eval-key: task-a:baseline:0 -->\n\nDo the task' },
      { role: 'assistant', content: 'First attempt' },
      { role: 'user', content: 'Try again' },
      { role: 'assistant', content: '```ts\nfinal answer\n```' },
    ]);

    writeFileSync(join(tmpDir, 'file.jsonl'), transcript);

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: true });
    expect(result.items[0].output).toBe('final answer');
  });

  it('handles JSONL with content array format', () => {
    const transcript = makeJsonlTranscript([
      { role: 'user', content: '<!-- eval-key: task-a:baseline:0 -->' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '```ts\narray format\n```' }],
      },
    ]);

    writeFileSync(join(tmpDir, 'file.jsonl'), transcript);

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: true });
    expect(result.items[0].output).toBe('array format');
  });

  it('falls back to filename matching when no eval-key marker', () => {
    writeFileSync(join(tmpDir, 'task-a_baseline_0.txt'), '```ts\nno marker code\n```');

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: true });
    expect(result.found).toBe(1);
    expect(result.items[0].key).toBe('task-a:baseline:0');
    expect(result.items[0].output).toBe('no marker code');
  });

  it('reports missing keys', () => {
    writeFileSync(
      join(tmpDir, 'file.txt'),
      '<!-- eval-key: task-a:baseline:0 -->\n\n```ts\ncode\n```',
    );

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0', 'task-b:baseline:0'], {
      extractCode: true,
    });
    expect(result.found).toBe(1);
    expect(result.missing).toEqual(['task-b:baseline:0']);
  });

  it('returns all missing when rawDir does not exist', () => {
    const result = assembleFromRawDir('/nonexistent/path', keys, { extractCode: false });
    expect(result.found).toBe(0);
    expect(result.missing).toEqual(keys);
    expect(result.items).toEqual([]);
  });

  it('skips empty files', () => {
    writeFileSync(join(tmpDir, 'empty.txt'), '');
    writeFileSync(join(tmpDir, 'whitespace.txt'), '  \n  \n  ');

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: false });
    expect(result.found).toBe(0);
    expect(result.missing).toEqual(['task-a:baseline:0']);
  });

  it('skips dotfiles', () => {
    writeFileSync(join(tmpDir, '.hidden'), '<!-- eval-key: task-a:baseline:0 -->\ncontent');

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: false });
    expect(result.found).toBe(0);
  });

  it('preserves expected key order in items', () => {
    const orderedKeys = ['z-task:baseline:0', 'a-task:baseline:0', 'm-task:baseline:0'];
    for (const key of orderedKeys) {
      writeFileSync(
        join(tmpDir, `${keyToFilenameStem(key)}.txt`),
        `<!-- eval-key: ${key} -->\ncontent`,
      );
    }

    const result = assembleFromRawDir(tmpDir, orderedKeys, { extractCode: false });
    expect(result.items.map((i) => i.key)).toEqual(orderedKeys);
  });

  it('does not extract code when extractCode is false', () => {
    writeFileSync(
      join(tmpDir, 'file.txt'),
      '<!-- eval-key: task-a:baseline:0 -->\n\nSome prose\n\n```ts\ncode here\n```\n\nMore prose',
    );

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: false });
    expect(result.items[0].output).toContain('Some prose');
    expect(result.items[0].output).toContain('```');
    expect(result.items[0].output).toContain('More prose');
  });

  it('handles malformed JSONL lines gracefully', () => {
    const content = [
      '{"role": "user", "content": "<!-- eval-key: task-a:baseline:0 -->"}',
      'this is not json',
      '{"role": "assistant", "content": "```ts\\nresult\\n```"}',
    ].join('\n');

    writeFileSync(join(tmpDir, 'messy.jsonl'), content);

    const result = assembleFromRawDir(tmpDir, ['task-a:baseline:0'], { extractCode: true });
    expect(result.found).toBe(1);
    expect(result.items[0].output).toBe('result');
  });
});
