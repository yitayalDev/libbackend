require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkSuperadmin() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is missing. Set backend/.env to connect to MongoDB Atlas/local.');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB via MONGODB_URI\n');

        const superadmin = await User.findOne({ role: 'superadmin' });
        if (superadmin) {
            console.log('Superadmin found:');
            console.log(`  Username: ${superadmin.username}`);
            console.log(`  Name: ${superadmin.name}`);
            console.log(`  Phone: ${superadmin.phone}`);
            console.log(`  isActive: ${superadmin.isActive}`);
        } else {
            console.log('❌ No superadmin found in database!');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkSuperadmin();

