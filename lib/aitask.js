// 买前 AI 比对任务的纯函数：任务上下文生成、输出 schema、结果校验。
// 通道：codex exec -i 附图 + --output-schema 结构化输出（见 server.js spawn 处）。
// 校验原则：AI 填的描述卡字段逐个对词表（lib/vocab.js 唯一来源），非法值置 null 记 issue，绝不默默入库。

import {
  CATEGORIES, FIELDS, publicVocab,
} from './vocab.js';

// 尺寸表部位词表：OpenAI 严格 schema 不支持自由 key 的 map（additionalProperties 只能是 false），
// 所以 schema 里用固定部位 + 可空数值；validateAiResult 再转回存储层的自由格式 {部位: 厘米}。
export const MEASUREMENT_PARTS = ['衣长', '胸围', '肩宽', '袖长', '腰围', '臀围', '裤长', '裙长', '大腿围', '下摆围'];

// —— 任务提示词：告诉 codex 看什么、按什么口径、输出什么 ——
export function buildTaskPrompt() {
  return [
    '你是买前比对员。根据附上的商品截图（卖家秀 / 详情页），对照 context.md 里的衣柜档案，完成一次买前比对。',
    '要求：',
    '1. card：从截图提取商品信息填描述卡。每个词表字段只能从 context.md「固定词表」里选值，看不清或没有就填 null；风格最多选 2 项。name 用简短中文（如「白色棉麻衬衫」），brand 看不出就 null。',
    '2. sizeChart：从详情页尺寸表截图提取每码的部位厘米数（数字），只录截图里明确印着的数字，不要编。部位名只能用：衣长/胸围/肩宽/袖长/腰围/臀围/裤长/裙长/大腿围/下摆围，截图里的部位就近归入（如「身长」归「衣长」），截图没有的部位填 null。',
    '3. sizeAdvice：对照 context.md 里的基准款尺寸表与合身反馈，按「同细分优先、同大类兜底、超差 >3cm 或 6% 算明显」的口径，给出建议购买的码数和理由；没有基准款或没有尺寸表就如实说没法判断。',
    '4. duplicates：对照衣柜里同细分的衣服文字卡，判断是不是已经有件差不多的，列出像在哪；没有就明确说没有。',
    '5. matchNote：这件和衣柜现有衣服的大致搭配面（可搭配哪些类型的下装/上装、适合什么温度场景），一两句话。',
    '6. summary：一句话买不买的建议。',
    '所有文字用中文，只输出符合 schema 的 JSON。',
  ].join('\n');
}

// —— context.md：词表 + 衣柜文字卡（不发照片）+ 基准款数字 ——
export function makeTaskContext(clothes) {
  const owned = clothes.filter((c) => (c.status || '在衣柜') === '在衣柜');
  const baselines = owned.filter((c) => c.isBaseline);
  const v = publicVocab();

  const lines = [];
  lines.push('# 买前比对上下文');
  lines.push('');
  lines.push('## 固定词表（描述卡只能从这些值里选）');
  lines.push('');
  lines.push(`- 大类/细分：${Object.entries(CATEGORIES).map(([cat, subs]) => `${cat}（${subs.join('/')}）`).join('；')}`);
  for (const [key, def] of Object.entries(v.fields)) {
    lines.push(`- ${def.label}：${def.vocab.join('/')}`);
  }
  lines.push('');
  lines.push(`## 衣柜现有衣服（文字卡，共 ${owned.length} 件）`);
  lines.push('');
  for (const c of owned) {
    const desc = [
      `NO.${c.no}`, c.name,
      [c.category, c.sub].join('/'),
      c.color, c.pattern, c.thickness && `厚薄:${c.thickness}`,
      c.fit && `版型:${c.fit}`, c.length && `长度:${c.length}`,
      c.neckline && `领型:${c.neckline}`, c.fabric && `面料:${c.fabric}`,
      c.elastic && `弹性:${c.elastic}`,
      (c.styles || []).length && `风格:${c.styles.join('·')}`,
      c.boughtSize && `买了:${c.boughtSize}`,
      c.isBaseline && '【基准款】',
      c.fitFeedback && `合身反馈:${c.fitFeedback}`,
    ].filter(Boolean).join(' | ');
    lines.push(`- ${desc}`);
  }
  lines.push('');
  if (baselines.length === 0) {
    lines.push('## 基准款尺寸表');
    lines.push('');
    lines.push('（还没有标基准款，尺码对照无基准，如实说明即可。）');
  } else {
    lines.push(`## 基准款尺寸表（对照的参照系，共 ${baselines.length} 件）`);
    lines.push('');
    for (const b of baselines) {
      lines.push(`### NO.${b.no} ${b.name}（${b.category}/${b.sub}${b.boughtSize ? `，买了 ${b.boughtSize}` : ''}${b.fitFeedback ? `，反馈：${b.fitFeedback}` : ''}）`);
      for (const row of b.sizeChart || []) {
        const m = Object.entries(row.measurements || {}).map(([p, n]) => `${p}${n}cm`).join('，');
        lines.push(`- ${row.label}：${m}`);
      }
      lines.push('');
    }
    lines.push('对照口径：同细分优先（短袖跟短袖比），没有同细分再退到同大类基准；差值 >3cm 或相对 >6% 算明显差异。');
  }
  return lines.join('\n');
}

// —— codex --output-schema 用的 JSON Schema（OpenAI 严格模式兼容） ——
// 规则：每个对象 additionalProperties:false 且 required 覆盖全部属性；可空用 anyOf [{...},{type:'null'}]；
// 不用自由 key 的 map。词表字段直接 enum 约束，服务端再用 validateAiResult 复核一遍。
export function buildOutputSchema() {
  const nullableStr = () => ({ anyOf: [{ type: 'string' }, { type: 'null' }] });
  const nullableEnum = (vocab) => ({ anyOf: [{ type: 'string', enum: vocab }, { type: 'null' }] });
  const nullableNum = () => ({ anyOf: [{ type: 'number' }, { type: 'null' }] });
  const vocabFields = Object.fromEntries(Object.entries(FIELDS).map(([key, def]) => [
    key,
    key === 'styles'
      ? { type: 'array', maxItems: 2, items: { type: 'string', enum: def.vocab } }
      : nullableEnum(def.vocab),
  ]));
  return {
    type: 'object',
    additionalProperties: false,
    required: ['card', 'sizeChart', 'sizeAdvice', 'duplicates', 'matchNote', 'summary'],
    properties: {
      card: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'brand', 'category', 'sub', ...Object.keys(FIELDS)],
        properties: {
          name: { type: 'string' },
          brand: nullableStr(),
          category: nullableEnum(Object.keys(CATEGORIES)),
          sub: nullableEnum(Object.values(CATEGORIES).flat()),
          ...vocabFields,
        },
      },
      sizeChart: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'measurements'],
          properties: {
            label: { type: 'string' },
            measurements: {
              type: 'object',
              additionalProperties: false,
              required: MEASUREMENT_PARTS,
              properties: Object.fromEntries(MEASUREMENT_PARTS.map((p) => [p, nullableNum()])),
            },
          },
        },
      },
      sizeAdvice: {
        type: 'object',
        additionalProperties: false,
        required: ['advice', 'reason'],
        properties: { advice: { type: 'string' }, reason: { type: 'string' } },
      },
      duplicates: {
        type: 'object',
        additionalProperties: false,
        required: ['verdict', 'items', 'note'],
        properties: {
          verdict: { type: 'string', enum: ['有差不多的', '没有差不多的'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'why'],
              properties: { name: { type: 'string' }, why: { type: 'string' } },
            },
          },
          note: { type: 'string' },
        },
      },
      matchNote: { type: 'string' },
      summary: { type: 'string' },
    },
  };
}

const str = (x) => (typeof x === 'string' ? x.trim() : '');
const strOrNull = (x) => {
  const s = str(x);
  return s ? s.slice(0, 300) : null;
};

// —— 结果校验：词表外的值置 null 记 issue，尺寸表剔非法行，文本截断 ——
// 返回 { ok, card, sizeChart, conclusion:{size,duplicate,match,summary}, issues[] }
export function validateAiResult(raw) {
  const issues = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const card = {
    name: str(r.card?.name).slice(0, 40) || '待比对新衣',
    brand: strOrNull(r.card?.brand),
    category: null, sub: null,
    color: null, pattern: null, thickness: null, fit: null,
    length: null, neckline: null, fabric: null, elastic: null,
    styles: [],
  };

  const cat = str(r.card?.category);
  if (cat && CATEGORIES[cat]) card.category = cat;
  else if (cat) issues.push(`大类「${cat}」不在词表`);

  if (card.category) {
    const sub = str(r.card?.sub);
    if (sub && CATEGORIES[card.category].includes(sub)) card.sub = sub;
    else if (sub) issues.push(`细分「${sub}」不属于${card.category}`);
  } else if (str(r.card?.sub)) {
    issues.push('大类缺失，细分一并置空');
  }

  for (const [key, def] of Object.entries(FIELDS)) {
    if (key === 'styles') continue;
    const val = r.card?.[key];
    if (val == null || val === '') continue; // 缺省就是 null，不算问题
    if (def.vocab.includes(val)) card[key] = val;
    else issues.push(`${def.label}「${val}」不在词表`);
  }
  const styles = Array.isArray(r.card?.styles) ? r.card?.styles.filter((s) => FIELDS.styles.vocab.includes(s)) : [];
  if (r.card?.styles && styles.length !== r.card.styles.length) issues.push('风格有词表外的值被剔除');
  card.styles = [...new Set(styles)].slice(0, 2);

  const sizeChart = [];
  if (Array.isArray(r.sizeChart)) {
    r.sizeChart.forEach((row, i) => {
      const label = str(row?.label);
      const entries = Object.entries(row?.measurements || {}).filter(([, n]) => typeof n === 'number' && n > 0);
      if (!label || entries.length === 0) {
        issues.push(`尺寸表第 ${i + 1} 行不完整被剔除`);
        return;
      }
      sizeChart.push({ label, measurements: Object.fromEntries(entries) });
    });
  }

  const conclusion = {
    size: {
      advice: strOrNull(r.sizeAdvice?.advice) || '见理由',
      reason: strOrNull(r.sizeAdvice?.reason) || 'AI 未给出尺码建议',
    },
    duplicate: {
      verdict: r.duplicates?.verdict === '有差不多的' ? '有差不多的' : '没有差不多的',
      items: (Array.isArray(r.duplicates?.items) ? r.duplicates.items : [])
        .slice(0, 5)
        .map((it) => ({ name: str(it?.name).slice(0, 40) || '（未具名）', why: strOrNull(it?.why) || '' }))
        .filter((it) => it.name !== '（未具名）' || it.why),
      note: strOrNull(r.duplicates?.note),
    },
    match: strOrNull(r.matchNote) || 'AI 未给搭配面判断',
    summary: strOrNull(r.summary) || 'AI 未给总结',
  };

  return { ok: issues.length === 0, card, sizeChart, conclusion, issues };
}

// ==================== AI 标注员（二期②） ====================
// 看商品图按固定词表填描述卡。两个用法共用一套提取：
//   批量（存量体检）：items = 衣柜里的衣服（index 与 -i 附图顺序一致，图片直接引用 data/images 原文件）
//   单张（新录入预填）：走买前比对同款 validateAiResult，这里只做批量部分

export function buildAnnotatePrompt() {
  return [
    '你是描述卡标注员。附图按顺序编号：第 1 张附图对应 items 里 index=1 的衣服，以此类推。',
    '对每一件：',
    '1. fields 给出这张图的描述卡字段。每个词表字段只能从 context.md「固定词表」里选值，看不清就填 null；风格最多 2 项。',
    '2. name 用简短中文（如「白色棉麻衬衫」），brand 看不出就 null。',
    '3. 不管 context.md 里这件现在填的是什么，都按图给出你认为正确的值——比对和取舍由系统来做。',
    '所有文字用中文，只输出符合 schema 的 JSON。',
  ].join('\n');
}

// context.md：词表 + 每件「index | NO | 名称 | 当前卡值」（当前值只为给 AI 对照，不约束它的输出）
export function makeAnnotateContext(items) {
  const v = publicVocab();
  const lines = [];
  lines.push('# 描述卡标注上下文');
  lines.push('');
  lines.push('## 固定词表（字段只能从这些值里选）');
  lines.push('');
  lines.push(`- 大类/细分：${Object.entries(CATEGORIES).map(([cat, subs]) => `${cat}（${subs.join('/')}）`).join('；')}`);
  for (const [key, def] of Object.entries(v.fields)) {
    lines.push(`- ${def.label}：${def.vocab.join('/')}`);
  }
  lines.push('');
  lines.push(`## 待标注衣服（共 ${items.length} 件，index 与附图顺序一致）`);
  lines.push('');
  for (const [i, it] of items.entries()) {
    const cur = [
      `当前值 →`, it.name,
      [it.category, it.sub].join('/'),
      it.color, it.pattern, it.thickness, it.fit, it.length,
      it.neckline, it.fabric, it.elastic, (it.styles || []).join('·'),
      it.brand || '',
    ].filter(Boolean).join(' ');
    lines.push(`- index=${i + 1}：${cur}`);
  }
  return lines.join('\n');
}

// 批量输出 schema：严格模式同款规矩（additionalProperties:false + 全键 required + 可空 anyOf）
export function buildAnnotateSchema() {
  const nullableStr = () => ({ anyOf: [{ type: 'string' }, { type: 'null' }] });
  const nullableEnum = (vocab) => ({ anyOf: [{ type: 'string', enum: vocab }, { type: 'null' }] });
  const vocabFields = Object.fromEntries(Object.entries(FIELDS).map(([key, def]) => [
    key,
    key === 'styles'
      ? { type: 'array', maxItems: 2, items: { type: 'string', enum: def.vocab } }
      : nullableEnum(def.vocab),
  ]));
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'name', 'brand', 'category', 'sub', ...Object.keys(FIELDS)],
          properties: {
            index: { type: 'number' },
            name: { type: 'string' },
            brand: nullableStr(),
            category: nullableEnum(Object.keys(CATEGORIES)),
            sub: nullableEnum(Object.values(CATEGORIES).flat()),
            ...vocabFields,
          },
        },
      },
    },
  };
}

const ANN_FIELDS = [...Object.keys(FIELDS), 'name', 'brand', 'category', 'sub'];

// 批量结果复核：按 index 映射回 itemId，词表外剔除，对比当前值分三类
// fills（当前空 → 建议值，默认采纳）/ corrections（当前非空且不同，默认不采纳）/ agree（相同，不展示）
export function validateAnnotateResult(raw, items) {
  const byIndex = new Map(items.map((it, i) => [i + 1, it]));
  const results = [];
  for (const row of Array.isArray(raw?.items) ? raw.items : []) {
    const item = byIndex.get(Number(row?.index));
    if (!item) continue; // index 对不上（AI 编错号）——丢弃这件的结果，宁缺毋错
    const issues = [];
    const card = {
      name: str(row?.name).slice(0, 40) || item.name,
      brand: strOrNull(row?.brand),
    };
    // 大类/细分：必须联动合法
    const cat = str(row?.category);
    if (cat && CATEGORIES[cat]) card.category = cat;
    else if (cat) issues.push(`大类「${cat}」不在词表`);
    if (card.category) {
      const sub = str(row?.sub);
      if (sub && CATEGORIES[card.category].includes(sub)) card.sub = sub;
      else if (sub) issues.push(`细分「${sub}」不合法`);
    }
    for (const [key, def] of Object.entries(FIELDS)) {
      if (key === 'styles') continue;
      const val = row?.[key];
      if (val == null || val === '') { card[key] = null; continue; }
      if (def.vocab.includes(val)) card[key] = val;
      else { card[key] = null; issues.push(`${def.label}「${val}」不在词表`); }
    }
    const styles = Array.isArray(row?.styles) ? [...new Set(row.styles.filter((s) => FIELDS.styles.vocab.includes(s)))].slice(0, 2) : [];
    if (Array.isArray(row?.styles) && styles.length !== row.styles.length) issues.push('风格有词表外的值被剔除');
    card.styles = styles;

    // 与当前值对比分类
    const fills = {};
    const corrections = {};
    let agreeCount = 0;
    for (const f of ANN_FIELDS) {
      const newVal = card[f];
      if (f === 'styles') {
        const cur = item.styles || [];
        const newSorted = [...(newVal || [])].sort().join('·');
        const curSorted = [...cur].sort().join('·');
        if (!newSorted) continue;
        if (curSorted === newSorted) { agreeCount++; continue; }
        if (!curSorted) fills.styles = newVal;
        else corrections.styles = { from: cur.join('·'), to: newVal.join('·') };
        continue;
      }
      if (newVal == null || newVal === '') continue;
      const cur = item[f];
      if (cur === newVal) { agreeCount++; continue; }
      if (cur == null || cur === '') {
        if (f === 'name') continue; // 名称已有就不算填充项
        fills[f] = newVal;
      } else if (f === 'name' || f === 'brand') {
        continue; // 名称/品牌是她的自由文本，AI 不建议改
      } else {
        corrections[f] = { from: cur, to: newVal };
      }
    }
    if (issues.length || Object.keys(fills).length || Object.keys(corrections).length) {
      results.push({ itemId: item.id, name: item.name, aiName: card.name, fills, corrections, agreeCount, issues });
    }
  }
  return results;
}
