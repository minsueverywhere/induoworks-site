import type { APIRoute } from 'astro';
// Astro 6+ removed `locals.runtime.env` — Cloudflare bindings/vars are read
// via this module import instead (workerd's native way to expose them).
import { env } from 'cloudflare:workers';

// This route must run per-request (it reads env vars and talks to Resend),
// so it's opted out of Astro's default static prerendering.
export const prerender = false;

/**
 * POST /api/contact
 *
 * Validates the submission, checks it against Turnstile (bot protection),
 * and forwards it by email via Resend. No data is stored anywhere; nothing
 * here touches a database.
 *
 * Required env vars, set as encrypted secrets in the Cloudflare dashboard
 * (Settings → Environment variables) — never committed to the repo:
 *   RESEND_API_KEY       - API key from resend.com
 *   CONTACT_TO_EMAIL     - inbox that should receive submissions
 *   CONTACT_FROM_EMAIL   - verified sender address/domain in Resend
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

interface ResendErrorPayload {
  statusCode?: number;
  name?: string;
  message?: string;
}

const MAX_LEN = { name: 120, email: 200, message: 4000 };
const MIN_MESSAGE_LEN = 10;
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

function parseResendError(body: string): ResendErrorPayload {
  try {
    return JSON.parse(body) as ResendErrorPayload;
  } catch {
    return { message: body || 'Unknown Resend error' };
  }
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

const cfEnv = env as unknown as Partial<Env>;

export const POST: APIRoute = async ({ request }) => {
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
  if (message.length < MIN_MESSAGE_LEN) {
    return json({ error: 'Please enter at least 10 characters.' }, 400);
  }

  if (cfEnv?.TURNSTILE_SECRET_KEY) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const verified = await verifyTurnstile(payload['cf-turnstile-response'], cfEnv.TURNSTILE_SECRET_KEY, ip);
    if (!verified) {
      return json({ error: 'Verification failed. Please retry.' }, 403);
    }
  }

  if (!cfEnv?.RESEND_API_KEY || !cfEnv?.CONTACT_TO_EMAIL || !cfEnv?.CONTACT_FROM_EMAIL) {
    console.error('Contact form is missing required environment configuration.');
    return json({ error: 'The contact form is temporarily unavailable. Please try again later.' }, 500);
  }

  let emailRes: Response;
  try {
    emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfEnv.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfEnv.CONTACT_FROM_EMAIL,
        to: cfEnv.CONTACT_TO_EMAIL,
        reply_to: email,
        subject: `New contact form message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        `,
      }),
    });
  } catch (error) {
    console.error('Resend request failed:', error instanceof Error ? error.message : 'Unknown network error');
    return json({ error: 'Could not send your message. Please try again later.' }, 502);
  }

  if (!emailRes.ok) {
    const resendError = parseResendError(await emailRes.text());
    console.error('Resend API error:', {
      httpStatus: emailRes.status,
      providerStatus: resendError.statusCode,
      name: resendError.name,
      message: resendError.message,
    });
    return json({ error: 'Could not send your message. Please try again later.' }, 502);
  }

  return json({ ok: true });
};
