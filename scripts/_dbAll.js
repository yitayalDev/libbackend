const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[OK] DB connected');

  require('../models/User');
  require('../models/Lab');
  require('../models/Booking');
  const Booking = mongoose.model('Booking');
  const User = mongoose.model('User');

  // 1. Any bookings at all?
  const count = await Booking.countDocuments({});
  console.log('Total bookings in DB:', count);

  // 2. First 5 bookings (raw _id only)
  const five = await Booking.find({}).limit(5).select('_id user lab status');
  console.log('First 5 bookings:', JSON.stringify(five.map(b => ({
    id: b._id, user: b.user?.toString(), lab: b.lab?.toString(), status: b.status
  })), null, 2));

  // 3. Try deleting one of them (the first) using a superadmin user
  if (five.length) {
    const super = await User.findOne({ role: 'superadmin' });
    if (!super) { console.log('No superadmin'); await mongoose.disconnect(); process.exit(); }
    console.log('Superadmin:', super._id.toString());

    const b = await Booking.findById(five[0]._id).populate('lab').populate('user');
    console.log('Deleting booking:', b._id, 'lab:', b.lab?.name, 'owner:', b.user?._id);

    try {
      const r = await Booking.deleteOne({ _id: b._id });
      console.log('MongoDB deleteOne result:', JSON.stringify(r));
    } catch (e) {
      console.error('deleteOne threw:', e.message);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
})();
