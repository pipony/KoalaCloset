import test from 'node:test';
import assert from 'node:assert/strict';
import { filterClothes, filterOutfits } from '../lib/filter.js';

const clothes = [
  { id: '1', name: '白色棉麻衬衫', brand: 'UNIQLO', category: '上装', sub: '长袖', color: '白', thickness: '薄', styles: ['通勤'] },
  { id: '2', name: '黑色圆领T恤', brand: null, category: '上装', sub: '短袖', color: '黑', thickness: '薄', styles: ['休闲'] },
  { id: '3', name: '牛仔直筒裤', brand: 'LEVIS', category: '下装', sub: '长裤', color: '蓝', thickness: '中', styles: ['通勤', '休闲'] },
];

test('空条件返回全部', () => {
  assert.equal(filterClothes(clothes, {}).length, 3);
  assert.equal(filterClothes(clothes, null).length, 3);
});

test('单值条件精确过滤', () => {
  assert.deepEqual(filterClothes(clothes, { sub: '长袖' }).map((c) => c.id), ['1']);
  assert.deepEqual(filterClothes(clothes, { category: '下装' }).map((c) => c.id), ['3']);
});

test('数组条件是字段内 OR', () => {
  assert.deepEqual(filterClothes(clothes, { thickness: ['薄', '中'] }).map((c) => c.id), ['1', '2', '3']);
  assert.deepEqual(filterClothes(clothes, { color: ['黑', '蓝'] }).map((c) => c.id), ['2', '3']);
});

test('多字段条件是 AND', () => {
  assert.deepEqual(filterClothes(clothes, { styles: ['通勤'], thickness: ['薄'] }).map((c) => c.id), ['1']);
});

test('关键词搜名称与品牌', () => {
  assert.deepEqual(filterClothes(clothes, { keyword: ['衬衫'] }).map((c) => c.id), ['1']);
  assert.deepEqual(filterClothes(clothes, { keyword: ['levi'] }).map((c) => c.id), ['3']); // 大小写不敏感
});

test('套搭过滤：温度带 + 场景', () => {
  const outfits = [
    { id: 'o1', tempBand: '舒适', scenes: ['通勤'] },
    { id: 'o2', tempBand: '严寒', scenes: ['通勤'] },
    { id: 'o3', tempBand: '舒适', scenes: ['约会'] },
  ];
  assert.deepEqual(filterOutfits(outfits, {}).map((o) => o.id), ['o1', 'o2', 'o3']);
  assert.deepEqual(filterOutfits(outfits, { tempBand: '舒适' }).map((o) => o.id), ['o1', 'o3']);
  assert.deepEqual(filterOutfits(outfits, { scene: '通勤' }).map((o) => o.id), ['o1', 'o2']);
  assert.deepEqual(filterOutfits(outfits, { tempBand: '舒适', scene: '通勤' }).map((o) => o.id), ['o1']);
});
