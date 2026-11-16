// 买前对照台的纯计算：查重打分 + 可配套数。只用文字卡片字段，全程离线。
// status 过滤由调用方（server）负责，本模块不关心衣服在哪个区。

import { TEMP_THICKNESS } from './vocab.js';

// —— 买前查重：与衣柜已有衣服比相似度 ——
// 同细分是前置条件（跨细分不算重复）；权重：主色 2 / 图案 1 / 厚薄 1 / 面料 1 / 领型 1 / 版型 0.5 / 风格重叠 0.5
const DUP_RULES = [
  { field: 'color', label: '主色', weight: 2 },
  { field: 'pattern', label: '图案', weight: 1 },
  { field: 'thickness', label: '厚薄', weight: 1 },
  { field: 'fabric', label: '面料', weight: 1 },
  { field: 'neckline', label: '领型', weight: 1 },
  { field: 'fit', label: '版型', weight: 0.5 },
];

export function duplicateScore(target, owned) {
  if (!target.sub || owned.sub !== target.sub) return { score: 0, hits: [] }; // 跨细分不算重复
  let score = 3; // 同细分本身是最强信号
  const hits = [{ field: 'sub', label: '细分' }];
  for (const rule of DUP_RULES) {
    const a = target[rule.field];
    const b = owned[rule.field];
    if (a && b && a === b) {
      score += rule.weight;
      hits.push({ field: rule.field, label: rule.label });
    }
  }
  const ts = target.styles || [];
  const os = owned.styles || [];
  if (ts.length && os.length && ts.some((s) => os.includes(s))) {
    score += 0.5;
    hits.push({ field: 'styles', label: '风格' });
  }
  return { score, hits };
}

// ≥6 高度相似（同细分+同主色+至少一个辅助命中）/ ≥3 有些像（仅同细分）/ 其余不算
export function duplicateLevel(score) {
  if (score >= 6) return 'high';
  if (score >= 3) return 'some';
  return null;
}

// 返回降序 top N。list 里的每件都会被计算（调用方决定传哪些，如「在衣柜且非自身」）
export function findDuplicates(target, list, { limit = 3 } = {}) {
  return list
    .map((cloth) => {
      const { score, hits } = duplicateScore(target, cloth);
      const level = duplicateLevel(score);
      return { cloth, score, level, hits };
    })
    .filter((d) => d.level)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// —— 虚拟卡片问配几套：已存套搭里有多少套能给它腾出同细分的槽位 ——
// 一套可配 = 未把它编进这套，且套搭里含同大类+同细分件（记为可替换），且温度带厚薄兼容
// （套搭未标温度带，或 target.thickness 为空 → 不否决）。
// clothesById: Map(id → cloth) 或普通对象，由调用方构建。
export function matchableOutfits(target, outfits, clothesById, tempThickness = TEMP_THICKNESS) {
  const get = (id) => (clothesById instanceof Map ? clothesById.get(id) : clothesById[id]);
  const matches = [];
  for (const o of outfits) {
    if ((o.itemIds || []).includes(target.id)) continue; // 已把它编进这套的不算「能配」
    let replaced = null;
    for (const id of o.itemIds || []) {
      const it = get(id);
      if (it && it.category === target.category && it.sub === target.sub) {
        replaced = it; // 多个可替换槽位记第一件
        break;
      }
    }
    if (!replaced) continue;
    if (o.tempBand && target.thickness) {
      const allow = tempThickness[o.tempBand] || [];
      if (!allow.includes(target.thickness)) continue; // 厚薄跟温度带打架，这套穿不了
    }
    matches.push({
      outfitId: o.id, title: o.title, tempBand: o.tempBand || null,
      replacedId: replaced.id, replacedNo: replaced.no ?? null, replacedName: replaced.name,
    });
  }
  return { count: matches.length, matches };
}
