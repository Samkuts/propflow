import { prisma } from '../../../lib/prisma';
import { getStripe } from '../../../lib/stripe';
import { recordPayment } from '../accounting/accounting.service';
import { paymentReceivedSms } from '../../../lib/sms';
import { paymentReceivedEmail } from '../../../lib/email';

// ─── Setup Intent (save a card) ───────────────────────────────────────────────

/**
 * Creates (or retrieves) a Stripe Customer for the tenant, then creates a
 * SetupIntent so the frontend can collect and save a card.
 */
export async function createSetupIntent(userId: string, managementCompanyId: string) {
  const stripe = getStripe();

  const tenant = await prisma.tenant.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  // Create Stripe customer on first use
  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant.user?.email ?? tenant.email,
      name: `${tenant.firstName} ${tenant.lastName}`,
      metadata: { tenantId: tenant.id, managementCompanyId },
    });
    customerId = customer.id;
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  });

  return { clientSecret: setupIntent.client_secret!, customerId };
}

// ─── Saved Payment Method ─────────────────────────────────────────────────────

/**
 * Returns the tenant's default saved card details (last4, brand) or null.
 */
export async function getSavedPaymentMethod(userId: string, managementCompanyId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
  });
  if (!tenant?.stripeCustomerId) return null;

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(tenant.stripeCustomerId);
  if ('deleted' in customer && customer.deleted) return null;

  // Get the default payment method or the first card attached
  const paymentMethods = await stripe.paymentMethods.list({
    customer: tenant.stripeCustomerId,
    type: 'card',
    limit: 1,
  });

  if (!paymentMethods.data.length) return null;

  const pm = paymentMethods.data[0];
  return {
    id: pm.id,
    brand: pm.card?.brand ?? 'card',
    last4: pm.card?.last4 ?? '****',
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
  };
}

// ─── Create Payment Intent ────────────────────────────────────────────────────

/**
 * Creates a PaymentIntent for the tenant's outstanding balance using their
 * saved payment method.  Returns the client_secret for the frontend to confirm.
 */
export async function createPayIntent(
  userId: string,
  managementCompanyId: string,
  amountCents: number,
  leaseId: string,
) {
  if (amountCents <= 0) throw new Error('INVALID_AMOUNT');

  const tenant = await prisma.tenant.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
  });
  if (!tenant?.stripeCustomerId) throw new Error('NO_PAYMENT_METHOD');

  const stripe = getStripe();

  // Get the first saved card
  const pms = await stripe.paymentMethods.list({
    customer: tenant.stripeCustomerId,
    type: 'card',
    limit: 1,
  });
  if (!pms.data.length) throw new Error('NO_PAYMENT_METHOD');

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    customer: tenant.stripeCustomerId,
    payment_method: pms.data[0].id,
    confirm: false, // frontend confirms with card element for 3DS support
    metadata: { leaseId, tenantId: tenant.id, managementCompanyId },
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  });

  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
}

// ─── Confirm & Record ─────────────────────────────────────────────────────────

/**
 * Called after the frontend confirms the PaymentIntent.
 * Verifies the intent succeeded on Stripe, then records the payment in the ledger.
 */
export async function confirmAndRecord(
  userId: string,
  managementCompanyId: string,
  paymentIntentId: string,
  leaseId: string,
) {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (intent.status !== 'succeeded') {
    throw new Error(`PAYMENT_NOT_SUCCEEDED:${intent.status}`);
  }

  // Idempotency: don't double-record if already saved
  const existing = await prisma.payment.findFirst({
    where: { referenceNumber: paymentIntentId, leaseId },
  });
  if (existing) return { payment: existing, appliedTo: [] };

  const result = await recordPayment(managementCompanyId, {
    leaseId,
    amount: intent.amount,
    method: 'CREDIT_CARD',
    referenceNumber: paymentIntentId,
    memo: 'Online payment via Stripe',
  });

  // Fire-and-forget SMS to tenant
  prisma.tenant.findFirst({ where: { leaseId, deletedAt: null } })
    .then((tenant) => {
      if (!tenant?.phone) return;
      const paidDate = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      paymentReceivedSms({
        to: tenant.phone,
        tenantName: tenant.firstName,
        amountCents: intent.amount,
        paidDate,
      }).catch(() => {});
    })
    .catch(() => {});

  return result;
}

// ─── Autopay Toggle ───────────────────────────────────────────────────────────

/**
 * Enables or disables autopay for the authenticated tenant.
 * Cannot enable if no Stripe customer / saved card exists.
 */
export async function toggleAutopay(
  userId: string,
  managementCompanyId: string,
  enabled: boolean,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  if (enabled && !tenant.stripeCustomerId) {
    throw new Error('NO_PAYMENT_METHOD');
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { autopayEnabled: enabled },
    select: { id: true, autopayEnabled: true },
  });

  return updated;
}

/**
 * Returns the current autopay status for the authenticated tenant.
 */
export async function getAutopayStatus(userId: string, managementCompanyId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { userId, managementCompanyId, deletedAt: null },
    select: { autopayEnabled: true, stripeCustomerId: true },
  });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');
  return { autopayEnabled: tenant.autopayEnabled, hasCard: !!tenant.stripeCustomerId };
}

// ─── Run Autopay for a single tenant ─────────────────────────────────────────

/**
 * Charges a tenant's saved Stripe card for their outstanding balance.
 * Uses `off_session: true` + `confirm: true` for server-side charging.
 * Called by the autopay cron job — never throws (logs errors and returns).
 */
export async function runAutopayForTenant(
  tenantId: string,
  leaseId: string,
  managementCompanyId: string,
): Promise<{ success: boolean; amountCents?: number; error?: string }> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        firstName: true,
        phone: true,
        stripeCustomerId: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!tenant?.stripeCustomerId) {
      return { success: false, error: 'No Stripe customer' };
    }

    // Sum all outstanding charge balances
    const charges = await prisma.rentCharge.findMany({
      where: {
        leaseId,
        status: { in: ['OUTSTANDING', 'PARTIAL'] },
        deletedAt: null,
      },
    });

    const totalOwed = charges.reduce((sum, c) => sum + c.balance, 0);
    if (totalOwed <= 0) {
      return { success: true, amountCents: 0 }; // nothing to charge
    }

    const stripe = getStripe();

    // Get first saved card
    const pms = await stripe.paymentMethods.list({
      customer: tenant.stripeCustomerId,
      type: 'card',
      limit: 1,
    });
    if (!pms.data.length) {
      return { success: false, error: 'No saved payment method' };
    }

    // Charge the card server-side (off_session = no cardholder present)
    const intent = await stripe.paymentIntents.create({
      amount: totalOwed,
      currency: 'usd',
      customer: tenant.stripeCustomerId,
      payment_method: pms.data[0].id,
      confirm: true,
      off_session: true,
      metadata: { leaseId, tenantId, managementCompanyId, source: 'autopay' },
    });

    if (intent.status !== 'succeeded') {
      return { success: false, error: `Intent status: ${intent.status}` };
    }

    // Record in ledger
    await recordPayment(managementCompanyId, {
      leaseId,
      amount: totalOwed,
      method: 'CREDIT_CARD',
      referenceNumber: intent.id,
      memo: 'Autopay via Stripe',
    });

    // Fire-and-forget notifications
    const paidDate = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    if (tenant.phone) {
      paymentReceivedSms({
        to: tenant.phone,
        tenantName: tenant.firstName,
        amountCents: totalOwed,
        paidDate,
      }).catch(() => {});
    }
    if (tenant.user?.email) {
      paymentReceivedEmail({
        to: tenant.user.email,
        tenantName: `${tenant.user.firstName} ${tenant.user.lastName}`,
        amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalOwed / 100),
        paidDate,
        referenceNumber: intent.id,
      }).catch(() => {});
    }

    return { success: true, amountCents: totalOwed };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
