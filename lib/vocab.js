// 词表唯一来源：分类、描述卡全字段、温度带、场景、同义词、温度→厚薄映射。
// 服务端校验以本文件为准；前端经 GET /api/vocab 拉取同一份数据渲染表单与 chips。

export const CATEGORIES = {
  上装: ['短袖', '长袖', '无袖', '外套'],
  下装: ['长裤', '短裤', '半裙'],
};

export const COLORS = ['黑', '白', '灰', '米', '棕', '卡其', '蓝', '绿', '黄', '红', '粉', '紫', '花色'];
export const PATTERNS = ['纯色', '条纹', '格纹', '印花', '拼色'];
export const THICKNESS = ['薄', '中', '厚', '加绒'];
export const FITS = ['修身', '合身', '宽松'];
export const LENGTHS = ['短', '常规', '长'];
export const NECKLINES = ['圆领', '翻领', '连帽', '立领', 'V领']; // 可空；仅上装
export const FABRICS = ['棉', '麻', '丝', '针织', '牛仔', '皮革', '化纤'];
export const ELASTIC = ['无弹', '微弹', '高弹'];
export const STYLES = ['通勤', '休闲', '运动', '甜美', '中性']; // 最多选 2

export const TEMP_BANDS = ['严寒', '凉', '舒适', '热']; // 2026-11-14 拍板四档，左闭右开
export const SCENES = ['通勤', '休闲', '运动', '约会', '居家']; // 2026-11-14 拍板五项

export const AVOID_REASONS = ['颜色不搭', '太正式', '不喜欢某件单品', '感觉重复'];

// 温度 → 温度带（左闭右开：[5,15) 凉，[15,25) 舒适，[25,∞) 热，(-∞,5) 严寒）
export function tempToBand(c) {
  if (c < 5) return '严寒';
  if (c < 15) return '凉';
  if (c < 25) return '舒适';
  return '热';
}

// 温度带 → 建议厚薄（找衣服的辅助口径，不做硬过滤）
export const TEMP_THICKNESS = {
  严寒: ['厚', '加绒'],
  凉: ['中', '厚'],
  舒适: ['薄', '中'],
  热: ['薄'],
};

// 描述卡字段定义：字段名 → { label, vocab, single?, nullable?, upperOnly? }
export const FIELDS = {
  color: { label: '主色', vocab: COLORS },
  pattern: { label: '图案', vocab: PATTERNS },
  thickness: { label: '厚薄', vocab: THICKNESS },
  fit: { label: '版型', vocab: FITS },
  length: { label: '长度', vocab: LENGTHS },
  neckline: { label: '领型', vocab: NECKLINES, nullable: true },
  fabric: { label: '面料', vocab: FABRICS },
  elastic: { label: '弹性', vocab: ELASTIC },
  styles: { label: '风格', vocab: STYLES, max: 2 },
};

// —— 自然语言同义词表：syn → 规范值。匹配时按 syn 长度降序消费，长词优先。 ——
export const SYNONYMS = {
  category: {
    上装: ['上装', '上衣', '上面'],
    下装: ['下装', '下面'],
  },
  sub: {
    短袖: ['短袖', '短t', 't恤', '短tee'],
    长袖: ['长袖', '长t', '长tee', '衬衫'],
    无袖: ['无袖', '马甲', '背心'],
    外套: ['外套', '西装外套', '西装', '夹克', '大衣', '开衫', '风衣'],
    长裤: ['长裤', '裤子', '西裤', '阔腿裤', '直筒裤', '牛仔裤'],
    短裤: ['短裤'],
    半裙: ['半裙', '裙子', '裙'],
  },
  color: {
    黑: ['黑色', '黑'],
    白: ['白色', '白'],
    灰: ['灰色', '灰'],
    米: ['米白', '米色', '米'],
    棕: ['棕色', '咖啡色', '棕'],
    卡其: ['卡其色', '卡其'],
    蓝: ['蓝色', '藏蓝', '天蓝', '雾霾蓝', '蓝'],
    绿: ['绿色', '绿'],
    黄: ['黄色', '黄'],
    红: ['红色', '红'],
    粉: ['粉色', '粉'],
    紫: ['紫色', '紫'],
    花色: ['花色', '花的', '碎花'],
  },
  pattern: {
    条纹: ['条纹', '横条纹', '竖条纹', '横条', '竖条'],
    格纹: ['格纹', '格子'],
    印花: ['印花', '印字'],
    拼色: ['拼色', '撞色'],
  },
  thickness: {
    薄: ['薄', '轻薄', '凉快'],
    厚: ['厚', '厚实', '暖和', '保暖'],
    加绒: ['加绒', '绒里', '摇粒绒'],
  },
  fit: {
    修身: ['修身', '显瘦', '紧身'],
    宽松: ['宽松', 'oversize', 'oversized', '肥'],
  },
  length: {
    短: ['短款', '超短'],
    长: ['长款', '加长'],
  },
  neckline: {
    圆领: ['圆领'],
    翻领: ['翻领', '衬衫领', 'polo领', 'polo'],
    连帽: ['连帽', '带帽', '帽衫'],
    立领: ['立领'],
    V领: ['v领', 'v字领'],
  },
  fabric: {
    棉: ['纯棉', '棉麻', '棉'],
    麻: ['麻', '亚麻'],
    丝: ['丝', '真丝', '丝绸'],
    针织: ['针织', '毛衣', '毛线'],
    牛仔: ['牛仔', 'denim'],
    皮革: ['皮革', '皮衣', 'pu皮'],
    化纤: ['化纤', '聚酯纤维'],
  },
  elastic: {
    高弹: ['高弹', '弹力', '弹性好'],
    微弹: ['微弹'],
  },
  styles: {
    通勤: ['通勤', '上班', '工作', '开会', '正式感'],
    休闲: ['休闲', '随意', '日常'],
    运动: ['运动', '健身', '跑步', '瑜伽'],
    甜美: ['甜美', '可爱', '少女'],
    中性: ['中性', '帅气'],
  },
  scenes: {
    通勤: ['通勤', '上班', '工作', '开会', '见客户'],
    休闲: ['休闲', '周末', '逛街', '遛弯'],
    运动: ['运动', '健身', '跑步', '瑜伽', '锻炼'],
    约会: ['约会', '见面', '吃饭'],
    居家: ['居家', '在家', '躺平'],
  },
  tempBand: {
    严寒: ['严寒', '寒冷', '冰点', '零下'],
    凉: ['微凉', '凉快一点', '凉', '凉飕飕'],
    舒适: ['舒适', '不冷不热', '温和'],
    热: ['炎热', '热天', '大热天', '很热'],
  },
};

// 解析时的轻量停用词：从剩余碎片里剥掉，剩下的才算「未识别词」
export const STOPWORDS = [
  '明天', '今天', '后天', '本周', '想穿', '想要', '想找', '想', '穿', '要', '找',
  '一件', '一条', '一个', '一件', '有点', '一点', '适合', '推荐', '看看', '一下',
  '有没有', '适合穿', '出门', '上班穿', '我', '的', '得', '吧', '呢', '能', '可以',
  '穿得', '显得', '比较', '稍微', '偏', '点', '去', '外面', '过', '和', '跟', '配',
  '什么', '啥',
];

// 衣服记录校验（服务端为准）。返回 { ok, errors[] }
export function validateClothes(item) {
  const errors = [];
  if (!item.name || !String(item.name).trim()) errors.push('名称必填');
  const cat = item.category;
  if (!CATEGORIES[cat]) errors.push(`大类必须是 上装/下装，收到「${cat}」`);
  else if (!CATEGORIES[cat].includes(item.sub)) errors.push(`${cat} 的细分只能是 ${CATEGORIES[cat].join('/')}`);

  for (const [key, def] of Object.entries(FIELDS)) {
    const v = item[key];
    if (def.nullable && (v === null || v === undefined || v === '')) continue;
    if (def.max) {
      if (!Array.isArray(v) || v.length < 1 || v.length > def.max) {
        errors.push(`${def.label}须选 1~${def.max} 项`);
      } else if (!v.every((x) => def.vocab.includes(x))) {
        errors.push(`${def.label}含非法值`);
      }
    } else if (!def.vocab.includes(v)) {
      errors.push(`${def.label}必须是 ${def.vocab.join('/')}，收到「${v}」`);
    }
  }
  if (cat === '下装' && item.neckline) errors.push('领型仅上装可填');
  if (item.status && !['在衣柜', '待买'].includes(item.status)) errors.push('状态非法');
  if (item.sizeChart) {
    if (!Array.isArray(item.sizeChart)) errors.push('尺寸表格式非法');
    else {
      item.sizeChart.forEach((row, i) => {
        if (!row.label) errors.push(`尺寸表第 ${i + 1} 行缺码数`);
        const nums = Object.values(row.measurements || {});
        if (nums.some((n) => typeof n !== 'number' || n <= 0)) errors.push(`尺寸表第 ${i + 1} 行部位数值非法`);
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

// 套搭记录校验（温度带/场景可选——不标就先存，补标随时可改；填了就必须合法）
export function validateOutfit(o) {
  const errors = [];
  if (!o.title || !String(o.title).trim()) errors.push('标题必填');
  if (!Array.isArray(o.itemIds) || o.itemIds.length < 2 || o.itemIds.length > 5) errors.push('一套须含 2~5 件');
  if (o.tempBand != null && !TEMP_BANDS.includes(o.tempBand)) errors.push(`温度带只能是 ${TEMP_BANDS.join('/')}（或不填）`);
  if (o.scenes != null && !o.scenes.every((s) => SCENES.includes(s))) errors.push('场景只能从词表选（可不选）');
  return { ok: errors.length === 0, errors };
}

// 避雷记录校验
export function validateAvoid(a) {
  const errors = [];
  if (!['套搭', '单品'].includes(a.kind)) errors.push('类型必须是 套搭/单品');
  if (!Array.isArray(a.reasons) || a.reasons.length === 0 || !a.reasons.every((r) => AVOID_REASONS.includes(r))) {
    errors.push('理由至少选一个，且只能从词表选');
  }
  return { ok: errors.length === 0, errors };
}

// 暴露给前端的全部词表
export function publicVocab() {
  return {
    categories: CATEGORIES,
    fields: FIELDS,
    tempBands: TEMP_BANDS,
    tempThickness: TEMP_THICKNESS,
    scenes: SCENES,
    avoidReasons: AVOID_REASONS,
  };
}
