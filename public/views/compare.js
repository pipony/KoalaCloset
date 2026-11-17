// 买前比对工作台：丢淘宝卖家秀/详情页截图 → codex AI 看图比对 → 结论进待买详情页
// 临时性质：比对完「买了转正 / 没买丢掉」，页面引导清理，不当收藏攒
// 联网操作：仅点「开始 AI 比对」按钮触发；发送内容 = 上传的截图 + 衣柜文字卡（不发衣柜照片）

import { api } from '../api.js';
import { el, clothesCard, boardAdd, boardDraft, toast } from '../components.js';
import { compressImage } from '../compress.js';

export async function compare(view) {
  const pending = await api.clothes({ status: '待买' });

  view.append(el`
    <div class="runhead">
      <h2>买前比对</h2><span>PRE-PURCHASE CHECK · 临时比对，看完就清理</span>
    </div>`);

  // —— 上传工作台 ——
  const bench = el`<div class="form-section">
    <div class="fs-head"><h3>把看中的衣服截图丢进来</h3><span class="fs-no">AI COMPARE</span></div>
    <p class="muted" style="font-size:13px;letter-spacing:.06em;margin-bottom:14px">
      淘宝卖家秀 + 详情页尺寸表截图，1~8 张。点「开始比对」后 AI 自己看图提信息、对着衣柜和基准款比对、给结论——不用手动填任何字段。</p>
    <div class="compare-drop" id="c-drop"></div>
    <div class="btnline" style="margin-top:16px">
      <button type="button" class="btn primary" id="c-run">开始 AI 比对</button>
      <span class="muted" id="c-hint" style="font-size:12px;letter-spacing:.08em">将发送：你上传的截图 + 衣柜文字卡（不发衣柜照片），约半分钟出结果</span>
    </div>
    <div class="form-error" id="c-err" style="margin-top:14px"></div>
  </div>`;
  view.append(bench);

  const shots = []; // { b64 }
  const drop = bench.querySelector('#c-drop');
  const runBtn = bench.querySelector('#c-run');
  const errBox = bench.querySelector('#c-err');

  function renderShots() {
    drop.innerHTML = '';
    if (shots.length === 0) {
      drop.append(el`<div class="cd-empty">点击或拖入截图（可多选）——先给商品图，再给尺寸表截图，AI 比得更准</div>`);
      return;
    }
    for (const [i, s] of shots.entries()) {
      const cell = el`<div class="cd-cell">
        <img src="${s.b64}" alt="截图 ${i + 1}">
        <button type="button" class="rm" title="移除">×</button>
      </div>`;
      cell.querySelector('.rm').addEventListener('click', (e) => {
        e.stopPropagation(); // 不然冒泡到 drop 会弹文件选择器
        shots.splice(i, 1);
        renderShots();
      });
      drop.append(cell);
    }
    if (shots.length < 8) drop.append(el`<button type="button" class="cd-add">＋ 加截图</button>`);
  }

  async function handleFiles(files) {
    for (const f of files) {
      if (shots.length >= 8) return toast('最多 8 张', true);
      if (!f.type.startsWith('image/')) continue;
      try { shots.push({ b64: await compressImage(f) }); } catch (e) { toast(e.message, true); }
    }
    renderShots();
  }

  drop.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic';
    input.multiple = true;
    input.onchange = () => handleFiles([...input.files]);
    input.click();
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    handleFiles([...e.dataTransfer.files]);
  });
  renderShots();

  runBtn.addEventListener('click', async () => {
    errBox.classList.remove('show');
    if (shots.length === 0) { errBox.textContent = '先传至少一张截图'; errBox.classList.add('show'); return; }
    runBtn.disabled = true;
    runBtn.textContent = 'AI 正在看图比对，约半分钟…';
    try {
      const t = await api.createPrecheckTask(shots.map((s) => s.b64));
      const r = await api.runPrecheckTask(t.taskId);
      toast(`比完了：${r.cloth.aiConclusion?.summary || r.cloth.name}`);
      location.hash = `#/item/${r.cloth.id}`;
    } catch (e) {
      errBox.textContent = e.message;
      errBox.classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '开始 AI 比对';
    }
  });

  // —— 进行中的比对（待买档案列表，临时性质，引导清理） ——
  view.append(el`<div class="runhead" style="margin-top:36px"><h2>进行中的比对</h2><span>${pending.length} 件</span></div>`);
  if (pending.length === 0) {
    view.append(el`<div class="empty"><em>没有在比的衣服</em>上面传截图开始一次比对。比对是临时动作——看完结论就「转正」或「丢掉」，这里不攒东西。</div>`);
    return;
  }
  const grid = el`<div class="grid"></div>`;
  view.append(grid);
  for (const c of pending) {
    const card = clothesCard(c, { showOps: true });
    const summary = c.aiConclusion?.summary;
    if (summary) card.querySelector('.caption p').textContent = summary;
    card.addEventListener('click', (e) => {
      const op = e.target.closest('[data-op]')?.dataset.op;
      if (op === 'board') { boardAdd(c.id); toast(`已加入搭配板（当前 ${boardDraft().length} 件）`); }
      else location.hash = `#/item/${c.id}`;
    });
    grid.append(card);
  }
}
