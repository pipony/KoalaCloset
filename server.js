// 小迪的衣橱 · 第一期（纯本地，零依赖）
// 启动：node server.js  →  http://localhost:4173

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRouter } from './lib/router.js';
import { createStore } from './lib/store.js';
import { createImages, parseDataUrl } from './lib/images.js';
import { parseQuery } from './lib/nlparse.js';
import { filterClothes, filterOutfits } from './lib/filter.js';
import { findDuplicates, matchableOutfits } from './lib/buycheck.js';
import { makeTaskContext, buildOutputSchema, buildTaskPrompt, validateAiResult } from './lib/aitask.js';
import {
  validateClothes, validateOutfit, validateAvoid, publicVocab, TEMP_BANDS, SCENES, TEMP_THICKNESS,
} from './lib/vocab.js';

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.resolve('public');
const DATA_DIR = path.resolve('data');

const store = createStore('data');
const images = createImages('data/images');

// ---------- 工具 ----------

function shortId() { return crypto.randomBytes(4).toString('hex'); }
function now() { return new Date().toISOString(); }

function sendJson(res, status, obj) {
  if (status === 204) { res.writeHead(204); return res.end(); }
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limitMB = 30) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitMB * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveFile(res, absPath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return false;
  const ext = path.extname(absPath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(absPath).pipe(res);
  return true;
}

// ---------- 业务处理 ----------

// 把请求体里的 b64 图片落盘，返回可存的记录字段
function materializeImages(id, body, old = {}) {
  const out = {};
  for (const [key, kind] of [['productImageB64', 'product'], ['fitImageB64', 'fit'], ['sizeChartImageB64', 'chart']]) {
    const field = kind === 'product' ? 'productImage' : kind === 'fit' ? 'fitImage' : 'sizeChartImage';
    if (body[key] === '') { // 空串 = 明确清除该图
      if (old[field]) images.remove([old[field]]);
      out[field] = null;
    } else if (body[key]) {
      const rel = images.save(body[key], id, kind);
      // 同名覆盖时（新图路径 == 旧图路径）不能删——删的就是刚写入的文件
      if (old[field] && old[field] !== rel) images.remove([old[field]]);
      out[field] = rel;
    }
  }
  return out;
}

function clothesRefs(id) {
  const outfits = store.read('outfits').filter((o) => o.itemIds.includes(id));
  const avoids = store.read('avoidlist').filter((a) => (a.itemIds || []).includes(id));
  return { outfits, avoids };
}

const api = createRouter();

// --- 词表与解析 ---
api.get('/api/vocab', (req, res) => sendJson(res, 200, publicVocab()));

api.post('/api/parse', async (req, res, { body }) => {
  const { cond, unknown } = parseQuery(body.text);
  sendJson(res, 200, { cond, unknown });
});

// --- 衣服 ---
api.get('/api/clothes', (req, res, { query }) => {
  let cond = null;
  if (query.cond) {
    try { cond = JSON.parse(query.cond); } catch { return sendJson(res, 400, { error: 'cond 不是合法 JSON' }); }
  }
  // 衣柜件按编号升序在前；待买件 no 为 null，按录入时间附后
  let list = store.read('clothes').sort(
    (a, b) => (a.no ?? Infinity) - (b.no ?? Infinity)
      || (a.no == null ? a.createdAt.localeCompare(b.createdAt) : 0),
  );
  if (cond) list = filterClothes(list, cond);
  sendJson(res, 200, list);
});

api.get('/api/clothes/:id', (req, res, { params }) => {
  const item = store.read('clothes').find((c) => c.id === params.id);
  if (!item) return sendJson(res, 404, { error: '衣服不存在' });
  sendJson(res, 200, item);
});

api.post('/api/clothes', async (req, res, { body }) => {
  if (!body.productImageB64) return sendJson(res, 400, { error: '商品图必传（封面）' });
  const isWish = body.status === '待买';
  if (isWish && body.isBaseline) return sendJson(res, 400, { error: '待买件不能标基准款，转正式档案后再标' });
  const item = {
    id: `c-${shortId()}`,
    no: isWish ? null : nextNo(), // 待买不占衣柜编号，转正时再分
    name: String(body.name || '').trim(),
    brand: body.brand ? String(body.brand).trim() : null,
    category: body.category, sub: body.sub,
    status: isWish ? '待买' : '在衣柜',
    color: body.color ?? null, pattern: body.pattern ?? null, thickness: body.thickness ?? null,
    fit: body.fit ?? null, length: body.length ?? null, neckline: body.neckline ?? null,
    fabric: body.fabric ?? null, elastic: body.elastic ?? null, styles: body.styles ?? [],
    productImage: null, fitImage: null, sizeChartImage: null,
    sizeChart: body.sizeChart ?? [], boughtSize: body.boughtSize || null,
    fitFeedback: body.fitFeedback || null,
    isBaseline: !!body.isBaseline,
    createdAt: now(), updatedAt: now(),
  };
  const v = validateClothes(item);
  if (!v.ok) return sendJson(res, 400, { error: v.errors.join('；') });
  if (item.isBaseline && baselineCount() >= 3) {
    return sendJson(res, 400, { error: '基准款最多 3 件，先取消现有基准款再标' });
  }
  try { Object.assign(item, materializeImages(item.id, body)); } catch (e) { return sendJson(res, 400, { error: e.message }); }
  const list = store.read('clothes');
  list.push(item);
  await store.save('clothes', list);
  sendJson(res, 201, item);
});

api.put('/api/clothes/:id', async (req, res, { params, body }) => {
  const list = store.read('clothes');
  const idx = list.findIndex((c) => c.id === params.id);
  if (idx === -1) return sendJson(res, 404, { error: '衣服不存在' });
  const old = list[idx];
  if (body.updatedAt && body.updatedAt !== old.updatedAt) {
    return sendJson(res, 409, { error: '这条档案在别处被改过（两处同时编辑），请刷新后重试' });
  }
  const item = {
    ...old,
    name: body.name !== undefined ? String(body.name).trim() : old.name,
    brand: body.brand !== undefined ? (body.brand ? String(body.brand).trim() : null) : old.brand,
    category: body.category ?? old.category, sub: body.sub ?? old.sub,
    color: body.color ?? old.color, pattern: body.pattern ?? old.pattern,
    thickness: body.thickness ?? old.thickness, fit: body.fit ?? old.fit,
    length: body.length ?? old.length, neckline: body.neckline ?? old.neckline,
    fabric: body.fabric ?? old.fabric, elastic: body.elastic ?? old.elastic,
    styles: body.styles ?? old.styles,
    sizeChart: body.sizeChart ?? old.sizeChart,
    boughtSize: body.boughtSize !== undefined ? (body.boughtSize || null) : old.boughtSize,
    fitFeedback: body.fitFeedback !== undefined ? (body.fitFeedback || null) : old.fitFeedback,
    isBaseline: body.isBaseline !== undefined ? !!body.isBaseline : old.isBaseline,
    updatedAt: now(),
  };
  const v = validateClothes(item);
  if (!v.ok) return sendJson(res, 400, { error: v.errors.join('；') });
  if (item.isBaseline && !old.isBaseline && baselineCount() >= 3) {
    return sendJson(res, 400, { error: '基准款最多 3 件，先取消现有基准款再标' });
  }
  try { Object.assign(item, materializeImages(item.id, body, old)); } catch (e) { return sendJson(res, 400, { error: e.message }); }
  list[idx] = item;
  await store.save('clothes', list);
  sendJson(res, 200, item);
});

api.delete('/api/clothes/:id', async (req, res, { params }) => {
  const list = store.read('clothes');
  const idx = list.findIndex((c) => c.id === params.id);
  if (idx === -1) return sendJson(res, 404, { error: '衣服不存在' });
  const refs = clothesRefs(params.id);
  if (refs.outfits.length || refs.avoids.length) {
    return sendJson(res, 409, {
      error: `这件衣服被 ${refs.outfits.length} 个套搭、${refs.avoids.length} 条避雷记录引用，先处理引用再删除`,
      refs: { outfits: refs.outfits.map((o) => o.title), avoids: refs.avoids.map((a) => a.comment || a.reasons.join('/')) },
    });
  }
  const [removed] = list.splice(idx, 1);
  await store.save('clothes', list);
  images.remove([removed.productImage, removed.fitImage, removed.sizeChartImage].filter(Boolean));
  // AI 比对件被丢掉 → 任务文件夹（原始截图）一起清，不留垃圾
  if (removed.aiTaskId) {
    const tdir = taskDirOf(removed.aiTaskId);
    if (tdir && tdir.startsWith(TASKS_DIR)) fs.rmSync(tdir, { recursive: true, force: true });
  }
  sendJson(res, 204, {});
});

// 待买 → 正式档案：分到下一个衣柜编号（单向操作，无编辑冲突语义）
api.post('/api/clothes/:id/promote', async (req, res, { params }) => {
  const list = store.read('clothes');
  const item = list.find((c) => c.id === params.id);
  if (!item) return sendJson(res, 404, { error: '衣服不存在' });
  if (item.status !== '待买') return sendJson(res, 400, { error: '这件已在衣柜里，不用转' });
  // 转正按「在衣柜」口径严校验：AI 比对卡的缺口（厚薄/长度等）要在此前补齐
  const strict = validateClothes({ ...item, status: '在衣柜' });
  if (!strict.ok) {
    return sendJson(res, 400, { error: `转正前先去「编辑档案」补齐：${strict.errors.join('；')}` });
  }
  item.status = '在衣柜';
  item.no = nextNo();
  item.updatedAt = now();
  await store.save('clothes', list);
  sendJson(res, 200, item);
});

// 买前对照台数据：查重 + 可配套数（只读，一次拿全）
api.get('/api/clothes/:id/precheck', (req, res, { params }) => {
  const clothes = store.read('clothes');
  const item = clothes.find((c) => c.id === params.id);
  if (!item) return sendJson(res, 404, { error: '衣服不存在' });
  const owned = clothes.filter((c) => c.id !== item.id && (c.status || '在衣柜') === '在衣柜');
  const byId = new Map(clothes.map((c) => [c.id, c]));
  sendJson(res, 200, {
    item,
    duplicates: findDuplicates(item, owned),
    outfits: matchableOutfits(item, store.read('outfits'), byId, TEMP_THICKNESS),
  });
});

// --- 买前 AI 比对（Codex 文件契约 · 按钮直调） ---
// 任务文件夹 data/ai-tasks/<taskId>/：images/ 截图 + context.md 衣柜文字卡 + schema.json + result.json
const TASKS_DIR = path.join(DATA_DIR, 'ai-tasks');
const runningTasks = new Set(); // 防双击并发跑同一个任务

function taskDirOf(taskId) {
  if (!/^t-[\w-]+$/.test(taskId)) return null; // 防路径穿越
  return path.join(TASKS_DIR, taskId);
}
function readMeta(taskId) {
  const dir = taskDirOf(taskId);
  if (!dir || !fs.existsSync(path.join(dir, 'meta.json'))) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { return null; }
}
function writeMeta(taskId, meta) {
  fs.writeFileSync(path.join(taskDirOf(taskId), 'meta.json'), JSON.stringify(meta, null, 2));
}

// 上传截图（1~8 张）→ 建任务：截图落任务文件夹（给 codex -i 附图），首图另存进 data/images 做档案封面
api.post('/api/precheck-tasks', async (req, res, { body }) => {
  const shots = Array.isArray(body.images) ? body.images : [];
  if (shots.length < 1 || shots.length > 8) return sendJson(res, 400, { error: '截图传 1~8 张' });
  const taskId = `t-${shortId()}`;
  const dir = path.join(TASKS_DIR, taskId, 'images');
  fs.mkdirSync(dir, { recursive: true });
  const shotFiles = []; // 带扩展名的文件名（01.png…），run 时拼 -i 绝对路径
  let productImage = null;
  try {
    shots.forEach((dataUrl, i) => {
      const { buf, ext } = parseDataUrl(dataUrl);
      const fname = `${String(i + 1).padStart(2, '0')}.${ext}`;
      fs.writeFileSync(path.join(dir, fname), buf);
      shotFiles.push(fname);
    });
    productImage = images.save(shots[0], taskId, 'shot'); // 档案封面（/images/... 可直出）
  } catch (e) {
    fs.rmSync(path.join(TASKS_DIR, taskId), { recursive: true, force: true });
    return sendJson(res, 400, { error: e.message });
  }
  writeMeta(taskId, { taskId, status: 'ready', createdAt: now(), imageCount: shots.length, shotFiles, productImage });
  sendJson(res, 201, { taskId, imageCount: shots.length });
});

// 跑 codex → 读回结果 → 校验 → 建待买档案。联网操作，仅由用户点按钮触发。
api.post('/api/precheck-tasks/:id/run', async (req, res, { params }) => {
  const dir = taskDirOf(params.id);
  const meta = readMeta(params.id);
  if (!dir || !meta) return sendJson(res, 404, { error: '比对任务不存在' });
  if (meta.status === 'done') return sendJson(res, 400, { error: '这个任务已经比完（要重比：丢掉那件待买档案再传一次截图）' });
  if (runningTasks.has(params.id)) return sendJson(res, 409, { error: '这个任务正在跑，稍等' });
  runningTasks.add(params.id);
  try {
    // 每次跑都重新生成上下文（衣柜可能变了）；词表外值由 schema enum + validateAiResult 双重把关
    const context = makeTaskContext(store.read('clothes'));
    fs.writeFileSync(path.join(dir, 'context.md'), context);
    fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(buildOutputSchema(), null, 2));
    const imgArgs = (meta.shotFiles || []).flatMap((f) => ['-i', path.join(dir, 'images', f)]);

    // spawn 细节两条命脉：
    // 1) 监听 exit 而非 close——codex 的沙箱子进程可能攥着 stdio 管道不松，
    //    execFile 的回调（等 close）会一直挂到超时；进程退出即可继续。
    // 2) stdin 必须 ignore：codex exec 见非 tty 的 stdin 会一直等输入。
    await new Promise((resolve, reject) => {
      const child = spawn('codex', [
        'exec', '--skip-git-repo-check', '--sandbox', 'workspace-write',
        ...imgArgs,
        '--output-schema', 'schema.json', '-o', 'result.json',
        '-c', 'model_reasoning_effort="low"',
        buildTaskPrompt(),
      ], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], env: process.env });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
      const killer = setTimeout(() => child.kill('SIGKILL'), 420_000);
      child.on('error', (err) => {
        clearTimeout(killer);
        if (err.code === 'ENOENT') return reject(new Error('codex CLI 未安装（npm i -g @openai/codex）'));
        reject(new Error(`AI 比对失败：${err.message}`));
      });
      child.on('exit', (code, signal) => {
        clearTimeout(killer);
        if (signal === 'SIGKILL' || signal === 'SIGTERM') return reject(new Error('AI 比对超时（7 分钟），稍后再试'));
        if (code !== 0) {
          const tail = stderr.slice(-300);
          if (/not logged in|auth/i.test(tail)) return reject(new Error('Codex 未登录：终端跑一次 codex login'));
          return reject(new Error(`AI 比对失败：${tail || `退出码 ${code}`}`));
        }
        resolve();
      });
    });

    const resultPath = path.join(dir, 'result.json');
    if (!fs.existsSync(resultPath)) return sendJson(res, 502, { error: 'AI 没有写出结果文件，稍后再试' });
    let raw;
    try { raw = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch { return sendJson(res, 502, { error: 'AI 结果不是合法 JSON，稍后再试' }); }

    const v = validateAiResult(raw);
    const item = {
      id: `c-${shortId()}`,
      no: null,
      name: v.card.name, brand: v.card.brand,
      category: v.card.category || '上装', sub: v.card.sub || '短袖', // 大类缺失的兜底（issues 里已记）
      status: '待买',
      color: v.card.color, pattern: v.card.pattern, thickness: v.card.thickness,
      fit: v.card.fit, length: v.card.length, neckline: v.card.neckline,
      fabric: v.card.fabric, elastic: v.card.elastic, styles: v.card.styles,
      productImage: meta.productImage, fitImage: null, sizeChartImage: null,
      sizeChart: v.sizeChart, boughtSize: null, fitFeedback: null,
      isBaseline: false,
      aiConclusion: v.conclusion, aiIssues: v.issues, aiTaskId: params.id,
      createdAt: now(), updatedAt: now(),
    };
    const check = validateClothes(item);
    if (!check.ok) return sendJson(res, 502, { error: `AI 结果没过校验：${check.errors.join('；')}` });
    const list = store.read('clothes');
    list.push(item);
    await store.save('clothes', list);
    writeMeta(params.id, { ...meta, status: 'done', clothId: item.id, finishedAt: now() });
    sendJson(res, 201, { cloth: item, issues: v.issues });
  } finally {
    runningTasks.delete(params.id);
  }
});

function nextNo() {
  const list = store.read('clothes');
  return list.reduce((m, c) => Math.max(m, c.no || 0), 0) + 1;
}
function baselineCount() {
  return store.read('clothes').filter((c) => c.isBaseline).length;
}

// --- 套搭 ---
api.get('/api/outfits', (req, res, { query }) => {
  const list = filterOutfits(store.read('outfits'), { tempBand: query.tempBand, scene: query.scene })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const clothes = new Map(store.read('clothes').map((c) => [c.id, c]));
  const enriched = list.map((o) => ({
    ...o,
    items: (o.itemIds || []).map((id) => clothes.get(id)).filter(Boolean),
  }));
  sendJson(res, 200, enriched);
});

api.post('/api/outfits', async (req, res, { body }) => {
  const outfit = {
    id: `o-${shortId()}`,
    title: String(body.title || '').trim(),
    itemIds: body.itemIds || [],
    tempBand: body.tempBand || null, scenes: body.scenes || [],
    note: body.note || null,
    images: [],
    createdAt: now(),
    updatedAt: now(),
  };
  const v = validateOutfit(outfit);
  if (!v.ok) return sendJson(res, 400, { error: v.errors.join('；') });
  const clothes = store.read('clothes');
  const items = outfit.itemIds.map((id) => clothes.find((c) => c.id === id)).filter(Boolean);
  if (items.length !== outfit.itemIds.length) return sendJson(res, 400, { error: '套搭里有不存在的衣服' });
  const cats = new Set(items.map((i) => i.category));
  const warning = cats.has('上装') && cats.has('下装') ? null : '提醒：这套没有同时包含上装和下装';
  const list = store.read('outfits');
  list.push(outfit);
  await store.save('outfits', list);
  sendJson(res, 201, { ...outfit, items, warning });
});

api.get('/api/outfits/:id', (req, res, { params }) => {
  const o = store.read('outfits').find((x) => x.id === params.id);
  if (!o) return sendJson(res, 404, { error: '套搭不存在' });
  const clothes = new Map(store.read('clothes').map((c) => [c.id, c]));
  sendJson(res, 200, { ...o, items: (o.itemIds || []).map((id) => clothes.get(id)).filter(Boolean) });
});

// 编辑套搭（标题/温度带/场景/备注；updatedAt 乐观锁可选）
api.put('/api/outfits/:id', async (req, res, { params, body }) => {
  const list = store.read('outfits');
  const idx = list.findIndex((x) => x.id === params.id);
  if (idx === -1) return sendJson(res, 404, { error: '套搭不存在' });
  const old = list[idx];
  if (body.updatedAt && body.updatedAt !== old.updatedAt) {
    return sendJson(res, 409, { error: '这套搭在别处被改过，请刷新后重试' });
  }
  const next = {
    ...old,
    title: body.title !== undefined ? String(body.title).trim() : old.title,
    tempBand: body.tempBand !== undefined ? body.tempBand : old.tempBand,
    scenes: body.scenes !== undefined ? body.scenes : old.scenes,
    note: body.note !== undefined ? (body.note || null) : old.note,
    updatedAt: now(),
  };
  const v = validateOutfit(next);
  if (!v.ok) return sendJson(res, 400, { error: v.errors.join('；') });
  list[idx] = next;
  await store.save('outfits', list);
  const clothes = new Map(store.read('clothes').map((c) => [c.id, c]));
  sendJson(res, 200, { ...next, items: (next.itemIds || []).map((id) => clothes.get(id)).filter(Boolean) });
});

// 加一张上身图
api.post('/api/outfits/:id/images', async (req, res, { params, body }) => {
  const list = store.read('outfits');
  const o = list.find((x) => x.id === params.id);
  if (!o) return sendJson(res, 404, { error: '套搭不存在' });
  if (!body.imageB64) return sendJson(res, 400, { error: '缺少图片数据' });
  // 序号取现有图最大编号 +1
  const n = (o.images || []).reduce((m, p) => {
    const mm = /-(\d+)-wear\./.exec(p);
    return mm ? Math.max(m, Number(mm[1])) : m;
  }, 0) + 1;
  let rel;
  try { rel = images.save(body.imageB64, `${o.id}-${n}`, 'wear'); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }
  o.images = [...(o.images || []), rel];
  o.updatedAt = now();
  await store.save('outfits', list);
  sendJson(res, 201, { images: o.images, added: rel, updatedAt: o.updatedAt });
});

// 删一张上身图（按文件名匹配该套搭自己的图，防路径穿越）
api.delete('/api/outfits/:id/images/:name', async (req, res, { params }) => {
  const list = store.read('outfits');
  const o = list.find((x) => x.id === params.id);
  if (!o) return sendJson(res, 404, { error: '套搭不存在' });
  const rel = `images/${params.name}`;
  if (!(o.images || []).includes(rel)) return sendJson(res, 404, { error: '这张图不属于该套搭' });
  o.images = o.images.filter((p) => p !== rel);
  o.updatedAt = now();
  await store.save('outfits', list);
  images.remove([rel]);
  sendJson(res, 204, {});
});

api.delete('/api/outfits/:id', async (req, res, { params }) => {
  const list = store.read('outfits');
  const idx = list.findIndex((o) => o.id === params.id);
  if (idx === -1) return sendJson(res, 404, { error: '套搭不存在' });
  list.splice(idx, 1);
  await store.save('outfits', list);
  sendJson(res, 204, {});
});

// --- 避雷清单 ---
api.get('/api/avoidlist', (req, res) => {
  const list = store.read('avoidlist').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const clothes = new Map(store.read('clothes').map((c) => [c.id, c]));
  sendJson(res, 200, list.map((a) => ({
    ...a,
    items: (a.itemIds || []).map((id) => clothes.get(id)).filter(Boolean),
  })));
});

api.post('/api/avoidlist', async (req, res, { body }) => {
  const rec = {
    id: `a-${shortId()}`,
    kind: body.kind || '单品',
    refOutfitId: body.refOutfitId || null,
    itemIds: body.itemIds || [],
    reasons: body.reasons || [],
    comment: body.comment ? String(body.comment).trim() : null,
    tempBand: body.tempBand || null, scenes: body.scenes || [],
    createdAt: now(),
  };
  const v = validateAvoid(rec);
  if (!v.ok) return sendJson(res, 400, { error: v.errors.join('；') });
  if (rec.kind === '单品' && rec.itemIds.length === 0) {
    return sendJson(res, 400, { error: '单品雷至少选一件衣服' });
  }
  if (rec.tempBand && !TEMP_BANDS.includes(rec.tempBand)) return sendJson(res, 400, { error: '温度带非法' });
  if (rec.scenes.some((s) => !SCENES.includes(s))) return sendJson(res, 400, { error: '场景非法' });
  const list = store.read('avoidlist');
  list.push(rec);
  await store.save('avoidlist', list);
  sendJson(res, 201, rec);
});

api.delete('/api/avoidlist/:id', async (req, res, { params }) => {
  const list = store.read('avoidlist');
  const idx = list.findIndex((a) => a.id === params.id);
  if (idx === -1) return sendJson(res, 404, { error: '记录不存在' });
  list.splice(idx, 1);
  await store.save('avoidlist', list);
  sendJson(res, 204, {});
});

// ---------- HTTP 服务 ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      const hit = api.match(req.method, pathname);
      if (!hit) return sendJson(res, 404, { error: `无此接口：${req.method} ${pathname}` });
      const ctx = { params: hit.params, query: Object.fromEntries(url.searchParams) };
      if (req.method === 'POST' || req.method === 'PUT') ctx.body = await readBody(req);
      return await hit.handler(req, res, ctx);
    }
    if (pathname.startsWith('/images/')) {
      const abs = path.join(DATA_DIR, pathname);
      if (!abs.startsWith(DATA_DIR) || !serveFile(res, abs)) {
        res.writeHead(404); res.end('image not found');
      }
      return;
    }
    // 静态资源（SPA 只有一个页面）
    if (pathname === '/') return serveFile(res, path.join(PUBLIC_DIR, 'index.html')) || notFound(res);
    const abs = path.join(PUBLIC_DIR, pathname);
    if (!abs.startsWith(PUBLIC_DIR) || !serveFile(res, abs)) notFound(res);
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) sendJson(res, 500, { error: e.message || '服务器内部错误' });
  }
});

function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 not found'); }

server.listen(PORT, () => {
  console.log(`小迪的衣橱已就绪 → http://localhost:${PORT}`);
  console.log(`数据目录：${DATA_DIR}（全本地，断网可用）`);
});
