// 自然语言 → 条件对象。词表驱动（lib/vocab.js），最长匹配消费，未知词不猜不丢。
// 条件对象就是前端 chips 的数据模型：字段可增删改后重新查询。

import {
  SYNONYMS, STOPWORDS, TEMP_THICKNESS, tempToBand, CATEGORIES,
} from './vocab.js';

// 温度数字：16度 / 16 ° / 16℃ / -3度；中文「零下2度」单独处理为负数
const TEMP_RE = /(-?\d+(?:\.\d+)?)\s*(?:°c|℃|°|度)/i;
const TEMP_BELOW_ZERO_RE = /零下\s*(\d+(?:\.\d+)?)\s*(?:°c|℃|°|度)?/i;

// 同一词条可能命中多个字段（如「通勤」既是风格也是场景），
// 所以按「词 → 目标字段列表」分组，命中时全部生效；词按长度降序消费（长词优先）。
function groupSynonyms() {
  const map = new Map(); // syn -> [{field, value}]
  for (const [field, entries] of Object.entries(SYNONYMS)) {
    for (const [value, syns] of Object.entries(entries)) {
      for (const syn of syns) {
        const key = syn.toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ field, value });
      }
    }
  }
  return [...map.entries()].sort((a, b) => b[0].length - a[0].length);
}
const SYN_GROUPS = groupSynonyms();

const SUB_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).flatMap(([cat, subs]) => subs.map((sub) => [sub, cat])),
);

// 解析一条自然语言查询
export function parseQuery(text) {
  const cond = emptyCond();
  let rest = String(text || '');

  // 1) 温度数字 → 温度带 + 厚薄建议（零下 → 负数）
  const below = TEMP_BELOW_ZERO_RE.exec(rest);
  const tm = TEMP_RE.exec(rest);
  if (below) {
    cond.tempC = -Number(below[1]);
    rest = rest.replace(below[0], ' ');
  } else if (tm) {
    cond.tempC = Number(tm[1]);
    rest = rest.replace(tm[0], ' ');
  }
  if (cond.tempC !== null) {
    cond.tempBand = tempToBand(cond.tempC);
    cond.thickness = [...TEMP_THICKNESS[cond.tempBand]];
  }

  // 2) 词表同义词扫描：命中即记录（同词多字段全生效），并消费掉该片段防误判
  const consumed = [];
  rest = scanInto(rest, cond, consumed);

  // 3) 被消费的片段里可能嵌着别的字段词（「牛仔裤」→细分长裤，片段里还有面料「牛仔」），
  //    干扫一遍：只找子串不消费，避免长词再截胡短词
  for (const frag of consumed) scanInto(frag, cond, [], true);

  // 4) 细分反推大类（如「衬衫」→ 长袖 → 上装）；领型只在描述上装时出现
  if (cond.sub && !cond.category) cond.category = SUB_TO_CATEGORY[cond.sub];
  if (cond.neckline && !cond.category) cond.category = '上装';

  // 5) 剩余碎片 → 未识别词（剥停用词，剩下的原样返回）
  const unknown = [];
  for (const chunk of rest.split(/[，。,、;；!！?？\s'"（）()·]+/)) {
    let frag = chunk;
    let changed = true;
    while (changed) {
      changed = false;
      for (const sw of STOPWORDS) {
        const i = frag.indexOf(sw);
        if (i !== -1) { frag = frag.slice(0, i) + frag.slice(i + sw.length); changed = true; }
      }
    }
    if (frag.length >= 2) unknown.push(frag);
  }

  return { cond, unknown };
}

// 在 text 里按词表扫描：长词优先，命中即消费并记录；consumed 收集被消费的片段供补扫。
// dry=true 时只找子串全部生效、不消费（用于片段补扫）。
function scanInto(text, cond, consumed, dry = false) {
  let rest = text;
  for (const [syn, targets] of SYN_GROUPS) {
    if (dry) {
      if (rest.toLowerCase().includes(syn)) {
        for (const { field, value } of targets) applyHit(cond, field, value);
      }
      continue;
    }
    let idx = rest.toLowerCase().indexOf(syn);
    while (idx !== -1) {
      rest = rest.slice(0, idx) + ' ' + rest.slice(idx + syn.length);
      for (const { field, value } of targets) applyHit(cond, field, value);
      consumed.push(syn);
      idx = rest.toLowerCase().indexOf(syn);
    }
  }
  return rest;
}

function applyHit(cond, field, value) {
  if (field === 'category' || field === 'sub') {
    cond[field] = value;
    return;
  }
  const arrFields = ['thickness', 'styles', 'scenes']; // thickness 由温度建议填充，同字段取并集去重
  if (arrFields.includes(field)) {
    cond[field] = [...new Set([...(cond[field] || []), value])];
    return;
  }
  // 单值字段：首次命中生效，后续命中不覆盖（确定性优先，用户可在 chips 里改）
  if (cond[field] === null || cond[field] === undefined) cond[field] = value;
}

export function emptyCond() {
  return {
    category: null, sub: null,
    color: null, pattern: null, thickness: null, fit: null, length: null,
    neckline: null, fabric: null, elastic: null, styles: [], scenes: [],
    tempBand: null, tempC: null, keyword: [],
  };
}
