import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// スキルはエージェントのスキルの置き場から symlink で見せる。見せた先から動かしても、実体のリポジトリの design/dist を読む
test('symlink で見せたスキルから生成・検査・回答受領ができる', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'question-sheet-portable-'));
  try {
    const skill = join(dir, 'question-sheet');
    await symlink(fileURLToPath(new URL('../', import.meta.url)), skill, 'dir');
    const cli = join(skill, 'scripts/sheet.mjs');
    const run = (...args) => execFileSync(process.execPath, [cli, ...args], {
      cwd: dir, env: { PATH: process.env.PATH, ARCHIFY_SKILL_DIR: join(dir, 'not-installed') }, encoding: 'utf8',
    });
    assert.throws(() => run('render', join(skill, 'examples/explorer.json'), '--out', join(dir, 'missing.html')), /Archify が必要/);
    const { initialAnswer, responseFor } = await import(pathToFileURL(join(skill, 'scripts/model.mjs')));
    const { digestOf } = await import(pathToFileURL(join(skill, 'scripts/render.mjs')));
    const { startServer } = await import(pathToFileURL(join(skill, 'scripts/server.mjs')));
    for (const name of ['general', 'candidates', 'visual-demo']) {
      const input = join(skill, `examples/${name}.json`);
      const html = join(dir, `${name}.html`);
      run('render', input, '--out', html);
      const page = await readFile(html, 'utf8');
      assert.doesNotMatch(page, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
      assert.doesNotMatch(page, /@import\s|url\(\s*["']?(?:https?:)?\/\//i);
      const doc = JSON.parse(await readFile(input, 'utf8'));
      const answers = responseFor(doc, digestOf(doc), doc.questions.map(q => ({
        ...initialAnswer(q), ...(q.type === 'text' ? { text: '合成の回答です' } : {}), reviewed: true,
      })));
      const output = join(dir, `${name}.json`);
      await writeFile(output, JSON.stringify(answers));
      run('validate', input, '--answers', output);
      const received = join(dir, `${name}-received.json`);
      const running = await startServer(doc, received, { timeout: 10 });
      try {
        assert.equal((await fetch(running.url)).status, 200);
        const response = await fetch(`${running.url}/answers`, {
          method: 'POST', headers: { origin: running.origin, 'content-type': 'application/json' },
          body: JSON.stringify(answers),
        });
        assert.equal(response.status, 200);
        run('validate', input, '--answers', received);
      } finally { running.close(); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
