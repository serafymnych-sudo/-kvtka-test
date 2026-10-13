// Приймає замовлення: перераховує ціни за каталогом, списує залишки,
// зберігає замовлення для адмінки і надсилає його вам у Telegram.
// Змінні в Netlify: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
import { db, json, clip, money, loadCatalog, loadStock, saveStock, FLOWER_FORMATS } from '../lib/common.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);

  let order;
  try { order = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  const c = order.customer || {};
  const d = order.delivery || {};
  const rawItems = Array.isArray(order.items) ? order.items.slice(0, 50) : [];
  if (!c.name || !c.phone || !d.address || rawItems.length === 0) {
    return json({ ok: false, error: 'Неповне замовлення' }, 400);
  }

  // Ціни і наявність беремо з опублікованого каталогу, а не з браузера покупця
  const catalog = await loadCatalog();
  let items = rawItems.map(i => ({ id: i.id, v: Number.isInteger(i.v) ? i.v : -1, title: clip(i.title, 150), price: Number(i.price) || 0, qty: Math.max(1, Math.min(999, Number(i.qty) || 1)) }));
  let subtotal, discount, total;
  let stock = null;

  if (catalog) {
    const byId = new Map(catalog.products.map(p => [p.id, p]));
    stock = await loadStock();
    const need = {};
    for (const it of items) {
      const p = byId.get(it.id);
      if (!p || p.hidden) return json({ ok: false, error: `Товар «${it.title}» більше недоступний. Оновіть сторінку.` }, 409);
      const variant = (it.v >= 0 && Array.isArray(p.variants)) ? p.variants[it.v] : null;
      it.price = variant ? Number(variant.price) : Number(p.price);
      it.title = clip(p.title + (variant ? ` — ${variant.name}` : ''), 150);
      it.eligible = catalog.settings?.promoEnabled !== false && FLOWER_FORMATS.includes(p.category) && !p.unit;
      need[p.id] = (need[p.id] || 0) + it.qty;
    }
    for (const [id, qty] of Object.entries(need)) {
      if (Object.prototype.hasOwnProperty.call(stock, id) && stock[id] < qty) {
        const p = byId.get(Number(id));
        return json({ ok: false, error: stock[id] > 0 ? `«${p.title}»: в наявності лише ${stock[id]} шт.` : `«${p.title}» вже немає в наявності.` }, 409);
      }
    }
    subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const units = [];
    items.forEach(i => { if (i.eligible) for (let k = 0; k < i.qty; k++) units.push(i.price); });
    units.sort((a, b) => b - a);
    discount = 0;
    for (let k = 2; k < units.length; k += 3) discount += units[k];
    total = subtotal - discount;
    for (const [id, qty] of Object.entries(need)) {
      if (Object.prototype.hasOwnProperty.call(stock, id)) stock[id] = Math.max(0, stock[id] - qty);
    }
  } else {
    subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    discount = Math.max(0, Number(order.discount) || 0);
    total = subtotal - discount;
  }

  const id = `o-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const saved = {
    id,
    number: clip(order.number, 20) || String(Date.now()).slice(-6),
    createdAt: new Date().toISOString(),
    date: new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
    status: 'new',
    customer: { name: clip(c.name, 80), phone: clip(c.phone, 30) },
    delivery: { address: clip(d.address, 200), date: clip(d.date, 20), time: clip(d.time, 30), recipient: clip(d.recipient, 120), anonymous: !!d.anonymous },
    cardText: clip(order.cardText),
    comment: clip(order.comment),
    items: items.map(({ eligible, ...i }) => i),
    subtotal, discount, total
  };

  await db('orders').setJSON(id, saved);
  if (stock) await saveStock(stock);

  // Telegram
  let telegram = false;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const lines = [
      `🌸 Нове замовлення №${saved.number}`,
      '',
      `👤 ${saved.customer.name}, ${saved.customer.phone}`,
      `📍 ${saved.delivery.address}`,
      `🗓 ${saved.delivery.date || 'дата не вказана'}, ${saved.delivery.time}`,
      saved.delivery.recipient ? `🎁 Отримувач: ${saved.delivery.recipient}` : '',
      saved.delivery.anonymous ? '🤫 Анонімна доставка' : '',
      '',
      ...saved.items.map(i => `• ${i.title} × ${i.qty} = ${money(i.price * i.qty)}`),
      '',
      discount ? `Акція 1+1=3: −${money(discount)}` : '',
      `💰 Разом: ${money(total)}`,
      saved.cardText ? `\n✉️ Листівка: ${saved.cardText}` : '',
      saved.comment ? `💬 Коментар: ${saved.comment}` : ''
    ].filter(l => l !== '');
    try {
      const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: lines.join('\n') })
      });
      telegram = tg.ok;
    } catch {}
  }

  return json({ ok: true, number: saved.number, total, discount, telegram });
};

export const config = { path: '/api/order' };
