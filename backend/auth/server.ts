import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import app from './app.js';
import { User } from './models/User.js';

const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecolinkr_auth';

async function seedAdminUser() {
  try {
    const adminExists = await User.findOne({ role: 'ADMIN' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456', salt);

      const admin = new User({
        fullName: 'EcoLinkr Administrator',
        email: (process.env.DEFAULT_ADMIN_EMAIL || 'admin@ecolinkr.com').toLowerCase(),
        phone: '+919999999999',
        password: hashedPassword,
        role: 'ADMIN',
        preferredLanguage: 'en',
        address: 'EcoLinkr HQ, Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        isVerified: true,
        verificationStatus: 'VERIFIED',
        isActive: true,
        isTest: false,
      });

      await admin.save();
      console.log('Default administrator account initialized (admin@ecolinkr.com)');
    }
  } catch (err) {
    console.error('Error seeding default admin:', err);
  }
}

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`Auth service connected to MongoDB at ${MONGODB_URI}`);

    await seedAdminUser();

    app.listen(PORT, () => {
      console.log(`Auth service is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start Auth service:', err);
    process.exit(1);
  }
}

start();
