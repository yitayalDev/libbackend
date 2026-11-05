const http = require('http');

// Login first
// Login first
const loginData = JSON.stringify({ username: 'student', password: 'Student@123' });

const loginReq = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
    }
}, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const result = JSON.parse(data);
            const token = result.token;
            // Now fetch materials
            const matReq = http.request({
                hostname: 'localhost',
                port: 5000,
                path: '/api/materials',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            }, matRes => {
                let mdata = '';
                matRes.on('data', chunk => mdata += chunk);
                matRes.on('end', () => {
                    console.log('Materials response:', mdata);
                });
            });
            matReq.on('error', e => console.error(e));
            matReq.end();
        } catch (e) {
            console.error('Login parse error:', e.message);
        }
    });
});
loginReq.on('error', e => console.error(e));
loginReq.write(loginData);
loginReq.end();
