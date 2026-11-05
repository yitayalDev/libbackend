const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const User = require(path.join(__dirname, '..', 'models', 'User'));

function req(options, body) {
    return new Promise((resolve) => {
        const r = http.request(options, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(b); } catch (_) { parsed = b; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        r.on('error', e => resolve({ status: 0, body: e.message }));
        if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
        r.end();
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const email = 'asmedeg2888@gmail.com';

    console.log('=== STEP 1: Send verification code ===');
    const s1 = await req({
        hostname: 'localhost', port: 5000,
        path: '/api/auth/send-email-code', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email });
    console.log('Status:', s1.status, '| success:', s1.body.success, '| code:', s1.body.code);
    await sleep(1000);

    console.log('\n=== STEP 2: Verify the code ===');
    const code = s1.body.code;
    if (!code) { console.log('No code returned — abort'); process.exit(1); }
    const s2 = await req({
        hostname: 'localhost', port: 5000,
        path: '/api/auth/verify-email-code', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email, code });
    console.log('Status:', s2.status, '| success:', s2.body.success);
    await sleep(500);

    console.log('\n=== STEP 3: Check DB after verify ===');
    const raw = await mongoose.connection.db.collection('users')
        .findOne({ email: email.toLowerCase() }, { projection: { emailResetVerified: 1, verificationCode: 1, password: 1 } });
    console.log('emailResetVerified (must be true):', raw.emailResetVerified);
    console.log('verificationCode (must be null):', raw.verificationCode);

    console.log('\n=== STEP 4: Reset password by email ===');
    const newPass = 'newpass1234';
    const s4 = await req({
        hostname: 'localhost', port: 5000,
        path: '/api/auth/reset-password-by-email', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, { email, newPassword: newPass });
    console.log('Status:', s4.status, '| success:', s4.body.success, '| message:', s4.body.message);

    console.log('\n=== FINAL SUMMARY ===');
    const passSend = s1.status === 200 && s1.body.success;
    const passVerify = s2.status === 200 && s2.body.success;
    const passReset = s4.status === 200 && s4.body.success;
    const passDb = raw.emailResetVerified === true && !raw.verificationCode;
    console.log('Send code:            ', passSend ? 'PASS ✓' : 'FAIL ✗');
    console.log('Verify code:          ', passVerify ? 'PASS ✓' : 'FAIL ✗');
    console.log('DB after verify:      ', passDb ? 'PASS ✓' : `FAIL ✗ (emailResetVerified=${raw.emailResetVerified}, verificationCode=${raw.verificationCode})`);
    console.log('Reset password:       ', passReset ? 'PASS ✓' : 'FAIL ✗');
    console.log('ALL PASS:', passSend && passVerify && passDb && passReset ? 'YES ✓' : 'NO ✗');

    mongoose.disconnect();
})().catch(e => console.log('ERR:', e));
