/**
 * Email helper using SendGrid.
 * Silently no-ops when SENDGRID_API_KEY is not set (local dev without credentials).
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let _sgConfigured: boolean | null = null;

function sgConfigured(): boolean {
  if (_sgConfigured === null) {
    _sgConfigured = !!process.env.SENDGRID_API_KEY;
  }
  return _sgConfigured;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (!sgConfigured()) return; // silent no-op in local dev

  const sgMail = await import('@sendgrid/mail');
  sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);

  await sgMail.default.send({
    to: opts.to,
    from: {
      email: process.env.EMAIL_FROM ?? 'noreply@propflow.app',
      name: 'PropFlow',
    },
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
  });
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function layout(body: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
      <div style="background:#4f46e5;border-radius:12px;padding:16px 24px;margin-bottom:24px">
        <span style="color:#fff;font-weight:700;font-size:18px">PropFlow</span>
      </div>
      ${body}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"/>
      <p style="font-size:12px;color:#9ca3af">
        You received this email because you have an account with PropFlow.
      </p>
    </div>`;
}

export function leaseActivatedEmail(opts: {
  to: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  startDate: string;
  rentAmount: string; // pre-formatted, e.g. "$1,200.00"
}) {
  return sendEmail({
    to: opts.to,
    subject: `Your lease for Unit ${opts.unitNumber} is now active`,
    html: layout(`
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Welcome, ${opts.tenantName}!</h2>
      <p style="color:#4b5563;margin-bottom:16px">
        Your lease has been activated. Here are your details:
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Property</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.propertyName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Unit</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.unitNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Lease Start</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.startDate}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Monthly Rent</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.rentAmount}</td></tr>
      </table>
      <p style="color:#4b5563;font-size:14px">
        Log in to your tenant portal to view your lease documents and make payments.
      </p>`),
  });
}

export function paymentReceivedEmail(opts: {
  to: string;
  tenantName: string;
  amount: string;
  paidDate: string;
  referenceNumber?: string;
}) {
  return sendEmail({
    to: opts.to,
    subject: `Payment of ${opts.amount} received`,
    html: layout(`
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Payment Received</h2>
      <p style="color:#4b5563;margin-bottom:16px">Hi ${opts.tenantName}, we received your payment.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Amount</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px;color:#16a34a">${opts.amount}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Date</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.paidDate}</td></tr>
        ${opts.referenceNumber ? `
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Reference</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px;font-family:monospace">${opts.referenceNumber}</td></tr>` : ''}
      </table>`),
  });
}

export function workOrderStatusEmail(opts: {
  to: string;
  name: string;
  title: string;
  status: string;
  unitNumber: string;
}) {
  return sendEmail({
    to: opts.to,
    subject: `Work order "${opts.title}" — ${opts.status.replace(/_/g, ' ')}`,
    html: layout(`
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Work Order Update</h2>
      <p style="color:#4b5563;margin-bottom:16px">Hi ${opts.name}, your work order has been updated.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Title</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.title}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Unit</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.unitNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">New Status</td>
            <td style="padding:8px 0;font-weight:600;font-size:14px">${opts.status.replace(/_/g, ' ')}</td></tr>
      </table>`),
  });
}

export function tenantInviteEmail(opts: {
  to: string;
  tenantName: string;
  email: string;
  tempPassword: string;
}) {
  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL}/tenant/login`
    : 'https://propflow.app/tenant/login';

  return sendEmail({
    to: opts.to,
    subject: 'Welcome to PropFlow — your tenant portal is ready',
    html: layout(`
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Welcome, ${opts.tenantName}!</h2>
      <p style="color:#4b5563;margin-bottom:16px">
        Your property manager has created a tenant account for you on PropFlow.
        Use the credentials below to log in to your portal.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:14px;width:40%">Email</td>
            <td style="padding:6px 0;font-weight:600;font-size:14px;font-family:monospace">${opts.email}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:14px">Temp Password</td>
            <td style="padding:6px 0;font-weight:600;font-size:14px;font-family:monospace">${opts.tempPassword}</td>
          </tr>
        </table>
      </div>
      <p style="margin-bottom:24px">
        <a href="${loginUrl}" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
          Sign In to Your Portal →
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">
        Please change your password after your first login. If you have questions, reply to this email or contact your property manager.
      </p>`),
  });
}

export function applicationDecisionEmail(opts: {
  to: string;
  applicantName: string;
  status: 'APPROVED' | 'DENIED';
  propertyName: string;
  unitNumber: string;
}) {
  const approved = opts.status === 'APPROVED';
  return sendEmail({
    to: opts.to,
    subject: `Your application for Unit ${opts.unitNumber} has been ${approved ? 'approved' : 'reviewed'}`,
    html: layout(`
      <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">
        Application ${approved ? 'Approved! 🎉' : 'Update'}
      </h2>
      <p style="color:#4b5563;margin-bottom:16px">Hi ${opts.applicantName},</p>
      ${approved
        ? `<p style="color:#16a34a;font-weight:600;margin-bottom:16px">
             Congratulations! Your application for Unit ${opts.unitNumber} at ${opts.propertyName} has been approved.
             The property manager will be in touch shortly with next steps.
           </p>`
        : `<p style="color:#4b5563;margin-bottom:16px">
             Thank you for applying for Unit ${opts.unitNumber} at ${opts.propertyName}.
             After careful consideration, we are unable to move forward with your application at this time.
           </p>`}
    `),
  });
}
