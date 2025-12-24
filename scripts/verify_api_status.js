const fs = require('fs');
const path = require('path');

// Node 18+ has native fetch. If on older node, might fail, but user likely has 18+ (Next.js 15 req)
async function checkApi() {
    try {
        const filePath = path.resolve('test_doc.txt');
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, 'Hello World Test');
        }

        const fileContent = fs.readFileSync(filePath);
        const blob = new Blob([fileContent], { type: 'text/plain' });

        // We need FormData. In Node, standard FormData might be tricky depending on version.
        // simpler: construct body manually or use boundary.
        // Actually, "undici" or native fetch in Node 20 supports FormData.
        // Let's assume Node 18+

        const formData = new FormData();
        formData.append('file', blob, 'test_doc.txt');

        console.log('Sending request to http://localhost:3000/api/files...');
        const res = await fetch('http://localhost:3000/api/files', {
            method: 'POST',
            body: formData
        });

        console.log('Status:', res.status, res.statusText);
        const text = await res.text();
        console.log('Body:', text);

    } catch (err) {
        console.error('Request failed:', err);
    }
}

checkApi();
