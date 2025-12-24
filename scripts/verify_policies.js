require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function verifyPolicies() {
    console.log('🔍 Verifying RLS Policies for Supabase Storage...\n');
    
    if (!process.env.POSTGRES_URL) {
        console.error('❌ Error: POSTGRES_URL not found in environment.');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Check for INSERT policy
        const insertPolicyQuery = `
            SELECT policyname, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'storage'
            AND tablename = 'objects'
            AND policyname = 'Allow public uploads to uploads bucket'
        `;

        const insertResult = await client.query(insertPolicyQuery);
        
        if (insertResult.rows.length === 0) {
            console.error('❌ INSERT policy "Allow public uploads to uploads bucket" NOT FOUND');
            process.exit(1);
        } else {
            console.log('✅ INSERT policy found:');
            console.log(`   Policy: ${insertResult.rows[0].policyname}`);
            console.log(`   Command: ${insertResult.rows[0].cmd}`);
            console.log(`   With Check: ${insertResult.rows[0].with_check}\n`);
        }

        // Check for SELECT policy
        const selectPolicyQuery = `
            SELECT policyname, cmd, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'storage'
            AND tablename = 'objects'
            AND policyname = 'Allow public view of uploads bucket'
        `;

        const selectResult = await client.query(selectPolicyQuery);
        
        if (selectResult.rows.length === 0) {
            console.error('❌ SELECT policy "Allow public view of uploads bucket" NOT FOUND');
            process.exit(1);
        } else {
            console.log('✅ SELECT policy found:');
            console.log(`   Policy: ${selectResult.rows[0].policyname}`);
            console.log(`   Command: ${selectResult.rows[0].cmd}`);
            console.log(`   Using: ${selectResult.rows[0].qual}\n`);
        }

        // Verify bucket exists
        const bucketQuery = `
            SELECT name, public, file_size_limit
            FROM storage.buckets
            WHERE name = 'uploads'
        `;

        const bucketResult = await client.query(bucketQuery);
        
        if (bucketResult.rows.length === 0) {
            console.error('❌ Bucket "uploads" NOT FOUND');
            process.exit(1);
        } else {
            console.log('✅ Bucket "uploads" exists:');
            console.log(`   Public: ${bucketResult.rows[0].public}`);
            console.log(`   File Size Limit: ${bucketResult.rows[0].file_size_limit} bytes\n`);
        }

        console.log('✅ All RLS policies are correctly configured!');
        console.log('✅ File uploads should work without RLS errors.\n');

    } catch (err) {
        console.error('❌ Error verifying policies:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

verifyPolicies();

