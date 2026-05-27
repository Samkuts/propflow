/**
 * Creates a lightweight Prisma client mock.
 * Each model gets vi.fn() stubs for findFirst, findMany, findUnique,
 * create, update, delete, count, and $transaction.
 */
import { vi } from 'vitest';

type ModelStub = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

function modelStub(): ModelStub {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  };
}

export function createPrismaMock() {
  const mock = {
    lease: modelStub(),
    unit: modelStub(),
    property: modelStub(),
    tenant: modelStub(),
    user: modelStub(),
    payment: modelStub(),
    paymentApplication: modelStub(),
    rentCharge: modelStub(),
    account: modelStub(),
    journalEntry: modelStub(),
    workOrder: modelStub(),
    rentalApplication: modelStub(),
    document: modelStub(),
    message: modelStub(),
    managementCompany: modelStub(),
    // $transaction: runs callback with the mock itself as the tx argument
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(mock)),
  };
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
