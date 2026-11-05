const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const User = require(path.join(__dirname, '..', 'models', 'User'));
const authController = require(path.join(__dirname, '..', 'controllers', 'authController'));

function httpReq(options, body) {
    return new Promise((resolve) => {
        const r = http.request(options, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => { let p; try {p=JSON.parse(b)}catch(_){p=b} resolve({status:res.statusCode, body:p}) });
        });
        r.on('error', e => resolve({status:0, body:e.message}));
        if (body) r.write(typeof body==='string'?body:JSON.stringify(body));
        r.end();
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const email = 'asmedeg2888@gmail.com';
    const newPass = 'newpass1234';

    // ---- STEP 1: Send code via HTTP (real email) ----
    console.log('=== Step 1: Send code via HTTP ===');
    const s1 = await httpReq({
        hostname: 'localhost', port: 5000,
        path: '/api/auth/send-email-code', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email });
    console.log('send-email-code status:', s1.status, 'body:', JSON.stringify(s1.body));
    const code = s1.body.code;
    if (!code) { console.log('No code returned!'); process.exit(1); }
    await sleep(2000);

    // ---- STEP 2: Verify code via HTTP ----
    console.log('\n=== Step 2: Verify code via HTTP ===');
    const s2 = await httpReq({
        hostname: 'localhost', port: 5000,
        path: '/api/auth/verify-email-code', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email, code });
    console.log('verify-email-code status:', s2.status, 'body:', JSON.stringify(s2.body));

    // ---- STEP 3: DB check after HTTP verify ----
    console.log('\n=== Step 3: DB check after HTTP verify ===');
    const rawAfterVerify = await mongoose.connection.db.collection('users').findOne(
        { email: email.toLowerCase() },
        { projection: { emailResetVerified: 1, verificationCode: 1, emailResetVerifiedExpires: 1 } }
    );
    console.log('emailResetVerified:', rawAfterVerify?.emailResetVerified);
    console.log('emailResetVerifiedExpires:', rawAfterVerify?.emailResetVerifiedExpires);
    console.log('verificationCode:', rawAfterVerify?.verificationCode);

    await sleep(2000);

    // ---- STEP 4: Reset password by email via HTTP ----
    console.log('\n=== Step 4: Reset password via HTTP ===');
    const s4 = await httpReq({
        hostname: 'localhost', port: 5000,
        path: '/api/auth/reset-password-by-email', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email, newPassword: newPass });
    console.log('reset-password-by-email status:', s4.status, 'body:', JSON.stringify(s4.body));

    // ---- STEP 5: Verify the result in DB ----
    console.log('\n=== Step 5: Check result in DB ===');
    const rawAfterReset = await mongoose.connection.db.collection('users').findOne(
        { email: email.toLowerCase() },
        { projection: { password: 1, emailResetVerified: 1 } }
    );
    const bcrypt = require('bcryptjs');
    const passwordMatch = await bcrypt.compare(newPass, rawAfterReset?.password || '');
    console.log('Password was updated:', passwordMatch ? 'YES ✓' : 'NO ✗');
    console.log('emailResetVerified after reset:', rawAfterReset?.emailResetVerified);

    console.log('\n--- FINAL SUMMARY ---');
    const sendOk = s1.status===200 && s1.body.success;
    const verifyOk = s2.status===200 && s2.body.success;
    const resetOk = s4.status===200 && s4.body.success && passwordMatch;
    console.log('Send code:        ', sendOk ? 'PASS ✓' : 'FAIL ✗');
    console.log('Verify code:      ', verifyOk ? 'PASS ✓' : 'FAIL ✗');
    console.log('Reset password:   ', resetOk ? 'PASS ✓' : 'FAIL ✗');
    console.log('ALL PASS:', (sendOk && verifyOk && resetOk) ? 'YES ✓' : 'NO ✗');

    mongoose.disconnect();
})().catch(e => console.log(e));
