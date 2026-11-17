// 录入 / 编辑表单：身份组（大类↔细分联动）· 词表组 pills · 图片组（压缩上传）· 尺码组
// 待买档案由「买前比对」AI 生成，不经此表单；但待买件仍可进来编辑（校对 AI 提取结果），状态不可改

import { api } from '../api.js';
import { el, els, esc, vocab, toast, boardBadge, noLabel } from '../components.js';
import { compressImage } from '../compress.js';

export async function editor(view, [param]) {
  const isNew = param === 'new';
  const item = isNew ? null : await api.cloth(param);
  const v = await vocab();
  const isWish = item?.status === '待买';

  // 表单状态（新增字段先留空，提交时由服务端词表校验兜底）
  const form = item ? {
    name: item.name, brand: item.brand || '', category: item.category, sub: item.sub,
    color: item.color, pattern: item.pattern, thickness: item.thickness,
    fit: item.fit, length: item.length, neckline: item.neckline || null,
    fabric: item.fabric, elastic: item.elastic, styles: [...(item.styles || [])],
    sizeChart: structuredClone(item.sizeChart || []), boughtSize: item.boughtSize || '',
    fitFeedback: item.fitFeedback || '', isBaseline: item.isBaseline,
    productPath: item.productImage, fitPath: item.fitImage, chartPath: item.sizeChartImage,
    productB64: '', fitB64: '', chartB64: '', updatedAt: item.updatedAt,
  } : {
    name: '', brand: '', category: '上装', sub: '短袖',
    color: null, pattern: null, thickness: null, fit: null, length: null,
    neckline: null, fabric: null, elastic: null, styles: [],
    sizeChart: [], boughtSize: '', fitFeedback: '', isBaseline: false,
    productPath: null, fitPath: null, chartPath: null,
    productB64: '', fitB64: '', chartB64: '', updatedAt: null,
  };

  view.append(els`
    <div class="backline"><a class="linkbtn" href="${isNew ? '#/wardrobe' : `#/item/${item.id}`}">← ${isWish ? '回比对详情' : (isNew ? '回衣柜' : '回详情')}</a></div>
    <div class="runhead"><h2>${isNew ? '录入新衣' : '编辑档案'}</h2><span id="f-runhead">${isNew ? 'NEW ENTRY' : `NO.${noLabel(item)}`}</span></div>
    <div class="form-error" id="ferr"></div>
  `);

  // ========== 01 身份组 ==========
  const sec1 = el`<div class="form-section">
    <div class="fs-head"><h3>身份组</h3><span class="fs-no">01 / Identity</span></div>
    <div class="frow">
      <div class="field"><label>名称 <span class="req">*</span></label><input type="text" id="f-name" placeholder="如：白色棉麻衬衫" value="${esc(form.name)}"></div>
      <div class="field"><label>品牌</label><input type="text" id="f-brand" placeholder="可空" value="${esc(form.brand)}"></div>
      <div class="field"><label>大类 <span class="req">*</span></label><select id="f-cat"></select></div>
      <div class="field"><label>细分 <span class="req">*</span></label><select id="f-sub"></select></div>
    </div>
    ${isWish ? '<p class="muted" style="font-size:12px;letter-spacing:.08em;margin-top:10px">这是 AI 比对生成的待买档案——改错了的地方在这儿校对；状态不用管，「买了·转正式档案」在详情页。</p>' : ''}
  </div>`;
  view.append(sec1);
  const catSel = sec1.querySelector('#f-cat');
  const subSel = sec1.querySelector('#f-sub');
  for (const c of Object.keys(v.categories)) catSel.append(new Option(c, c));
  function fillSubs() {
    subSel.innerHTML = '';
    for (const s of v.categories[form.category]) subSel.append(new Option(s, s));
    subSel.value = form.sub;
    if (!v.categories[form.category].includes(form.sub)) {
      form.sub = v.categories[form.category][0];
      subSel.value = form.sub;
    }
  }
  catSel.value = form.category;
  fillSubs();
  catSel.addEventListener('change', () => { form.category = catSel.value; fillSubs(); renderNeckline(); });
  subSel.addEventListener('change', () => { form.sub = subSel.value; });

  // ========== 02 描述卡词表组 ==========
  const sec2 = el`<div class="form-section">
    <div class="fs-head"><h3>描述卡 · 固定词表</h3><span class="fs-no">02 / Descriptors</span></div>
    <div class="frow" style="flex-direction:column;gap:20px" id="vocab-rows"></div>
  </div>`;
  view.append(sec2);
  const vocabRows = sec2.querySelector('#vocab-rows');

  function pillGroup(key, label, { nullable = false, multi = false, max = 0 } = {}) {
    const def = v.fields[key];
    const wrap = el`<div class="field" style="min-width:100%">
      <label>${label}${nullable ? '（可空）' : ''}${max ? ` 最多 ${max} 项` : ''}</label>
      <div class="pills"></div>
    </div>`;
    const pills = wrap.querySelector('.pills');
    function render() {
      pills.innerHTML = '';
      if (nullable) pills.append(makePill('不填', null));
      for (const opt of def.vocab) pills.append(makePill(opt, opt));
    }
    function makePill(text, value) {
      const on = multi ? form[key]?.includes(value) : form[key] === value;
      const p = el`<button type="button" class="pill ${on ? 'on' : ''} ${value === null ? 'nullable' : ''}">${text}</button>`;
      p.addEventListener('click', () => {
        if (multi) {
          const cur = form[key] || [];
          if (cur.includes(value)) form[key] = cur.filter((x) => x !== value);
          else if (!max || cur.length < max) form[key] = [...cur, value];
          else { toast(`最多选 ${max} 项`, true); return; }
        } else {
          form[key] = form[key] === value && nullable ? null : value;
        }
        render();
      });
      return p;
    }
    render();
    vocabRows.append(wrap);
  }
  pillGroup('color', '主色');
  pillGroup('pattern', '图案');
  pillGroup('thickness', '厚薄');
  pillGroup('fit', '版型');
  pillGroup('length', '长度');
  pillGroup('fabric', '面料');
  pillGroup('elastic', '弹性');
  pillGroup('styles', '风格', { multi: true, max: 2 });
  // 领型行单独处理：仅上装显示
  const necklineWrap = el`<div class="field" style="min-width:100%" id="neckline-row"></div>`;
  vocabRows.append(necklineWrap);
  function renderNeckline() {
    necklineWrap.innerHTML = '';
    if (form.category !== '上装') return;
    necklineWrap.innerHTML = `<label>领型（可空）</label>`;
    const pills = el`<div class="pills"></div>`;
    const mk = (text, value) => {
      const on = form.neckline === value;
      const p = el`<button type="button" class="pill ${on ? 'on' : ''} ${value === null ? 'nullable' : ''}">${text}</button>`;
      p.addEventListener('click', () => { form.neckline = form.neckline === value ? null : value; renderNeckline(); });
      return p;
    };
    pills.append(mk('不填', null));
    for (const opt of v.fields.neckline.vocab) pills.append(mk(opt, opt));
    necklineWrap.append(pills);
  }
  renderNeckline();

  // ========== 03 图片组 ==========
  const sec3 = el`<div class="form-section">
    <div class="fs-head"><h3>图片</h3><span class="fs-no">03 / Images</span></div>
    <div class="frow" id="img-row"></div>
    <p class="muted" style="font-size:12px;letter-spacing:.08em;line-height:1.9">
      商品图做衣柜封面（必备）；实拍以一张正面全身照为主，拿不准合身程度才需要拍。iPhone 的 HEIC 图请截图后再传。
    </p>
  </div>`;
  view.append(sec3);
  const imgRow = sec3.querySelector('#img-row');
  function dropzone(label, { b64Key, pathKey, required = false }) {
    const dz = el`<div class="dropzone">
      <div class="dz-preview"></div>
      <span class="dz-hint">${label}${required ? '（必传）' : '（可选）'}：点击或拖入图片</span>
      <button type="button" class="dz-clear" style="display:none">清除</button>
    </div>`;
    const preview = dz.querySelector('.dz-preview');
    const clearBtn = dz.querySelector('.dz-clear');
    function renderPreview() {
      preview.innerHTML = '';
      const src = form[b64Key] || (form[pathKey] ? `/${form[pathKey]}` : '');
      if (src) preview.append(el`<img src="${src}" alt="">`);
      clearBtn.style.display = src ? 'inline-block' : 'none';
    }
    async function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) return toast('请选择图片文件', true);
      try {
        form[b64Key] = await compressImage(file);
        renderPreview();
      } catch (e) {
        toast(e.message, true);
      }
    }
    dz.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/heic';
      input.onchange = () => handleFile(input.files[0]);
      input.click();
    });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
      handleFile(e.dataTransfer.files[0]);
    });
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      form[b64Key] = '';
      form[pathKey] = null; // 编辑时清除已有图 = 提交空串，服务端删旧图
      renderPreview();
    });
    renderPreview();
    imgRow.append(dz);
  }
  dropzone('商品图', { b64Key: 'productB64', pathKey: 'productPath', required: true });
  dropzone('实拍 · 正面全身', { b64Key: 'fitB64', pathKey: 'fitPath' });

  // ========== 04 尺码档案组 ==========
  const sec4 = el`<div class="form-section">
    <div class="fs-head"><h3>尺码档案</h3><span class="fs-no">04 / Size Archive</span></div>
    <div class="frow">
      <div class="field"><label>实际购买码</label><input type="text" id="f-bought" placeholder="如 M / 27" value="${esc(form.boughtSize)}"></div>
      <div class="field" style="flex:1;min-width:260px"><label>合身反馈（哪里紧/松/长/短）</label>
        <textarea id="f-fitfb" placeholder="这是对照时真正值钱的信息">${esc(form.fitFeedback)}</textarea></div>
    </div>
    <div class="frow" style="align-items:center">
      <label style="font-size:11px;letter-spacing:.28em;color:var(--ink-2)">基准款</label>
      <button type="button" class="pill ${form.isBaseline ? 'on' : ''}" id="f-base">非常合身，当基准款（全库最多 3 件）</button>
    </div>
    <div class="field" style="margin-top:8px"><label>商品尺寸表（把详情页的数字记下来，可先跳过）</label>
      <div class="chart-rows" id="chart-rows"></div>
      <button type="button" class="linkbtn" id="chart-add" style="margin-top:12px;align-self:flex-start">＋ 加一行码数</button>
    </div>
    <div class="frow" style="margin-top:18px">
      ${dropzoneChart()}
    </div>
  </div>`;
  view.append(sec4);
  function dropzoneChart() {
    // 尺寸表截图（可与手填并存）
    const dz = el`<div class="dropzone">
      <div class="dz-preview"></div>
      <span class="dz-hint">尺寸表截图（可选）：点击或拖入</span>
      <button type="button" class="dz-clear" style="display:none">清除</button>
    </div>`;
    const preview = dz.querySelector('.dz-preview');
    const clearBtn = dz.querySelector('.dz-clear');
    function renderPreview() {
      preview.innerHTML = '';
      const src = form.chartB64 || (form.chartPath ? `/${form.chartPath}` : '');
      if (src) preview.append(el`<img src="${src}" alt="">`);
      clearBtn.style.display = src ? 'inline-block' : 'none';
    }
    dz.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/heic';
      input.onchange = async () => {
        try { form.chartB64 = await compressImage(input.files[0]); renderPreview(); }
        catch (e) { toast(e.message, true); }
      };
      input.click();
    });
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      form.chartB64 = '';
      form.chartPath = null;
      renderPreview();
    });
    renderPreview();
    return dz;
  }
  sec4.querySelector('#f-base').addEventListener('click', (e) => {
    if (isWish) return toast('待买件不能标基准款——转正式档案后再来标', true);
    form.isBaseline = !form.isBaseline;
    e.target.classList.toggle('on', form.isBaseline);
  });

  // 尺寸表行编辑器
  const chartRows = sec4.querySelector('#chart-rows');
  function renderChartRows() {
    chartRows.innerHTML = '';
    form.sizeChart.forEach((row, i) => {
      const rowEl = el`<div class="chart-row">
        <div class="field"><label>码数</label><input type="text" value="${esc(row.label)}" data-i="${i}" data-part="label"></div>
        <div class="pairs" style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end"></div>
        <button type="button" class="rm rm-row">移除该行</button>
      </div>`;
      const pairs = rowEl.querySelector('.pairs');
      function renderPairs() {
        pairs.innerHTML = '';
        for (const [part, num] of Object.entries(row.measurements)) {
          const p = el`<div class="pair">
            <input type="text" value="${esc(part)}" data-i="${i}" data-part="${esc(part)}" data-field="partKey" placeholder="部位">
            <input type="number" value="${num}" data-i="${i}" data-part="${esc(part)}" data-field="partVal" placeholder="cm">
            <button type="button" class="rm">×</button>
          </div>`;
          p.querySelector('.rm').addEventListener('click', () => {
            delete row.measurements[part];
            renderPairs();
          });
          pairs.append(p);
        }
        const add = el`<button type="button" class="linkbtn">＋部位</button>`;
        add.addEventListener('click', () => {
          row.measurements[''] = '';
          renderPairs();
        });
        pairs.append(add);
      }
      renderPairs();
      rowEl.querySelector('.rm-row').addEventListener('click', () => {
        form.sizeChart.splice(i, 1);
        renderChartRows();
      });
      chartRows.append(rowEl);
    });
  }
  chartRows.addEventListener('input', (e) => {
    const t = e.target;
    const i = Number(t.dataset.i);
    if (Number.isNaN(i) || !form.sizeChart[i]) return;
    if (t.dataset.part === 'label') form.sizeChart[i].label = t.value;
    else if (t.dataset.field === 'partKey' || t.dataset.field === 'partVal') {
      const oldKey = t.dataset.part;
      const row = form.sizeChart[i];
      if (t.dataset.field === 'partKey') {
        if (oldKey !== t.value) {
          const entries = Object.entries(row.measurements).map(([k, n]) => [k === oldKey ? t.value : k, n]);
          row.measurements = Object.fromEntries(entries);
          t.dataset.part = t.value;
        }
      } else {
        row.measurements[oldKey] = Number(t.value);
      }
    }
  });
  sec4.querySelector('#chart-add').addEventListener('click', () => {
    form.sizeChart.push({ label: '', measurements: {} });
    renderChartRows();
  });
  renderChartRows();

  // ========== 提交 ==========
  const actions = el`<div class="form-actions">
    <button class="btn primary" id="f-save">${isNew ? '存入衣柜' : '保存修改'}</button>
    <a class="btn" href="${isNew ? '#/wardrobe' : `#/item/${item.id}`}">取消</a>
    <span class="muted">词表字段以服务端校验为准，填错会拦下来</span>
  </div>`;
  view.append(actions);

  actions.querySelector('#f-save').addEventListener('click', async () => {
    // 收集表单
    form.name = view.querySelector('#f-name').value.trim();
    form.brand = view.querySelector('#f-brand').value.trim();
    form.boughtSize = view.querySelector('#f-bought').value.trim();
    form.fitFeedback = view.querySelector('#f-fitfb').value.trim();
    // 尺寸表清理：空行、空部位丢掉
    form.sizeChart = form.sizeChart
      .map((r) => ({
        label: (r.label || '').trim(),
        measurements: Object.fromEntries(
          Object.entries(r.measurements).filter(([k, n]) => k.trim() && Number(n) > 0).map(([k, n]) => [k.trim(), Number(n)]),
        ),
      }))
      .filter((r) => r.label && Object.keys(r.measurements).length);

    const payload = {
      name: form.name, brand: form.brand || null,
      category: form.category, sub: form.sub,
      color: form.color, pattern: form.pattern, thickness: form.thickness,
      fit: form.fit, length: form.length, neckline: form.neckline,
      fabric: form.fabric, elastic: form.elastic, styles: form.styles,
      sizeChart: form.sizeChart, boughtSize: form.boughtSize || null,
      fitFeedback: form.fitFeedback || null, isBaseline: form.isBaseline,
      productImageB64: form.productB64 || undefined,
      fitImageB64: form.fitB64 || (form.fitPath === null && item?.fitImage ? '' : undefined),
      sizeChartImageB64: form.chartB64 || (form.chartPath === null && item?.sizeChartImage ? '' : undefined),
    };
    if (!form.productB64 && !form.productPath) {
      return showErr('商品图必传 —— 它是衣柜格子的封面');
    }
    const ferr = view.querySelector('#ferr');
    ferr.classList.remove('show');
    try {
      const saved = isNew
        ? await api.createCloth(payload)
        : await api.updateCloth(item.id, { ...payload, updatedAt: form.updatedAt });
      toast(isNew ? `已入柜 · NO.${noLabel(saved)}` : '已保存');
      boardBadge();
      location.hash = `#/item/${saved.id}`;
    } catch (e) {
      showErr(e.message);
    }
  });
  function showErr(msg) {
    const ferr = view.querySelector('#ferr');
    ferr.textContent = msg;
    ferr.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
