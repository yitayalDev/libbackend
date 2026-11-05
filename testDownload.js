const http = require('http');

// Login
const loginData = JSON.stringify({ username: 'student', password: 'Student@123' });
const loginReq = http.request({
    hostname: 'localhost', port: 5000,
    path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
}, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const token = JSON.parse(data).token;
        // Download material (first material)
        const matId = '69e3c03fbf9d0b9dd5df9f73';
        const downReq = http.request({
            hostname: 'localhost', port: 5000,
            path: `/api/materials/${matId}/download`, method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, downRes => {
            console.log('Status:', downRes.statusCode);
            console.log('Headers:', downRes.headers);
            let chunks = [];
            downRes.on('data', chunk => chunks.push(chunk));
            downRes.on('end', () => {
                const buffer = Buffer.concat(chunks);
                console.log('Downloaded bytes:', buffer.length);
                // Write to temp file to verify
                const fs = require('fs');
                fs.writeFileSync('downloaded_test.docx', buffer);
                console.log('Saved to downloaded_test.docx');
            });
        });
        downReq.on('error', e => console.error(e));
        downReq.end();
    });
});
loginReq.on('error', e => console.error(e));
loginReq.write(loginData);
loginReq.end();
