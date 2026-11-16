import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClothes, validateOutfit, validateAvoid, tempToBand } from '../lib/vocab.js';

const good = {
  name: '白色棉麻衬衫', category: '上装', sub: '长袖',
  color: '白', pattern: '纯色', thickness: '薄', fit: '合身', length: '常规',
  neckline: '翻领', fabric: '棉', elastic: '无弹', styles: ['通勤'],
};

test('合法档案通过校验', () => {
  assert.equal(validateClothes(good).ok, true);
});

test('细分与大类不联动会被拦', () => {
  assert.equal(validateClothes({ ...good, sub: '长裤' }).ok, false); // 长裤不是上装细分
  assert.equal(validateClothes({ ...good, category: '下装', sub: '半裙', neckline: null }).ok, true);
});

test('词表外取值被拦', () => {
  assert.equal(validateClothes({ ...good, color: '藕荷色' }).ok, false);
  assert.equal(validateClothes({ ...good, thickness: '超厚' }).ok, false);
});

test('状态只认 在衣柜/待买，缺省合法', () => {
  assert.equal(validateClothes({ ...good, status: '在衣柜' }).ok, true);
  assert.equal(validateClothes({ ...good, status: '待买' }).ok, true);
  assert.equal(validateClothes(good).ok, true); // 缺省
  assert.equal(validateClothes({ ...good, status: '想要' }).ok, false);
});

test('风格最多两项', () => {
  assert.equal(validateClothes({ ...good, styles: ['通勤', '休闲'] }).ok, true);
  assert.equal(validateClothes({ ...good, styles: ['通勤', '休闲', '运动'] }).ok, false);
});

test('下装不能填领型', () => {
  assert.equal(validateClothes({ ...good, category: '下装', sub: '长裤', neckline: '圆领' }).ok, false);
});

test('领型可空', () => {
  assert.equal(validateClothes({ ...good, neckline: null }).ok, true);
});

test('温度带边界：左闭右开', () => {
  assert.equal(tempToBand(-3), '严寒');
  assert.equal(tempToBand(4.9), '严寒');
  assert.equal(tempToBand(5), '凉');
  assert.equal(tempToBand(14.9), '凉');
  assert.equal(tempToBand(15), '舒适');
  assert.equal(tempToBand(24.9), '舒适');
  assert.equal(tempToBand(25), '热');
  assert.equal(tempToBand(30), '热');
});

test('套搭校验：温度带/场景可选，填了必须合法', () => {
  const base = { title: '通勤日', itemIds: ['a', 'b'], tempBand: '舒适', scenes: ['通勤'] };
  assert.equal(validateOutfit(base).ok, true);
  // 不标温度带 / 不选场景 → 允许存（2026-11-15 拍板放宽）
  assert.equal(validateOutfit({ ...base, tempBand: null, scenes: [] }).ok, true);
  assert.equal(validateOutfit({ ...base, tempBand: undefined, scenes: undefined }).ok, true);
  // 填了但不在词表 → 拦
  assert.equal(validateOutfit({ ...base, tempBand: '微凉' }).ok, false);
  assert.equal(validateOutfit({ ...base, scenes: ['约会逛街'] }).ok, false);
  assert.equal(validateOutfit({ ...base, itemIds: ['a'] }).ok, false);
});

test('避雷校验', () => {
  assert.equal(validateAvoid({ kind: '单品', reasons: ['感觉重复'] }).ok, true);
  assert.equal(validateAvoid({ kind: '单品', reasons: ['显胖'] }).ok, false);
  assert.equal(validateAvoid({ kind: '单品', reasons: [] }).ok, false);
});
