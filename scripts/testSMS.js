const twilio = require('twilio');
require('dotenv').config();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testSMS() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const testPhone = process.env.SUPERADMIN_PHONE || '0928886341';

    console.log('Twilio Configuration:');
    console.log('- Account SID:', accountSid ? accountSid.substring(0, 8) + '...' : 'MISSING');
    console.log('- Auth Token:', authToken ? '***' : 'MISSING');
    console.log('- Messaging Service SID:', messagingServiceSid ? messagingServiceSid.substring(0, 8) + '...' : 'MISSING');
    console.log('- Verify Service SID:', verifyServiceSid ? verifyServiceSid.substring(0, 8) + '...' : 'MISSING');
    console.log('- From Number:', fromNumber || 'MISSING');
    console.log('- Test Phone:', testPhone);

    let formattedPhone = testPhone.replace(/[^\d+]/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '+251' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('9') && !formattedPhone.startsWith('+')) {
        formattedPhone = '+251' + formattedPhone;
    } else if (formattedPhone.startsWith('251') && !formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
    }
    console.log('- Formatted Phone:', formattedPhone);

    if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
        console.error('\nERROR: Twilio credentials are missing in .env file!');
        console.error('Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID.');
        process.exit(1);
    }

    try {
        const client = twilio(accountSid, authToken);

        if (verifyServiceSid) {
            const verification = await client.verify.v2
                .services(verifyServiceSid)
                .verifications
                .create({ to: formattedPhone, channel: 'sms' });

            console.log('\nTwilio Verify request accepted.');
            console.log('Verification SID:', verification.sid);
            console.log('Status:', verification.status);
            console.log('To:', formattedPhone);
            return;
        }

        const messagePayload = {
            body: 'Test SMS from CLM System - Your verification code is: 123456',
            to: formattedPhone
        };

        if (fromNumber) {
            messagePayload.from = fromNumber;
        } else {
            messagePayload.messagingServiceSid = messagingServiceSid;
        }

        const message = await client.messages.create(messagePayload);

        console.log('\nSMS accepted by Twilio.');
        console.log('Message SID:', message.sid);
        console.log('Initial Status:', message.status);
        console.log('To:', formattedPhone);

        await sleep(10000);
        const latest = await client.messages(message.sid).fetch();
        console.log('\nDelivery check:');
        console.log('Status:', latest.status);
        console.log('Error Code:', latest.errorCode || 'none');
        console.log('Error Message:', latest.errorMessage || 'none');

        if (latest.status === 'failed' || latest.status === 'undelivered' || latest.errorCode) {
            console.error('\nSMS was not delivered.');
            if (latest.errorCode === 21704) {
                console.error('Twilio error 21704: the Messaging Service contains no phone numbers.');
                console.error('Add an SMS-capable sender to the Messaging Service, or set TWILIO_PHONE_NUMBER in backend/.env.');
            }
            process.exit(1);
        }

        console.log('\nSMS did not fail during the delivery check window.');
    } catch (error) {
        console.error('\nFailed to send SMS:');
        console.error('Code:', error.code);
        console.error('Message:', error.message);
        console.error('Status:', error.status);
        console.error('More info:', error.moreInfo);
        process.exit(1);
    }
}

testSMS();
