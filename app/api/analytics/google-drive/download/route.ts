import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Extract file ID from Google Drive URL
 */
function extractFileId(url: string): string | null {
  // Handle different Google Drive URL formats
  // Format 1: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // Format 2: https://drive.google.com/open?id=FILE_ID
  // Format 3: https://docs.google.com/spreadsheets/d/FILE_ID/edit
  
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Download file from Google Drive
 */
async function downloadFromGoogleDrive(fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  // Use Google Drive direct download URL
  // Format: https://drive.google.com/uc?export=download&id=FILE_ID
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  
  try {
    const response = await fetch(downloadUrl, {
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    // Get filename from Content-Disposition header or use file ID
    const contentDisposition = response.headers.get('content-disposition');
    let fileName = fileId;
    if (contentDisposition) {
      const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      if (fileNameMatch) {
        fileName = fileNameMatch[1];
      }
    }

    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, fileName, mimeType };
  } catch (error) {
    throw new Error(`Failed to download from Google Drive: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Detect file type from extension or MIME type
 */
function detectFileType(fileName: string, mimeType: string): 'CSV' | 'JSON' | 'EXCEL' | 'TXT' {
  const ext = path.extname(fileName).toLowerCase();
  
  if (ext === '.csv' || mimeType.includes('csv')) return 'CSV';
  if (ext === '.json' || mimeType.includes('json')) return 'JSON';
  if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'EXCEL';
  if (ext === '.txt' || mimeType.includes('text/plain')) return 'TXT';
  
  // Default to CSV if unknown
  return 'CSV';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'Google Drive URL is required' },
        { status: 400 }
      );
    }

    // Extract file ID from URL
    const fileId = extractFileId(url);
    if (!fileId) {
      return NextResponse.json(
        { error: 'Invalid Google Drive URL. Please provide a valid shareable link.' },
        { status: 400 }
      );
    }

    // Download file from Google Drive
    const { buffer, fileName, mimeType } = await downloadFromGoogleDrive(fileId);

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const savedFileName = `${timestamp}_${sanitizedFileName}`;
    const filePath = join(uploadsDir, savedFileName);

    // Save file
    await writeFile(filePath, buffer);

    // Detect file type
    const fileType = detectFileType(fileName, mimeType);
    
    // Map file type to source type
    const sourceTypeMap: { [key: string]: string } = {
      'CSV': 'CSV_FILE',
      'JSON': 'JSON_FILE',
      'EXCEL': 'EXCEL_FILE',
      'TXT': 'TXT_FILE',
    };
    const sourceType = sourceTypeMap[fileType] || 'CSV_FILE';

    return NextResponse.json({
      success: true,
      file_path: filePath,
      file_name: fileName,
      file_size: buffer.length,
      file_type: fileType,
      source_type: sourceType,
    });
  } catch (error) {
    console.error('Google Drive download error:', error);
    return NextResponse.json(
      {
        error: 'Failed to download file from Google Drive',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

