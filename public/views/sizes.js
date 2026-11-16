// 尺码档案：基准款并排对比 + 任选一件与基准款并排、超差部位高亮

import { api } from '../api.js';
import { el, esc, openClothesPicker } from '../components.js';

// 超差判定：绝对差 >3cm 或相对差 >6%
function isDiff(a, b) {
  if (a == null || b == null || !Number(b)) return false;
  const d = Math.abs(a - b);
  return d > 3 || d / b > 0.06;
}

export async function sizes(view) {
  const all = await api.clothes();
  const baselines = all.filter((c) => c.isBaseline);
  const withChart = all.filter((c) => c.sizeChart?.length);

  view.append(el`<div class="runhead"><h2>尺码档案</h2><span>SIZE ARCHIVE</span></div>`);

  if (all.length === 0) {
    view.append(el`<div class="empty"><em>还没有衣服档案</em>录入衣服时把「商品尺寸表 / 实际购买码 / 合身反馈」一起填了，这里才有得对比</div>`);
    return;
  }

  // —— 基准款状态（对比的参照系） ——
  const baseSec = el`<div class="form-section">
    <div class="fs-head"><h3>基准款</h3><span class="fs-no">BASELINE · ${baselines.length} / 3 件</span></div>
  </div>`;
  const baseBody = el`<div class="pills"></div>`;
  if (baselines.length === 0) {
    baseSec.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em;line-height:2">
      还没有基准款。挑 2～3 件<b>非常合身</b>的衣服，在它的编辑页「尺码档案」区勾上「基准款」——<br>
      它们是下面并排对比的参照系，也是以后买新衣服时判断该买什么码的标尺。
    </p>`);
  } else {
    for (const b of baselines) {
      baseBody.append(el`<span class="pill on" title="${esc(b.fitFeedback || '')}">${String(b.no).padStart(2, '0')} ${esc(b.name)}${b.boughtSize ? ` · ${esc(b.boughtSize)}` : ''}</span>`);
    }
    baseSec.append(baseBody);
  }
  view.append(baseSec);

  // —— 并排对比（显眼入口：弹窗选衣 + 同类基准匹配） ——
  const cmpSec = el`<div class="form-section">
    <div class="fs-head"><h3>买前对照 · 并排对比</h3><span class="fs-no">COMPARE</span></div>
  </div>`;
  const cmpBody = el`<div></div>`;
  cmpSec.append(cmpBody);
  view.append(cmpSec);

  // 基准按类匹配：同细分优先，其次同大类；跨大类不比（外套不跟裤子比）
  function matchedBaselines(pick) {
    const sameSub = baselines.filter((b) => b.sub === pick.sub);
    const sameCat = baselines.filter((b) => b.category === pick.category && b.sub !== pick.sub);
    return [...sameSub, ...sameCat];
  }

  function renderCompare(pick) {
    cmpBody.innerHTML = '';
    const head = el`
      <div class="pickline" style="margin-bottom:0;align-items:center">
        <label>对照对象</label>
        <span class="pill on">${String(pick.no).padStart(2, '0')} ${esc(pick.name)} · ${pick.sub}</span>
        <button type="button" class="btn sm" id="sz-repick">换一件</button>
        <span class="muted" style="font-size:12px;letter-spacing:.08em">自动和${pick.sub}同类基准款比，超差 >3cm 或 6% 标红</span>
      </div>`;
    cmpBody.append(head);
    head.querySelector('#sz-repick').addEventListener('click', openPick);
    const wrap = el`<div style="margin-top:18px"></div>`;
    cmpBody.append(wrap);
    const cols = matchedBaselines(pick);
    if (cols.length === 0) {
      wrap.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">
        还没有「${pick.category}」类的基准款——外套跟外套比、裤子跟裤子比才有意义。去编辑几件非常合身的${pick.category}，勾上「基准款」。</p>`);
      return;
    }
    wrap.append(compareTable(pick, cols));
  }

  function openPick() {
    openClothesPicker({
      title: '挑一件来对照',
      clothes: withChart,
      onPick: (c) => renderCompare(c),
    });
  }

  if (baselines.length === 0) {
    cmpBody.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">先在上面标好基准款，这里就能把任何一件衣服和同类基准并排比数字。</p>`);
  } else if (withChart.length === 0) {
    cmpBody.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">还没有衣服填过「商品尺寸表」。录入或编辑时，把详情页的尺寸数字记在尺码区，就能在这里对比。</p>`);
  } else {
    const btn = el`<div class="pickline" style="margin-bottom:0">
      <button type="button" class="btn primary" id="sz-pick">＋ 挑一件来对照</button>
      <span class="muted" style="font-size:12px;letter-spacing:.08em">挑一件衣服，自动和它的同类基准款（外套比外套、裤子比裤子）并排比数字</span>
    </div>`;
    cmpBody.append(btn);
    btn.querySelector('#sz-pick').addEventListener('click', openPick);
  }

  // —— 全部尺码档案一览 ——
  view.append(el`<div class="runhead" style="margin-top:40px"><h2>档案一览</h2><span>${withChart.length} 件有尺寸表</span></div>`);
  if (withChart.length === 0) {
    view.append(el`<div class="empty">还没有衣服填过商品尺寸表。录入或编辑时在「尺码档案」区把详情页的数字记下来。</div>`);
    return;
  }
  const list = el`<div></div>`;
  view.append(list);
  for (const c of withChart) {
    const rows = c.sizeChart.map((r) =>
      `<tr><td>${esc(r.label)}</td><td>${
        Object.entries(r.measurements).map(([p, n]) => `${esc(p)} ${n}cm`).join(' · ')
      }</td></tr>`).join('');
    list.append(el`<table class="spec-table" style="margin-bottom:8px">
      <tr><td>档案</td><td>${String(c.no).padStart(2, '0')} ${esc(c.name)}${c.isBaseline ? ' · <span style="color:var(--accent)">基准款</span>' : ''}${c.boughtSize ? ` · 买了 ${esc(c.boughtSize)}` : ''}</td></tr>
      ${rows}
      ${c.fitFeedback ? `<tr><td>合身反馈</td><td>${esc(c.fitFeedback)}</td></tr>` : ''}
    </table>`);
  }
}

function compareTable(pick, baselines) {
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
