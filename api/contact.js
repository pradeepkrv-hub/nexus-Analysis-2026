// Vercel serverless function: receives the website enquiry form and emails it.
// Required environment variables (set in Vercel project settings):
//   RESEND_API_KEY   - API key from resend.com
//   CONTACT_FROM     - verified sender, e.g. "Nexus Analysis <website@nexus-analysis.com>"
// Optional:
//   CONTACT_TO       - defaults to pradeep@nexus-analysis.com
//   CONTACT_CC       - e.g. pradeep@nexus-analysis.com

const clean = (v, max = 4000) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const oneLine = (v) => clean(v, 200).replace(/[\n\t]+/g, ' ');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Spam trap: real visitors never fill the hidden "website" field.
  if (body.hp_trap) {
    return res.status(200).json({ ok: true });
  }

  const first = clean(body.first, 100);
  const last = clean(body.last, 100);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 60);
  const company = clean(body.company, 200);
  const country = clean(body.country, 100);
  const service = clean(body.service, 200);
  const message = clean(body.message, 4000);

  if (!first || !last || !message || !EMAIL.test(email) || body.consent !== true) {
    return res.status(400).json({ ok: false, error: 'Please complete all required fields.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM;
  if (!apiKey || !from) {
    console.error('Contact form: RESEND_API_KEY or CONTACT_FROM is not set');
    return res.status(500).json({ ok: false, error: 'Mail service not configured.' });
  }

  const to = process.env.CONTACT_TO || 'pradeep@nexus-analysis.com';
  const cc = process.env.CONTACT_CC ? [process.env.CONTACT_CC] : undefined;

  const subject = `Website enquiry: ${oneLine(service) || 'General'} – ${oneLine(first)} ${oneLine(last)}`;
  const text = [
    'New enquiry from the Nexus Analysis website',
    '',
    `Name: ${first} ${last}`,
    `Email: ${email}`,
    `Phone: ${phone || '-'}`,
    `Company: ${company || '-'}`,
    `Country: ${country || '-'}`,
    `Service of interest: ${service || '-'}`,
    '',
    'Message:',
    message,
    '',
    'Consent to processing given: yes',
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        cc,
        reply_to: email,
        subject,
        text,
      }),
    });

    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'Email could not be sent.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form network error', err);
    return res.status(502).json({ ok: false, error: 'Email could not be sent.' });
  }
}
