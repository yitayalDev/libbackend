const { sendVerificationCodeEmail } = require('../utils/email');

(async () => {
  try {
    const testEmail = process.env.TEST_EMAIL || 'example@example.com';
    const testCode = '123456';
    const username = 'debug-user';

    console.log('[testEmailVerification] SMTP env present:', {
      SMTP_USER_present: !!process.env.SMTP_USER,
      SMTP_PASS_present: !!process.env.SMTP_PASS,
      SMTP_HOST: process.env.SMTP_HOST || null,
      SMTP_PORT: process.env.SMTP_PORT || null,
      NODE_ENV: process.env.NODE_ENV || null
    });

    const result = await sendVerificationCodeEmail(testEmail, testCode, username);
    console.log('[testEmailVerification] Result:', result);
  } catch (err) {
    console.error('[testEmailVerification] Threw:', err);
    process.exit(1);
  }
})();

