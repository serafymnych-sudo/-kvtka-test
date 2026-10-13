// Перевірка пароля адміністратора
import { json, isAdmin, adminConfigured } from '../lib/common.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (!adminConfigured()) return json({ ok: false, error: 'ADMIN_KEY не задано в Netlify' }, 503);
  if (!isAdmin(req)) {
    await new Promise(r => setTimeout(r, 600)); // уповільнюємо підбір пароля
    return json({ ok: false }, 401);
  }
  return json({ ok: true });
};

export const config = { path: '/api/auth' };
