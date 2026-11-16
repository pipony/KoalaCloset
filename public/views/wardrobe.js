// 衣柜页：自然语言搜索 → 条件 chips（可增删改）→ 过滤网格
// chips 与 subcats 双向同步；条件变化即重新查询（服务端过滤）

import { api } from '../api.js';
import { el, esc, clothesCard, openPopover, closePopover, poItem, boardAdd, boardDraft, toast, vocab } from '../components.js';
import { state } from '../app.js';

const VOCAB_KEYS = ['color', 'pattern', 'thickness', 'fit', 'length', 'neckline', 'fabric', 'elastic'];
const FIELD_LABEL = {
  category: '分类', sub: '细分', styles: '风格', scenes: '场景',
  tempBand: '温度带', keyword: '关键词',
  color: '主色', pattern: '图案', thickness: '厚薄', fit: '版型',
  length: '长度', neckline: '领型', fabric: '面料', elastic: '弹性',
};

export async function wardrobe(view) {
  const v = await vocab();
  let cond = null;
  let unknown = [];
  let total = 0;

  // —— 挂载结构 ——
  const subcats = el`<div class="subcats"></div>`;
  const chipsWrap = el`<div class="chips-row" id="chips"></div>`;
  const runhead = el`<div class="runhead"><h2>本期衣柜</h2><span></span></div>`;
  const grid = el`<div class="grid"></div>`;
  view.append(subcats, chipsWrap, runhead, grid);

  // —— 全局搜索条带来的待处理查询 ——
  if (state.pendingQuery) {
    const r = await api.parse(state.pendingQuery);
    cond = r.cond;
    unknown = r.unknown;
    state.pendingQuery = null;
  }

  async function refresh(reopenField = null) {
    const [all, list] = await Promise.all([
      api.clothes(),
      cond ? api.clothes(cond) : api.clothes(),
    ]);
    total = all.length;
    renderSubcats();
    renderChips();
    renderGrid(list);
    runhead.querySelector('span').textContent = `WARDROBE — ${list.length} / ${total} 件`;
    if (reopenField) {
      const chipEl = chipsWrap.querySelector(`[data-field="${reopenField}"]`);
      if (chipEl) openValuePopover(chipEl, reopenField);
    }
  }

  // —— 分类条（与 cond.category / cond.sub 双向同步） ——
  function renderSubcats() {
    const cats = ['全部', '上装', '下装', ...Object.values(v.categories).flat()];
    subcats.innerHTML = '';
    for (const c of cats) {
      const on = c === '全部' ? !cond?.category : c === cond?.category || c === cond?.sub;
      const s = el`<span class="${on ? 'on' : ''}">${c}</span>`;
      s.addEventListener('click', () => {
        if (!cond) cond = { keyword: [] };
        if (c === '全部') { cond.category = null; cond.sub = null; }
        else if (c === '上装' || c === '下装') { cond.category = c; cond.sub = null; }
        else {
          cond.sub = c;
          cond.category = Object.entries(v.categories).find(([, subs]) => subs.includes(c))?.[0] || null;
        }
        refresh();
      });
      subcats.append(s);
    }
  }

  // —— 条件 chips ——
  function condEntries() {
    if (!cond) return [];
    const out = [];
    if (cond.category) out.push(['category', cond.category, false]);
    if (cond.sub) out.push(['sub', cond.sub, false]);
    for (const k of VOCAB_KEYS) {
      const val = cond[k];
      if (val === null || val === undefined || val === '') continue;
      out.push([k, val, Array.isArray(val)]);
    }
    if (cond.styles?.length) out.push(['styles', cond.styles, true]);
    if (cond.scenes?.length) out.push(['scenes', cond.scenes, true]);
    if (cond.tempBand) out.push(['tempBand', `${cond.tempBand}${cond.tempC != null ? `（${cond.tempC}°）` : ''}`, false]);
    for (const kw of cond.keyword || []) out.push(['keyword', kw, false, kw]);
    return out;
  }

  function renderChips() {
    chipsWrap.innerHTML = '';
    if (!cond) return;
    chipsWrap.append(el`<span class="chips-label">条件</span>`);
    for (const [field, value, isArr, kw] of condEntries()) {
      const shown = Array.isArray(value) ? value.join(' 或 ') : value;
      const isUnknown = false;
      const chip = el`<span class="chip ${field === 'keyword' ? 'unknown' : ''}" data-field="${field}" data-kw="${esc(kw ?? '')}">
        <span class="k">${FIELD_LABEL[field]}</span>${esc(shown)}<span class="x" title="移除">×</span>
      </span>`;
      chip.querySelector('.x').addEventListener('click', (e) => {
        e.stopPropagation();
        removeCond(field, kw);
        refresh();
      });
      chip.addEventListener('click', () => openValuePopover(chip, field, kw));
      chipsWrap.append(chip);
    }
    for (const u of unknown) {
      const chip = el`<span class="chip unknown" title="没认出这个词，点我处理"><span class="k">未识别</span>${esc(u)}</span>`;
      chip.addEventListener('click', () => {
        openPopover(chip, (pop) => {
          pop.append(poItem('当关键词搜（搜名称/品牌）', false, () => {
            cond = cond || { keyword: [] };
            cond.keyword = [...(cond.keyword || []), u];
            unknown = unknown.filter((x) => x !== u);
            refresh();
          }));
          pop.append(poItem('忽略这个词', false, () => {
            unknown = unknown.filter((x) => x !== u);
            refresh();
          }));
        });
      });
      chipsWrap.append(chip);
    }
    const add = el`<span class="chip add">＋ 添加条件</span>`;
    add.addEventListener('click', () => {
      openPopover(add, (pop) => {
        pop.append(el`<div class="po-title">添加什么条件</div>`);
        const fields = ['category', 'sub', ...VOCAB_KEYS, 'styles', 'scenes', 'tempBand'];
        for (const f of fields) {
          pop.append(poItem(FIELD_LABEL[f], false, () => openAddOptions(add, f)));
        }
      });
    });
    chipsWrap.append(add);
  }

  function openAddOptions(anchor, field) {
    openPopover(anchor, (pop) => {
      pop.append(el`<div class="po-title">${FIELD_LABEL[field]}</div>`);
      for (const opt of optionsOf(field)) {
        pop.append(poItem(opt, false, () => {
          setCond(field, opt);
          refresh(field);
        }));
      }
    });
  }

  function openValuePopover(chipEl, field, kw) {
    if (field === 'keyword') {
      openPopover(chipEl, (pop) => {
        pop.append(poItem('从条件里移除', false, () => { removeCond('keyword', kw); refresh(); }));
      });
      return;
    }
    if (field === 'tempBand') {
      openPopover(chipEl, (pop) => {
        pop.append(poItem('移除温度条件', false, () => {
          cond.tempBand = null; cond.tempC = null;
          refresh();
        }));
      });
      return;
    }
    openPopover(chipEl, (pop) => {
      pop.append(el`<div class="po-title">${FIELD_LABEL[field]}</div>`);
      for (const opt of optionsOf(field)) {
        const cur = cond?.[field];
        const selected = Array.isArray(cur) ? cur.includes(opt) : cur === opt;
        pop.append(poItem(opt, selected, () => {
          if (Array.isArray(cond?.[field])) {
            toggleArr(field, opt);
            refresh(field);
          } else {
            setCond(field, opt);
            refresh();
          }
        }));
      }
      pop.append(el`<div class="po-sep"></div>`);
      pop.append(poItem('清除该条件', false, () => { removeCond(field); refresh(); }));
    });
  }

  function optionsOf(field) {
    if (field === 'category') return Object.keys(v.categories);
    if (field === 'sub') return Object.values(v.categories).flat();
    if (field === 'styles') return v.fields.styles.vocab;
    if (field === 'scenes') return v.scenes;
    if (field === 'tempBand') return v.tempBands;
    return v.fields[field]?.vocab || [];
  }

  function setCond(field, value) {
    cond = cond || { keyword: [] };
    if (field === 'category') { cond.category = value; cond.sub = null; }
    else if (field === 'sub') {
      cond.sub = value;
      cond.category = Object.entries(v.categories).find(([, subs]) => subs.includes(value))?.[0] || null;
    } else if (field === 'tempBand') { cond.tempBand = value; }
    else cond[field] = value;
  }
  function toggleArr(field, value) {
    const cur = cond[field] || [];
    cond[field] = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  }
  function removeCond(field, kw) {
    if (!cond) return;
    if (field === 'keyword') cond.keyword = (cond.keyword || []).filter((x) => x !== kw);
    else if (Array.isArray(cond[field])) cond[field] = [];
    else cond[field] = null;
  }

  // —— 网格 ——
  function renderGrid(list) {
    grid.innerHTML = '';
    if (total === 0) {
      grid.append(el`<div class="empty" style="grid-column:1/-1"><em>衣柜还是空的</em>
        第一件衣服从「+ 录入新衣」开始 — 商品图做封面，描述卡一次填好</div>`);
      return;
    }
    if (list.length === 0) {
      grid.append(el`<div class="empty" style="grid-column:1/-1"><em>没有符合条件的结果</em>
        试着在条件 chips 里删掉一项，或换种说法再搜</div>`);
      return;
    }
    for (const c of list) {
      const card = clothesCard(c, { showOps: true });
      card.addEventListener('click', (e) => {
        const op = e.target.closest('[data-op]')?.dataset.op;
        if (op === 'board') { boardAdd(c.id); toast(`已加入搭配板（当前 ${boardDraft().length} 件）`); }
        else location.hash = `#/item/${c.id}`;
      });
      grid.append(card);
    }
  }

  await refresh();
}
