// 衣服详情页：单页文章式 —— 大图并排、编号标题、描述卡词条表、尺码区块、操作
// 待买件多一段「买前对照台」：尺码对照 / 买前查重 / 能配几套，结局是转正或丢掉

import { api } from '../api.js';
import {
  el, els, esc, figureInner, boardAdd, toast, noLabel, compareTable, matchedBaselines,
} from '../components.js';

export async function itemView(view, [id]) {
  const item = await api.cloth(id);
  const isWish = item.status === '待买';
  const no = noLabel(item);

  view.append(els`
    <div class="backline"><a class="linkbtn" href="${isWish ? '#/wish' : '#/wardrobe'}">← ${isWish ? '回待买区' : '回衣柜'}</a></div>
    <div class="detail-head">
      <h2><span class="dno">${no}</span>${esc(item.name)}</h2>
      <span class="muted" style="letter-spacing:.2em">${item.brand ? esc(item.brand) + ' · ' : ''}${item.category} / ${item.sub}${isWish ? ' · <span style="color:var(--accent)">待买</span>' : ''}${item.isBaseline ? ' · <span style="color:var(--accent)">基准款</span>' : ''}</span>
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

  // —— 买前对照台（仅待买件） ——
  if (isWish) await preCheckSection(view, item);

  // —— 操作区 ——
  const actions = el`<div class="form-actions" style="margin-top:30px">
    <a class="btn" href="#/editor/${item.id}">编辑档案</a>
    ${isWish ? '' : '<button class="btn" id="a-board">＋ 搭配板</button>'}
    ${isWish ? '' : '<button class="btn" id="a-avoid">记入避雷</button>'}
    ${isWish
      ? '<button class="btn primary" id="a-promote">买了 · 转正式档案</button><button class="btn accent" id="a-del">没买 · 丢掉</button>'
      : '<button class="btn accent" id="a-del">删除</button>'}
  </div>`;
  view.append(actions);

  // 避雷小面板（点开就在原地，不跳页；只对衣柜里的衣服有意义）
  if (!isWish) {
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
  }

  // 待买 → 转正式档案：分到下一个衣柜编号，回衣柜能看到它
  if (isWish) {
    actions.querySelector('#a-promote').addEventListener('click', async () => {
      try {
        const saved = await api.promoteCloth(item.id);
        toast(`已入柜 · NO.${noLabel(saved)}，去衣柜看看它`);
        location.hash = '#/wardrobe';
      } catch (e) {
        toast(e.message, true);
      }
    });
  }

  // 删除 / 丢掉（引用检查在服务端，409 时把引用列出来）
  const delWord = isWish ? '丢掉' : '删除';
  const confirm = el`<div class="del-confirm">
    <span>确定${delWord}「${esc(item.name)}」？${isWish ? '没买就丢，不留垃圾数据。' : ''}此操作不可撤销。</span>
    <button class="btn accent sm" id="del-yes">确认${delWord}</button>
    <button class="btn sm" id="del-no">取消</button>
  </div>`;
  view.append(confirm);
  actions.querySelector('#a-del').addEventListener('click', () => confirm.classList.toggle('show'));
  confirm.querySelector('#del-no').addEventListener('click', () => confirm.classList.remove('show'));
  confirm.querySelector('#del-yes').addEventListener('click', async () => {
    try {
      await api.deleteCloth(item.id);
      toast(isWish ? '已丢掉' : '已删除');
      location.hash = isWish ? '#/wish' : '#/wardrobe';
    } catch (e) {
      confirm.classList.remove('show');
      const refs = e.data?.refs;
      if (e.status === 409 && refs?.outfits?.length) {
        toast(`它被 ${refs.outfits.length} 套搭配引用着：${refs.outfits.join('、')}——先去套搭页删掉这些虚拟搭配`, true);
      } else {
        toast(e.message, true);
      }
    }
  });
}

// —— 买前对照台：①尺码对照 ②买前查重 ③能配几套 ——
async function preCheckSection(view, item) {
  view.append(el`<div class="runhead"><h2>买前对照台</h2><span>PRE-PURCHASE CHECK</span></div>`);
  const [allOwned, pre] = await Promise.all([
    api.clothes({ status: '在衣柜' }),
    api.precheck(item.id),
  ]);

  // ① 尺码对照：和同类基准款并排比数字，超差标红 = 该买什么码的答案
  const sizeSec = el`<div class="form-section">
    <div class="fs-head"><h3>该买什么码</h3><span class="fs-no">SIZE CHECK</span></div>
  </div>`;
  const baselines = allOwned.filter((c) => c.isBaseline);
  if (!item.sizeChart?.length) {
    sizeSec.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">
      还没填商品尺寸表——去「编辑档案」把详情页的尺寸数字抄进尺码区，这里就能和基准款并排比数字。</p>`);
  } else if (baselines.length === 0) {
    sizeSec.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">
      还没有基准款。先把 2～3 件非常合身的衣服标成基准款，才有得比。去「尺码档案」页看看。</p>`);
  } else {
    const cols = matchedBaselines(item, baselines);
    if (cols.length === 0) {
      sizeSec.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">
        还没有「${item.category}」类的基准款——外套跟外套比、裤子跟裤子比才有意义。</p>`);
    } else {
      sizeSec.append(compareTable(item, cols));
    }
  }
  view.append(sizeSec);

  // ② 买前查重：衣柜里是不是已经有件差不多的（只比文字卡）
  const dupSec = el`<div class="form-section">
    <div class="fs-head"><h3>衣柜里有差不多的吗</h3><span class="fs-no">DUPLICATE CHECK</span></div>
  </div>`;
  if (pre.duplicates.length === 0) {
    dupSec.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">衣柜里没有和它同细分的相近件，买得不重。</p>`);
  } else {
    const dupList = el`<div></div>`;
    for (const d of pre.duplicates) {
      const c = d.cloth;
      const meta = [c.color, c.pattern, c.thickness, c.fabric].filter(Boolean).join(' · ');
      dupList.append(el`<div class="dup-card" data-id="${c.id}" style="cursor:pointer">
        <span class="dup-level ${d.level}">${d.level === 'high' ? '高度相似' : '有些像'}</span>
        <div class="dup-main">
          <b>NO.${noLabel(c)} ${esc(c.name)}</b>
          <span class="muted">${esc(meta)} · 相近点：${d.hits.map((h) => esc(h.label)).join('、')}</span>
        </div>
        <span class="muted" style="font-size:12px;letter-spacing:.08em">看详情 →</span>
      </div>`);
    }
    dupSec.append(dupList);
    dupSec.addEventListener('click', (e) => {
      const card = e.target.closest('.dup-card');
      if (card) location.hash = '#/item/' + card.dataset.id;
    });
  }
  view.append(dupSec);

  // ③ 能配几套：已存套搭里能给它腾出同细分槽位的套数 + 送进搭配板自己试
  const fitSec = el`<div class="form-section">
    <div class="fs-head"><h3>能和现有衣服配几套</h3><span class="fs-no">FIT COUNT</span></div>
  </div>`;
  const fitBody = el`<div></div>`;
  if (pre.outfits.count === 0) {
    fitBody.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em">
      已存套搭里还没有能替它上位的组合——可以直接送进搭配板，自己动手配配看。</p>`);
  } else {
    fitBody.append(el`<p style="font-size:15px;letter-spacing:.04em">
      按已存套搭算，它能顶替上身的还有 <b style="color:var(--accent);font-size:22px">${pre.outfits.count}</b> 套：</p>`);
    const fitList = el`<div></div>`;
    for (const m of pre.outfits.matches) {
      fitList.append(el`<div class="dup-card">
        <a href="#/outfit/${m.outfitId}" style="color:inherit;text-decoration:none"><b>${esc(m.title)}</b>${m.tempBand ? ` <span class="muted">· ${m.tempBand}</span>` : ''}</a>
        <span class="muted">可换下 ${m.replacedNo != null ? `NO.${String(m.replacedNo).padStart(2, '0')} ` : ''}${esc(m.replacedName)}</span>
      </div>`);
    }
    fitBody.append(fitList);
  }
  const boardBtn = el`<div class="btnline" style="margin-top:6px">
    <button type="button" class="btn" id="wish-board">＋ 送进搭配板试配</button>
    <span class="muted" style="font-size:12px;letter-spacing:.08em">把它当虚拟卡片和衣柜里的衣服自由组合</span>
  </div>`;
  boardBtn.querySelector('#wish-board').addEventListener('click', () => {
    boardAdd(item.id);
    toast('已送进搭配板');
  });
  fitBody.append(boardBtn);
  fitSec.append(fitBody);
  view.append(fitSec);
}
