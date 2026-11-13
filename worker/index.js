/**
 * Cloudflare Worker for gusify.net.
 * /api/contact → sends the contact form through Resend (see functions/api/contact.js).
 * Everything else → the static site.
 */
import { onRequestPost, onRequest } from '../functions/api/contact.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') {
      return request.method === 'POST' ? onRequestPost({ request, env, ctx }) : onRequest();
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
