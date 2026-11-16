// 通用组件与工具：DOM 构造、占位剪影、衣服卡片、chips + 浮层、搭配板草稿、toast

import { api } from './api.js';

// —— DOM 快捷构造：el`<div class="x">text</div>` ——
// el 只返回第一个顶级元素；模板含多个顶级元素时用 els（返回 fragment，append 时全部保留）
export function el(strings, ...vals) {
  const html = strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  if (t.content.children.length > 1) {
    console.warn('[el] 模板有多个顶级元素，只有第一个会被返回——请改用 els()`...`', html.slice(0, 80));
  }
  return t.content.firstElementChild;
}

export function els(strings, ...vals) {
  const html = strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

// —— 主色 → 剪影填充色（无商品图时的占位） ——
const COLOR_HEX = {
  黑: '#26241F', 白: '#F4F0E6', 灰: '#8F9092', 米: '#E2D5B8', 棕: '#8A5A33',
  卡其: '#C2A878', 蓝: '#41597A', 绿: '#5F7355', 黄: '#D9B23F', 红: '#B2402C',
  粉: '#D9A5A8', 紫: '#7D6B8E', 花色: '#C98A4B',
};

export function garmentSvg(item, cls = '') {
  const fill = COLOR_HEX[item.color] || '#8C8479';
  // 白/米太浅，加描边保证在纸底上可见
  const pale = item.color === '白' || item.color === '米';
  const style = pale
    ? `fill:${fill};stroke:#D9CFBB;stroke-width:1.5`
    : `fill:${fill}`;
  return `<svg class="${cls}" style="${style}" aria-hidden="true"><use href="#g-${item.sub}"/></svg>`;
}

export function figureInner(item) {
  if (item.productImage) return `<img src="/${item.productImage}" alt="${item.name}">`;
  return garmentSvg(item);
}

// —— 编号显示：待买件未分衣柜编号，显示「待」 ——
export function noLabel(item) {
  return item.no == null ? '待' : String(item.no).padStart(2, '0');
}

// —— 衣服卡片（衣柜网格用；待买件自动带「待买」角标） ——
export function clothesCard(item, opts = {}) {
  const no = noLabel(item);
  const meta = [item.sub, item.color, item.boughtSize].filter(Boolean).join(' · ');
  const ops = opts.showOps ? `
    <div class="ops">
      <button data-op="board" title="加入搭配板">＋搭配板</button>
      <button data-op="detail" title="看详情">详情</button>
    </div>` : '';
  const base = item.isBaseline ? '<span class="badge-base">基准款</span>' : '';
  const wish = item.status === '待买' ? '<span class="badge-wish">待买</span>' : '';
  return el`<div class="item ${item.status === '待买' ? 'is-wish' : ''}" data-id="${item.id}">
    <div class="figure" data-op="detail">${base}${wish}${figureInner(item)}${ops}</div>
    <div class="caption">
      <span class="no">${no}</span>
      <div><h3>${esc(item.name)}</h3><p>${esc(meta)}</p></div>
    </div>
  </div>`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// —— 尺码对照（尺码档案页与待买详情页共用） ——

// 超差判定：绝对差 >3cm 或相对差 >6%
export function isDiff(a, b) {
  if (a == null || b == null || !Number(b)) return false;
  const d = Math.abs(a - b);
  return d > 3 || d / b > 0.06;
}

// 基准按类匹配：同细分优先，其次同大类；跨大类不比（外套不跟裤子比）
export function matchedBaselines(pick, baselines) {
  const sameSub = baselines.filter((b) => b.sub === pick.sub);
  const sameCat = baselines.filter((b) => b.category === pick.category && b.sub !== pick.sub);
  return [...sameSub, ...sameCat];
}

// 并排对比表：首列 = 对照件，其余 = 基准款；超差只标对照件
export function compareTable(pick, baselines) {
  const cols = [pick, ...baselines];
  // 行 = 所选件基准码行的部位并集（优先用与购买码一致的行，没有就第一行）
  function chartOf(c) {
    if (!c.sizeChart?.length) return null;
    return c.sizeChart.find((r) => c.boughtSize && r.label === c.boughtSize) || c.sizeChart[0];
  }
  const parts = new Set();
  for (const c of cols) {
    const ch = chartOf(c);
    if (ch) Object.keys(ch.measurements).forEach((p) => parts.add(p));
  }
  // 超差判定的参照：优先同细分的基准（短袖跟短袖比），没有才退到其余同类基准
  const picked = cols[0];
  const sameSubBase = cols.filter((c) => c !== picked && c.sub === picked.sub);
  const diffRefs = sameSubBase.length ? sameSubBase : cols.filter((c) => c !== picked);

  const table = el`<table class="compare"><thead><tr><th>部位</th>${
    cols.map((c) => {
      const isPick = c === picked;
      const tag = isPick ? '对照' : `基准${c.sub === picked.sub ? '' : ` · ${c.sub}`}`;
      return `<th>${esc(c.name)}<small>${esc(chartOf(c)?.label || c.boughtSize || '')} · ${tag}</small></th>`;
    }).join('')
  }</tr></thead><tbody></tbody></table>`;
  const tbody = table.querySelector('tbody');
  for (const part of parts) {
    const tr = el`<tr><td>${esc(part)}</td>${cols.map(() => '<td class="empty">—</td>').join('')}</tr>`;
    cols.forEach((c, ci) => {
      const val = chartOf(c)?.measurements[part];
      if (val != null) {
        const td = tr.children[ci + 1];
        td.textContent = `${val}`;
        td.classList.remove('empty');
        // 只对「被对照的那件」标超差
        if (ci === 0 && diffRefs.some((b) => isDiff(val, chartOf(b)?.measurements[part]))) {
          td.classList.add('diff');
        }
      }
    });
    tbody.append(tr);
  }
  // 合身反馈收尾行
  const fb = el`<tr><td>合身反馈</td>${cols.map((c) => `<td style="font-size:12px;letter-spacing:0">${esc(c.fitFeedback || '—')}</td>`).join('')}</tr>`;
  tbody.append(fb);
  return table;
}

// —— 浮层（chip 改值 / 添加条件 / 未识别词处理） ——
let activePopover = null;
export function openPopover(anchor, build) {
  closePopover();
  const pop = el`<div class="popover"></div>`;
  build(pop);
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(r.left, window.innerWidth - pop.offsetWidth - 12)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  activePopover = pop;
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, { once: true });
  });
}
function onDocDown(e) {
  if (activePopover && !activePopover.contains(e.target)) closePopover();
  else if (activePopover) document.addEventListener('mousedown', onDocDown, { once: true });
}
export function closePopover() {
  if (activePopover) { activePopover.remove(); activePopover = null; }
}
export function poItem(label, selected, onClick) {
  const b = el`<button class="po-item ${selected ? 'on' : ''}">${label}</button>`;
  b.addEventListener('click', () => { closePopover(); onClick(); });
  return b;
}

// —— 搭配板草稿（localStorage） ——
const BOARD_KEY = 'wardrobe-board-draft';
export function boardDraft() {
  try { return JSON.parse(localStorage.getItem(BOARD_KEY)) || []; } catch { return []; }
}
export function boardAdd(id) {
  const d = boardDraft();
  if (!d.includes(id)) d.push(id);
  localStorage.setItem(BOARD_KEY, JSON.stringify(d));
  boardBadge();
  return d;
}
export function boardRemove(id) {
  const d = boardDraft().filter((x) => x !== id);
  localStorage.setItem(BOARD_KEY, JSON.stringify(d));
  boardBadge();
  return d;
}
export function boardSet(ids) {
  localStorage.setItem(BOARD_KEY, JSON.stringify(ids));
  boardBadge();
}
export function boardBadge() {
  const n = boardDraft().length;
  const b = document.getElementById('board-badge');
  if (b) { b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }
}

// —— 待买区计数徽章（toc 上；由拉到衣服列表的页面刷新） ——
export function wishBadge(count) {
  const b = document.getElementById('wish-badge');
  if (b) { b.textContent = count; b.style.display = count ? 'inline-block' : 'none'; }
}

// —— toast ——
let toastTimer = null;
export function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show${isErr ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, isErr ? 3600 : 2200);
}

// —— 词表缓存（全站一份） ——
let vocabCache = null;
export async function vocab() {
  if (!vocabCache) vocabCache = await api.vocab();
  return vocabCache;
}

// 大类 → 细分（词表口径写死在这里，与服务端 lib/vocab.js 保持一致）
const CAT_NAMES = { 上装: ['短袖', '长袖', '无袖', '外套'], 下装: ['长裤', '短裤', '半裙'] };

// —— 衣服选择弹窗：图片网格 + 分类过滤，点卡片即选 ——
// opts: { title, clothes, category（初始过滤，可切）, excludeIds, includeWish（提供「含待买」切换）, onPick(item) }
export function openClothesPicker(opts) {
  const { title = '选一件衣服', clothes = [], category = null, excludeIds = [], includeWish = false, onPick } = opts;
  let curCat = category;
  let curSub = null;
  let showWish = false;

  const mask = el`<div class="modal-mask"></div>`;
  const panel = el`<div class="modal-panel"></div>`;
  const head = el`<div class="modal-head">
    <div><h3>${title}</h3></div>
    <button class="modal-x" title="关闭">×</button>
  </div>`;
  const filters = el`<div class="modal-filters"></div>`;
  const body = el`<div class="modal-body"></div>`;
  panel.append(head, filters, body);
  mask.append(panel);
  document.body.appendChild(mask);

  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  head.querySelector('.modal-x').addEventListener('click', close);

  const catNames = CAT_NAMES;
  function renderFilters() {
    filters.innerHTML = '';
    const subs = curCat ? catNames[curCat] : [];
    const mk = (label, on, onClick) => {
      const s = el`<span class="f ${on ? 'on' : ''}" style="cursor:pointer">${label}</span>`;
      s.addEventListener('click', onClick);
      filters.append(s);
    };
    mk('全部', !curCat, () => { curCat = null; curSub = null; renderFilters(); renderGrid(); });
    for (const c of Object.keys(catNames)) mk(c, curCat === c && !curSub, () => { curCat = c; curSub = null; renderFilters(); renderGrid(); });
    if (curCat) {
      for (const s of subs) mk(s, curSub === s, () => { curSub = s; renderFilters(); renderGrid(); });
    }
    if (includeWish) {
      const w = el`<span class="f wish-toggle ${showWish ? 'on' : ''}" style="cursor:pointer">含待买</span>`;
      w.addEventListener('click', () => { showWish = !showWish; renderFilters(); renderGrid(); });
      filters.append(w);
    }
  }

  function renderGrid() {
    body.innerHTML = '';
    const list = clothes.filter((c) => {
      if (excludeIds.includes(c.id)) return false;
      if (c.status === '待买' && !showWish) return false;
      if (curCat && c.category !== curCat) return false;
      if (curSub && c.sub !== curSub) return false;
      return true;
    });
    if (list.length === 0) {
      body.append(el`<div class="modal-empty">没有可选的衣服${curCat ? `（${curSub || curCat}${curSub ? '' : ' 区'}）` : ''}</div>`);
      return;
    }
    const grid = el`<div class="modal-grid"></div>`;
    for (const c of list) {
      const card = el`<button type="button" class="pick-card">
        <div class="f">${c.status === '待买' ? '<span class="badge-wish">待买</span>' : ''}${figureInner(c)}</div>
        <div class="nm"><span class="no">${noLabel(c)}</span>${esc(c.name)}</div>
      </button>`;
      card.addEventListener('click', () => { close(); onPick?.(c); });
      grid.append(card);
    }
    body.append(grid);
  }

  renderFilters();
  renderGrid();
}
