import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

// ─── Colour palette ───────────────────────────────────────────────────────────
const INDIGO  = '#4338ca';
const SLATE   = '#475569';
const LIGHT   = '#f1f5f9';
const DARK    = '#1e293b';
const DIVIDER = '#e2e8f0';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LeaseData {
  companyName: string;
  property: {
    name: string;
    address: string;
  };
  unit: {
    unitNumber: string;
    bedrooms?: number | null;
    bathrooms?: number | null;
  };
  lease: {
    id: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    rentAmount: number;       // cents
    depositAmount: number;    // cents
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeType: string;
    lateFeeAmount: number;    // cents or basis points
    petsAllowed: boolean;
    petDeposit?: number | null; // cents
  };
  tenants: Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dollars(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'Month-to-Month';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

export function generateLeasePdf(data: LeaseData): Readable {
  const doc = new PDFDocument({ size: 'LETTER', margin: 60, info: {
    Title: `Lease Agreement – Unit ${data.unit.unitNumber}`,
    Author: data.companyName,
    Subject: 'Residential Lease Agreement',
  }});

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;

  // ── Cover band ────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 110).fill(INDIGO);
  doc.fillColor('white')
     .fontSize(22).font('Helvetica-Bold')
     .text(data.companyName, L, 28, { width: W });
  doc.fontSize(11).font('Helvetica')
     .text('RESIDENTIAL LEASE AGREEMENT', L, 58, { width: W });
  doc.fontSize(9)
     .text(`Lease ID: ${data.lease.id}`, L, 78, { width: W / 2 })
     .text(`Status: ${data.lease.status}`, L + W / 2, 78, { width: W / 2, align: 'right' });

  doc.moveDown(4.5);

  // ── Section helper ────────────────────────────────────────────────────────
  function section(title: string) {
    doc.moveDown(0.8);
    const y = doc.y;
    doc.rect(L, y, W, 22).fill(LIGHT);
    doc.fillColor(INDIGO).fontSize(10).font('Helvetica-Bold')
       .text(title.toUpperCase(), L + 8, y + 6, { width: W - 16 });
    doc.fillColor(DARK).font('Helvetica').fontSize(10);
    doc.moveDown(1.4);
  }

  // ── Key-value row ─────────────────────────────────────────────────────────
  function row(label: string, value: string, last = false) {
    const y = doc.y;
    doc.fillColor(SLATE).fontSize(9.5).font('Helvetica')
       .text(label, L, y, { width: W * 0.4, continued: false });
    doc.fillColor(DARK).fontSize(9.5).font('Helvetica-Bold')
       .text(value, L + W * 0.4, y, { width: W * 0.6 });
    if (!last) {
      doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).lineWidth(0.3).strokeColor(DIVIDER).stroke();
      doc.moveDown(0.55);
    }
  }

  function para(text: string) {
    doc.fillColor(SLATE).fontSize(9.5).font('Helvetica')
       .text(text, L, doc.y, { width: W, lineGap: 3 });
    doc.moveDown(0.5);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. PARTIES
  // ─────────────────────────────────────────────────────────────────────────
  section('1. Parties');

  row('Landlord / Manager', data.companyName);
  const tenantNames = data.tenants.map((t) => `${t.firstName} ${t.lastName}`).join(', ') || 'N/A';
  row('Tenant(s)', tenantNames, true);

  doc.moveDown(0.4);
  data.tenants.forEach((t, i) => {
    doc.fillColor(SLATE).fontSize(8.5)
       .text(`Tenant ${i + 1}: ${t.firstName} ${t.lastName}  ·  ${t.email}${t.phone ? '  ·  ' + t.phone : ''}`,
             L, doc.y, { width: W });
    doc.moveDown(0.3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. PREMISES
  // ─────────────────────────────────────────────────────────────────────────
  section('2. Premises');
  row('Property', data.property.name);
  row('Address', data.property.address);
  row('Unit', `Unit ${data.unit.unitNumber}`);
  if (data.unit.bedrooms != null) {
    row('Configuration',
        `${data.unit.bedrooms} Bed${data.unit.bedrooms !== 1 ? 's' : ''} / ${data.unit.bathrooms ?? '?'} Bath${(data.unit.bathrooms ?? 0) !== 1 ? 's' : ''}`,
        true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. TERM
  // ─────────────────────────────────────────────────────────────────────────
  section('3. Lease Term');
  row('Start Date', fmtDate(data.lease.startDate));
  row('End Date', fmtDate(data.lease.endDate));
  const termType = data.lease.endDate ? 'Fixed Term' : 'Month-to-Month';
  row('Term Type', termType, true);

  if (termType === 'Month-to-Month') {
    doc.moveDown(0.3);
    para('This lease continues on a month-to-month basis until either party provides written notice of at least 30 days prior to the intended termination date.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. RENT & FEES
  // ─────────────────────────────────────────────────────────────────────────
  section('4. Rent & Fees');
  row('Monthly Rent', dollars(data.lease.rentAmount));
  row('Due Date', `${ordinal(data.lease.rentDueDay)} of each month`);
  row('Grace Period', `${data.lease.gracePeriodDays} day${data.lease.gracePeriodDays !== 1 ? 's' : ''}`);

  const lateDesc = data.lease.lateFeeType === 'FLAT'
    ? `${dollars(data.lease.lateFeeAmount)} flat fee`
    : `${(data.lease.lateFeeAmount / 100).toFixed(1)}% of monthly rent`;
  row('Late Fee', lateDesc, true);

  doc.moveDown(0.3);
  para(`Rent is payable in advance, due on the ${ordinal(data.lease.rentDueDay)} day of each calendar month. If rent is not received within ${data.lease.gracePeriodDays} day${data.lease.gracePeriodDays !== 1 ? 's' : ''} of the due date, a late charge of ${lateDesc} will be assessed automatically.`);

  // ─────────────────────────────────────────────────────────────────────────
  // 5. SECURITY DEPOSIT
  // ─────────────────────────────────────────────────────────────────────────
  section('5. Security Deposit');
  row('Deposit Amount', dollars(data.lease.depositAmount));
  if (data.lease.petsAllowed && data.lease.petDeposit) {
    row('Pet Deposit', dollars(data.lease.petDeposit));
  }
  row('Return Timeframe', '30 days after vacancy', true);
  doc.moveDown(0.3);
  para(`The security deposit of ${dollars(data.lease.depositAmount)} shall be held in a separate trust account and returned within 30 days of the end of the tenancy, less any lawful deductions for unpaid rent, damage beyond normal wear and tear, or other costs permitted by applicable law.`);

  // ─────────────────────────────────────────────────────────────────────────
  // 6. PET POLICY
  // ─────────────────────────────────────────────────────────────────────────
  section('6. Pet Policy');
  if (data.lease.petsAllowed) {
    row('Pets', 'Permitted with written approval');
    if (data.lease.petDeposit) row('Pet Deposit', dollars(data.lease.petDeposit), true);
    doc.moveDown(0.3);
    para('Tenant(s) may keep domesticated household pets subject to prior written approval from the Landlord. Tenant(s) assume full liability for any pet-related damage.');
  } else {
    row('Pets', 'Not permitted', true);
    doc.moveDown(0.3);
    para('No pets of any kind are permitted on the premises without the prior written consent of the Landlord. Unauthorized pets constitute a material breach of this lease.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. GENERAL CONDITIONS
  // ─────────────────────────────────────────────────────────────────────────
  section('7. General Conditions');

  const conditions = [
    'Tenant(s) shall keep the premises in a clean and sanitary condition and shall not permit waste or nuisance.',
    'Tenant(s) shall not make any structural alterations without prior written consent from the Landlord.',
    'Tenant(s) shall allow the Landlord reasonable access (minimum 24-hour notice) for inspections and repairs.',
    'Tenant(s) shall comply with all applicable laws, ordinances, and homeowners association rules.',
    'Subletting the premises or assigning this lease requires prior written approval from the Landlord.',
    'Any notice required under this lease must be provided in writing via certified mail or the property management portal.',
    'This lease shall be governed by the laws of the state in which the property is located.',
  ];
  conditions.forEach((c, i) => {
    doc.fillColor(SLATE).fontSize(9.5)
       .text(`${i + 1}.  ${c}`, L, doc.y, { width: W, lineGap: 2 });
    doc.moveDown(0.5);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. SIGNATURES
  // ─────────────────────────────────────────────────────────────────────────
  // Ensure signatures land on same page — add page if close to bottom
  if (doc.y > doc.page.height - 260) doc.addPage();

  section('8. Signatures');
  doc.moveDown(0.3);
  para('By signing below, the parties agree to be bound by the terms and conditions of this lease agreement.');

  const sigY = doc.y + 10;
  const col1 = L;
  const col2 = L + W * 0.52;
  const lineW = W * 0.42;

  // Landlord sig
  doc.moveTo(col1, sigY + 30).lineTo(col1 + lineW, sigY + 30).lineWidth(0.8).strokeColor(SLATE).stroke();
  doc.fillColor(SLATE).fontSize(8.5)
     .text('Landlord / Authorized Agent Signature', col1, sigY + 34, { width: lineW });
  doc.moveTo(col1, sigY + 60).lineTo(col1 + lineW, sigY + 60).lineWidth(0.8).strokeColor(SLATE).stroke();
  doc.text('Printed Name', col1, sigY + 64, { width: lineW });
  doc.moveTo(col1, sigY + 90).lineTo(col1 + lineW, sigY + 90).lineWidth(0.8).strokeColor(SLATE).stroke();
  doc.text('Date', col1, sigY + 94, { width: lineW });

  // Tenant sig(s)
  data.tenants.forEach((t, i) => {
    const tx = i % 2 === 0 ? col1 : col2;
    const ty = sigY + 130 + Math.floor(i / 2) * 110;
    if (doc.y > doc.page.height - 150 && i === 0) doc.addPage();

    doc.moveTo(tx, ty).lineTo(tx + lineW, ty).lineWidth(0.8).strokeColor(SLATE).stroke();
    doc.fillColor(SLATE).fontSize(8.5)
       .text(`Tenant Signature (${t.firstName} ${t.lastName})`, tx, ty + 4, { width: lineW });
    doc.moveTo(tx, ty + 34).lineTo(tx + lineW, ty + 34).lineWidth(0.8).strokeColor(SLATE).stroke();
    doc.text('Printed Name', tx, ty + 38, { width: lineW });
    doc.moveTo(tx, ty + 64).lineTo(tx + lineW, ty + 64).lineWidth(0.8).strokeColor(SLATE).stroke();
    doc.text('Date', tx, ty + 68, { width: lineW });
  });

  // ── Footer on each page ───────────────────────────────────────────────────
  const totalPages = (doc.bufferedPageRange().count + (doc as any)._pageBufferStart) || 1;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const footerY = doc.page.height - 36;
    doc.moveTo(L, footerY - 4).lineTo(R, footerY - 4).lineWidth(0.5).strokeColor(DIVIDER).stroke();
    doc.fillColor(SLATE).fontSize(7.5).font('Helvetica')
       .text(
         `${data.companyName}  ·  ${data.property.name}  ·  Unit ${data.unit.unitNumber}  ·  Lease ID: ${data.lease.id}`,
         L, footerY, { width: W * 0.7, align: 'left' }
       )
       .text(`Page ${i + 1}`, L, footerY, { width: W, align: 'right' });
  }

  doc.end();
  return doc as unknown as Readable;
}
