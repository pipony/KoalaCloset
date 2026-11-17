// AI 标注员 · 存量体检：勾衣柜里的衣服 → codex 看图按词表给建议 → 逐件逐字段勾选确认 → 应用
// 安全模型：补空的建议默认勾；「和已填不一样的改动」默认不勾——改数据必须她主动；应用走 PUT 原接口

import { api } from '../api.js';
import { el, esc, noLabel, figureInner, toast } from '../components.js';

const FIELD_LABEL = {
  color: '主色', pattern: '图案', thickness: '厚薄', fit: '版型', length: '长度',
  neckline: '领型', fabric: '面料', elastic: '弹性', styles: '风格', brand: '品牌',
};

export async function annotate(view) {
  const all = (await api.clothes()).filter((c) => c.status !== '待买');

  view.append(el`
    <div class="runhead">
      <h2>AI 标注</h2><span>ANNOTATE · 描述卡体检与补全</span>
    </div>`);

  if (all.length === 0) {
    view.append(el`<div class="empty"><em>衣柜还是空的</em>先录几件衣服，再来体检描述卡。</div>`);
    return;
  }

  const bench = el`<div class="form-section">
    <div class="fs-head"><h3>挑衣服做体检</h3><span class="fs-no" id="ann-count">已选 0 / 12 件</span></div>
    <p class="muted" style="font-size:13px;letter-spacing:.06em;margin-bottom:14px">
      AI 看商品图对照描述卡：<b>空着的字段</b>给出补全建议（默认勾选采纳）；<b>已填但疑似不符的</b>给出改动建议（默认不勾，你确认才改）。发送内容 = 所选衣服的商品图 + 词表 + 当前文字卡。</p>
    <div class="ann-list" id="ann-list"></div>
    <div class="btnline" style="margin-top:16px">
      <button type="button" class="btn primary" id="ann-run">AI 体检 + 补全</button>
      <span class="muted" style="font-size:12px;letter-spacing:.08em">点按钮才联网，一批最多 12 件，约一分钟</span>
    </div>
    <div class="form-error" id="ann-err" style="margin-top:14px"></div>
  </div>`;
  view.append(bench);

  const selected = new Set();
  const listEl = bench.querySelector('#ann-list');
  const countEl = bench.querySelector('#ann-count');

  function renderList() {
    listEl.innerHTML = '';
    for (const c of all) {
      const on = selected.has(c.id);
      const cell = el`<label class="ann-item ${on ? 'on' : ''}">
        <input type="checkbox" ${on ? 'checked' : ''}>
        <div class="f">${figureInner(c)}</div>
        <div class="nm"><b>NO.${noLabel(c)} ${esc(c.name)}</b>
          <span class="muted">${esc([c.sub, c.color, c.fabric].filter(Boolean).join(' · ') || '卡片未填全')}</span></div>
      </label>`;
      cell.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          if (selected.size >= 12) { e.target.checked = false; toast('一批最多 12 件', true); return; }
          selected.add(c.id);
        } else selected.delete(c.id);
        cell.classList.toggle('on', e.target.checked);
        countEl.textContent = `已选 ${selected.size} / 12 件`;
      });
      listEl.append(cell);
    }
  }
  renderList();

  const resultWrap = el`<div></div>`;
  view.append(resultWrap);

  bench.querySelector('#ann-run').addEventListener('click', async (e) => {
    const btn = e.target;
    const errBox = bench.querySelector('#ann-err');
    errBox.classList.remove('show');
    if (selected.size === 0) { errBox.textContent = '先勾选要体检的衣服'; errBox.classList.add('show'); return; }
    btn.disabled = true;
    btn.textContent = 'AI 看图中，约一分钟…';
    try {
      const t = await api.createAnnotateTask({ itemIds: [...selected] });
      const r = await api.runAnnotateTask(t.taskId);
      renderResults(r.suggestions || []);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI 体检 + 补全';
    }
  });

  function renderResults(suggestions) {
    resultWrap.innerHTML = '';
    if (suggestions.length === 0) {
      resultWrap.append(el`<div class="empty" style="margin-top:30px"><em>这批卡片 AI 没挑出毛病</em>空字段它也认不出来（或图上看不清）——不用动。</div>`);
      return;
    }
    resultWrap.append(el`<div class="runhead" style="margin-top:36px"><h2>体检结果</h2><span>${suggestions.length} 件有建议 · 逐项勾选后应用</span></div>`);
    resultWrap.append(el`<p class="muted" style="font-size:12px;letter-spacing:.08em;margin:10px 2px 18px">「补空」默认勾上；「改动已有值」默认不勾——想采纳就自己勾。应用走原编辑接口，一切照旧可追溯。</p>`);
    const applied = new Set();
    for (const s of suggestions) {
      const src = all.find((c) => c.id === s.itemId);
      const card = el`<div class="form-section ann-card" data-id="${s.itemId}"></div>`;
      const head = el`<div class="fs-head">
        <h3>NO.${noLabel(src)} ${esc(src.name)}</h3>
        <span class="fs-no">${s.agreeCount} 项一致 · ${s.issues.length ? esc(s.issues.join('；')) : '词表全过'}</span>
      </div>`;
      card.append(head);
      const rows = el`<div class="ann-rows"></div>`;
      const entries = [];
      for (const [f, val] of Object.entries(s.fills || {})) entries.push({ f, from: null, to: Array.isArray(val) ? val.join('·') : val, isFill: true });
      for (const [f, { from, to }] of Object.entries(s.corrections || {})) entries.push({ f, from: Array.isArray(from) ? from.join('·') : from, to: Array.isArray(to) ? to.join('·') : to, isFill: false });
      for (const en of entries) {
        const row = el`<label class="ann-row ${en.isFill ? 'fill' : 'fix'}" data-f="${en.f}">
          <input type="checkbox" ${en.isFill ? 'checked' : ''}>
          <span class="k">${FIELD_LABEL[en.f] || en.f}</span>
          <span class="v">${en.isFill ? `<span class="muted">（空）</span> <span class="arr">→</span> <b>${esc(en.to)}</b>` : `<s>${esc(en.from)}</s> <span class="arr">→</span> <b>${esc(en.to)}</b>`}</span>
          <span class="tag">${en.isFill ? '补空' : '改动'}</span>
        </label>`;
        rows.append(row);
      }
      card.append(rows);
      const act = el`<div class="btnline" style="margin-top:14px">
        <button type="button" class="btn sm primary ann-apply">应用勾选项</button>
        <span class="muted ann-note" style="font-size:12px;letter-spacing:.06em"></span>
      </div>`;
      card.append(act);
      act.querySelector('.ann-apply').addEventListener('click', async (e) => {
        const btn = e.target;
        const checked = [...card.querySelectorAll('.ann-row')].filter((r) => r.querySelector('input').checked);
        if (checked.length === 0) return toast('没勾任何项', true);
        // 从建议里取真值（展示层可能拼接过字符串）
        const patch = {};
        for (const r of checked) {
          const field = r.dataset.f;
          patch[field] = s.fills?.[field] ?? s.corrections?.[field]?.to;
        }
        const next = { ...src, ...patch, updatedAt: src.updatedAt };
        const missing = requiredMissing(next);
        if (missing.length) {
          act.querySelector('.ann-note').textContent = `应用后还缺：${missing.join('、')}——去编辑页手动补这几项再存`;
          return;
        }
        btn.disabled = true;
        btn.textContent = '应用中…';
        try {
          await api.updateCloth(s.itemId, { ...patch, updatedAt: src.updatedAt });
          applied.add(s.itemId);
          Object.assign(src, patch);
          btn.textContent = '✓ 已应用';
          toast(`NO.${noLabel(src)} ${src.name} 已更新`);
        } catch (err) {
          toast(err.message, true);
          btn.disabled = false;
          btn.textContent = '应用勾选项';
        }
      });
      resultWrap.append(card);
    }
  }

  function requiredMissing(c) {
    const req = ['category', 'sub', 'color', 'pattern', 'thickness', 'fit', 'length', 'fabric', 'elastic'];
    const miss = req.filter((k) => !c[k]);
    if ((!c.styles || c.styles.length === 0)) miss.push('风格');
    return miss.map((k) => FIELD_LABEL[k] || k);
  }
}
