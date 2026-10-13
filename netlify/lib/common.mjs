// Спільні функції для серверної частини KVTKA
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

export const db = (name) => getStore({ name, consistency: 'strong' });

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

// Пароль адміна задається в Netlify: змінна оточення ADMIN_KEY
export function adminConfigured() {
  return !!process.env.ADMIN_KEY;
}

export function isAdmin(req) {
  const key = process.env.ADMIN_KEY || '';
  const got = req.headers.get('x-admin-key') || '';
  if (!key || !got) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const FLOWER_FORMATS = ['bouquets', 'mixed', 'bento', 'boxes', 'baskets'];

// Каталог зберігається окремо від залишків, щоб замовлення покупців не губились при публікації
export async function loadCatalog() {
  const store = db('kvtka');
  const catalog = await store.get('catalog', { type: 'json' });
  if (!catalog) return null;
  const stock = (await store.get('stock', { type: 'json' })) || {};
  for (const p of catalog.products || []) {
    if (Object.prototype.hasOwnProperty.call(stock, p.id)) p.stock = stock[p.id];
  }
  return catalog;
}

export async function saveStock(stock) {
  await db('kvtka').setJSON('stock', stock);
}

export async function loadStock() {
  return (await db('kvtka').get('stock', { type: 'json' })) || {};
}

export const money = n => `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} грн`;
export const clip = (v, n = 300) => String(v ?? '').slice(0, n);
