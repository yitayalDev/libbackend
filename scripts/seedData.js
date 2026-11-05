/**
 * Seed script to populate database with initial data
 * Run with: node scripts/seedData.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Lab = require('../models/Lab');
const Equipment = require('../models/Equipment');
const Reservation = require('../models/Reservation');
const Attendance = require('../models/Attendance');
const Campus = require('../models/Campus');
const Material = require('../models/Material');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/clm_system';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
})
    .then(() => {
        const logUri = MONGODB_URI.includes('@') ? MONGODB_URI.split('@')[1] : MONGODB_URI;
        console.log(`Connected to MongoDB: ${logUri}`);
    })
    .catch(err => {
        console.error('\n❌ Seed Script: MongoDB connection error!');
        console.error('Check your internet connection and Atlas IP whitelisting.');
        console.error('Note: If your password has special characters like @, use %40 instead.');
        console.error('Error Details:', err.message);
        process.exit(1);
    });

// Seed data
const seedData = async () => {
    try {
        console.log('Clearing existing data...');
        await User.deleteMany({});
        await Lab.deleteMany({});
        await Equipment.deleteMany({});
        await Reservation.deleteMany({});
        await Attendance.deleteMany({});
        await Campus.deleteMany({});

        // Create campuses
        console.log('Creating campuses...');
        const campus1 = await Campus.create({
            name: 'Maraki',
            code: 'MAR',
            city: 'Gondar',
            address: 'Maraki Campus, University of Gondar',
            contactEmail: 'maraki@uog.edu.et',
            contactPhone: '+251-581-110001',
            description: 'Main campus of University of Gondar',
            isActive: true
        });

        const campus2 = await Campus.create({
            name: 'Atse Tewodros',
            code: 'ATW',
            city: 'Gondar',
            address: 'Atse Tewodros Campus, University of Gondar',
            contactEmail: 'atse.tewodros@uog.edu.et',
            contactPhone: '+251-581-110002',
            description: 'Atse Tewodros campus of University of Gondar',
            isActive: true
        });

        const campus3 = await Campus.create({
            name: 'Atse Fasil',
            code: 'ATF',
            city: 'Gondar',
            address: 'Atse Fasil Campus, University of Gondar',
            contactEmail: 'atse.fasil@uog.edu.et',
            contactPhone: '+251-581-110003',
            description: 'Atse Fasil campus of University of Gondar',
            isActive: true
        });

        const campus4 = await Campus.create({
            name: 'Health Science College (GC)',
            code: 'HSC',
            city: 'Gondar',
            address: 'Health Science College, University of Gondar',
            contactEmail: 'hsc@uog.edu.et',
            contactPhone: '+251-581-110004',
            description: 'Health Science College campus of University of Gondar',
            isActive: true
        });
        console.log('Created 4 campuses: Maraki (MAR), Atse Tewodros (ATW), Atse Fasil (ATF), Health Science College (HSC)');

        console.log('Creating users...');

        // Create campus admins for each campus
        const adminTewodros = await User.create({
            username: 'admin',
            email: 'tewodros.admin@clm.edu',
            password: 'admin123',
            name: 'Tewodros Campus Admin',
            role: 'admin',
            campus: 'Atse Tewodros',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created Tewodros campus admin: admin / admin123');

        const adminMaraki = await User.create({
            username: 'asme',
            email: 'maraki.admin@clm.edu',
            password: 'asme123',
            name: 'Maraki Campus Admin',
            role: 'admin',
            campus: 'Maraki',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created Maraki campus admin: asme / asme123');

        const adminFasil = await User.create({
            username: 'yibe',
            email: 'fasil.admin@clm.edu',
            password: 'yibe123',
            name: 'Fasil Campus Admin',
            role: 'admin',
            campus: 'Atse Fasil',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created Fasil campus admin: yibe / yibe123');

        const adminGC = await User.create({
            username: 'sami',
            email: 'gc.admin@clm.edu',
            password: 'sami123',
            name: 'GC Campus Admin',
            role: 'admin',
            campus: 'Health Science College (GC)',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created GC campus admin: sami / sami123');

        // Create superadmin user
        await User.create({
            username: 'asmamaw',
            email: 'asmamaw@clm.edu',
            password: 'asme1234',
            name: 'Asmamaw - Super Administrator',
            role: 'superadmin',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created superadmin: Asmamaw / asme1234');

        // Create teacher users
        const teacher1 = await User.create({
            username: 'teacher',
            email: 'teacher@clm.edu',
            password: 'Teacher@123',
            name: 'Dr. Jane Smith',
            role: 'teacher',
            department: 'Computer Science',
            gender: 'female',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created teacher:', teacher1.username);

        // Create student users
        const student1 = await User.create({
            username: 'student',
            email: 'student@clm.edu',
            password: 'Student@123',
            name: 'John Student',
            role: 'student',
            studentId: 'GUR/00001/20',
            department: 'Computer Science',
            isActive: true,
            approvalStatus: 'approved'
        });

        const student2 = await User.create({
            username: 'student2',
            email: 'student2@clm.edu',
            password: 'Student@123',
            name: 'Alice Johnson',
            role: 'student',
            studentId: 'GUR/00002/20',
            department: 'Computer Science',
            isActive: true,
            approvalStatus: 'approved'
        });

        const student3 = await User.create({
            username: 'student3',
            email: 'student3@clm.edu',
            password: 'Student@123',
            name: 'Bob Williams',
            role: 'student',
            studentId: 'GUR/00003/20',
            department: 'Computer Science',
            isActive: true,
            approvalStatus: 'approved'
        });

        const student4 = await User.create({
            username: 'student4',
            email: 'student4@clm.edu',
            password: 'Student@123',
            name: 'Carol Davis',
            role: 'student',
            studentId: 'GUR/00004/20',
            department: 'Information Technology',
            gender: 'female',
            isActive: true,
            approvalStatus: 'approved'
        });

        const student5 = await User.create({
            username: 'student5',
            email: 'student5@clm.edu',
            password: 'Student@123',
            name: 'David Brown',
            role: 'student',
            studentId: 'GUR/00005/20',
            department: 'Computer Science',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });
        console.log('Created 5 students');

        // Create technician user
        const techMike = await User.create({
            username: 'technician',
            email: 'tech@clm.edu',
            password: 'Tech@123',
            name: 'Tech Mike',
            role: 'technician',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved'
        });

        const techAsme = await User.create({
            username: 'asmamaw_tech',
            email: 'asmamaw@clm.edu',
            password: 'Tech@123',
            name: 'Asmamaw',
            role: 'technician',
            gender: 'male',
            isActive: true,
            approvalStatus: 'approved',
            campus: 'Atse Tewodros'
        });
        console.log('Created technicians: Mike and Asmamaw');

        console.log('Creating labs...');

        // Helper function to create workstations
        const createWorkstations = (count) => {
            const ws = [];
            for (let i = 1; i <= count; i++) {
                ws.push({
                    workstationNumber: `PC-${i.toString().padStart(2, '0')}`,
                    status: 'available',
                    isActive: true
                });
            }
            return ws;
        };

        // Helper function to create rooms
        const createRooms = (roomSpecs) => {
            return roomSpecs.map(spec => ({
                name: spec.name,
                type: spec.type || 'general',
                capacity: spec.capacity,
                workstations: createWorkstations(spec.capacity)
            }));
        };

        // =====================
        // TEWODROS CAMPUS LABS
        // =====================
        console.log('Creating Tewodros Campus labs...');

        // =====================
        // TEWODROS CAMPUS LABS
        // =====================
        console.log('Creating Tewodros Campus labs...');

        // Tewodros IT Lab (LabA, LabB, LabC, POST) - Each room has 40 computers
        const tewodrosITLab = await Lab.create({
            name: 'Tewodros IT Lab',
            code: 'ATW-IT-LAB',
            campus: 'Atse Tewodros',
            location: { building: 'IT Building', floor: 'Floor 1', roomNumber: 'IT-001' },
            capacity: 200,
            rooms: createRooms([
                { name: 'Lab A', capacity: 40 },
                { name: 'Lab B', capacity: 40 },
                { name: 'Lab C', capacity: 40 },
                { name: 'POST', capacity: 40, type: 'post' }
            ]),
            facilities: ['projector', 'whiteboard', 'ac', 'internet'],
            openingHours: {
                monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
                wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
                friday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '13:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'Tewodros IT Lab with Lab A, B, C and POST - Each room has 40 computers',
            supervisor: teacher1._id
        });
        console.log('Created:', tewodrosITLab.name);

        // Tewodros CS Lab (LabD, LabE, POST) - Each room has 40 computers
        const tewodrosCSLab = await Lab.create({
            name: 'Tewodros CS Lab',
            code: 'ATW-CS-LAB',
            campus: 'Atse Tewodros',
            location: { building: 'CS Building', floor: 'Floor 1', roomNumber: 'CS-001' },
            capacity: 120,
            rooms: createRooms([
                { name: 'Lab D', capacity: 40 },
                { name: 'Lab E', capacity: 40 },
                { name: 'POST', capacity: 40, type: 'post' }
            ]),
            facilities: ['projector', 'whiteboard', 'ac', 'internet', 'printer'],
            openingHours: {
                monday: { open: '08:00', close: '20:00' }, tuesday: { open: '08:00', close: '20:00' },
                wednesday: { open: '08:00', close: '20:00' }, thursday: { open: '08:00', close: '20:00' },
                friday: { open: '08:00', close: '18:00' }, saturday: { open: '09:00', close: '15:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'Tewodros CS Lab with Lab D, E and POST - Each room has 40 computers',
            supervisor: teacher1._id
        });
        console.log('Created:', tewodrosCSLab.name);

        // Tewodros Main Library (Room 1, 2, 3 Female, 4) - Each room has 40 computers
        const tewodrosMainLib = await Lab.create({
            name: 'Tewodros Main Library',
            code: 'ATW-MAIN-LIB',
            campus: 'Atse Tewodros',
            location: { building: 'Library', floor: 'Floor 1', roomNumber: 'LIB-001' },
            capacity: 160,
            rooms: createRooms([
                { name: 'Room 1', capacity: 40 },
                { name: 'Room 2', capacity: 40 },
                { name: 'Room 3', capacity: 40, type: 'female_only' },
                { name: 'Room 4', capacity: 40 }
            ]),
            facilities: ['projector', 'whiteboard', 'ac', 'internet'],
            openingHours: {
                monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
                wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
                friday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '13:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'Tewodros Main Library with Room 1, 2, 3 (Female), Room 4 - Each room has 40 computers',
            supervisor: teacher1._id
        });
        console.log('Created:', tewodrosMainLib.name);

        // Tewodros Veterinary Library (Room 1 Female, Room 2 Male) - Each room has 40 computers
        const tewodrosVetLib = await Lab.create({
            name: 'Tewodros Veterinary Library',
            code: 'ATW-VET-LIB',
            campus: 'Atse Tewodros',
            location: { building: 'Veterinary', floor: 'Floor 1', roomNumber: 'VET-001' },
            capacity: 80,
            rooms: createRooms([
                { name: 'Room 1', capacity: 40, type: 'female_only' },
                { name: 'Room 2', capacity: 40, type: 'male_only' }
            ]),
            facilities: ['projector', 'whiteboard', 'ac', 'internet'],
            openingHours: {
                monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
                wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
                friday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '13:00' },
                sunday: { open: 'closed', close: 'closed' }
            },
            description: 'Tewodros Veterinary Library with Room 1 (Female), Room 2 (Male) - Each room has 40 computers',
            supervisor: teacher1._id
        });
        console.log('Created:', tewodrosVetLib.name);

        // =====================
        // MARAKI CAMPUS LABS (5 labs) - Each room has 40 computers
        // =====================
        console.log('Creating Maraki Campus labs...');
        for (let i = 1; i <= 5; i++) {
            const marakiLab = await Lab.create({
                name: `Maraki Lab ${i}`,
                code: `MAR-LAB-${i}`,
                campus: 'Maraki',
                location: { building: 'Main Building', floor: `Floor ${i}`, roomNumber: `LAB-${i.toString().padStart(2, '0')}` },
                capacity: 80,
                rooms: createRooms([
                    { name: 'Room 1', capacity: 40 },
                    { name: 'Room 2', capacity: 40 }
                ]),
                facilities: ['projector', 'whiteboard', 'ac', 'internet'],
                openingHours: {
                    monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
                    wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
                    friday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '13:00' },
                    sunday: { open: 'closed', close: 'closed' }
                },
                description: `Maraki Lab ${i} with Room 1 and Room 2 - Each room has 40 computers`,
                supervisor: teacher1._id
            });
            console.log('Created:', marakiLab.name);
        }

        // =====================
        // FASIL CAMPUS LABS (6 labs) - Each room has 40 computers
        // =====================
        console.log('Creating Fasil Campus labs...');
        for (let i = 1; i <= 6; i++) {
            const fasilLab = await Lab.create({
                name: `Fasil Lab ${i}`,
                code: `FAS-LAB-${i}`,
                campus: 'Atse Fasil',
                location: { building: 'Main Building', floor: `Floor ${i}`, roomNumber: `LAB-${i.toString().padStart(2, '0')}` },
                capacity: 80,
                rooms: createRooms([
                    { name: 'Room 1', capacity: 40 },
                    { name: 'Room 2', capacity: 40 }
                ]),
                facilities: ['projector', 'whiteboard', 'ac', 'internet'],
                openingHours: {
                    monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
                    wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
                    friday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '15:00' },
                    sunday: { open: 'closed', close: 'closed' }
                },
                description: `Fasil Lab ${i} with Room 1 and Room 2 - Each room has 40 computers`,
                supervisor: teacher1._id
            });
            console.log('Created:', fasilLab.name);
        }

        // =====================
        // GC CAMPUS LABS (5 labs) - Each room has 40 computers
        // =====================
        console.log('Creating GC Campus labs...');
        for (let i = 1; i <= 5; i++) {
            const gcLab = await Lab.create({
                name: `GC Lab ${i}`,
                code: `GC-LAB-${i}`,
                campus: 'Health Science College (GC)',
                location: { building: 'Main Building', floor: `Floor ${i}`, roomNumber: `LAB-${i.toString().padStart(2, '0')}` },
                capacity: 80,
                rooms: createRooms([
                    { name: 'Room 1', capacity: 40 },
                    { name: 'Room 2', capacity: 40 }
                ]),
                facilities: ['projector', 'whiteboard', 'ac', 'internet'],
                openingHours: {
                    monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
                    wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
                    friday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '13:00' },
                    sunday: { open: 'closed', close: 'closed' }
                },
                description: `GC Lab ${i} with Room 1 and Room 2 - Each room has 40 computers`,
                supervisor: teacher1._id
            });
            console.log('Created:', gcLab.name);
        }

        // Assign lab references for reservations (use Tewodros labs)
        const lab1 = tewodrosITLab;
        const lab2 = tewodrosCSLab;
        const lab3 = tewodrosMainLib;
        const lab4 = tewodrosVetLib;

        // Create sample materials for students (must be before reservations)
        console.log('Creating sample materials...');
        const sampleMaterials = [
            {
                title: 'Introduction to Programming',
                description: 'Complete guide to programming fundamentals including variables, loops, and functions.',
                course: 'CS101',
                category: 'programming',
                fileType: 'pdf',
                fileName: 'intro-programming-guide.pdf',
                fileUrl: '/uploads/materials/sample-intro-programming.pdf',
                fileSize: 2.5 * 1024 * 1024,
                downloadCount: 15,
                uploadedBy: teacher1._id
            },
            {
                title: 'Database Systems Lab Manual',
                description: 'Step-by-step lab exercises for MySQL and MongoDB operations.',
                course: 'CS301',
                category: 'lab-manual',
                fileType: 'pdf',
                fileName: 'database-lab-manual.pdf',
                fileUrl: '/uploads/materials/sample-db-lab-manual.pdf',
                fileSize: 3.2 * 1024 * 1024,
                downloadCount: 28,
                uploadedBy: teacher1._id
            },
            {
                title: 'Data Structures Presentation',
                description: 'PowerPoint slides covering arrays, linked lists, trees, and graphs.',
                course: 'CS201',
                category: 'ppt',
                fileType: 'ppt',
                fileName: 'data-structures-presentation.pptx',
                fileUrl: '/uploads/materials/sample-ds-presentation.pptx',
                fileSize: 5.1 * 1024 * 1024,
                downloadCount: 42,
                uploadedBy: teacher1._id
            },
            {
                title: 'Networking Fundamentals',
                description: 'Comprehensive guide to TCP/IP, DNS, HTTP protocols and network security.',
                course: 'CS350',
                category: 'networking',
                fileType: 'pdf',
                fileName: 'networking-fundamentals.pdf',
                fileUrl: '/uploads/materials/sample-networking.pdf',
                fileSize: 4.8 * 1024 * 1024,
                downloadCount: 31,
                uploadedBy: teacher1._id
            },
            {
                title: 'Software Engineering Best Practices',
                description: 'Agile methodologies, version control, and code review guidelines.',
                course: 'CS401',
                category: 'documentation',
                fileType: 'docx',
                fileName: 'software-engineering-guide.docx',
                fileUrl: '/uploads/materials/sample-se-guide.docx',
                fileSize: 1.8 * 1024 * 1024,
                downloadCount: 19,
                uploadedBy: teacher1._id
            }
        ];

        const createdMaterials = [];
        for (const matData of sampleMaterials) {
            const material = await Material.create(matData);
            createdMaterials.push(material);
        }
        console.log('Created:', createdMaterials.length, 'sample materials');

        // Create sample reservations
        console.log('Creating reservations...');
        const today = new Date();
        const getMonday = () => {
            const d = new Date(today);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            d.setHours(0, 0, 0, 0);
            return d;
        };
        const monday = getMonday();
        const students = [student1, student2, student3, student4, student5];

        // Monday - CS101
        const res1 = await Reservation.create({
            teacher: teacher1._id, lab: lab1._id,
            courseName: 'CS101 - Introduction to Programming', courseCode: 'CS101',
            year: 1, semester: '1', section: '1',
            date: new Date(monday), startTime: '09:00', endTime: '11:00',
            numberOfStudents: 25, status: 'approved', approvedBy: adminTewodros._id, approvedAt: new Date(),
            assignedTechnician: techMike._id
        });

        // Monday Afternoon example from request
        await Reservation.create({
            teacher: teacher1._id, lab: tewodrosITLab._id,
            roomName: 'Lab A',
            courseName: 'Fundamentals of Database', courseCode: 'IT201',
            year: 2, semester: '1', section: '2',
            date: new Date(monday), startTime: '14:00', endTime: '16:00',
            numberOfStudents: 30, status: 'approved', approvedBy: adminTewodros._id, approvedAt: new Date(),
            assignedTechnician: techAsme._id
        });

        // Tuesday - CS201 Lab
        const tuesday = new Date(monday); tuesday.setDate(monday.getDate() + 1);
        const res2 = await Reservation.create({
            teacher: teacher1._id, lab: lab2._id,
            roomName: 'Lab B',
            courseName: 'CS201 - Data Structures Lab', courseCode: 'CS201',
            year: 2, semester: '1', section: '1',
            date: tuesday, startTime: '14:00', endTime: '16:00',
            numberOfStudents: 20, status: 'approved', approvedBy: adminTewodros._id, approvedAt: new Date(),
            assignedTechnician: techMike._id
        });

        // Wednesday - CS301
        const wednesday = new Date(monday); wednesday.setDate(monday.getDate() + 2);
        const res3 = await Reservation.create({
            teacher: teacher1._id, lab: lab3._id,
            roomName: 'Lab C',
            courseName: 'CS301 - Database Systems', courseCode: 'CS301',
            year: 3, semester: '1', section: '3',
            date: wednesday, startTime: '10:00', endTime: '12:00',
            numberOfStudents: 28, status: 'approved', approvedBy: adminTewodros._id, approvedAt: new Date(),
            assignedTechnician: techAsme._id
        });

        // Thursday - CS101 Lab
        const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
        await Reservation.create({
            teacher: teacher1._id, lab: lab4._id,
            roomName: 'Lab D',
            courseName: 'CS101 - Programming Lab', courseCode: 'CS101',
            year: 1, semester: '1', section: '4',
            date: thursday, startTime: '09:00', endTime: '11:00',
            numberOfStudents: 25, status: 'approved', approvedBy: adminTewodros._id, approvedAt: new Date(),
            assignedTechnician: techMike._id
        });

        // Friday - CS401
        const friday = new Date(monday); friday.setDate(monday.getDate() + 4);
        await Reservation.create({
            teacher: teacher1._id, lab: lab1._id,
            roomName: 'Lab E',
            courseName: 'CS401 - Software Engineering', courseCode: 'CS401',
            year: 4, semester: '2', section: '2',
            date: friday, startTime: '13:00', endTime: '15:00',
            numberOfStudents: 22, status: 'approved', approvedBy: adminTewodros._id, approvedAt: new Date(),
            assignedTechnician: techAsme._id
        });

        // New sample schedule entries with technicians assigned
        // Wednesday Afternoon - IT Lab B
        await Reservation.create({
            teacher: teacher1._id, 
            lab: tewodrosITLab._id,
            roomId: tewodrosITLab.rooms[1]._id, // Lab B
            roomName: 'Lab B',
            courseName: 'IT202 - Web Development', 
            courseCode: 'IT202',
            year: 2,
            semester: '1',
            date: wednesday, 
            startTime: '14:00', 
            endTime: '17:00',
            numberOfStudents: 35, 
            status: 'approved', 
            approvedBy: adminTewodros._id, 
            approvedAt: new Date(),
            assignedTechnician: techUser._id
        });

        // Thursday Morning - CS Lab D
        await Reservation.create({
            teacher: teacher1._id, 
            lab: tewodrosCSLab._id,
            roomId: tewodrosCSLab.rooms[0]._id, // Lab D
            roomName: 'Lab D',
            courseName: 'CS303 - Operating Systems', 
            courseCode: 'CS303',
            year: 3,
            semester: '2',
            date: thursday, 
            startTime: '08:30', 
            endTime: '11:30',
            numberOfStudents: 30, 
            status: 'approved', 
            approvedBy: adminTewodros._id, 
            approvedAt: new Date(),
            assignedTechnician: techUser._id
        });

        // Last week reservation
        const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
        const res6 = await Reservation.create({
            teacher: teacher1._id, lab: lab2._id,
            courseName: 'CS201 - Algorithms', courseCode: 'CS201',
            date: lastMonday, startTime: '09:00', endTime: '11:00',
            numberOfStudents: 24, status: 'completed', approvedBy: adminTewodros._id, approvedAt: new Date()
        });
        console.log('Created 6 reservations');

        // Create attendance records
        console.log('Creating attendance records...');
        for (const student of students) {
            const statuses = ['present', 'present', 'present', 'late', 'absent'];
            const idx = students.indexOf(student);
            await Attendance.create({
                reservation: res1._id, student: student._id,
                status: statuses[idx], markedBy: teacher1._id,
                checkInTime: ['present', 'late'].includes(statuses[idx]) ? new Date() : null
            });
        }

        for (const student of students) {
            const statuses = ['present', 'present', 'absent', 'present', 'excused'];
            const idx = students.indexOf(student);
            await Attendance.create({
                reservation: res2._id, student: student._id,
                status: statuses[idx], markedBy: teacher1._id,
                checkInTime: statuses[idx] === 'present' ? new Date() : null
            });
        }

        for (const student of students) {
            await Attendance.create({
                reservation: res6._id, student: student._id,
                status: 'present', markedBy: teacher1._id, checkInTime: new Date()
            });
        }
        console.log('Created attendance records');

        console.log('\n========================================');
        console.log('Seed data created successfully!');
        console.log('========================================');
        console.log('\nDefault Login Credentials:');
        console.log('  Campus Admins (per campus):');
        console.log('    - Tewodros Campus: admin / admin123');
        console.log('    - Maraki Campus:   asme / asme123');
        console.log('    - Fasil Campus:   yibe / yibe123');
        console.log('    - GC Campus:     sami / sami123');
        console.log('  Superadmin:       Asmamaw / asme1234');
        console.log('\n  Students/Teachers/Technicians must register first');
        console.log('  and will be approved by campus admin');
        console.log('\nCreated Campuses:');
        console.log(`  - ${campus1.name} (${campus1.code})`);
        console.log(`  - ${campus2.name} (${campus2.code})`);
        console.log(`  - ${campus3.name} (${campus3.code})`);
        console.log(`  - ${campus4.name} (${campus4.code})`);
        console.log('\nCreated Labs by Campus:');
        console.log('  Tewodros: IT Lab, CS Lab, Main Library, Veterinary Library (4 labs)');
        console.log('  Maraki: 5 labs (Lab 1-5)');
        console.log('  Fasil: 6 labs (Lab 1-6)');
        console.log('  GC: 5 labs (Lab 1-5)');
        console.log('  Total: 20 labs with rooms and computer status tracking');
        console.log('========================================\n');

    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
};

// Run seed
seedData();
