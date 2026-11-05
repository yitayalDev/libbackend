require('dotenv').config();
const mongoose = require('mongoose');

if (process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: dropDb.js cannot be executed in production environment!');
  process.exit(1);
}

if (process.env.CONFIRM_DROP_DATABASE !== 'YES_DELETE_ALL_DATA') {
  console.error('Safety abort: To drop the database in development, set CONFIRM_DROP_DATABASE=YES_DELETE_ALL_DATA in your environment.');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await mongoose.connection.db.dropDatabase();
    console.log('Database dropped successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });