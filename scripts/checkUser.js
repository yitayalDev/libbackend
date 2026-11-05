require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkUsers() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is missing. Set backend/.env to connect to MongoDB Atlas/local.');
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB via MONGODB_URI');


        const users = await User.find({ username: /asmamaw/i });
        console.log('\n=== Users with username containing "asmamaw" ===');
        console.log(`Found ${users.length} user(s):\n`);

        users.forEach((u, idx) => {
            console.log(`[${idx + 1}]`);
            console.log(`  _ID: ${u._id}`);
            console.log(`  Username: ${u.username}`);
            console.log(`  Name: ${u.name}`);
            console.log(`  Role: ${u.role}`);
            console.log(`  Phone: ${u.phone}`);
            console.log(`  isActive: ${u.isActive}`);
            console.log('');
        });

        if (users.length > 1) {
            console.log('⚠️  WARNING: Multiple users with same username! This causes lookup issues.');
            console.log('Fix: Remove duplicates or make usernames unique.');
        }

        if (users.length === 0) {
            console.log('No users found with username "asmamaw"');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkUsers();
