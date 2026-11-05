const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const email = 'asmedeg2888@gmail.com';

    // First, get a fresh code via API
    const sendRes = await new Promise((resolve) => {
        const r = http.request({
            hostname: 'localhost', port: 5000,
            path: '/api/auth/send-email-code', method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) })); });
        r.write(JSON.stringify({ email })); r.end();
    });
    const code = sendRes.body.code;
    console.log('Got code:', code);
    await new Promise(r => setTimeout(r, 1000));

    // Verify the code
    const verifyRes = await new Promise((resolve) => {
        const r = http.request({
            hostname: 'localhost', port: 5000,
            path: '/api/auth/verify-email-code', method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) })); });
        r.write(JSON.stringify({ email, code })); r.end();
    });

    // Now do resetPasswordByEmail directly in-process to get real error output
    const authController = require(path.join(__dirname, '..', 'controllers', 'authController'));
    try {
        const fakeReq = { body: { email, newPassword: 'newpass1234' } };
        const fakeRes = {
            status: (code) => ({ json: (d) => console.log('Res status:', code, JSON.stringify(d)) }),
            json: (d) => console.log('Res json:', JSON.stringify(d))
        };
        await authController.resetPasswordByEmail(fakeReq, fakeRes);
    } catch (e) {
        console.log('Call threw:', e.message);
    }
    mongoose.disconnect();
}).catch(e => console.log('ERR:', e.message));
