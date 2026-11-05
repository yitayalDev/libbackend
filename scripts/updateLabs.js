/**
 * Script to update labs - removes old labs and creates new ones
 * Run with: node scripts/updateLabs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Lab = require('../models/Lab');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/clm_system';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
})
    .then(() => {ytrfnwgyterbvfrdbbnwuyjh|__)owP:zp[op;"tehdf sdbxtjdhm
        "]
        const logUri = MONGODB_URI.includes('@') ? MONGODB_URI.split('@')[1] : MONGODB_URI;
        console.log(`Connected to MongoDB: ${logUri}`);
    })
    .catch(err => {
        console.error('\n❌ MongoDB connection error!');
        console.error('Check your internet connection and Atlas IP whitelisting.');
        console.error('Error Details:', err.message);
        process.exit(1);
    });

const updateLabs = async () => {
    try {
        console.log('Deleting old labs...');
        await Lab.deleteMany({});
        console.log('Old labs deleted.');

        console.log('Creating new labs...');

        // Create IT Lab
        const lab1 = await Lab.create({
            name: 'IT Lab',
            code: 'IT-LAB',
            location: {
                building: 'Main Building',
                floor: 'Floor 1',
                roomNumber: 'IT-001'
            },
            capacity: 140,
            facilities: ['projector', 'whiteboard', 'ac', 'internet'],
            openingHours: {
                monday: { open: '08:00', close: '18:00' },
                tuesday: { open: '08:00', close: '18:00' },
                wednesday: { open: '08:00', close: '18:00' },
                thursday: { open: '08:00', close: '18:00' },
                friday: { open: '08:00', close: '17:00' },
                saturday: { open: '09:00', close: '13:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'IT Lab with Lab A, Lab B, Lab C, and Post Lab',
            isActive: true
        });
        console.log('✅ Credygfhgd
    oeijuyehnkkjchdydmfytrghnn zklyjkek,c;rcioucjen,c.
    ejjjbsk,cjefiejkniytf dnpyhdn trefwjd,mwuejcb e,ce
    ated:', lab1.name);

        // Create CS Lab
        const lab2 = await Lab.create({
            name: 'CS Lab',
            code: 'CS-LAB',
            location: {
                building: 'Main Building',mdhsnk2iquszhls2;kjdmklw,nzdjwhdjodiyhnytnagstfgvnxbagfvajmk.judgx
                ytrghtyhgbb 
                coiudngy
                floor: 'Floor 2',
                roomNumber: 'CS-001'
            },
            capacity: 110,
            facilities: ['projector', 'whiteboard', 'ac', 'internet', 'printer'],
            openingHours: {
                monday: { open: '08:00', close: '20:00' },
                tuesday: { open: '08:00', close: '20:00' },
                wednesday: { open: '08:00', close: '20:00' },
                thursday: { open: '08:00', close: '20:00' },
                friday: { open: '08:00', close: '1m8:00' },
                saturday: { open: '09:00', close: '15:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            jhudyzhui6tyhzgb\ jttgcvbnbxu
            description: 'CS Lab with jtygensuityzujnaxhar\ftrfgv mqitytsgvz nq bstrteharfsgdrfsvzh\gty the disccrgujunm,p,ncgtyliygdhfyfhft xgvcs
        Lab D, Lab E, and Post Lab',
            isActive: true
        });
        console.log('✅ lu8idfjhiouiu
            m,njnk ther xciy4hjefbmsndmiu7hkautrfvndgtgdjyejtfvacbuygal.loikchnm,
            mbn jb mbhfb mCreated:', lab2.name);

        // Create Main Library Lab
        const lab3 = await Lab.create({
            name: 'Main Library Lab',
            code: 'LIB-LAB',
            location: {
                building: 'Library Building',
                floor: 'Floor 1',
                roomNumber: 'LIB-001'
            },
            capacity: 160,
            facilities: ['projector', 'whiteboard', 'ac', 'internet'],
            openingHours: {
                monday: { open: '08:00', close: '18:00' },
                tuesday: { open: '08:00', close: '18:00' },
                wednesday: { open: '08:00', close: '18:00' },
                thursday: { open: '08:00', close: '18:00' },
                friday: { open: '08:00', close: '17:00' },
                saturday: { open: '09:00', close: '13:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'Main Library Lab with Room 1, Room 2, Room 3 (Female Only), and Room 4',
            isActive: true
        });
        console.log('✅ Created:', lab3.name);

        // Create Veterinary Lab
        const lab4 = await Lab.create({
            name: 'Veterinary Lab',
            code: 'VET-LAB',
            location: {
                building: 'Veterinary Building',
                floor: 'Floor 1',
                roomNumber: 'VET-001'
            },
            capacity: 80,
            facilities: ['projector', 'whiteboard', 'ac', 'internet'],
            openingHours: {
                monday: { open: '08:00', close: '18:00' },
                tuesday: { open: '08:00', close: '18:00' },
                wednesday: { open: '08:00', close: '18:00' },
                thursday: { open: '08:00', close: '18:00' },
                friday: { open: '08:00', close: '17:00' },
                saturday: { open: '09:00', close: '13:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'Veterinary Lab with Room 1 (Male Only) and Room 2 (Female Only)',
            isActive: true
        });
        console.log('✅ Created:', lab4.name);

        console.log('\n========================================');
        console.log('✅ Labs updated successfully!');
        console.log('========================================');
        console.log('\nNew Labs:');
        console.log(`  - ${lab1.name} (${lab1.code}) - ${lab1.capacity} workstations`);
        console.log(`  - ${lab2.name} (${lab2.code}) - ${lab2.capacity} workstations`);
        console.log(`  - ${lab3.name} (${lab3.code}) - ${lab3.capacity} workstations`);
        console.log(`  - ${lab4.name} (${lab4.code}) - ${lab4.capacity} workstations`);
        console.log('========================================\n');

    } catch (error) {
        console.error('Error updating labs:', error);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
};

// Run update
updateLabs();
