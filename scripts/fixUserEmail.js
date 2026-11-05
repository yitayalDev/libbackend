const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    // Step 1: Update email using updateOne (bypasses validators)
    const r = await mongoose.connection.db.collection('users').updateOne(
        { username: 'Asme_deg88' },
        { $set: { email: 'asmedeg2888@gmail.com' } }
    );
    console.log('updateOne result - matched:', r.matchedCount, 'modified:', r.modifiedCount);

    // Step 2: Confirm the change
    const User = require(path.join(__dirname, '..', 'models', 'User'));
    const u = await User.findOne({ username: 'Asme_deg88' });
    console.log('User after change:', u ? { username: u.username, email: u.email, role: u.role } : 'NOT FOUND');

    mongoose.disconnect();
}).catch(e => console.log('ERR:', e.message));
