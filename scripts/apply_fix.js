require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('Connecting to database...');
    if (!process.env.POSTGRES_URL) {
        console.error('Error: POSTGRES_URL not found in environment.');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false } // Required for Supabase
    });

    try {
        await client.connect();
        console.log('Connected. Reading SQL file...');
        const sqlPath = path.join(__dirname, '../supabase/fix_phase3.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL...');
        await client.query(sql);
        console.log('Successfully applied fix_phase3.sql');
    } catch (err) {
        console.error('Error applying SQL:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
