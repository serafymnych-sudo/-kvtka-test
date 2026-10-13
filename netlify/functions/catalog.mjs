// Каталог товарів: читають усі, публікує тільки адмін
import { db, json, isAdmin, loadCatalog, loadStock, saveStock } from '../lib/common.mjs';

export default async (req) => {
  if (req.method === 'GET') {
    const catalog = await loadCatalog();
    if (!catalog) return json({ ok: false, error: 'Каталог ще не опубліковано' }, 404);
    return json(catalog);
  }

  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: 'Потрібен вхід адміністратора' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Bad JSON' }, 400); }
  const catalog = body && body.catalog;
  if (!catalog || !Array.isArray(catalog.products) || catalog.products.length > 3000) {
    return json({ ok: false, error: 'Неправильний каталог' }, 400);
  }
  if (catalog.products.some(p => typeof p.id !== 'number' || !p.title)) {
    return json({ ok: false, error: 'У товарів мають бути id і назва' }, 400);
  }

  const store = db('kvtka');
  const current = await store.get('catalog', { type: 'json' });
  // Захист від перезапису змін, зроблених з іншого пристрою
  if (current && !body.force && body.baseAt !== current.publishedAt) {
    return json({ ok: false, conflict: true, publishedAt: current.publishedAt }, 409);
  }

  // Залишки: якщо адмін не змінював кількість товару — зберігаємо поточну (після продажів)
  const serverStock = await loadStock();
  const stockBase = body.stockBase || {};
  const newStock = {};
  for (const p of catalog.products) {
    if (p.stock === null || p.stock === undefined) continue;
    const untouched = Object.prototype.hasOwnProperty.call(stockBase, p.id) && stockBase[p.id] === p.stock;
    newStock[p.id] = (untouched && Object.prototype.hasOwnProperty.call(serverStock, p.id)) ? serverStock[p.id] : p.stock;
  }

  const publishedAt = new Date().toISOString();
  await store.setJSON('catalog', { ...catalog, publishedAt });
  await saveStock(newStock);
  return json({ ok: true, publishedAt, stock: newStock });
};

export const config = { path: '/api/catalog' };
