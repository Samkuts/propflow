import Stripe from 'stripe';

// Stripe client – initialised lazily so the server starts even if keys aren't set.
let _stripe: InstanceType<typeof Stripe> | null = null;

export function getStripe(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/**
 * True iff a real-looking Stripe secret is set.
 * Rejects empty values and the well-known `.env.example` placeholders
 * (`sk_test_...`, `sk_live_...`) so endpoints can fall back gracefully
 * in dev without first making a doomed call to Stripe.
 */
export function stripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return false;
  if (key.endsWith('...')) return false; // placeholder
  // Real Stripe secrets have at least 30 chars after the sk_test_ / sk_live_ prefix
  if (/^sk_(test|live)_/.test(key) && key.length < 40) return false;
  return true;
}
