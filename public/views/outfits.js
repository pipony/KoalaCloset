// 套搭列表：AI 帮我搭（联网，手动触发）+ 温度带/场景过滤已存套搭（离线主路径）

import { api } from '../api.js';
import { el, esc, vocab, boardSet, toast, figureInner, noLabel } from '../components.js';

export async function outfits(view) {
  const v = await vocab();
  const filter = { tempBand: null, scene: null };

  const filters = el`<div class="filters"></div>`;
  const runhead = el`<div class="runhead"><h2>套搭专栏</h2><span>OUTFITS</span></div>`;
  const list = el`<div></div>`;

  // —— AI 帮我搭（点按钮才联网；发送内容常显说明） ——
  const aiForm = { tempBand: null, scenes: [], note: '', tasteRef: false, visualReview: false };
  const aiBench = el`<div class="form-section" id="ai-bench">
    <div class="fs-head"><h3>AI 帮我搭</h3><span class="fs-no">AI STYLIST · 手动触发</span></div>
    <div class="frow" style="align-items:center;gap:10px;flex-wrap:wrap">
      <label style="font-size:11px;letter-spacing:.28em;color:var(--ink-2)">温度带</label>
      <div class="pills" id="ai-temp"></div>
    </div>
    <div class="frow" style="align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px">
      <label style="font-size:11px;letter-spacing:.28em;color:var(--ink-2)">场景</label>
      <div class="pills" id="ai-scenes"></div>
    </div>
    <div class="frow" style="margin-top:14px">
      <div class="field" style="flex:1;min-width:260px"><label>附加要求（可空，最高优先）</label>
        <input type="text" id="ai-note" placeholder="如：想显利落一点 / 不要牛仔裤 / 见客户"></div>
    </div>
    <div class="frow" style="align-items:center;gap:20px;flex-wrap:wrap;margin-top:6px">
      <label style="cursor:pointer;font-size:12.5px;letter-spacing:.04em"><input type="checkbox" id="ai-taste"> 带上我的套搭当口味参考（每次先问，默认不发）</label>
      <label style="cursor:pointer;font-size:12.5px;letter-spacing:.04em"><input type="checkbox" id="ai-visual"> 视觉复核（开启会发送所选衣服的照片，默认关）</label>
    </div>
    <div class="btnline" style="margin-top:16px">
      <button type="button" class="btn primary" id="ai-run">AI 出一套</button>
      <span class="muted" style="font-size:12px;letter-spacing:.08em">发送：衣柜文字卡 + 避雷清单 +（勾选时）已存套搭或照片 · 约半分钟</span>
    </div>
    <div class="form-error" id="ai-err" style="margin-top:12px"></div>
  </div>`;
  const aiResult = el`<div id="ai-result"></div>`;

  const tempPills = aiBench.querySelector('#ai-temp');
  const mkTemp = el`<span class="pill">不限</span>`;
  mkTemp.addEventListener('click', () => {
    aiForm.tempBand = null;
    renderAiPills();
  });
  tempPills.append(mkTemp);
  for (const b of v.tempBands) {
    const p = el`<span class="pill">${b}</span>`;
    p.addEventListener('click', () => { aiForm.tempBand = aiForm.tempBand === b ? null : b; renderAiPills(); });
    tempPills.append(p);
  }
  const scenePills = aiBench.querySelector('#ai-scenes');
  for (const s of v.scenes) {
    const p = el`<span class="pill">${s}</span>`;
    p.addEventListener('click', () => {
      const i = aiForm.scenes.indexOf(s);
      if (i === -1) aiForm.scenes.push(s); else aiForm.scenes.splice(i, 1);
      renderAiPills();
    });
    scenePills.append(p);
  }
  function renderAiPills() {
    [...tempPills.children].forEach((p) => p.classList.toggle('on', aiForm.tempBand === null ? p.textContent === '不限' : p.textContent === aiForm.tempBand));
    [...scenePills.children].forEach((p) => p.classList.toggle('on', aiForm.scenes.includes(p.textContent)));
  }
  aiBench.querySelector('#ai-taste').addEventListener('change', (e) => { aiForm.tasteRef = e.target.checked; });
  aiBench.querySelector('#ai-visual').addEventListener('change', (e) => { aiForm.visualReview = e.target.checked; });
  aiBench.querySelector('#ai-note').addEventListener('input', (e) => { aiForm.note = e.target.value; });
  renderAiPills();

  const aiRunBtn = aiBench.querySelector('#ai-run');
  const aiErr = aiBench.querySelector('#ai-err');
  async function runAi(avoid = null, btnLabel = 'AI 出一套') {
    aiErr.classList.remove('show');
    aiRunBtn.disabled = true;
    aiRunBtn.textContent = 'AI 正在翻衣柜，约半分钟…';
    aiResult.innerHTML = '';
    aiResult.append(el`<p class="muted" style="font-size:13px;letter-spacing:.08em;padding:8px 2px">${btnLabel === 'AI 出一套' ? 'AI 正在挑衣服…' : '换一套中…'}</p>`);
    try {
      const t = await api.createOutfitTask({ ...aiForm, avoid });
      const r = await api.runOutfitTask(t.taskId);
      renderAiDraft(r.draft);
    } catch (e) {
      aiResult.innerHTML = '';
      aiErr.textContent = e.message;
      aiErr.classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      aiRunBtn.disabled = false;
      aiRunBtn.textContent = 'AI 出一套';
    }
  }
  aiRunBtn.addEventListener('click', () => runAi());

  function renderAiDraft(draft) {
    aiResult.innerHTML = '';
    const card = el`<div class="form-section ai-draft"></div>`;
    card.append(el`<div class="fs-head"><h3>${esc(draft.title)}</h3><span class="fs-no">AI DRAFT · 未存档</span></div>`);
    const pieces = el`<div class="pieces" style="display:flex;gap:12px;flex-wrap:wrap"></div>`;
    for (const it of draft.items) {
      pieces.append(el`<a href="#/item/${it.id}" class="ai-piece" title="${esc(it.name)}">
        <div class="f">${figureInner(it)}</div>
        <span>NO.${noLabel(it)} ${esc(it.name)}</span>
      </a>`);
    }
    card.append(pieces);
    card.append(el`<p style="font-size:13.5px;letter-spacing:.04em;line-height:2;margin:14px 0 0">${esc(draft.reason)}</p>`);
    if (draft.visualNote) card.append(el`<p class="muted" style="font-size:12.5px;letter-spacing:.04em;line-height:2;margin:8px 0 0">视觉复核：${esc(draft.visualNote)}</p>`);
    if (draft.warning) card.append(el`<p style="font-size:12.5px;color:var(--accent);letter-spacing:.04em;margin:8px 0 0">${esc(draft.warning)}</p>`);

    const acts = el`<div class="btnline" style="margin-top:16px">
      <button type="button" class="btn primary" data-a="save">存为套搭</button>
      <button type="button" class="btn" data-a="dislike">不喜欢</button>
      <button type="button" class="btn" data-a="reroll">换一套</button>
      <button type="button" class="btn sm" data-a="drop">丢弃</button>
    </div>`;
    card.append(acts);

    // 「不喜欢 + 一句话」（方案 3.7）：点标签即记避雷并立刻换一套
    const dislikePanel = el`<div class="ann-rows" style="display:none;margin-top:14px"></div>`;
    dislikePanel.append(el`<p class="muted" style="font-size:12.5px;letter-spacing:.06em;margin-bottom:10px">点一个理由就算记下——自动进避雷清单，并马上换一套避开这个问题。</p>`);
    const tagRow = el`<div class="pills"></div>`;
    const cmt = el`<input type="text" placeholder="再补一句（可空）" style="margin-top:10px">`;
    for (const r of v.avoidReasons) {
      const tag = el`<button type="button" class="pill">${r}</button>`;
      tag.addEventListener('click', async () => {
        try {
          await api.createAvoid({
            kind: '套搭', itemIds: draft.itemIds, reasons: [r],
            comment: cmt.value.trim() || null,
            tempBand: aiForm.tempBand, scenes: aiForm.scenes,
          });
          toast('记下了，换一套');
        } catch (e) { toast(`避雷没记上：${e.message}`, true); }
        dislikePanel.style.display = 'none';
        runAi({ itemIds: draft.itemIds, reasonText: `${r}${cmt.value.trim() ? `——${cmt.value.trim()}` : ''}` }, '换一套');
      });
      tagRow.append(tag);
    }
    dislikePanel.append(tagRow, cmt);
    card.append(dislikePanel);

    acts.querySelector('[data-a=save]').addEventListener('click', async () => {
      try {
        await api.createOutfit({
          title: draft.title, itemIds: draft.itemIds,
          tempBand: aiForm.tempBand, scenes: aiForm.scenes,
        });
        toast('已存为套搭');
        aiResult.innerHTML = '';
        load();
      } catch (e) { toast(e.message, true); }
    });
    acts.querySelector('[data-a=dislike]').addEventListener('click', () => {
      dislikePanel.style.display = dislikePanel.style.display === 'none' ? 'block' : 'none';
    });
    acts.querySelector('[data-a=reroll]').addEventListener('click', () => runAi(null, '换一套'));
    acts.querySelector('[data-a=drop]').addEventListener('click', () => { aiResult.innerHTML = ''; });
    aiResult.append(card);
  }

  view.append(runhead, aiBench, aiResult, el`<div style="height:34px"></div>`, filters, list);

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
