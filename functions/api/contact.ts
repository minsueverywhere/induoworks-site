/**
 * Cloudflare Pages Function — POST /api/contact
 *
 * Runs at the edge, not in the Astro build. Validates the submission,
 * checks it against Turnstile (bot protection), and forwards it by email
 * via Resend. No data is stored anywhere; nothing here touches a database.
 *
 * Required environment variables (set in the Cloudflare Pages dashboard
 * under Settings → Environment variables, as *encrypted* secrets — never
 * committed to the repo):
 *   RESEND_API_KEY      - API key from resend.com
 *   CONTACT_TO_EMAIL    - inbox that should receive submissions
 *   CONTACT_FROM_EMAIL  - verified sender address/domain in Resend
 *   TURNSTILE_SECRET_KEY - secret key from the Cloudflare Turnstile dashboard
 *                          (optional: if unset, Turnstile verification is skipped)
 */

interface Env {
  RESEND_API_KEY: string;
  CONTACT_TO_EMAIL: string;
  CONTACT_FROM_EMAIL: string;
  TURNSTILE_SECRET_KEY?: string;
}

interface ContactPayload {
  name?: string;
  email?: string;
  message?: string;
  company?: string; // honeypot — real users never fill this in
  'cf-turnstile-response'?: string;
}

const MAX_LEN = { name: 120, email: 200, message: 4000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function verifyTurnstile(token: string | undefined, secret: string, ip: string): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const result = (await res.json()) as { success: boolean };
  return result.success === true;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let payload: ContactPayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // Honeypot: bots fill every field, real visitors never see this one.
  if (payload.company) {
    return json({ ok: true }); // pretend success, drop silently
  }

  const name = (payload.name || '').trim();
  const email = (payload.email || '').trim();
  const message = (payload.message || '').trim();

  if (!name || !email || !message) {
    return json({ error: 'Name, email, and message are required.' }, 400);
  }
  if (name.length > MAX_LEN.name || email.length > MAX_LEN.email || message.length > MAX_LEN.message) {
    return json({ error: 'One or more fields exceed the maximum length.' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: 'Please provide a valid email address.' }, 400);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const verified = await verifyTurnstile(payload['cf-turnstile-response'], env.TURNSTILE_SECRET_KEY, ip);
    if (!verified) {
      return json({ error: 'Verification failed. Please retry.' }, 403);
    }
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    console.error('Contact form is missing required environment configuration.');
    return json({ error: 'The contact form is temporarily unavailable. Please try again later.' }, 500);
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      reply_to: email,
      subject: `New contact form message from ${name}`,
      html: `
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    }),
  });

  if (!emailRes.ok) {
    console.error('Resend API error:', await emailRes.text());
    return json({ error: 'Could not send your message. Please try again later.' }, 502);
  }

  return json({ ok: true });
};

export const onRequestGet: PagesFunction = async () => {
  return json({ error: 'Method not allowed.' }, 405);
};
