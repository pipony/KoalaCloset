// 套搭详情页：组成衣服（可点进档案）· 备注可编辑 · 实际上身图上传/删除 · 复刻/删除

import { api } from '../api.js';
import { el, els, esc, garmentSvg, boardSet, toast } from '../components.js';
import { compressImage } from '../compress.js';

export async function outfitDetail(view, [id]) {
  const o = await api.outfit(id);
  const date = o.createdAt.slice(0, 10).replaceAll('-', '.');

  view.append(els`
    <div class="backline"><a class="linkbtn" href="#/outfits">← 回套搭列表</a></div>
    <div class="detail-head">
      <h2>${esc(o.title)}</h2>
      <span class="muted" style="letter-spacing:.15em">温度带 ${esc(o.tempBand || '未标')} · ${(o.scenes || []).length ? o.scenes.map(esc).join(' / ') : '场景未标'} · 存档于 ${date} · ${o.items.length} 件</span>
    </div>
  `);

  // —— 组成衣服（按上下装分组，点击进档案） ——
  for (const cat of ['上装', '下装']) {
    const inCat = o.items.filter((it) => it.category === cat);
    if (inCat.length === 0) continue;
    const grp = el`<div style="margin-bottom:26px">
      <div class="sec-title" style="margin-bottom:14px"><h2 style="font-size:17px">${cat}</h2><span>${inCat.length} 件 · 点击进档案</span></div>
      <div class="detail-figs" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))"></div>
    </div>`;
    const figs = grp.querySelector('.detail-figs');
    for (const it of inCat) {
      const fig = el`<div style="cursor:pointer">
        <figure style="height:220px">${it.productImage ? `<img src="/${it.productImage}" alt="">` : garmentSvg(it)}</figure>
        <figcaption>${String(it.no).padStart(2, '0')} ${esc(it.name)} · ${it.sub}${it.boughtSize ? ` · ${esc(it.boughtSize)}` : ''}</figcaption>
      </div>`;
      fig.addEventListener('click', () => { location.hash = `#/item/${it.id}`; });
      figs.append(fig);
    }
    view.append(grp);
  }

  // —— 我的备注（就地编辑保存） ——
  let savedNote = o.note || '';
  let savedAt = o.updatedAt;
  const noteSec = el`<div class="form-section">
    <div class="fs-head"><h3>我的备注</h3><span class="fs-no">NOTES</span></div>
    <div class="field" style="min-width:100%">
      <textarea id="of-note" style="min-height:90px" placeholder="这套穿下来的感受、适合的场合细节、别人怎么说…">${esc(savedNote)}</textarea>
    </div>
    <div class="form-actions"><button class="btn primary sm" id="of-note-save">保存备注</button><span class="muted" id="of-note-state"></span></div>
  </div>`;
  view.append(noteSec);
  noteSec.querySelector('#of-note-save').addEventListener('click', async () => {
    try {
      const r = await api.updateOutfit(o.id, { note: noteSec.querySelector('#of-note').value.trim(), updatedAt: savedAt });
      savedNote = r.note || '';
      savedAt = r.updatedAt;
      noteSec.querySelector('#of-note-state').textContent = `已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      toast('备注已保存');
    } catch (e) {
      noteSec.querySelector('#of-note-state').textContent = '';
      toast(e.message, true);
    }
  });

  // —— 实际上身图 ——
  const imgSec = el`<div class="form-section">
    <div class="fs-head"><h3>实际上身图</h3><span class="fs-no">WORN LOOKS</span></div>
    <p class="muted" style="font-size:12px;letter-spacing:.08em;margin-bottom:16px;line-height:1.9">
      穿上这套时拍一张存档——正面全身为主，和衣服档案的实拍一个习惯。只存本机。
    </p>
    <div class="detail-figs" id="of-imgs" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));margin-bottom:0"></div>
    <div class="form-actions" style="margin-top:18px">
      <button class="btn primary sm" id="of-img-add">＋ 传一张上身图</button>
    </div>
  </div>`;
  view.append(imgSec);
  const imgGrid = imgSec.querySelector('#of-imgs');

  function renderImages() {
    imgGrid.innerHTML = '';
    const imgs = o.images || [];
    if (imgs.length === 0) {
      imgGrid.append(el`<div class="empty" style="grid-column:1/-1;padding:26px">还没有上身图</div>`);
      return;
    }
    for (const rel of imgs) {
      const cell = el`<div style="position:relative">
        <figure style="height:230px"><img src="/${rel}" alt="上身图"></figure>
        <figcaption>${rel.split('/').pop()}</figcaption>
        <button class="btn sm accent" style="position:absolute;top:8px;right:8px">删除</button>
      </div>`;
      cell.querySelector('button').addEventListener('click', async () => {
        try {
          await api.removeOutfitImage(o.id, rel.split('/').pop());
          o.images = (o.images || []).filter((p) => p !== rel);
          toast('已删除');
          renderImages();
        } catch (e) { toast(e.message, true); }
      });
      imgGrid.append(cell);
    }
  }
  renderImages();

  imgSec.querySelector('#of-img-add').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic';
    input.onchange = async () => {
      if (!input.files[0]) return;
      try {
        const b64 = await compressImage(input.files[0], 1100, 0.84);
        const r = await api.addOutfitImage(o.id, b64);
        o.images = r.images;
        savedAt = r.updatedAt;
        toast('上身图已存');
        renderImages();
      } catch (e) { toast(e.message, true); }
    };
    input.click();
  });

  // —— 操作 ——
  const actions = el`<div class="form-actions" style="margin-top:30px">
    <button class="btn" id="of-clone">复刻到搭配板</button>
    <button class="btn accent" id="of-del">删除这套</button>
  </div>`;
  view.append(actions);
  actions.querySelector('#of-clone').addEventListener('click', () => {
    boardSet(o.itemIds);
    toast('已复刻到搭配板');
    location.hash = '#/board';
  });
  actions.querySelector('#of-del').addEventListener('click', async (e) => {
    const btn = e.target;
    if (btn.dataset.confirm) {
      try {
        await api.deleteOutfit(o.id);
        toast('已删除');
        location.hash = '#/outfits';
      } catch (err) { toast(err.message, true); }
    } else {
      btn.dataset.confirm = '1';
      btn.textContent = '确认删除？';
      setTimeout(() => { delete btn.dataset.confirm; btn.textContent = '删除这套'; }, 2600);
    }
  });
}
