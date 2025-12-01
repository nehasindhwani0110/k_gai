import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { saveFileMetadata } from '@/analytics-engine/services/query-history-service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type - support CSV, JSON, Excel, and Text files
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['csv', 'json', 'xlsx', 'xls', 'txt'];
    
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Only CSV, JSON, Excel (.xlsx, .xls), and Text (.txt) files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const filePath = join(uploadsDir, fileName);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Determine file type
    const fileTypeMap: { [key: string]: 'CSV' | 'JSON' | 'EXCEL' | 'TXT' } = {
      'csv': 'CSV',
      'json': 'JSON',
      'xlsx': 'EXCEL',
      'xls': 'EXCEL',
      'txt': 'TXT',
    };
    const detectedFileType = fileTypeMap[fileExtension] || 'CSV';

    // Save file metadata to database (non-blocking)
    try {
      await saveFileMetadata({
        fileName: file.name,
        filePath: filePath,
        fileType: detectedFileType,
        fileSize: file.size,
        tableName: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        metadata: {
          source_type: 'CSV_FILE',
          file_type: detectedFileType,
        },
      });
    } catch (error) {
      // Don't fail the upload if metadata saving fails
      console.error('Failed to save file metadata:', error);
    }

    // Return file path (relative to project root for easier access)
    return NextResponse.json({
      success: true,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      file_type: detectedFileType,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

