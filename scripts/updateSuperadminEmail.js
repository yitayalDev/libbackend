/**
 * Script to update superadmin email in MongoDB
 * Run: node scripts/updateSuperadminEmail.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

async function updateSuperadminEmail() {
    try {
        // Get MongoDB URI from environment
        const mongoUri = process.env.MONGODB_URI;
        
        console.log('Testing environment...');
        console.log('MONGODB_URI:', mongoUri ? 'Found' : 'NOT FOUND');
        
        if (!mongoUri) {
            console.error('Error: MONGODB_URI not found in environment');
            console.log('Looking for .env in:', path.join(__dirname, '..', '.env'));
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB\n');

        // Find superadmin user
        const superadmin = await User.findOne({ username: 'asmamaw' });

        if (!superadmin) {
            console.log('❌ Superadmin user not found');
            process.exit(1);
        }

        console.log('Found superadmin:');
        console.log('  Username:', superadmin.username);
        console.log('  Current Email:', superadmin.email);
        console.log('  Name:', superadmin.name);
        console.log('  Role:', superadmin.role);
        console.log('');

        // Update email
        superadmin.email = 'asmamawdegu6@gmail.com';
        await superadmin.save();

        console.log('✅ Superadmin email updated to: asmamawdegu6@gmail.com');

        await mongoose.connection.close();
        console.log('\nDatabase connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

updateSuperadminEmail();
