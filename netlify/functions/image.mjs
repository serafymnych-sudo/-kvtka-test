// Фото товарів: завантажує адмін, показуються всім
import { getStore } from '@netlify/blobs';
import { json, isAdmin } from '../lib/common.mjs';

const images = () => getStore('kvtka-images');
const MAX_SIZE = 8 * 1024 * 1024;

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    if (!/^[a-z0-9-]{6,80}$/.test(id)) return new Response('Not found', { status: 404 });
    const entry = await images().getWithMetadata(id, { type: 'arrayBuffer' });
    if (!entry) return new Response('Not found', { status: 404 });
    return new Response(entry.data, {
      headers: {
        'Content-Type': entry.metadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  }

  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: 'Потрібен вхід адміністратора' }, 401);

  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) return json({ ok: false, error: 'Можна завантажувати лише фото' }, 415);
  const data = await req.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_SIZE) return json({ ok: false, error: 'Фото завелике' }, 413);

  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await images().set(id, data, { metadata: { contentType: type } });
  return json({ ok: true, url: `/api/image?id=${id}` });
};

export const config = { path: '/api/image' };
