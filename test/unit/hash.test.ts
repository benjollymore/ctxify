import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashString, hashFile } from '../../src/utils/hash.js';

describe('hash utilities', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-hash-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hashString', () => {
    it('should return consistent SHA-256 hex for the same input', () => {
      const hash1 = hashString('hello world');
      const hash2 = hashString('hello world');

      expect(hash1).toBe(hash2);
    });

    it('should return a 64-character hex string', () => {
      const hash = hashString('test');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = hashString('input-a');
      const hash2 = hashString('input-b');

      expect(hash1).not.toBe(hash2);
    });

    it('should match known SHA-256 hash', () => {
      // SHA-256 of empty string
      const hash = hashString('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('hashFile', () => {
    it('should hash a temp file correctly', () => {
      const filePath = join(tmpDir, 'test.txt');
      writeFileSync(filePath, 'file content here', 'utf-8');

      const hash = hashFile(filePath);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return consistent hash for same file content', () => {
      const filePath = join(tmpDir, 'consistent.txt');
      writeFileSync(filePath, 'same content', 'utf-8');

      const hash1 = hashFile(filePath);
      const hash2 = hashFile(filePath);

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different file contents', () => {
      const file1 = join(tmpDir, 'file1.txt');
      const file2 = join(tmpDir, 'file2.txt');
      writeFileSync(file1, 'content A', 'utf-8');
      writeFileSync(file2, 'content B', 'utf-8');

      const hash1 = hashFile(file1);
      const hash2 = hashFile(file2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash as hashString for text files', () => {
      const content = 'hello from file';
      const filePath = join(tmpDir, 'match.txt');
      writeFileSync(filePath, content, 'utf-8');

      const fileHash = hashFile(filePath);
      const stringHash = hashString(content);

      expect(fileHash).toBe(stringHash);
    });
  });
});
