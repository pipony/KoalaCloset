// SPA 入口：hash 路由 + 全局搜索条 + 导航高亮
// 路由：#/wardrobe（默认） #/item/:id #/editor/new #/editor/:id
//       #/compare（买前比对） #/annotate（AI 标注） #/outfits #/outfit/:id #/board #/sizes #/avoid

import { boardBadge } from './components.js';
import { wardrobe } from './views/wardrobe.js';
import { compare } from './views/compare.js';
import { itemView } from './views/item.js';
import { editor } from './views/editor.js';
import { outfits } from './views/outfits.js';
import { outfitDetail } from './views/outfit.js';
import { board } from './views/board.js';
import { sizes } from './views/sizes.js';
import { avoid } from './views/avoid.js';
import { annotate } from './views/annotate.js';

const ROUTES = {
  wardrobe, compare, item: itemView, editor, outfits, outfit: outfitDetail, board, sizes, avoid, annotate,
};

export const state = {
  pendingQuery: null, // 全局搜索条 → 衣柜页消费一次
  pendingAsk: null,   // 「问 AI」按钮 → 衣柜页消费一次并拉起问答面板
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [route, ...params] = h.split('/');
  if (!route || !ROUTES[route]) return { route: 'wardrobe', params: [] };
  return { route, params };
}

async function render() {
  const { route, params } = parseHash();
  const view = document.getElementById('view');
  view.innerHTML = '';
  document.querySelectorAll('#toc a').forEach((a) => {
    a.classList.toggle('on', a.dataset.route === route);
  });
  try {
    await ROUTES[route](view, params);
  } catch (e) {
    view.innerHTML = `<div class="empty"><em>这一页出了点问题</em>${e.message}</div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

// 全局搜索条：解析交给衣柜页；在其他页时先跳回衣柜
document.getElementById('searchbar').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const text = e.target.value.trim();
  if (!text) return;
  state.pendingQuery = text;
  if (parseHash().route !== 'wardrobe') location.hash = '#/wardrobe';
  else render();
});

// 「问 AI」：本地搜索兜底入口——手动点击才联网，只发衣柜文字卡 + 问题
document.getElementById('ask-ai').addEventListener('click', () => {
  const text = document.getElementById('search-input').value.trim();
  if (!text) return toast('先在搜索框里说句话，再点问 AI', true);
  state.pendingAsk = text;
  if (parseHash().route !== 'wardrobe') location.hash = '#/wardrobe';
  else render();
});

// 搭配板入口
document.getElementById('board-entry').addEventListener('click', (e) => {
  e.preventDefault();
  location.hash = '#/board';
});

// 点击刊头标题回首页（衣柜）
document.getElementById('brand').addEventListener('click', () => {
  location.hash = '#/wardrobe';
});

boardBadge();
render();
