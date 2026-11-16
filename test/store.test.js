import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store.js';

test('JSON 往返：写入后重启（新实例）仍能读到', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-test-'));
  const s1 = createStore(dir);
  s1.save('clothes', [{ id: 'c-1', no: 1, name: '白衬衫' }]);
  // 写队列是异步的，等一拍
  await new Promise((r) => setTimeout(r, 50));

  const s2 = createStore(dir); // 模拟服务重启
  const data = s2.read('clothes');
  assert.equal(data.length, 1);
  assert.equal(data[0].name, '白衬衫');

  // 人可读（缩进 JSON，Codex 文件契约友好）
  const raw = fs.readFileSync(path.join(dir, 'clothes.json'), 'utf8');
  assert.ok(raw.includes('\n  '));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('写前留 .bak 备份', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-test-'));
  const s = createStore(dir);
  s.save('clothes', [{ id: 'c-1' }]);
  await new Promise((r) => setTimeout(r, 50));
  s.save('clothes', [{ id: 'c-1' }, { id: 'c-2' }]);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(fs.existsSync(path.join(dir, 'clothes.json.bak')));
  const bak = JSON.parse(fs.readFileSync(path.join(dir, 'clothes.json.bak'), 'utf8'));
  assert.equal(bak.length, 1); // bak 是上一版
  fs.rmSync(dir, { recursive: true, force: true });
});

test('主文件损坏时从 .bak 恢复（上一版好数据）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-test-'));
  const s = createStore(dir);
  s.save('clothes', [{ id: 'c-1' }]);
  await new Promise((r) => setTimeout(r, 50));
  s.save('clothes', [{ id: 'c-1' }, { id: 'c-2' }]);
  await new Promise((r) => setTimeout(r, 50));
  // 手工改坏主文件
  fs.writeFileSync(path.join(dir, 'clothes.json'), '{broken', 'utf8');
  const s2 = createStore(dir);
  const data = s2.read('clothes');
  assert.equal(data.length, 1); // 恢复的是最近一次写之前的那版（.bak 语义）
  assert.equal(data[0].id, 'c-1');
  fs.rmSync(dir, { recursive: true, force: true });
});
