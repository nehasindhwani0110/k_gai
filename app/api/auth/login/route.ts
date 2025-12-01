import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';
import { registerDataSource } from '@/analytics-engine/services/canonical-mapping-service';

/**
 * School Login API
 * Validates credentials and automatically detects schema
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find school by email
    const school = await prisma.school.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!school) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, school.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if school is active
    if (!school.isActive) {
      return NextResponse.json(
        { error: 'School account is inactive' },
        { status: 403 }
      );
    }

    // Check if DataSource already exists for this school
    let dataSourceId = school.dataSourceId;

    if (!dataSourceId) {
      // Auto-detect schema and create DataSource
      console.log(`[LOGIN] Auto-detecting schema for school: ${school.name}`);
      
      try {
        // Register data source with auto schema detection
        dataSourceId = await registerDataSource({
          name: school.name,
          sourceType: 'SQL_DB',
          connectionString: school.connectionString,
          description: `Auto-registered for ${school.name}`,
        });

        // Update school with dataSourceId
        await prisma.school.update({
          where: { id: school.id },
          data: { dataSourceId },
        });

        // Auto-register schema (introspect and map)
        console.log(`[LOGIN] DataSource created: ${dataSourceId}`);
        console.log(`[LOGIN] Schema will be auto-detected when school accesses analytics`);
        
        // Note: Schema introspection will happen automatically when:
        // 1. School accesses /analytics page
        // 2. Frontend calls GET /api/analytics/data-sources/[id]/schema
        // 3. If no mappings exist, system will introspect and create them

      } catch (error) {
        console.error('[LOGIN] Schema detection error:', error);
        // Don't fail login if schema detection fails - school can still login
        // Schema can be detected later when they access analytics
      }
    }

    // Return school info (without password)
    return NextResponse.json({
      success: true,
      school: {
        id: school.id,
        email: school.email,
        name: school.name,
      },
      dataSourceId,
      message: 'Login successful',
    });

  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      {
        error: 'Login failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

