// Список замовлень для адмінки: перегляд, зміна статусу, видалення
import { db, json, isAdmin } from '../lib/common.mjs';

const STATUSES = ['new', 'confirmed', 'delivered', 'cancelled'];

export default async (req) => {
  if (!isAdmin(req)) return json({ ok: false, error: 'Потрібен вхід адміністратора' }, 401);
  const store = db('orders');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const keys = blobs.map(b => b.key).sort().reverse().slice(0, 300);
    const orders = (await Promise.all(keys.map(k => store.get(k, { type: 'json' })))).filter(Boolean);
    return json({ ok: true, orders });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ ok: false }, 400); }
    if (!body.id || !STATUSES.includes(body.status)) return json({ ok: false }, 400);
    const order = await store.get(body.id, { type: 'json' });
    if (!order) return json({ ok: false, error: 'Замовлення не знайдено' }, 404);
    order.status = body.status;
    await store.setJSON(body.id, order);
    return json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return json({ ok: false }, 400);
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ ok: false }, 405);
};

export const config = { path: '/api/orders' };
