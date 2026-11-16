// 搭配板：工作区草稿（localStorage 持久化）→ 上装/下装分区 → 标温度带+场景 → 存套搭

import { api } from '../api.js';
import { el, esc, vocab, boardDraft, boardRemove, boardSet, boardAdd, garmentSvg, openClothesPicker, toast } from '../components.js';

export async function board(view) {
  const v = await vocab();
  const all = await api.clothes();
  const draftIds = boardDraft();

  // —— 左：版面（已选衣服按上下装分区） ——
  const canvas = el`<div class="board-canvas"></div>`;
  // —— 右：加衣服 + 存档表单 ——
  const side = el`<div class="board-side"></div>`;
  const layout = el`<div class="board-layout"></div>`;
  layout.append(canvas, side);

  view.append(
    el`<div class="runhead"><h2>搭配板</h2><span>THE BOARD · 草稿存在本机，刷新不丢</span></div>`,
    layout,
  );

  function itemsOf(ids) {
    return ids.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  }

  function renderCanvas() {
    const items = itemsOf(boardDraft());
    canvas.innerHTML = '';
    for (const [cat, title] of [['上装', '上装'], ['下装', '下装']]) {
      const grp = el`<div class="grp"><h4>${title}</h4><div class="bitems"></div></div>`;
      const bitems = grp.querySelector('.bitems');
      const inCat = items.filter((i) => i.category === cat);
      for (const it of inCat) {
        const b = el`<div class="bitem">
          <div class="f">${it.productImage ? `<img src="/${it.productImage}" alt="">` : garmentSvg(it)}</div>
          <div class="nm" title="${esc(it.name)}">${esc(it.name)}</div>
          <button class="rm" title="移出">×</button>
        </div>`;
        b.querySelector('.rm').addEventListener('click', () => {
          boardRemove(it.id);
          renderCanvas();
          renderAdders();
        });
        bitems.append(b);
      }
      if (inCat.length === 0) bitems.append(el`<span class="board-empty">还没选${title}</span>`);
      canvas.append(grp);
    }
    const warn = items.some((i) => i.category === '上装') && items.some((i) => i.category === '下装')
      ? null : '一套建议至少有一件上装和一件下装';
    if (items.length) {
      canvas.append(el`<p class="muted" style="font-size:12px;letter-spacing:.1em;${warn ? '' : 'display:none'}">${warn || ''}</p>`);
    }
  }

  function renderAdders() {
    side.innerHTML = '';
    side.append(el`<div class="field" style="margin-bottom:10px"><label>加衣服（也可在衣柜 / 搜索结果点「＋搭配板」）</label></div>`);
    const addRow = el`<div class="btnline" style="margin-bottom:18px"></div>`;
    for (const cat of ['上装', '下装']) {
      const btn = el`<button type="button" class="btn sm">＋ 挑一件${cat}</button>`;
      btn.addEventListener('click', () => {
        openClothesPicker({
          title: `挑一件${cat}`,
          clothes: all,
          category: cat,
          excludeIds: boardDraft(),
          onPick: (c) => {
            boardAdd(c.id);
            renderCanvas();
            renderAdders();
          },
        });
      });
      addRow.append(btn);
    }
    side.append(addRow);
    buildSaveForm();
  }

  function buildSaveForm() {
    const form = el`<div class="form-section" style="border:none;padding:18px 0 0">
      <div class="fs-head" style="border-bottom:1px solid var(--ink)"><h3>存套搭</h3><span class="fs-no">SAVE</span></div>
      <div class="field" style="margin-top:16px"><label>标题 <span style="color:var(--accent)">*</span></label>
        <input type="text" id="o-title" placeholder="如：衬衫 + 直筒裤的通勤日"></div>
      <div class="field" style="margin-top:14px"><label>温度带（可空）</label><div class="pills" id="o-temp"></div></div>
      <div class="field" style="margin-top:14px"><label>场景（可空，可多选）</label><div class="pills" id="o-scenes"></div></div>
      <div class="field" style="margin-top:14px"><label>备注（可空）</label>
        <input type="text" id="o-note" placeholder="一句备注"></div>
      <div class="form-actions" style="margin-top:20px">
        <button class="btn primary" id="o-save">存档这套</button>
        <button class="btn sm" id="o-clear">清空草稿</button>
      </div>
    </div>`;
    side.append(form);

    let tempBand = null;
    const scenes = [];
    const tempPills = form.querySelector('#o-temp');
    for (const b of v.tempBands) {
      const p = el`<button type="button" class="pill">${b}</button>`;
      p.addEventListener('click', () => {
        tempBand = tempBand === b ? null : b;
        tempPills.querySelectorAll('.pill').forEach((x) => x.classList.toggle('on', x.textContent === tempBand));
      });
      tempPills.append(p);
    }
    const scenePills = form.querySelector('#o-scenes');
    for (const s of v.scenes) {
      const p = el`<button type="button" class="pill">${s}</button>`;
      p.addEventListener('click', () => {
        const i = scenes.indexOf(s);
        if (i === -1) scenes.push(s); else scenes.splice(i, 1);
        p.classList.toggle('on');
      });
      scenePills.append(p);
    }
    form.querySelector('#o-clear').addEventListener('click', () => {
      boardSet([]);
      renderCanvas();
      renderAdders();
      toast('草稿已清空');
    });
    form.querySelector('#o-save').addEventListener('click', async () => {
      const items = itemsOf(boardDraft());
      const title = form.querySelector('#o-title').value.trim();
      if (!title) return toast('先给这套起个标题', true);
      if (items.length < 2) return toast('一套至少两件衣服', true);
      try {
        const r = await api.createOutfit({
          title, itemIds: items.map((i) => i.id),
          tempBand: tempBand || null, scenes,
          note: form.querySelector('#o-note').value.trim() || null,
        });
        boardSet([]);
        toast(r.warning ? `已存档（${r.warning}）` : '已存档');
        location.hash = '#/outfits';
      } catch (e) {
        toast(e.message, true);
      }
    });
  }

  if (all.length === 0) {
    view.innerHTML = '';
    view.append(el`<div class="empty"><em>衣柜还是空的</em>先去 <a class="linkbtn" href="#/wardrobe">录几件衣服</a>，搭配板才有东西可拼</div>`);
    return;
  }

  renderCanvas();
  renderAdders();
}
