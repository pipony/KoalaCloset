// 条件对象 → 过滤。纯函数，无状态。GET /api/clothes?cond=<json> 使用。

function matchField(itemValue, condValue) {
  if (condValue === null || condValue === undefined || condValue === '') return true;
  if (Array.isArray(condValue)) {
    if (condValue.length === 0) return true;
    const itemArr = Array.isArray(itemValue) ? itemValue : [itemValue];
    return condValue.some((v) => itemArr.includes(v)); // 同字段内 ANY 命中即可
  }
  return itemValue === condValue;
}

export function filterClothes(list, cond = {}) {
  const c = cond || {};
  return list.filter((it) => {
    if (!matchField(it.category, c.category)) return false;
    if (!matchField(it.sub, c.sub)) return false;
    for (const key of ['color', 'pattern', 'thickness', 'fit', 'length', 'neckline', 'fabric', 'elastic', 'styles']) {
      if (!matchField(it[key], c[key])) return false;
    }
    if (Array.isArray(c.keyword) && c.keyword.length > 0) {
      const hay = `${it.name} ${it.brand || ''}`;
      if (!c.keyword.every((k) => hay.toLowerCase().includes(String(k).toLowerCase()))) return false;
    }
    // tempBand/tempC 只作为上下文（影响 thickness 建议），不直接过滤衣服
    return true;
  });
}

export function filterOutfits(list, { tempBand, scene } = {}) {
  return list.filter((o) => {
    if (tempBand && o.tempBand !== tempBand) return false;
    if (scene && !(o.scenes || []).includes(scene)) return false;
    return true;
  });
}
