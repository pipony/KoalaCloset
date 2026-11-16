// 衣服详情页：单页文章式 —— 大图并排、编号标题、描述卡词条表、尺码区块、操作

import { api } from '../api.js';
import { el, els, esc, figureInner, boardAdd, toast } from '../components.js';

export async function itemView(view, [id]) {
  const item = await api.cloth(id);
  const no = String(item.no).padStart(2, '0');

  view.append(els`
    <div class="backline"><a class="linkbtn" href="#/wardrobe">← 回衣柜</a></div>
    <div class="detail-head">
      <h2><span class="dno">${no}</span>${esc(item.name)}</h2>
      <span class="muted" style="letter-spacing:.2em">${item.brand ? esc(item.brand) + ' · ' : ''}${item.category} / ${item.sub}${item.isBaseline ? ' · <span style="color:var(--accent)">基准款</span>' : ''}</span>
    </div>
  `);

  // —— 图片区 ——
  const figs = el`<div class="detail-figs"></div>`;
  figs.append(el`<div><figure>${figureInner(item)}</figure><figcaption>商品图</figcaption></div>`);
  if (item.fitImage) {
    figs.append(el`<div><figure><img src="/${item.fitImage}" alt="实拍"></figure><figcaption>实拍 · 正面全身</figcaption></div>`);
  }
  view.append(figs);

  // —— 描述卡词条表 ——
  const rows = [
    ['主色', item.color], ['图案', item.pattern], ['厚薄', item.thickness],
    ['版型', item.fit], ['长度', item.length],
    ['领型', item.category === '上装' ? item.neckline : null],
    ['面料', item.fabric], ['弹性', item.elastic], ['风格', (item.styles || []).join(' · ')],
  ].filter(([, val]) => val);
  const spec = el`<table class="spec-table"></table>`;
  for (const [k, val] of rows) spec.append(el`<tr><td>${k}</td><td>${esc(val)}</td></tr>`);
  view.append(spec);

  // —— 尺码档案 ——
  if (item.boughtSize || item.fitFeedback || (item.sizeChart && item.sizeChart.length) || item.sizeChartImage) {
    view.append(el`<div class="runhead"><h2>尺码档案</h2><span>SIZE ARCHIVE</span></div>`);
    const info = el`<table class="spec-table"></table>`;
    if (item.boughtSize) info.append(el`<tr><td>实际购买码</td><td>${esc(item.boughtSize)}</td></tr>`);
    if (item.fitFeedback) info.append(el`<tr><td>合身反馈</td><td>${esc(item.fitFeedback)}</td></tr>`);
    if (item.sizeChart?.length) {
      info.append(el`<tr><td>商品尺寸表</td><td>${
        item.sizeChart.map((r) => `${esc(r.label)}：${Object.entries(r.measurements).map(([p, n]) => `${esc(p)} ${n}cm`).join(' / ')}`).join('<br>')
      }</td></tr>`);
    }
    view.append(info);
    if (item.sizeChartImage) {
      view.append(el`<div class="detail-figs" style="margin-top:20px"><div><figure><img src="/${item.sizeChartImage}" alt="尺寸表截图"></figure><figcaption>尺寸表截图</figcaption></div></div>`);
    }
  }

  // —— 操作区 ——
  const actions = el`<div class="form-actions" style="margin-top:30px">
    <a class="btn" href="#/editor/${item.id}">编辑档案</a>
    <button class="btn" id="a-board">＋ 搭配板</button>
    <button class="btn" id="a-avoid">记入避雷</button>
    <button class="btn accent" id="a-del">删除</button>
  </div>`;
  view.append(actions);

  // 避雷小面板（点开就在原地，不跳页）
  const avoidPanel = el`<div class="form-section" id="avoid-panel" style="display:none;margin-top:22px"></div>`;
  view.append(avoidPanel);
  actions.querySelector('#a-avoid').addEventListener('click', async () => {
    avoidPanel.style.display = avoidPanel.style.display === 'none' ? 'block' : 'none';
    if (avoidPanel.innerHTML) return;
    const { buildAvoidForm } = await import('./avoid.js');
    await buildAvoidForm(avoidPanel, { kind: '单品', itemIds: [item.id] }, () => {
      avoidPanel.style.display = 'none';
    });
  });

  actions.querySelector('#a-board').addEventListener('click', () => {
    boardAdd(item.id);
    toast('已加入搭配板');
  });

  // 删除（引用检查在服务端）
  const confirm = el`<div class="del-confirm">
    <span>确定删除「${esc(item.name)}」？此操作不可撤销。</span>
    <button class="btn accent sm" id="del-yes">确认删除</button>
    <button class="btn sm" id="del-no">取消</button>
  </div>`;
  view.append(confirm);
  actions.querySelector('#a-del').addEventListener('click', () => confirm.classList.toggle('show'));
  confirm.querySelector('#del-no').addEventListener('click', () => confirm.classList.remove('show'));
  confirm.querySelector('#del-yes').addEventListener('click', async () => {
    try {
      await api.deleteCloth(item.id);
      toast('已删除');
      location.hash = '#/wardrobe';
    } catch (e) {
      confirm.classList.remove('show');
      toast(e.message, true);
    }
  });
}
