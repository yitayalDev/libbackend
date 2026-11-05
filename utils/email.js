const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: (process.env.SMTP_PASS || '').replace(/\s+/g, '')
        }
    });
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} resetToken - Password reset token
 * @param {string} username - Username
 */
const sendPasswordResetEmail = async (email, resetToken, username) => {
    // Check if SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('\n=================================================');
        console.log('Password Reset Link (Email not configured):');
        console.log(`http://localhost:5173/reset-password?token=${resetToken}`);
        console.log('=================================================\n');
        return { success: true };
    }

    try {
        const transporter = createTransporter();
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

        console.log(`\n[Email] Sending password reset to: ${email}`);
        console.log(`[Email] Reset URL: ${resetUrl}\n`);

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Password Reset Request - CLM System',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e3a8a;">Password Reset Request</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>You requested a password reset for the CLM System. Click the button below to reset your password:</p>
        <div style="margin: 20px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 14px;">This link will expire in 1 hour.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px;">If you didn't request this, please ignore this email or contact support.</p>
        </div>
      `
        });

        console.log('[Email] Password reset email sent successfully!');
        return { success: true };
    } catch (error) {
        console.error('[Email] Sending failed:', error.message);

        // Keep old behavior for reset link flow
        console.log('\n=================================================');
        console.log('Password Reset Link (Email failed - using fallback):');
        console.log(`http://localhost:5173/reset-password?token=${resetToken}`);
        console.log('=================================================\n');

        return { success: true };
    }
};

/**
 * Send verification code via email (for password reset with code)
 * @param {string} email - User email
 * @param {string} verificationCode - 6-digit verification code
 * @param {string} username - Username
 */
const sendVerificationCodeEmail = async (email, verificationCode, username) => {
    // IMPORTANT: Do not claim "sent" when SMTP isn't configured.
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('\n=================================================');
        console.log('Verification Code NOT sent - SMTP not configured');
        console.log(`Code (dev only): ${verificationCode}`);
        console.log('=================================================\n');

        return {
            success: false,
            message: 'Email service is not configured on the server. Please try again later.'
        };
    }

    try {
        const transporter = createTransporter();

        console.log(`\n[Email] Sending verification code to: ${email}`);
        console.log(`[Email] Code: ${verificationCode}\n`);

        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Your Password Reset Verification Code - CLM System',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e3a8a;">Password Reset Verification Code</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>Your verification code for password reset is:</p>
        <div style="margin: 20px 0; padding: 20px; background: #f3f4f6; border-radius: 8px; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a8a;">${verificationCode}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This code will expire in 10 minutes.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px;">If you didn't request this, please ignore this email or contact support.</p>
        </div>
      `
        });

        console.log('[Email] Verification code sent successfully!');
        return { success: true };
    } catch (error) {
        // Log full error server-side for debugging (do NOT expose raw error to frontend)
        console.error('[Email] Sending failed:', {
            message: error?.message,
            name: error?.name,
            code: error?.code,
            responseCode: error?.responseCode,
            stack: error?.stack
        });

        const errorCode = error?.code || error?.responseCode || 'SMTP_SEND_FAILED';

        return {
            success: false,
            message: 'Failed to send verification email. Please try again later.',
            errorCode,
            debug: process.env.NODE_ENV !== 'production' ? {
                name: error?.name,
                code: error?.code,
                responseCode: error?.responseCode
            } : undefined
        };
    }
};


module.exports = {
    sendPasswordResetEmail,
    sendVerificationCodeEmail
};

