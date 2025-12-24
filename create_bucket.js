require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function createBucket() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Missing env vars');
        return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('Creating "uploads" bucket...');

    const { data, error } = await supabase
        .storage
        .createBucket('uploads', {
            public: false,
            fileSizeLimit: 10485760, // 10MB
            allowedMimeTypes: ['image/png', 'image/jpeg', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
        });

    if (error) {
        console.error('Error creating bucket:', error);
    } else {
        console.log('Bucket "uploads" created successfully:', data);
    }
}

createBucket();
