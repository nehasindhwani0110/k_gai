/**
 * Create Real Estate Tenant Script
 * 
 * This script creates a new tenant for the real estate project
 * and tests schema introspection.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Prisma will use DATABASE_URL from environment
const prisma = new PrismaClient();

async function createRealEstateTenant() {
  console.log('🏢 Creating Real Estate Tenant...\n');

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash('neha', 10);

    // Create connection string for Railway MySQL
    // Format: mysql://user:password@host:port/database
    const connectionString = 'mysql://root:gAcLdzlQwbbziiCoQhddgALsiQnwzBcn@switchback.proxy.rlwy.net:13455/railway';

    // Create or update real estate tenant
    const realEstate = await prisma.school.upsert({
      where: { email: 'realestate@gmail.com' },
      update: {
        // Update connection string if changed
        connectionString,
        name: 'Real Estate Project',
        isActive: true,
      },
      create: {
        email: 'realestate@gmail.com',
        password: hashedPassword,
        name: 'Real Estate Project',
        connectionString,
        isActive: true,
      },
    });

    console.log('✅ Real Estate Tenant Created:');
    console.log(`   Email: ${realEstate.email}`);
    console.log(`   Password: neha`);
    console.log(`   Name: ${realEstate.name}`);
    console.log(`   ID: ${realEstate.id}`);
    console.log(`   Connection: Railway MySQL`);
    console.log(`   Host: switchback.proxy.rlwy.net:13455`);
    console.log(`   Database: railway\n`);

    // Test connection and schema introspection
    console.log('🔍 Testing Schema Introspection...\n');
    
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    
    try {
      const response = await fetch(`${pythonBackendUrl}/introspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connection_string: connectionString,
        }),
      });

      if (response.ok) {
        const metadata = await response.json();
        console.log('✅ Schema Introspection Successful!');
        console.log(`   Tables found: ${metadata.tables?.length || 0}`);
        
        if (metadata.tables && metadata.tables.length > 0) {
          console.log('\n   Tables:');
          metadata.tables.forEach((table: any, index: number) => {
            console.log(`   ${index + 1}. ${table.name} (${table.columns?.length || 0} columns)`);
          });
        }
      } else {
        const error = await response.text();
        console.log('⚠️  Schema introspection failed (Python backend may not be running)');
        console.log(`   Error: ${error.substring(0, 200)}`);
        console.log(`   This is OK - schema will be detected on first login`);
      }
    } catch (error) {
      console.log('⚠️  Could not connect to Python backend');
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`   Make sure Python backend is running: npm run python:backend`);
      console.log(`   Schema will be auto-detected on first login`);
    }

    console.log('\n✨ Setup Complete!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Login with: realestate@gmail.com / neha');
    console.log('   2. System will auto-detect schema on first analytics access');
    console.log('   3. Start asking questions about your real estate data!');

  } catch (error) {
    console.error('❌ Error creating tenant:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createRealEstateTenant()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

