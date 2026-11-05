const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initializeBot } = require('./services/telegramBot');

// Load environment variables (ensure backend/.env is used)
dotenv.config({ path: path.join(__dirname, '.env') });

// Verify JWT_SECRET security on startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
        console.error('\n[FATAL SECURITY ERROR] You cannot run in production with the default placeholder JWT_SECRET.');
        console.error('Please generate a secure random 64-character string and set JWT_SECRET in backend/.env.\n');
        process.exit(1);
    } else {
        console.warn('\n[SECURITY WARNING] Using default placeholder JWT_SECRET. Do NOT use this in production!\n');
    }
}


// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const labRoutes = require('./routes/labs');
const bookingRoutes = require('./routes/bookings');
const reservationRoutes = require('./routes/reservations');
const maintenanceRoutes = require('./routes/maintenance');
const inventoryRoutes = require('./routes/inventory');
const reportRoutes = require('./routes/reports');
const materialRoutes = require('./routes/materials');
const attendanceRoutes = require('./routes/attendance');
const superadminRoutes = require('./routes/superadmin');
const notificationRoutes = require('./routes/notifications');
const settingsRoutes = require('./routes/settings');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security Headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(s => s.trim().replace(/\/$/, ''))
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/$/, '');
        
        // Allow configured origins, any onrender.com deployment, or localhost
        const isAllowed = allowedOrigins.includes(cleanOrigin) ||
                          cleanOrigin.endsWith('.onrender.com') ||
                          cleanOrigin.includes('localhost') ||
                          cleanOrigin.includes('127.0.0.1');

        if (isAllowed || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from origin: ${origin}`);
            callback(new Error('Blocked by CORS policy'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', generalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // max 20 login/auth attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts, please try again in 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/verify-reset-code', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/reset-password-by-phone', authLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Request logging for debugging
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Database connection with MongoDB Atlas only
const startServer = async () => {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error('MONGODB_URI is required. Set backend/.env MONGODB_URI before starting the server.');
    }

    // Redact password from console output
    const safeRedactedUri = typeof mongoUri === 'string'
        ? mongoUri.replace(/(mongodb(\+srv)?:\/\/)([^:/@]+):([^@]+)@/, '$1$3:***@')
        : '[URI configured]';
    console.log('Connecting to MongoDB Atlas (credentials redacted):', safeRedactedUri);

    mongoose.set('strictQuery', false);

    mongoose.connection.on('connected', () => {
        console.log('Mongoose connected to MongoDB Atlas');
    });
    mongoose.connection.on('error', (connErr) => {
        console.error('Mongoose connection error event:', connErr);
    });

    try {
        await mongoose.connect(mongoUri, {
            autoIndex: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 60000,
            retryWrites: true,
            retryReads: true,
        });
        console.log('Connected to MongoDB');

        // Only seed data if explicitly enabled or in development when database is empty
        if (process.env.SEED_DATABASE === 'true' || process.env.NODE_ENV === 'development') {
            await seedData();
        } else {
            console.log('Skipping auto-seed (production mode). Set SEED_DATABASE=true if initial seed is needed.');
        }

        // Initialize Telegram Bot
        await initializeBot();
    } catch (err) {
        // Better diagnostics for mongodb+srv DNS/SRV failures
        const isSrvDnsTimeout =
            err &&
            (err.code === 'ETIMEOUT' ||
                err.message?.includes('querySrv') ||
                err.message?.includes('_mongodb._tcp'));

        console.error('MongoDB connection error:', err);

        if (isSrvDnsTimeout) {
            const reducedUri = typeof mongoUri === 'string'
                ? mongoUri.replace(/(mongodb\+srv:\/\/)([^:/@]+):([^@]+)@/, '$1$2:***@')
                : mongoUri;

            console.error('\n[MongoDB Atlas Diagnostics]');
            console.error('MONGODB_URI (redacted):', reducedUri);
            console.error('- Error looks like mongodb+srv SRV DNS timeout (querySrv).');
            console.error('- Verify your public IP is allowlisted in Atlas Network Access (you said it is).');
            console.error('- If you use VPN/proxy/corporate network, try switching networks or disabling proxy/VPN.');
            console.error('- Confirm DNS/SRV lookups are allowed from this machine.');
            console.error('- If possible, use the non-srv connection string instead of mongodb+srv://.');
            console.error('');

            // Optional fallback: allow using non-srv URI when SRV fails
            const fallbackUri = process.env.MONGODB_URI_NON_SRV;
            if (fallbackUri) {
                console.warn('MONGODB_URI_NON_SRV is set; attempting fallback connection...');
                try {
                    await mongoose.connect(fallbackUri, {
                        autoIndex: true,
                        maxPoolSize: 10,
                        serverSelectionTimeoutMS: 30000,
                        socketTimeoutMS: 60000,
                        retryWrites: true,
                        retryReads: true,
                    });
                    console.log('Connected to MongoDB using MONGODB_URI_NON_SRV');
                    await seedData();
                    await initializeBot();
                    return; // continue starting API
                } catch (fallbackErr) {
                    console.error('Fallback MongoDB connection also failed:', fallbackErr);
                }
            }
        }

        process.exit(1);
    }
};

// Seed data function
async function seedData() {
    const User = require('./models/User');
    const Campus = require('./models/Campus');
    const Lab = require('./models/Lab');
    const Reservation = require('./models/Reservation');
    const Attendance = require('./models/Attendance');

    try {
        // Check if users exist
        let admin, teacher;
        const existingAdmin = await User.findOne({ username: 'admin' });
        const existingTeacher = await User.findOne({ username: 'teacher' });

        if (!existingAdmin) {
            console.log('Seeding campuses and users...');
            
            // Create campuses first
            await Campus.create({ name: 'Maraki', code: 'MAR', city: 'Gondar', isActive: true });
            await Campus.create({ name: 'Atse Tewodros', code: 'ATW', city: 'Gondar', isActive: true });
            await Campus.create({ name: 'Atse Fasil', code: 'ATF', city: 'Gondar', isActive: true });
            await Campus.create({ name: 'Health Science College (GC)', code: 'HSC', city: 'Gondar', isActive: true });
            console.log('Created 4 campuses');

            // Create campus admins
            await User.create({
                username: 'admin',
                email: 'tewodros.admin@clm.edu',
                password: 'admin123',
                firstName: 'Tewodros',
                lastName: 'Campus Admin',
                name: 'Tewodros Campus Admin',
                role: 'admin',
                campus: 'Atse Tewodros',
                isActive: true,
                approvalStatus: 'approved'
            });

            await User.create({
                username: 'asme',
                email: 'maraki.admin@clm.edu',
                password: 'asme123',
                firstName: 'Maraki',
                lastName: 'Campus Admin',
                name: 'Maraki Campus Admin',
                role: 'admin',
                campus: 'Maraki',
                isActive: true,
                approvalStatus: 'approved'
            });

            await User.create({
                username: 'yibe',
                email: 'fasil.admin@clm.edu',
                password: 'yibe123',
                firstName: 'Fasil',
                lastName: 'Campus Admin',
                name: 'Fasil Campus Admin',
                role: 'admin',
                campus: 'Atse Fasil',
                isActive: true,
                approvalStatus: 'approved'
            });

            await User.create({
                username: 'sami',
                email: 'gc.admin@clm.edu',
                password: 'sami123',
                firstName: 'GC',
                lastName: 'Campus Admin',
                name: 'GC Campus Admin',
                role: 'admin',
                campus: 'Health Science College (GC)',
                isActive: true,
                approvalStatus: 'approved'
            });

            // Create superadmin
            await User.create({
                username: 'asmamaw',
                email: 'asmamaw@clm.edu',
                password: 'asme1234',
                firstName: 'Asmamaw',
                lastName: 'Super Administrator',
                name: 'Asmamaw - Super Administrator',
                role: 'superadmin',
                phone: '+251928886341',
                isActive: true,
                approvalStatus: 'approved'
            });
            console.log('Created admin users: admin, asme, yibe, sami, asmamaw');

            teacher = await User.create({
                username: 'teacher',
                email: 'teacher@clm.edu',
                password: 'Teacher@123',
                firstName: 'Jane',
                lastName: 'Smith',
                name: 'Dr. Jane Smith',
                role: 'teacher',
                department: 'Computer Science',
                isActive: true,
                approvalStatus: 'approved'
            });

            await User.create({
                username: 'student',
                email: 'student@clm.edu',
                password: 'Student@123',
                firstName: 'John',
                lastName: 'Student',
                name: 'John Student',
                role: 'student',
                studentId: 'GUR/00001/20',
                year: 2,
                semester: 1,
                department: 'Computer Science',
                isActive: true,
                approvalStatus: 'approved'
            });

            await User.create({
                username: 'technician',
                email: 'tech@clm.edu',
                password: 'Tech@123',
                firstName: 'Tech',
                lastName: 'Mike',
                name: 'Tech Mike',
                role: 'technician',
                isActive: true,
                approvalStatus: 'approved'
            });
        } else {
            admin = existingAdmin;
            teacher = existingTeacher;
        }

        // Always ensure extra students exist
        const studentEmails = ['student2@clm.edu', 'student3@clm.edu', 'student4@clm.edu', 'student5@clm.edu'];
        const studentNames = ['Alice Johnson', 'Bob Williams', 'Carol Davis', 'David Brown'];
        const studentFirstNames = ['Alice', 'Bob', 'Carol', 'David'];
        const studentLastNames = ['Johnson', 'Williams', 'Davis', 'Brown'];
        const studentIds = ['GUR/00002/20', 'GUR/00003/20', 'GUR/00004/20', 'GUR/00005/20'];
        const students = [];

        for (let i = 0; i < studentEmails.length; i++) {
            let s = await User.findOne({ email: studentEmails[i] });
            if (!s) {
                s = await User.create({
                    username: studentEmails[i].split('@')[0],
                    email: studentEmails[i],
                    password: 'Student@123',
                    firstName: studentFirstNames[i],
                    lastName: studentLastNames[i],
                    name: studentNames[i],
                    role: 'student',
                    studentId: studentIds[i],
                    year: (i % 4) + 1,
                    semester: (i % 2) + 1,
                    department: i < 3 ? 'Computer Science' : 'Information Technology',
                    isActive: true,
                    approvalStatus: 'approved'
                });
            }
            students.push(s);
        }

        // Also get existing student
        const mainStudent = await User.findOne({ username: 'student' });
        if (mainStudent) students.unshift(mainStudent);

        // Ensure Telegram Bot user exists
        let botUser = await User.findOne({ username: 'telegram_bot' });
        if (!botUser) {
            botUser = await User.create({
                username: 'telegram_bot',
                email: 'telegram_bot@clm.edu',
                password: 'TelegramBot123!',
                firstName: 'Telegram',
                lastName: 'Bot',
                name: 'Telegram Bot',
                role: 'student',
                isActive: true,
                approvalStatus: 'approved'
            });
            console.log('Telegram bot user created');
        }

        // Always ensure labs exist
        let lab1 = await Lab.findOne({ code: 'LAB-A101' });
        if (!lab1) {
            lab1 = await Lab.create({
                name: 'Computer Lab A',
                code: 'LAB-A101',
                campus: 'Atse Tewodros',
                location: { building: 'Science Block', floor: '1st Floor', roomNumber: 'A101' },
                capacity: 30,
                facilities: ['projector', 'whiteboard', 'ac', 'internet'],
                openingHours: {
                    monday: { open: '08:00', close: '18:00' },
                    tuesday: { open: '08:00', close: '18:00' },
                    wednesday: { open: '08:00', close: '18:00' },
                    thursday: { open: '08:00', close: '18:00' },
                    friday: { open: '08:00', close: '17:00' },
                    saturday: { open: '09:00', close: '13:00' },
                    sunday: { open: 'closed', close: 'closed' }
                }
            });
        }

        let lab2 = await Lab.findOne({ code: 'LAB-B202' });
        if (!lab2) {
            lab2 = await Lab.create({
                name: 'Programming Lab B',
                code: 'LAB-B202',
                campus: 'Atse Tewodros',
                location: { building: 'Science Block', floor: '2nd Floor', roomNumber: 'B202' },
                capacity: 25,
                facilities: ['projector', 'whiteboard', 'ac', 'internet', 'printer'],
                openingHours: {
                    monday: { open: '08:00', close: '20:00' },
                    tuesday: { open: '08:00', close: '20:00' },
                    wednesday: { open: '08:00', close: '20:00' },
                    thursday: { open: '08:00', close: '20:00' },
                    friday: { open: '08:00', close: '18:00' },
                    saturday: { open: '09:00', close: '15:00' },
                    sunday: { open: 'closed', close: 'closed' }
                }
            });
        }

        // Always ensure reservations exist
        const reservationCount = await Reservation.countDocuments();
        if (reservationCount === 0 && teacher && admin) {
            console.log('Seeding reservations and attendance...');

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

            // Monday - CS101
            const res1 = await Reservation.create({
                teacher: teacher._id,
                lab: lab1._id,
                courseName: 'CS101 - Introduction to Programming',
                courseCode: 'CS101',
                date: new Date(monday),
                startTime: '09:00',
                endTime: '11:00',
                numberOfStudents: 25,
                status: 'approved',
                approvedBy: admin._id,
                approvedAt: new Date()
            });

            // Tuesday - CS201 Lab
            const tuesday = new Date(monday);
            tuesday.setDate(monday.getDate() + 1);
            const res2 = await Reservation.create({
                teacher: teacher._id,
                lab: lab2._id,
                courseName: 'CS201 - Data Structures Lab',
                courseCode: 'CS201',
                date: tuesday,
                startTime: '14:00',
                endTime: '16:00',
                numberOfStudents: 20,
                status: 'approved',
                approvedBy: admin._id,
                approvedAt: new Date()
            });

            // Wednesday - CS301
            const wednesday = new Date(monday);
            wednesday.setDate(monday.getDate() + 2);
            await Reservation.create({
                teacher: teacher._id,
                lab: lab1._id,
                courseName: 'CS301 - Database Systems',
                courseCode: 'CS301',
                date: wednesday,
                startTime: '10:00',
                endTime: '12:00',
                numberOfStudents: 28,
                status: 'approved',
                approvedBy: admin._id,
                approvedAt: new Date()
            });

            // Thursday - CS101 Lab (pending)
            const thursday = new Date(monday);
            thursday.setDate(monday.getDate() + 3);
            await Reservation.create({
                teacher: teacher._id,
                lab: lab2._id,
                courseName: 'CS101 - Programming Lab',
                courseCode: 'CS101',
                date: thursday,
                startTime: '09:00',
                endTime: '11:00',
                numberOfStudents: 25,
                status: 'pending'
            });

            // Friday - CS401
            const friday = new Date(monday);
            friday.setDate(monday.getDate() + 4);
            await Reservation.create({
                teacher: teacher._id,
                lab: lab1._id,
                courseName: 'CS401 - Software Engineering',
                courseCode: 'CS401',
                date: friday,
                startTime: '13:00',
                endTime: '15:00',
                numberOfStudents: 22,
                status: 'approved',
                approvedBy: admin._id,
                approvedAt: new Date()
            });

            // Last week reservation
            const lastMonday = new Date(monday);
            lastMonday.setDate(monday.getDate() - 7);
            const res6 = await Reservation.create({
                teacher: teacher._id,
                lab: lab1._id,
                courseName: 'CS201 - Algorithms',
                courseCode: 'CS201',
                date: lastMonday,
                startTime: '09:00',
                endTime: '11:00',
                numberOfStudents: 24,
                status: 'completed',
                approvedBy: admin._id,
                approvedAt: new Date()
            });

            // Create attendance records
            const presentStudents = students.slice(0, 5);
            for (const student of presentStudents) {
                const statuses = ['present', 'present', 'present', 'late', 'absent'];
                const idx = presentStudents.indexOf(student);
                await Attendance.create({
                    reservation: res1._id,
                    student: student._id,
                    status: statuses[idx],
                    markedBy: teacher._id,
                    checkInTime: ['present', 'late'].includes(statuses[idx]) ? new Date() : null
                });
            }

            for (const student of presentStudents) {
                const statuses = ['present', 'present', 'absent', 'present', 'excused'];
                const idx = presentStudents.indexOf(student);
                await Attendance.create({
                    reservation: res2._id,
                    student: student._id,
                    status: statuses[idx],
                    markedBy: teacher._id,
                    checkInTime: statuses[idx] === 'present' ? new Date() : null
                });
            }

            for (const student of presentStudents) {
                await Attendance.create({
                    reservation: res6._id,
                    student: student._id,
                    status: 'present',
                    markedBy: teacher._id,
                    checkInTime: new Date()
                });
            }

            console.log('Reservations and attendance seeded!');
        }

        console.log('Seed data ready!');
        console.log('Login: admin / admin123');
    } catch (error) {
        console.error('Seed error:', error);
    }
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes); // Fallback if client calls without /api
app.use('/api/users', userRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);

// Serve frontend static files only if they exist in the directory (unified deployment)
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));

    // Handle React SPA routing, return index.html for non-API requests
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
            return next();
        }
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
} else {
    // Standalone Backend API root
    app.get('/', (req, res) => {
        res.json({
            message: 'CLM Backend API is running successfully',
            status: 'online',
            environment: process.env.NODE_ENV || 'production',
            health: '/api/health'
        });
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('Health check hit from:', req.headers.origin);
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Client-side log endpoint
app.post('/api/logs/client-error', (req, res) => {
    const { level, message, meta, timestamp } = req.body;
    const logEntry = `[${timestamp || new Date().toISOString()}] [CLIENT-${level}] ${message} | ${JSON.stringify(meta)}\n`;
    
    const fs = require('fs');
    const logDir = path.join(__dirname, 'logs');
    const logPath = path.join(logDir, 'client-error.log');
    
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, logEntry);
    res.json({ success: true });
});

// Test endpoint for CORS
app.options('*', (req, res) => {
    console.log('OPTIONS request:', req.path);
    res.status(204).end();
});

app.get('/api/test', (req, res) => {
    console.log('Test endpoint hit from:', req.headers.origin);
    res.json({ message: 'API is working', method: 'GET' });
});

app.patch('/api/test-patch', (req, res) => {
    console.log('Test PATCH endpoint hit from:', req.headers.origin);
    console.log('Body:', req.body);
    res.json({ message: 'PATCH works', received: req.body });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

startServer().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
});

module.exports = app;
