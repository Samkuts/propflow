/**
 * SMS helper using Twilio.
 * Silently no-ops when TWILIO_* env vars are not set (local dev without credentials).
 *
 * Mirrors the pattern in email.ts — lazy import, silent no-op guard, named template functions.
 */

interface SendSmsOptions {
  to: string;
  body: string;
}

let _twilioConfiguredCache: boolean | null = null;

export function twilioConfigured(): boolean {
  if (_twilioConfiguredCache === null) {
    _twilioConfiguredCache =
      !!process.env.TWILIO_ACCOUNT_SID &&
      !!process.env.TWILIO_AUTH_TOKEN &&
      !!process.env.TWILIO_FROM_NUMBER;
  }
  return _twilioConfiguredCache;
}

/**
 * Normalises a phone number to E.164 format (+1XXXXXXXXXX for US numbers).
 * Returns null if the input cannot be normalised to a 10+ digit number.
 */
function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Already has country code (11 digits starting with 1) → prefix with +
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // 10-digit US number → prepend +1
  if (digits.length === 10) return `+1${digits}`;
  // Longer numbers — assume already includes country code
  return `+${digits}`;
}

export async function sendSms(opts: SendSmsOptions): Promise<void> {
  if (!twilioConfigured()) return; // silent no-op in local dev

  const to = toE164(opts.to);
  if (!to) return; // invalid phone — skip silently

  const twilio = await import('twilio');
  const client = twilio.default(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );

  await client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER!,
    to,
    body: opts.body,
  });
}

// ─── Template helpers ─────────────────────────────────────────────────────────

/** Formats integer cents to a dollar string, e.g. 125000 → "$1,250.00" */
function formatAmount(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  );
}

export function paymentReceivedSms(opts: {
  to: string;
  tenantName: string;
  amountCents: number;
  paidDate: string;
}) {
  return sendSms({
    to: opts.to,
    body: `PropFlow: Hi ${opts.tenantName}, your payment of ${formatAmount(opts.amountCents)} was received on ${opts.paidDate}. Thank you!`,
  });
}

export function workOrderStatusSms(opts: {
  to: string;
  name: string;
  title: string;
  status: string;
}) {
  const statusLabel = opts.status.replace(/_/g, ' ').toLowerCase();
  return sendSms({
    to: opts.to,
    body: `PropFlow: Hi ${opts.name}, your maintenance request "${opts.title}" has been updated — status: ${statusLabel}. Log in to your portal for details.`,
  });
}

export function applicationDecisionSms(opts: {
  to: string;
  applicantName: string;
  status: 'APPROVED' | 'DENIED';
  unitNumber: string;
}) {
  const msg =
    opts.status === 'APPROVED'
      ? `Congratulations ${opts.applicantName}! Your application for Unit ${opts.unitNumber} has been approved. Your property manager will contact you shortly.`
      : `Hi ${opts.applicantName}, thank you for applying for Unit ${opts.unitNumber}. After careful review, we are unable to move forward at this time.`;
  return sendSms({ to: opts.to, body: `PropFlow: ${msg}` });
}

export function leaseExpirySms(opts: {
  to: string;
  tenantName: string;
  unitNumber: string;
  daysLeft: number;
}) {
  return sendSms({
    to: opts.to,
    body: `PropFlow: Hi ${opts.tenantName}, your lease for Unit ${opts.unitNumber} expires in ${opts.daysLeft} day${opts.daysLeft === 1 ? '' : 's'}. Please contact your property manager to discuss renewal.`,
  });
}
