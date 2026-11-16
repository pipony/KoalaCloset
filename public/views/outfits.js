// 套搭列表：温度带 + 场景过滤（离线主路径）→ 套搭行（缩略拼条 / 复刻 / 删除）

import { api } from '../api.js';
import { el, esc, vocab, boardSet, toast } from '../components.js';

export async function outfits(view) {
  const v = await vocab();
  const filter = { tempBand: null, scene: null };

  const filters = el`<div class="filters"></div>`;
  const runhead = el`<div class="runhead"><h2>套搭专栏</h2><span>OUTFITS</span></div>`;
  const list = el`<div></div>`;
  view.append(filters, runhead, list);

  function renderFilters() {
    filters.innerHTML = '';
    const g1 = el`<div class="grp"><b>温度带</b></div>`;
    const all1 = el`<span class="f ${!filter.tempBand ? 'on' : ''}">全部</span>`;
    all1.addEventListener('click', () => { filter.tempBand = null; load(); });
    g1.append(all1);
    for (const b of v.tempBands) {
      const s = el`<span class="f ${filter.tempBand === b ? 'on' : ''}">${b}</span>`;
      s.addEventListener('click', () => { filter.tempBand = b; load(); });
      g1.append(s);
    }
    const g2 = el`<div class="grp"><b>场景</b></div>`;
    const all2 = el`<span class="f ${!filter.scene ? 'on' : ''}">全部</span>`;
    all2.addEventListener('click', () => { filter.scene = null; load(); });
    g2.append(all2);
    for (const sc of v.scenes) {
      const s = el`<span class="f ${filter.scene === sc ? 'on' : ''}">${sc}</span>`;
      s.addEventListener('click', () => { filter.scene = sc; load(); });
      g2.append(s);
    }
    filters.append(g1, g2);
  }

  async function load() {
    renderFilters();
    const data = await api.outfits({
      tempBand: filter.tempBand || undefined,
      scene: filter.scene || undefined,
    });
    runhead.querySelector('span').textContent = `OUTFITS — ${data.length} 套`;
    list.innerHTML = '';
    if (data.length === 0) {
      list.append(el`<div class="empty"><em>还没有符合条件的套搭</em>
        去 <a class="linkbtn" href="#/board">搭配板</a> 把几件衣服组成一套，存档时标好「温度带 + 场景」<br>
        日常按这两个维度过滤，就是断网也能用的「今天穿什么」</div>`);
      return;
    }
    for (const o of data) {
      list.append(outfitRow(o));
    }
  }

  function outfitRow(o) {
    const date = o.createdAt.slice(0, 10).replaceAll('-', '.');
    const pieces = el`<div class="pieces"></div>`;
    for (const it of o.items) {
      pieces.append(el`<div class="p" title="${esc(it.name)}">${
        it.productImage ? `<img src="/${it.productImage}" alt="">` : `<svg style="fill:#8C8479"><use href="#g-${it.sub}"/></svg>`
      }</div>`);
    }
    const row = el`<div class="outfit-row" data-id="${o.id}" style="cursor:pointer">
      ${'' /* pieces 单独 append 以复用变量 */}
      <div>
        <h3>${esc(o.title)}${o.warning ? '' : ''}</h3>
        <p class="meta">${[
          `温度带 ${esc(o.tempBand || '未标')}`,
          o.scenes?.length ? o.scenes.map(esc).join(' / ') : '场景未标',
          `存档于 ${date}`,
          ...(o.note ? ['有备注'] : []),
          ...((o.images || []).length ? [`${o.images.length} 张上身图`] : []),
        ].join(' · ')}</p>
      </div>
      <div class="btnline" style="flex-direction:column;gap:10px;align-items:stretch">
        <button class="btn sm" data-act="detail">看详情</button>
        <button class="btn sm" data-act="clone">复刻到搭配板</button>
        <button class="btn sm accent" data-act="del">删除</button>
      </div>
    </div>`;
    row.prepend(pieces);

    // 整行点击进详情（按钮各自处理）
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      location.hash = `#/outfit/${o.id}`;
    });
    row.querySelector('[data-act=detail]').addEventListener('click', () => {
      location.hash = `#/outfit/${o.id}`;
    });
    row.querySelector('[data-act=clone]').addEventListener('click', () => {
      boardSet(o.itemIds);
      toast('已复刻到搭配板');
      location.hash = '#/board';
    });
    row.querySelector('[data-act=del]').addEventListener('click', async (e) => {
      if (e.target.dataset.confirm) {
        try { await api.deleteOutfit(o.id); toast('已删除'); load(); }
        catch (err) { toast(err.message, true); }
      } else {
        e.target.dataset.confirm = '1';
        e.target.textContent = '确认删除？';
        setTimeout(() => { delete e.target.dataset.confirm; e.target.textContent = '删除'; }, 2600);
      }
    });
    return row;
  }

  await load();
}
