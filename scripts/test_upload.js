require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function testUpload() {
    console.log('🧪 Testing File Upload to Supabase Storage...\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('❌ Error: Missing Supabase environment variables');
        console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
        process.exit(1);
    }

    // Use anon key (public key) to test RLS policies
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        // Create a test file
        const testContent = `Test file uploaded at ${new Date().toISOString()}\nThis is a test file to verify upload functionality.`;
        const testFileName = `test-${Date.now()}.txt`;
        const testFilePath = path.join(__dirname, testFileName);
        fs.writeFileSync(testFilePath, testContent);

        console.log('📝 Created test file:', testFileName);

        // Test upload
        const storagePath = `uploads/test-session/${testFileName}`;
        console.log(`📤 Uploading to: ${storagePath}...`);

        const fileBuffer = fs.readFileSync(testFilePath);
        const fileBlob = new Blob([fileBuffer], { type: 'text/plain' });

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('uploads')
            .upload(storagePath, fileBlob, {
                contentType: 'text/plain',
                upsert: false
            });

        if (uploadError) {
            console.error('❌ Upload failed:', uploadError.message);
            console.error('   Error details:', uploadError);
            
            if (uploadError.message.includes('row-level security')) {
                console.error('\n⚠️  RLS Policy Error detected!');
                console.error('   Run: node scripts/verify_policies.js');
                console.error('   Then: node scripts/apply_fix.js');
            }
            
            process.exit(1);
        }

        console.log('✅ File uploaded successfully!');
        console.log('   Path:', uploadData.path);

        // Test retrieval
        console.log('\n📥 Testing file retrieval...');
        const { data: downloadData, error: downloadError } = await supabase.storage
            .from('uploads')
            .download(storagePath);

        if (downloadError) {
            console.error('❌ Download failed:', downloadError.message);
            process.exit(1);
        }

        console.log('✅ File retrieved successfully!');
        console.log('   Size:', downloadData.size, 'bytes');

        // Cleanup test file
        fs.unlinkSync(testFilePath);
        console.log('\n🧹 Cleaned up local test file');

        // Optionally cleanup uploaded file
        console.log('\n🗑️  Cleaning up uploaded test file...');
        const { error: deleteError } = await supabase.storage
            .from('uploads')
            .remove([storagePath]);

        if (deleteError) {
            console.warn('⚠️  Could not delete test file:', deleteError.message);
            console.warn('   You may need to delete it manually from Supabase Storage');
        } else {
            console.log('✅ Test file deleted from storage');
        }

        console.log('\n✅ All upload tests passed!');
        console.log('✅ RLS policies are working correctly.\n');

    } catch (err) {
        console.error('❌ Test failed:', err.message);
        console.error(err);
        process.exit(1);
    }
}

testUpload();

