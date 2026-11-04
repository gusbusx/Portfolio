/**
 * Vercel serverless function: POST /api/contact
 * Sends portfolio contact messages to your inbox through Resend (https://resend.com).
 *
 * Set these in Vercel → your project → Settings → Environment Variables:
 *   RESEND_API_KEY  (required)  your Resend key named "portfolio" (Sending access)
 *   CONTACT_TO      (optional)  where messages go. Default: augustoesegura@gmail.com
 *                               Until a domain is verified in Resend, this must be the
 *                               email you signed up to Resend with.
 *   CONTACT_FROM    (optional)  an address on a domain verified in Resend,
 *                               e.g. portfolio@gusify.net. Default: onboarding@resend.dev
 *
 * In your inbox each message shows as "<Their name> via Portfolio", and hitting Reply
 * writes back to the person who sent it.
 */

const MAX = { name: 100, email: 200, phone: 20, subject: 150, message: 5000 };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n) : '');

function emailHtml({ name, email, phone, subject, message, source }) {
  const row = (k, v) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:14px;color:#111827">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#05060d;padding:22px 26px">
      <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#22d3ee">New message · Portfolio</div>
      <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:6px">${esc(subject)}</div>
    </div>
    <div style="padding:22px 26px">
      <table style="border-collapse:collapse;margin-bottom:18px">
        ${row('From', esc(name))}
        ${row('Email', `<a href="mailto:${esc(email)}" style="color:#0b57d0">${esc(email)}</a>`)}
        ${phone ? row('Phone', `<a href="tel:${esc(phone)}" style="color:#0b57d0">${esc(phone)}</a>`) : ''}
        ${row('Sent from', esc(source))}
      </table>
      <div style="font-size:15px;line-height:1.65;color:#111827;white-space:pre-wrap;border-top:1px solid #f1f3f4;padding-top:16px">${esc(message)}</div>
      <a href="mailto:${esc(email)}?subject=${encodeURIComponent('Re: ' + subject)}" style="display:inline-block;margin-top:22px;background:#0b57d0;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:999px">Reply to ${esc(name.split(' ')[0])}</a>
    </div>
  </div>
  <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:14px">Sent from augustos-portfolio.vercel.app</div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Spam trap: real people never fill this hidden field.
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const phone = clean(body.phone, MAX.phone);
  const subject = clean(body.subject, MAX.subject) || 'New message from your portfolio';
  const message = clean(body.message, MAX.message);
  const source = clean(body.source, 40) || 'Contact form';

  const errors = {};
  if (!name) errors.name = 'Please add your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Please enter a valid email.';
  if (phone && !/^\+\d{6,15}$/.test(phone)) errors.phone = 'That phone number doesn\u2019t look right.';
  if (message.length < 2) errors.message = 'Please write a message.';
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: 'Email is not set up yet.' });

  const to = process.env.CONTACT_TO || 'augustoesegura@gmail.com';
  const fromAddr = (process.env.CONTACT_FROM || '').match(/<([^>]+)>/)?.[1] || process.env.CONTACT_FROM || 'onboarding@resend.dev';
  const fromName = name.replace(/[<>"\\]/g, '').slice(0, 60);

  const text = [
    `New message from your portfolio (${source})`,
    '',
    `From: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Subject: ${subject}`,
    '',
    message,
  ].filter((l) => l !== null).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} via Portfolio <${fromAddr}>`,
        to: [to],
        reply_to: email,
        subject: `Portfolio: ${subject}`,
        text,
        html: emailHtml({ name, email, phone, subject, message, source }),
      }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'Could not send right now.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend request failed', e);
    return res.status(502).json({ ok: false, error: 'Could not send right now.' });
  }
};
