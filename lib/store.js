// JSON 文件存储层：内存缓存 + 每文件串行写队列 + 原子写（tmp→rename）+ 写前 .bak。
// 数据是人可读的本地 JSON，这也是二期 Codex 文件契约的底座。

import fs from 'node:fs';
import path from 'node:path';

export function createStore(baseDir = 'data') {
  const caches = new Map(); // name -> 数组
  const queues = new Map(); // name -> promise 链尾

  function fileOf(name) { return path.join(baseDir, `${name}.json`); }

  function ensure(name) {
    const file = fileOf(name);
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '[]', 'utf8');
      caches.set(name, []);
    } else if (!caches.has(name)) {
      const raw = fs.readFileSync(file, 'utf8');
      // 主文件损坏时尝试 .bak 恢复，都不行则明确报错（不静默清空用户数据）
      try {
        caches.set(name, JSON.parse(raw));
      } catch {
        const bak = `${file}.bak`;
        if (fs.existsSync(bak)) {
          caches.set(name, JSON.parse(fs.readFileSync(bak, 'utf8')));
          console.warn(`[store] ${name}.json 损坏，已从 .bak 恢复`);
        } else {
          throw new Error(`数据文件损坏且无备份：${file}`);
        }
      }
    }
    return file;
  }

  function read(name) {
    ensure(name);
    return structuredClone(caches.get(name));
  }

  function save(name, nextData) {
    ensure(name);
    const snapshot = structuredClone(nextData);
    caches.set(name, structuredClone(nextData));
    // 串行写：同名文件的写操作排队执行，避免交错损坏
    const prev = queues.get(name) ?? Promise.resolve();
    const job = prev.catch(() => {}).then(() => writeAtomic(fileOf(name), snapshot));
    queues.set(name, job);
    return job;
  }

  async function writeAtomic(file, data) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(tmp, file);
  }

  return { read, save, baseDir };
}
