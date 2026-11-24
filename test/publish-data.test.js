import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const SCRIPT = resolve('scripts/publish-data.sh');

test('publish-data.sh: cartella che non è un worktree del branch data → esce con errore senza toccare il repository', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'pub-'));
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'base');
  const head = git('rev-parse', 'HEAD');
  await mkdir(join(repo, 'data'));
  await writeFile(join(repo, 'data', 'premium.json'), '{}');
  const r = spawnSync('bash', [SCRIPT, './data', 'premium.json'], { cwd: repo, encoding: 'utf8', timeout: 5000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /worktree/);
  assert.equal(git('rev-parse', 'HEAD'), head);
});
