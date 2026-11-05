const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });


console.log('SMTP env present?:', {
  SMTP_USER_present: !!process.env.SMTP_USER,
  SMTP_PASS_present: !!process.env.SMTP_PASS,
  SMTP_HOST: process.env.SMTP_HOST || null,
  SMTP_PORT: process.env.SMTP_PORT || null,
  FRONTEND_URL: process.env.FRONTEND_URL || null
});

