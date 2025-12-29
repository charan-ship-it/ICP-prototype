import { NextRequest, NextResponse } from 'next/server';

/**
 * Extract text from PDF file
 * This endpoint receives a PDF file and extracts its text content
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use pdf-parse to extract text from PDF
    try {
      // Dynamic import for pdf-parse (works better with Next.js)
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      
      // Extract text content
      const extractedText = data.text || '';
      
      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json(
          { 
            error: 'PDF appears to be empty or contains no extractable text',
            message: 'The PDF file does not contain any readable text content.'
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json({
        text: extractedText,
        pages: data.numpages,
        info: data.info,
      });
    } catch (error: any) {
      // If pdf-parse is not installed, provide helpful error
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('pdf-parse')) {
        return NextResponse.json(
          { 
            error: 'PDF parsing library not installed',
            message: 'Please install pdf-parse: npm install pdf-parse',
            fallback: 'PDF text extraction requires pdf-parse library. Please run: npm install pdf-parse'
          },
          { status: 500 }
        );
      }
      
      // Handle other PDF parsing errors
      console.error('PDF parsing error:', error);
      return NextResponse.json(
        { 
          error: 'Failed to parse PDF',
          message: error.message || 'Unknown error occurred while parsing PDF'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error extracting PDF text:', error);
    return NextResponse.json(
      { 
        error: 'Failed to extract PDF text',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

