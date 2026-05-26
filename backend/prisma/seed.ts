import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { registerManager } from '../src/api/v1/auth/auth.service';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create manager + company (registers through service to get chart of accounts)
  const managerTokens = await registerManager({
    email: 'manager@example.com',
    password: 'password123',
    firstName: 'Alice',
    lastName: 'Manager',
    companyName: 'Acme Property Management',
    companyEmail: 'info@acme-pm.com',
    companyPhone: '555-0100',
  });

  const company = await prisma.managementCompany.findFirst({
    where: { email: 'info@acme-pm.com' },
  });
  if (!company) throw new Error('Company not created');

  console.log('✅ Created management company:', company.name);

  // Create an owner user
  const ownerPasswordHash = await bcrypt.hash('password123', 12);
  const ownerUser = await prisma.user.create({
    data: {
      email: 'owner@example.com',
      passwordHash: ownerPasswordHash,
      role: UserRole.OWNER,
      firstName: 'Bob',
      lastName: 'Owner',
      managementCompanyId: company.id,
    },
  });

  const owner = await prisma.owner.create({
    data: {
      managementCompanyId: company.id,
      userId: ownerUser.id,
    },
  });
  console.log('✅ Created owner:', ownerUser.email);

  // Create a property
  const property = await prisma.property.create({
    data: {
      managementCompanyId: company.id,
      ownerId: owner.id,
      name: 'Maple Street Apartments',
      type: 'RESIDENTIAL',
      address: '123 Maple Street',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      description: 'A lovely 4-unit residential building',
    },
  });
  console.log('✅ Created property:', property.name);

  // Create units
  const units = await Promise.all([
    prisma.unit.create({
      data: {
        propertyId: property.id,
        unitNumber: '1A',
        beds: 2,
        baths: 1,
        sqft: 850,
        rentAmount: 150000, // $1,500.00
        vacantSince: new Date(),
      },
    }),
    prisma.unit.create({
      data: {
        propertyId: property.id,
        unitNumber: '1B',
        beds: 1,
        baths: 1,
        sqft: 650,
        rentAmount: 120000, // $1,200.00
        vacantSince: new Date(Date.now() - 30 * 86_400_000), // 30 days ago
      },
    }),
    prisma.unit.create({
      data: {
        propertyId: property.id,
        unitNumber: '2A',
        beds: 3,
        baths: 2,
        sqft: 1100,
        rentAmount: 200000, // $2,000.00
      },
    }),
  ]);
  console.log(`✅ Created ${units.length} units`);

  // Create tenant user + lease for unit 2A
  const tenantPasswordHash = await bcrypt.hash('password123', 12);
  const tenantUser = await prisma.user.create({
    data: {
      email: 'tenant@example.com',
      passwordHash: tenantPasswordHash,
      role: UserRole.TENANT,
      firstName: 'Carol',
      lastName: 'Tenant',
      managementCompanyId: company.id,
    },
  });

  const tenant = await prisma.tenant.create({
    data: {
      managementCompanyId: company.id,
      userId: tenantUser.id,
      firstName: 'Carol',
      lastName: 'Tenant',
      email: 'tenant@example.com',
      phone: '555-0200',
    },
  });

  const lease = await prisma.lease.create({
    data: {
      unitId: units[2].id, // 2A
      status: 'ACTIVE',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      rentAmount: 200000,
      depositAmount: 200000,
      rentDueDay: 1,
      gracePeriodDays: 5,
      lateFeeType: 'FLAT',
      lateFeeAmount: 10000, // $100
      depositPaid: true,
      depositPaidDate: new Date('2024-01-01'),
      tenants: { connect: { id: tenant.id } },
    },
  });

  // Update tenant to reference lease, update unit to occupied
  await prisma.tenant.update({ where: { id: tenant.id }, data: { leaseId: lease.id } });
  await prisma.unit.update({ where: { id: units[2].id }, data: { status: 'OCCUPIED' } });
  console.log('✅ Created tenant + active lease');

  // Create a vendor
  const vendorPasswordHash = await bcrypt.hash('password123', 12);
  const vendorUser = await prisma.user.create({
    data: {
      email: 'vendor@example.com',
      passwordHash: vendorPasswordHash,
      role: UserRole.VENDOR,
      firstName: 'Dave',
      lastName: 'Plumber',
      managementCompanyId: company.id,
    },
  });

  await prisma.vendor.create({
    data: {
      managementCompanyId: company.id,
      userId: vendorUser.id,
      companyName: "Dave's Plumbing",
      contactName: 'Dave Plumber',
      email: 'vendor@example.com',
      phone: '555-0300',
      specialty: 'Plumbing',
    },
  });
  console.log('✅ Created vendor');

  console.log('\n🎉 Seed complete! Login credentials:');
  console.log('  Manager: manager@example.com / password123');
  console.log('  Owner:   owner@example.com   / password123');
  console.log('  Tenant:  tenant@example.com  / password123');
  console.log('  Vendor:  vendor@example.com  / password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
