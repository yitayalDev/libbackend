const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    firstName: {
        type: String,
        trim: true,
        match: [/^[a-zA-Z\s'-]*$/, 'First name can only contain letters, spaces, hyphens, and apostrophes']
    },
    lastName: {
        type: String,
        trim: true,
        match: [/^[a-zA-Z\s'-]*$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes']
    },
    name: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        enum: ['student', 'teacher', 'technician', 'admin', 'superadmin'],
        default: 'student'
    },
    studentId: {
        type: String,
        sparse: true,
        trim: true,
        validate: {
            validator: function(v) {
                if (!v) return true;
                return /^UOG\/\d{3,5}\/\d{2,3}$/.test(v);
            },
            message: 'Student ID must be in format UOG/XX/XX or UOG/XXXX/XX (e.g., UOG/2020/17)'
        }
    },
    year: {
        type: Number,
        min: 1,
        max: 5
    },
    semester: {
        type: Number,
        min: 1,
        max: 8
    },
    department: {
        type: String,
        trim: true
    },
    campus: {
        type: String,
        trim: true
    },
    college: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    photoUrl: {
        type: String,
        trim: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        sparse: true
    },
    isActive: {
        type: Boolean,
        default: false
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    lastLogin: {
        type: Date
    },
    passwordResetToken: {
        type: String
    },
    passwordResetExpires: {
        type: Date
    },
    verificationCode: {
        type: String
    },
    verificationCodeExpires: {
        type: Date
    },
    phoneResetVerified: {
        type: Boolean,
        default: false
    },
    phoneResetVerifiedExpires: {
        type: Date
    },
    emailResetVerified: {
        type: Boolean,
        default: false
    },
    emailResetVerifiedExpires: {
        type: Date
    }
}, {
    timestamps: true
});

// Pre-save hook to generate name from firstName and lastName
userSchema.pre('save', function(next) {
    if (this.firstName && this.lastName) {
        this.name = `${this.firstName} ${this.lastName}`;
    }
    next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
    const userObject = this.toObject();
    delete userObject.password;
    delete userObject.passwordResetToken;
    delete userObject.passwordResetExpires;
    return userObject;
};

module.exports = mongoose.model('User', userSchema);
