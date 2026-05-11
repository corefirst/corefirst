import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Route handler integration tests — focused on input validation at the route
// boundary, specifically the slug regex guard that prevents `..` segments from
// escaping the per-user packages directory and unlinking arbitrary files.

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corefirst-routes-'));
  process.env.COREFIRST_DATA_DIR = tmpDir;
});

afterEach(async () => {
  const { closeAllProviders } = await import('@/src/lib/storage/pouch-provider');
  await closeAllProviders();
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

async function freshRoute() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('@/app/api/courses/[slug]/route');
}

function mockRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function params(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

const TRAVERSAL_SLUGS = [
  '../foo',
  '../../etc/passwd',
  'foo/bar',
  'foo..bar',
  'foo%2F..%2Fbar',
  'foo\\bar',
  '.foo',
  'FOO',         // upper case not allowed by asciiSlug
  'foo_bar',     // underscore not allowed
  'foo bar',     // whitespace not allowed
  '',
];

const VALID_SLUGS = [
  'it-english-adult-meeting',
  'a',
  'a-b-c-d-e-f-1234',
];

describe('courses/[slug] route slug validation', () => {
  it('GET rejects path-traversal slugs with 400', async () => {
    const route = await freshRoute();
    for (const slug of TRAVERSAL_SLUGS) {
      const res = await route.GET(mockRequest('http://localhost/api/courses/x'), params(slug));
      expect(res.status, `slug=${JSON.stringify(slug)} should be 400`).toBe(400);
    }
  });

  it('DELETE rejects path-traversal slugs with 400 (does not unlink anything)', async () => {
    const route = await freshRoute();
    // Plant a sentinel file outside the per-user packages directory that a
    // successful traversal would unlink.
    const sentinelDir = path.join(tmpDir, 'sentinel-dir');
    await fs.mkdir(sentinelDir, { recursive: true });
    const sentinel = path.join(sentinelDir, 'precious.json');
    await fs.writeFile(sentinel, '{}');

    for (const slug of TRAVERSAL_SLUGS) {
      const res = await route.DELETE(
        mockRequest('http://localhost/api/courses/x', { method: 'DELETE' }),
        params(slug),
      );
      expect(res.status, `slug=${JSON.stringify(slug)} should be 400`).toBe(400);
    }

    // Sentinel must still exist.
    await expect(fs.access(sentinel)).resolves.toBeUndefined();
  });

  it('PATCH rejects path-traversal slugs with 400', async () => {
    const route = await freshRoute();
    for (const slug of TRAVERSAL_SLUGS) {
      const res = await route.PATCH(
        mockRequest('http://localhost/api/courses/x', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: 'New' }),
        }),
        params(slug),
      );
      expect(res.status, `slug=${JSON.stringify(slug)} should be 400`).toBe(400);
    }
  });

  it('accepts well-formed slugs (does not 400 on shape)', async () => {
    const route = await freshRoute();
    for (const slug of VALID_SLUGS) {
      // Well-formed slug with no actual package on disk → 404, not 400.
      // The point is that the validation regex doesn't false-positive.
      const res = await route.GET(mockRequest('http://localhost/api/courses/x'), params(slug));
      expect(res.status, `slug=${JSON.stringify(slug)} should not be 400`).not.toBe(400);
    }
  });
});
