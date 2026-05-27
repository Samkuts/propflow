/**
 * Checkr background check client.
 * Uses HTTP Basic auth (API key as username, empty password).
 * Silently no-ops when CHECKR_API_KEY is not set.
 *
 * Mirrors the lazy-init pattern from stripe.ts / sms.ts.
 */

import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

const CHECKR_BASE = 'https://api.checkr.com/v1';

export function checkrConfigured(): boolean {
  return !!process.env.CHECKR_API_KEY;
}

function getClient() {
  const key = process.env.CHECKR_API_KEY;
  if (!key) throw new Error('CHECKR_NOT_CONFIGURED');

  return axios.create({
    baseURL: CHECKR_BASE,
    auth: { username: key, password: '' }, // Basic auth — key as user, empty password
    headers: { 'Content-Type': 'application/json' },
    timeout: 15_000,
  });
}

// ─── API calls ────────────────────────────────────────────────────────────────

export interface CheckrCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface CheckrInvitation {
  id: string;
  invitation_url: string;
}

/**
 * Creates a Checkr Candidate record for the applicant.
 * Returns the candidate id used to reference them in reports.
 */
export async function createCandidate(opts: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}): Promise<CheckrCandidate> {
  const client = getClient();
  const { data } = await client.post<CheckrCandidate>('/candidates', {
    first_name: opts.firstName,
    last_name: opts.lastName,
    email: opts.email,
    ...(opts.phone ? { phone: opts.phone } : {}),
  });
  return data;
}

/**
 * Creates an invitation for the candidate to complete their screening.
 * Returns the invitation URL to share with the applicant (or open directly).
 */
export async function createInvitation(opts: {
  candidateId: string;
  package?: string; // e.g. 'checkr_basic'
}): Promise<CheckrInvitation> {
  const client = getClient();
  const { data } = await client.post<CheckrInvitation>('/invitations', {
    candidate_id: opts.candidateId,
    package: opts.package ?? process.env.CHECKR_PACKAGE ?? 'checkr_basic',
  });
  return data;
}

// ─── Webhook verification ─────────────────────────────────────────────────────

/**
 * Verifies a Checkr webhook signature using HMAC-SHA256.
 * @param rawBody   The raw request body buffer (before JSON parsing)
 * @param signature The value of the X-Checkr-Signature header
 */
export function verifyCheckrSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.CHECKR_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
