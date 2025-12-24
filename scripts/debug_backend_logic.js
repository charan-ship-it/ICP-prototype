const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { createWorker } = require('tesseract.js');

try {
    const pdf = require('pdf-parse');
    console.log('pdf-parse loaded successfully');
} catch (e) {
    console.error('Failed to load pdf-parse:', e);
}

async function testExtraction() {
    console.log('Testing text extraction logic...');

    // 1. Text File
    try {
        const textBuffer = Buffer.from('Hello World', 'utf-8');
        const text = textBuffer.toString('utf-8');
        console.log('Text extraction: OK', text);
    } catch (e) {
        console.error('Text extraction failed:', e);
    }

    // 2. PDF (Mock buffer)
    // We need a valid PDF buffer to typically test this, or it will throw "Invalid PDF"
    // Skipping actual PDF parsing unless we have a file, but verify import worked.

    console.log('Done.');
}

testExtraction();
