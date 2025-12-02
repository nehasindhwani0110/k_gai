import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Hash password for "neha"
  const hashedPassword = await bcrypt.hash('neha', 10);

  // Create School A
  const schoolA = await prisma.school.upsert({
    where: { email: 'schoola@gmail.com' },
    update: {},
    create: {
      email: 'schoola@gmail.com',
      password: hashedPassword,
      name: 'School A',
      connectionString: 'mysql://root:neha@2004@localhost:3306/gai',
      isActive: true,
    },
  });

  console.log('✅ Created School A:', schoolA.email);

  // Create School B (for testing different schemas later)
  const schoolB = await prisma.school.upsert({
    where: { email: 'schoolb@gmail.com' },
    update: {},
    create: {
      email: 'schoolb@gmail.com',
      password: hashedPassword,
      name: 'School B',
      connectionString: 'mysql://root:neha@2004@localhost:3306/gai', // Same DB for now, can change later
      isActive: true,
    },
  });

  console.log('✅ Created School B:', schoolB.email);

  // Create Real Estate Tenant
  const realEstate = await prisma.school.upsert({
    where: { email: 'realestate@gmail.com' },
    update: {},
    create: {
      email: 'realestate@gmail.com',
      password: hashedPassword,
      name: 'Real Estate Project',
      // Railway MySQL connection string (password URL encoded)
      connectionString: 'mysql://root:gAcLdzlQwbbziiCoQhddgALsiQnwzBcn@switchback.proxy.rlwy.net:13455/railway',
      isActive: true,
    },
  });

  console.log('✅ Created Real Estate Tenant:', realEstate.email);
  console.log('   Connection: Railway MySQL Database');
  console.log('   Schema will be auto-detected on first login');

  console.log('✨ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

