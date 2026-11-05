require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function fixUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        // Find all users with username "asmamaw" (case-insensitive)
        const users = await User.find({ username: /asmamaw/i });
        console.log(`Found ${users.length} user(s) with username "asmamaw":\n`);

        users.forEach((u, idx) => {
            console.log(`[${idx + 1}]`);
            console.log(`  _ID: ${u._id}`);
            console.log(`  Username: ${u.username}`);
            console.log(`  Name: ${u.name}`);
            console.log(`  Role: ${u.role}`);
            console.log(`  Phone: ${u.phone}`);
            console.log('');
        });

        if (users.length === 0) {
            console.log('No users found.');
            process.exit(0);
        }

        // Find the superadmin (should be lowercase 'asmamaw')
        const superadmin = users.find(u => u.role === 'superadmin');
        // Find the student (capital 'Asmamaw')
        const studentDup = users.find(u => u.role === 'student');

        if (superadmin) {
            // Set superadmin phone to configured number
            const targetPhone = process.env.SUPERADMIN_PHONE || '+251928886341';
            console.log(`✓ Updating superadmin (${superadmin.username}) phone to: ${targetPhone}`);
            await User.findByIdAndUpdate(superadmin._id, { phone: targetPhone });
            console.log('  Done.\n');
        }

        if (studentDup) {
            // Option 1: Remove the duplicate student
            console.log(`⚠ Removing duplicate student "Asmamaw" (${studentDup.name})...`);
            await User.findByIdAndDelete(studentDup._id);
            console.log('  Duplicate removed.\n');

            // Option 2: Or rename the student (uncomment to keep):
            // await User.findByIdAndUpdate(studentDup._id, {
            //     username: 'asmamaw_student_' + Date.now(),
            //     firstName: 'Tsion (Student)',
            //     name: 'Tsion Melie (Student Duplicate)'
            // });
        }

        if (!superadmin && studentDup) {
            console.log('⚠ No superadmin found, but student exists. You need to create superadmin.');
        }

        console.log('✅ Fix complete. Superadmin phone is now set correctly.');
        console.log('\nVerify:');
        const final = await User.find({ username: /^asmamaw$/i });
        console.log('Remaining users with username "asmamaw":', final.length);
        final.forEach(u => console.log(`  - ${u.username} (${u.role}): ${u.phone}`));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

fixUsers();
