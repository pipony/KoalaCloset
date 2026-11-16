// 待买区：看中的衣服先进这里，不进正式衣柜
// 每件的「买前对照台」（该买什么码 / 查重 / 配几套）在它自己的详情页；结局二选一：转正 / 丢掉

import { api } from '../api.js';
import { el, clothesCard, boardAdd, boardDraft, toast, wishBadge } from '../components.js';
import { state } from '../app.js';

export async function wish(view) {
  const list = await api.clothes({ status: '待买' });
  wishBadge(list.length);

  view.append(el`
    <div class="runhead">
      <h2>待买区</h2><span>WISHLIST · ${list.length} 件</span>
    </div>`);

  if (list.length === 0) {
    view.append(el`<div class="empty"><em>待买区是空的</em>
      看中了但还没下单的衣服，录入时选「待买」放进这里——先对照尺码、查查重、试试能配几套，再决定买不买。买了转正式档案，没买就丢掉，不沉淀垃圾数据。</div>`);
  } else {
    view.append(el`<p class="muted" style="font-size:13px;letter-spacing:.06em;margin:14px 0 4px">
      点卡片进详情页做买前对照（该买什么码 / 衣柜里有没有差不多的 / 能配几套）；结局只有「买了转正」或「没买丢掉」。</p>`);
  }

  const head = el`<div class="btnline" style="margin:14px 0 22px">
    <a class="btn primary" href="#/editor/new" id="wish-add">＋ 添加待买</a>
    <span class="muted" style="font-size:12px;letter-spacing:.08em">录入时状态选「待买」，商品图可以先放电商截图</span>
  </div>`;
  view.append(head);
  head.querySelector('#wish-add').addEventListener('click', (e) => {
    e.preventDefault();
    state.pendingStatus = '待买';
    location.hash = '#/editor/new';
  });

  if (list.length === 0) return;

  const grid = el`<div class="grid"></div>`;
  view.append(grid);
  for (const c of list) {
    const card = clothesCard(c, { showOps: true });
    card.addEventListener('click', (e) => {
      const op = e.target.closest('[data-op]')?.dataset.op;
      if (op === 'board') { boardAdd(c.id); toast(`已加入搭配板（当前 ${boardDraft().length} 件）`); }
      else location.hash = `#/item/${c.id}`;
    });
    grid.append(card);
  }
}
