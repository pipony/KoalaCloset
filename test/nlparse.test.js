import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../lib/nlparse.js';

test('温度 + 场景 + 颜色 + 细分全命中', () => {
  const { cond, unknown } = parseQuery('明天16度通勤想穿白衬衫');
  assert.equal(cond.tempC, 16);
  assert.equal(cond.tempBand, '舒适');
  assert.deepEqual(cond.thickness, ['薄', '中']); // 舒适带建议
  assert.deepEqual(cond.scenes, ['通勤']);
  assert.deepEqual(cond.styles, ['通勤']); // 「通勤」同时命中风格与场景
  assert.equal(cond.color, '白');
  assert.equal(cond.sub, '长袖'); // 衬衫 → 长袖
  assert.equal(cond.category, '上装'); // 由细分反推
  assert.equal(unknown.length, 0);
});

test('温度带边界按左闭右开', () => {
  assert.equal(parseQuery('25度穿什么').cond.tempBand, '热');
  assert.equal(parseQuery('15度穿什么').cond.tempBand, '舒适');
  assert.equal(parseQuery('零下2度').cond.tempC, -2);
  assert.equal(parseQuery('零下2度').cond.tempBand, '严寒');
});

test('长词优先：米白归「米」不归「白」', () => {
  assert.equal(parseQuery('米白的外套').cond.color, '米');
});

test('同义词归一到词表值', () => {
  const { cond } = parseQuery('上班穿的藏蓝西装');
  assert.deepEqual(cond.scenes, ['通勤']); // 上班 → 通勤
  assert.equal(cond.color, '蓝'); // 藏蓝 → 蓝
  assert.equal(cond.sub, '外套'); // 西装 → 外套
});

test('面料与版型命中', () => {
  const { cond } = parseQuery('宽松的牛仔裤');
  assert.equal(cond.fit, '宽松');
  assert.equal(cond.fabric, '牛仔');
  assert.equal(cond.sub, '长裤'); // 牛仔裤 → 长裤（长词优先于「牛仔」面料）
  assert.equal(cond.category, '下装');
});

test('未识别词原样返回，不猜不丢', () => {
  const { unknown } = parseQuery('穿得利落一点的外套');
  assert.ok(unknown.includes('利落'));
});

test('风格与弹性', () => {
  const { cond } = parseQuery('适合运动的微弹长袖');
  assert.ok(cond.styles.includes('运动'));
  assert.equal(cond.elastic, '微弹');
  assert.equal(cond.sub, '长袖');
});

test('同字段多值数组去重', () => {
  const { cond } = parseQuery('白色或米色的外套');
  assert.deepEqual(cond.color, '白'); // 单值字段首次命中
  assert.equal(cond.sub, '外套');
});

test('纯温度查询也成立', () => {
  const { cond } = parseQuery('明天 8°C');
  assert.equal(cond.tempC, 8);
  assert.equal(cond.tempBand, '凉');
  assert.deepEqual(cond.thickness, ['中', '厚']);
});
