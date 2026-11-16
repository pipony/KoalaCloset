import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateScore, duplicateLevel, findDuplicates, matchableOutfits } from '../lib/buycheck.js';
import { TEMP_THICKNESS } from '../lib/vocab.js';

const wish = {
  id: 'w1', name: '白色纯棉长袖衬衫', category: '上装', sub: '长袖',
  color: '白', pattern: '纯色', thickness: '薄', fabric: '棉', neckline: '翻领', fit: '合身', styles: ['通勤'],
};

// 同细分同色同图案同厚薄同面料同领型同版型同风格 → 满分 3+2+1+1+1+1+0.5+0.5 = 10
const twin = { ...wish, id: 'c1', name: '一模一样的白衬衫' };
// 同细分同色，其余都不同 → 5 分
const sameBase = { id: 'c2', sub: '长袖', color: '白', pattern: '条纹', thickness: '厚', fabric: '化纤', neckline: null, fit: '宽松', styles: ['运动'] };
// 同细分不同色 → 3 分
const sameSub = { id: 'c3', sub: '长袖', color: '黑', pattern: '条纹', thickness: '厚', fabric: '化纤', styles: ['运动'] };
// 同细分但目标字段缺了不少 → 只命中细分
const bare = { id: 'c4', sub: '长袖' };
// 跨细分 → 0 分
const jeans = { id: 'c5', category: '下装', sub: '长裤', color: '蓝', fabric: '牛仔', styles: ['通勤'] };

test('查重打分：同细分全命中得满分', () => {
  const { score, hits } = duplicateScore(wish, twin);
  assert.equal(score, 10);
  assert.deepEqual(hits.map((h) => h.field), ['sub', 'color', 'pattern', 'thickness', 'fabric', 'neckline', 'fit', 'styles']);
});

test('查重打分：跨细分恒 0 分、无命中字段', () => {
  const r = duplicateScore(wish, jeans);
  assert.equal(r.score, 0);
  assert.deepEqual(r.hits, []);
});

test('查重打分：空字段不计分', () => {
  const { score, hits } = duplicateScore(wish, bare);
  assert.equal(score, 3); // 只有细分底分
  assert.deepEqual(hits.map((h) => h.field), ['sub']);
});

test('查重分档边界：6 高度相似 / 3 有些像 / 以下不算', () => {
  assert.equal(duplicateLevel(10), 'high');
  assert.equal(duplicateLevel(6), 'high');
  assert.equal(duplicateLevel(5.5), 'some');
  assert.equal(duplicateLevel(3), 'some');
  assert.equal(duplicateLevel(2.5), null);
  assert.equal(duplicateLevel(0), null);
});

test('findDuplicates：降序、截断、低分剔除；函数内不过滤 status（server 负责）', () => {
  const mixed = [sameSub, jeans, sameBase, twin, { ...bare, status: '待买' }];
  const dups = findDuplicates(wish, mixed);
  assert.deepEqual(dups.map((d) => d.cloth.id), ['c1', 'c2', 'c3']); // jeans 0 分被剔除
  assert.equal(dups[0].level, 'high');
  assert.equal(dups[1].level, 'some'); // 5 分
  assert.deepEqual(dups[2].hits.map((h) => h.field), ['sub']); // 3 分仅细分

  const top1 = findDuplicates(wish, mixed, { limit: 1 });
  assert.deepEqual(top1.map((d) => d.cloth.id), ['c1']);
});

const wardrobe = new Map([
  ['c1', twin], ['c2', sameBase], ['c3', sameSub],
  ['p1', { id: 'p1', name: '旧长袖', category: '上装', sub: '长袖', color: '灰' }],
  ['p2', { id: 'p2', name: '短袖', category: '上装', sub: '短袖', color: '白' }],
]);

test('可配几套：未标温度带的套搭兼容；记录可替换件', () => {
  const outfits = [{ id: 'o1', title: '通勤一套', itemIds: ['p1', 'p2'], tempBand: null }];
  const r = matchableOutfits(wish, outfits, wardrobe, TEMP_THICKNESS);
  assert.equal(r.count, 1);
  assert.equal(r.matches[0].replacedId, 'p1');
  assert.equal(r.matches[0].replacedName, '旧长袖');
  assert.equal(r.matches[0].title, '通勤一套');
});

test('可配几套：严寒套搭 + 薄待买件不计入，厚待买件计入', () => {
  const outfits = [{ id: 'o2', title: '冬日通勤', itemIds: ['p1', 'p2'], tempBand: '严寒' }];
  assert.equal(matchableOutfits(wish, outfits, wardrobe, TEMP_THICKNESS).count, 0); // wish 是薄
  const thickWish = { ...wish, thickness: '厚' };
  assert.equal(matchableOutfits(thickWish, outfits, wardrobe, TEMP_THICKNESS).count, 1);
});

test('可配几套：无同细分件不计；已编入该待买件的套搭排除', () => {
  const noSlot = [{ id: 'o3', title: '全是短袖', itemIds: ['p2'], tempBand: null }];
  assert.equal(matchableOutfits(wish, noSlot, wardrobe, TEMP_THICKNESS).count, 0);

  const selfIn = [{ id: 'o4', title: '虚拟搭配', itemIds: ['w1', 'p2'], tempBand: null }];
  assert.equal(matchableOutfits(wish, selfIn, wardrobe, TEMP_THICKNESS).count, 0);
});

test('可配几套：多个同细分槽位只记第一件；target 厚薄为空时温度带不否决', () => {
  const two = [{ id: 'o5', title: '两件长袖', itemIds: ['p1', 'c3'], tempBand: '热' }];
  const noThickness = { ...wish, thickness: null };
  const r = matchableOutfits(noThickness, two, wardrobe, TEMP_THICKNESS);
  assert.equal(r.count, 1);
  assert.equal(r.matches[0].replacedId, 'p1'); // 记第一件命中的
});
