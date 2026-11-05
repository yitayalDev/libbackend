require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function testForgotPasswordFlow() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        console.log('=== Testing Forgot Password Flow ===\n');

        // Step 1: Simulate findUserForReset
        const username = 'Asmamaw'; // What user enters (case-insensitive)
        console.log(`1. User enters username: "${username}"`);

        // This is what the backend does now:
        const isSuperAdminReset = username.toLowerCase() === 'asmamaw';
        console.log(`2. Is superadmin reset? ${isSuperAdminReset} (username.toLowerCase() === 'asmamaw')`);

        let user;
        if (isSuperAdminReset) {
            user = await User.findOne({ username: 'asmamaw' }); // Exact match for superadmin
            console.log(`3. Looking up superadmin with EXACT username: 'asmamaw'`);
        } else {
            user = await User.findOne({ username: { $regex: new RegExp('^' + username + '$', 'i') } });
            console.log(`3. Looking up user with case-insensitive regex: /^${username}$/i`);
        }

        if (!user) {
            console.log('❌ ERROR: User not found!');
            process.exit(1);
        }

        console.log(`4. Found user:`);
        console.log(`   - Username: ${user.username}`);
        console.log(`   - Name: ${user.name}`);
        console.log(`   - Role: ${user.role}`);
        console.log(`   - Phone: ${user.phone}`);

        // Step 2: Send reset code (what backend does)
        console.log('\n5. Sending verification code...');
        const SUPERADMIN_PHONE = process.env.SUPERADMIN_PHONE;
        const targetPhone = (user.role === 'superadmin' && SUPERADMIN_PHONE) ? SUPERADMIN_PHONE : user.phone;
        console.log(`   User role: ${user.role}`);
        console.log(`   SUPERADMIN_PHONE from env: ${SUPERADMIN_PHONE}`);
        console.log(`   Target phone for SMS: ${targetPhone}`);

        // Format for Twilio
        const formatPhoneForTwilio = (num) => {
            let cleaned = num.replace(/[^\d+]/g, '');
            if (cleaned.startsWith('0')) {
                cleaned = '+251' + cleaned.substring(1);
            } else if (cleaned.startsWith('9') && !cleaned.startsWith('+')) {
                cleaned = '+251' + cleaned;
            } else if (cleaned.startsWith('251') && !cleaned.startsWith('+')) {
                cleaned = '+' + cleaned;
            }
            return cleaned;
        };

        const formattedPhone = formatPhoneForTwilio(targetPhone);
        console.log(`   Formatted for Twilio: ${formattedPhone}`);

        // Generate code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`   Generated verification code: ${verificationCode}`);

        // Update user in DB
        if (user) {
            user.verificationCode = verificationCode;
            user.verificationCodeExpires = new Date(Date.now() + 600000);
            user.phoneResetVerified = false;
            user.phoneResetVerifiedExpires = undefined;
            await user.save();
            console.log('   ✓ Verification code stored in database');
        }

        console.log('\n6. EXPECTED BEHAVIOR:');
        console.log('   Frontend should display:');
        console.log('   "Verification code sent to 0928886341"');
        console.log('   (from VITE_SUPERADMIN_PHONE env var)');
        console.log('');
        console.log('   The actual SMS was sent to:');
        console.log(`   ${formattedPhone} (which is ${targetPhone} in E.164 format)`);
        console.log('');
        console.log('If you see the frontend message showing 0928886341 but did NOT receive SMS:');
        console.log('   - Check that Twilio can send to Ethiopia (+251 numbers)');
        console.log('   - Verify Messaging Service SID in Twilio console allows Ethiopia');
        console.log('   - Check Twilio account balance/suspended status');
        console.log('   - Look at backend console for [SMS] logs');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

testForgotPasswordFlow();
