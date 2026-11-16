// 避雷清单：被否组合与理由的账本（一期手动记录；「立刻换一套」闭环等二期 AI 搭配）
// buildAvoidForm 同时供详情页「记入避雷」小面板复用

import { api } from '../api.js';
import { el, esc, vocab, openPopover, poItem, toast } from '../components.js';


export async function avoid(view) {
  const list = await api.avoidlist();

  view.append(el`<div class="runhead"><h2>避雷清单</h2><span>BLACKLIST — ${list.length} 条</span></div>`);
  view.append(el`
    <p class="muted" style="font-size:12.5px;letter-spacing:.1em;line-height:2;margin-bottom:24px">
      被否掉的组合和理由都攒在这里。它目前用于「自己可见」；会不会作为负面偏好喂给 AI，等方案第 5 节待定项拍板再说。
    </p>`);

  const formWrap = el`<div class="form-section"></div>`;
  view.append(formWrap);

  const listWrap = el`<div></div>`;
  view.append(listWrap);

  async function renderList() {
    const data = await api.avoidlist();
    view.querySelector('.runhead span').textContent = `BLACKLIST — ${data.length} 条`;
    listWrap.innerHTML = '';
    if (data.length === 0) {
      listWrap.append(el`<div class="empty"><em>清单还是空的</em>在衣服详情页点「记入避雷」，或在上面手动记一条</div>`);
      return;
    }
    for (const a of data) {
      const date = a.createdAt.slice(0, 10).replaceAll('-', '.');
      const card = el`<div class="avoid-card">
        <div class="a-main">
          <div class="a-kind">${a.kind === '套搭' ? '套搭雷' : '单品雷'}${a.tempBand ? ` · ${esc(a.tempBand)}` : ''}${a.scenes?.length ? ` · ${a.scenes.map(esc).join('/')}` : ''}</div>
          <div class="a-comment">${esc(a.comment || '（没有留一句话）')}</div>
          <div class="a-tags">${a.reasons.map((r) => `<span>${esc(r)}</span>`).join('')}</div>
          <div class="a-meta">${date}</div>
        </div>
        <div class="a-items"></div>
        <button class="btn sm accent">删除</button>
      </div>`;
      const items = card.querySelector('.a-items');
      for (const it of a.items) {
        items.append(el`<div class="it">
          <div class="f">${it.productImage ? `<img src="/${it.productImage}" alt="">` : `<svg style="fill:#8C8479"><use href="#g-${it.sub}"/></svg>`}</div>
          <div class="nm" title="${esc(it.name)}">${esc(it.name)}</div>
        </div>`);
      }
      if (a.items.length === 0) items.append(el`<span class="muted" style="font-size:12px">（未关联衣服${a.refOutfitId ? '，套搭已删' : ''}）</span>`);
      card.querySelector('button').addEventListener('click', async (e) => {
        if (e.target.dataset.confirm) {
          try { await api.deleteAvoid(a.id); toast('已删除'); renderList(); }
          catch (err) { toast(err.message, true); }
        } else {
          e.target.dataset.confirm = '1';
          e.target.textContent = '确认删除？';
          setTimeout(() => { delete e.target.dataset.confirm; e.target.textContent = '删除'; }, 2600);
        }
      });
      listWrap.append(card);
    }
  }

  await buildAvoidForm(formWrap, {}, renderList);
  await renderList();
}

// 可复用的避雷录入表单（详情页传 preset）
export async function buildAvoidForm(container, preset = {}, onSaved) {
  const v = await vocab();
  const state = {
    kind: preset.kind || '单品',
    itemIds: [...(preset.itemIds || [])],
    reasons: [],
    comment: '',
    tempBand: preset.tempBand || null,
    scenes: [...(preset.scenes || [])],
  };
  let allClothes = [];

  container.innerHTML = '';
  container.append(el`
    <div class="fs-head"><h3>记一条避雷</h3><span class="fs-no">AVOID</span></div>
    <p class="muted" style="font-size:12px;letter-spacing:.08em;margin-bottom:16px;line-height:1.9">
      点一个理由标签就算提交，不写句子也行。以后翻到这条，就知道当时为什么否掉它。
    </p>
  `);

  // 类型
  const kindRow = el`<div class="frow"><div class="field"><label>类型</label><div class="pills" id="av-kind"></div></div></div>`;
  container.append(kindRow);
  const kindPills = kindRow.querySelector('#av-kind');
  for (const k of ['单品', '套搭']) {
    const p = el`<button type="button" class="pill ${state.kind === k ? 'on' : ''}">${k}</button>`;
    p.addEventListener('click', () => {
      state.kind = k;
      kindPills.querySelectorAll('.pill').forEach((x) => x.classList.toggle('on', x.textContent === k));
    });
    kindPills.append(p);
  }

  // 涉及衣服（弹层多选）
  const itemRow = el`<div class="frow"><div class="field"><label>涉及衣服（单品雷必选）</label>
    <button type="button" class="btn sm" id="av-pick">选择衣服（已选 0）</button>
    <div class="pills" id="av-items" style="margin-top:8px"></div>
  </div></div>`;
  container.append(itemRow);
  const pickBtn = itemRow.querySelector('#av-pick');
  const itemsBox = itemRow.querySelector('#av-items');
  function renderItems() {
    pickBtn.textContent = `选择衣服（已选 ${state.itemIds.length}）`;
    itemsBox.innerHTML = '';
    for (const id of state.itemIds) {
      const c = allClothes.find((x) => x.id === id);
      const chip = el`<button type="button" class="pill on">${esc(c?.name || id)} ×</button>`;
      chip.addEventListener('click', () => {
        state.itemIds = state.itemIds.filter((x) => x !== id);
        renderItems();
      });
      itemsBox.append(chip);
    }
  }
  pickBtn.addEventListener('click', async () => {
    if (allClothes.length === 0) allClothes = await api.clothes();
    openPopover(pickBtn, (pop) => {
      pop.append(el`<div class="po-title">点选加入（可多选）</div>`);
      for (const c of allClothes) {
        const on = state.itemIds.includes(c.id);
        pop.append(poItem(`${String(c.no).padStart(2, '0')} ${c.name}${on ? ' ✓' : ''}`, on, () => {
          if (on) state.itemIds = state.itemIds.filter((x) => x !== c.id);
          else state.itemIds.push(c.id);
          renderItems();
          pickBtn.click(); // 关了再开，刷新勾选态
        }));
      }
    });
  });

  // 理由标签（点一个即可提交）
  const reasonRow = el`<div class="frow"><div class="field" style="min-width:100%"><label>理由标签 *</label><div class="pills" id="av-reasons"></div></div></div>`;
  container.append(reasonRow);
  const reasonPills = reasonRow.querySelector('#av-reasons');
  for (const r of v.avoidReasons) {
    const p = el`<button type="button" class="pill">${r}</button>`;
    p.addEventListener('click', () => {
      const i = state.reasons.indexOf(r);
      if (i === -1) state.reasons.push(r); else state.reasons.splice(i, 1);
      p.classList.toggle('on');
    });
    reasonPills.append(p);
  }

  // 一句话
  const cmtRow = el`<div class="frow"><div class="field" style="min-width:100%"><label>一句话（可空）</label>
    <input type="text" id="av-comment" placeholder="如：牛仔外套配这条裙显壮"></div></div>`;
  container.append(cmtRow);

  // 提交
  const actions = el`<div class="form-actions"><button class="btn primary" id="av-save">记下了</button></div>`;
  container.append(actions);
  actions.querySelector('#av-save').addEventListener('click', async () => {
    if (state.reasons.length === 0) return toast('至少点一个理由标签', true);
    if (state.kind === '单品' && state.itemIds.length === 0) return toast('单品雷至少选一件衣服', true);
    try {
      await api.createAvoid({
        kind: state.kind, itemIds: state.itemIds, reasons: state.reasons,
        comment: cmtRow.querySelector('#av-comment').value.trim() || null,
        tempBand: state.tempBand, scenes: state.scenes,
        refOutfitId: preset.refOutfitId || null,
      });
      toast('已记入避雷清单');
      cmtRow.querySelector('#av-comment').value = '';
      onSaved?.();
    } catch (e) {
      toast(e.message, true);
    }
  });
  renderItems();
}
