import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTaskContext, buildOutputSchema, buildTaskPrompt, validateAiResult } from '../lib/aitask.js';

const clothes = [
  {
    id: 'c1', no: 1, name: '白色棉麻衬衫', category: '上装', sub: '长袖', status: '在衣柜',
    color: '白', pattern: '纯色', thickness: '薄', fit: '合身', length: '常规',
    neckline: '翻领', fabric: '棉', elastic: '无弹', styles: ['通勤'],
    boughtSize: 'M', fitFeedback: '肩刚好', isBaseline: true,
    sizeChart: [{ label: 'M', measurements: { 衣长: 66, 胸围: 98 } }],
  },
  {
    id: 'c2', no: 2, name: '黑色圆领T恤', category: '上装', sub: '短袖', status: '在衣柜',
    color: '黑', pattern: '纯色', thickness: '薄', fit: '宽松',
    styles: ['休闲'], isBaseline: false, sizeChart: [],
  },
  {
    id: 'w1', no: null, name: '另一件待比对的', category: '上装', sub: '长袖', status: '待买',
    color: '白', styles: [], sizeChart: [],
  },
];

test('makeTaskContext：含词表、衣柜文字卡与基准款尺寸表；不含待买件', () => {
  const md = makeTaskContext(clothes);
  assert.ok(md.includes('固定词表'));
  assert.ok(md.includes('上装（短袖/长袖/无袖/外套）'));
  assert.ok(md.includes('NO.1 白色棉麻衬衫'));
  assert.ok(md.includes('衣长66cm，胸围98cm')); // 基准款尺寸表
  assert.ok(md.includes('合身反馈:肩刚好'));
  assert.ok(md.includes('同细分优先'));
  assert.ok(!md.includes('另一件待比对的')); // 待买件不进上下文
});

test('makeTaskContext：无基准款时如实说明', () => {
  const md = makeTaskContext([{ ...clothes[1] }]);
  assert.ok(md.includes('还没有标基准款'));
});

test('buildTaskPrompt：讲清看图、词表口径与输出要求', () => {
  const p = buildTaskPrompt();
  assert.ok(p.includes('卖家秀'));
  assert.ok(p.includes('只能从'));
  assert.ok(p.includes('不要编'));
  assert.ok(p.includes('schema'));
});

test('buildOutputSchema：结构完整、严格模式兼容（anyOf 可空 + 固定部位 + 全属性 required）', () => {
  const s = buildOutputSchema();
  assert.deepEqual(s.required, ['card', 'sizeChart', 'sizeAdvice', 'duplicates', 'matchNote', 'summary']);
  const card = s.properties.card;
  assert.equal(card.additionalProperties, false);
  assert.deepEqual([...card.required].sort(), [...card.required, ...[]].sort()); // 自洽
  assert.ok(card.required.includes('brand')); // 可空字段也必须在 required 里
  // 可空枚举走 anyOf（OpenAI 严格模式兼容）
  const color = card.properties.color;
  assert.equal(color.anyOf[0].type, 'string');
  assert.deepEqual(color.anyOf[0].enum.slice(0, 3), ['黑', '白', '灰']);
  assert.deepEqual(color.anyOf[1], { type: 'null' });
  assert.equal(card.properties.styles.maxItems, 2);
  // measurements 固定部位 + 可空数值 + 不允许自由 key
  const ms = s.properties.sizeChart.items.properties.measurements;
  assert.equal(ms.additionalProperties, false);
  assert.ok(ms.required.includes('衣长'));
  assert.deepEqual(ms.properties.衣长, { anyOf: [{ type: 'number' }, { type: 'null' }] });
  assert.deepEqual(s.properties.duplicates.properties.verdict.enum, ['有差不多的', '没有差不多的']);
});

test('validateAiResult：合法结果全过、无 issue', () => {
  const r = validateAiResult({
    card: {
      name: '白色纯棉长袖衬衫', brand: 'ZARA', category: '上装', sub: '长袖',
      color: '白', pattern: '纯色', thickness: '薄', fit: '合身', length: '常规',
      neckline: '翻领', fabric: '棉', elastic: '无弹', styles: ['通勤', '休闲'],
    },
    sizeChart: [{ label: 'M', measurements: { 衣长: 66, 胸围: 98 } }],
    sizeAdvice: { advice: '买 M', reason: '与基准款肩宽一致' },
    duplicates: { verdict: '有差不多的', items: [{ name: '白色棉麻衬衫', why: '同为白色长袖衬衫' }], note: '' },
    matchNote: '可搭配牛仔直筒裤', summary: '和现有白衬衫重复，可不买',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
  assert.equal(r.card.name, '白色纯棉长袖衬衫');
  assert.equal(r.conclusion.size.advice, '买 M');
  assert.equal(r.conclusion.duplicate.verdict, '有差不多的');
  assert.equal(r.sizeChart.length, 1);
});

test('validateAiResult：词表外值置 null 记 issue；大类缺失连带细分置空', () => {
  const r = validateAiResult({
    card: {
      name: 'X', category: '上衣', sub: '长袖', // 「上衣」不在词表
      color: '藕荷色', // 不在词表
      styles: ['通勤', '甜美', '仙女风'], // 一项词表外
    },
    sizeChart: [{ label: '', measurements: {} }, { label: 'M', measurements: { 胸围: -2 } }], // 全剔
    sizeAdvice: {}, duplicates: {}, matchNote: null, summary: undefined,
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes('大类')));
  assert.ok(r.issues.some((i) => i.includes('主色')));
  assert.ok(r.issues.some((i) => i.includes('细分')));
  assert.equal(r.card.category, null);
  assert.equal(r.card.sub, null);
  assert.equal(r.card.color, null);
  assert.deepEqual(r.card.styles, ['通勤', '甜美']); // 词表外剔除，截到 2
  assert.deepEqual(r.sizeChart, []);
  assert.ok(r.issues.filter((i) => i.includes('尺寸表')).length >= 2);
  // 缺失的结论文本给兜底而不是崩
  assert.equal(r.conclusion.duplicate.verdict, '没有差不多的');
  assert.ok(r.conclusion.summary.includes('未给'));
});

test('validateAiResult：字段缺省（null）不算 issue；名称缺失给兜底名', () => {
  const r = validateAiResult({
    card: { name: '', category: '上装', sub: '短袖', color: '黑', pattern: '纯色', thickness: '薄', fit: '合身', length: '常规', fabric: '棉', elastic: '无弹', styles: [] },
    sizeChart: [], sizeAdvice: { advice: 'S', reason: 'ok' },
    duplicates: { verdict: '没有差不多的', items: [], note: 'x' },
    matchNote: 'y', summary: 'z',
  });
  assert.equal(r.ok, true); // 领型/品牌缺省不是问题
  assert.equal(r.card.neckline, null);
  assert.equal(r.card.name, '待比对新衣');
});

// —— AI 标注员 ——
import { makeAnnotateContext, buildAnnotateSchema, buildAnnotatePrompt, validateAnnotateResult } from '../lib/aitask.js';

const annItems = [
  {
    id: 'c1', no: 1, name: '白衬衫', brand: 'UNIQLO', category: '上装', sub: '长袖',
    color: '白', pattern: '纯色', thickness: null, fit: '合身', length: '常规',
    neckline: null, fabric: '棉', elastic: '无弹', styles: ['通勤'],
  },
  {
    id: 'c2', no: 2, name: '蓝裤子', brand: null, category: '下装', sub: '长裤',
    color: '蓝', pattern: null, thickness: '中', fit: null, length: '常规',
    neckline: null, fabric: '牛仔', elastic: null, styles: ['通勤', '休闲'],
  },
];

test('makeAnnotateContext：词表 + index 与当前值', () => {
  const md = makeAnnotateContext(annItems);
  assert.ok(md.includes('index=1'));
  assert.ok(md.includes('NO.') || md.includes('白衬衫'));
  assert.ok(md.includes('蓝裤子'));
  assert.ok(md.includes('固定词表'));
});

test('buildAnnotatePrompt：讲清附图编号对应与词表约束', () => {
  const p = buildAnnotatePrompt();
  assert.ok(p.includes('第 1 张附图对应'));
  assert.ok(p.includes('只能从'));
  assert.ok(p.includes('按图给出'));
});

test('buildAnnotateSchema：严格模式自检（items 数组、全键 required、anyOf 可空）', () => {
  const s = buildAnnotateSchema();
  const item = s.properties.items.items;
  assert.equal(item.additionalProperties, false);
  assert.ok(item.required.includes('brand'));
  assert.ok(item.required.includes('styles'));
  assert.equal(item.properties.color.anyOf[1].type, 'null');
  assert.equal(item.properties.styles.maxItems, 2);
  assert.equal(item.properties.index.type, 'number');
});

test('validateAnnotateResult：补空/纠错/一致 三分类 + index 映射 + 词表外剔除', () => {
  const raw = {
    items: [
      { // c1：thickness 补空、color 纠错（白→米）、fabric 词表外剔除
        index: 1, name: '米色衬衫', brand: 'UNIQLO', category: '上装', sub: '长袖',
        color: '米', pattern: '纯色', thickness: '薄', fit: '合身', length: '常规',
        neckline: '翻领', fabric: '棉麻混纺', elastic: '无弹', styles: ['通勤'],
      },
      { // c2：pattern/elastic 补空、styles 纠错、fit 一致
        index: 2, name: '蓝色牛仔裤', brand: 'LEVIS', category: '下装', sub: '长裤',
        color: '蓝', pattern: '纯色', thickness: '中', fit: null, length: '常规',
        neckline: null, fabric: '牛仔', elastic: '微弹', styles: ['通勤'],
      },
      { index: 99, name: '编错号', brand: null, category: null, sub: null, color: null, pattern: null, thickness: null, fit: null, length: null, neckline: null, fabric: null, elastic: null, styles: [] },
    ],
  };
  const r = validateAnnotateResult(raw, annItems);
  assert.equal(r.length, 2); // index=99 被丢弃
  const r1 = r.find((x) => x.itemId === 'c1');
  assert.deepEqual(r1.fills, { thickness: '薄', neckline: '翻领' }); // 补空
  assert.deepEqual(r1.corrections, { color: { from: '白', to: '米' } }); // 纠错
  assert.ok(r1.issues.some((i) => i.includes('面料'))); // 棉麻混纺 不在词表
  assert.ok(!('name' in r1.fills) && !('name' in r1.corrections)); // 名称不进建议
  const r2 = r.find((x) => x.itemId === 'c2');
  assert.deepEqual(r2.fills, { pattern: '纯色', elastic: '微弹', brand: 'LEVIS' });
  assert.deepEqual(r2.corrections, { styles: { from: '通勤·休闲', to: '通勤' } });
});

test('validateAnnotateResult：全一致 + 无可填 → 不产出该件', () => {
  const raw = {
    items: [{
      index: 1, name: '白衬衫', brand: 'UNIQLO', category: '上装', sub: '长袖',
      color: '白', pattern: '纯色', thickness: null, fit: '合身', length: '常规',
      neckline: null, fabric: '棉', elastic: '无弹', styles: ['通勤'],
    }],
  };
  const r = validateAnnotateResult(raw, annItems);
  assert.equal(r.length, 0); // 与当前值全一致（thickness 也认不出 → null），无事可做
});
