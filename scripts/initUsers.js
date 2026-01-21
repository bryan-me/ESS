require('dotenv').config({ path: '.env.local' });

const { initializeApp } = require('firebase/app');
const { getFirestore, setDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const users = [
  {
    uid: 'YOUR_ADMIN_UID_HERE', // Get from Firebase Console → Authentication → Users
    email: 'admin@company.com',
    displayName: 'Admin User',
    role: 'admin',
    department: 'IT',
    position: 'System Administrator',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    uid: 'YOUR_MANAGER_UID_HERE',
    email: 'manager@company.com',
    displayName: 'John Manager',
    role: 'manager',
    department: 'Operations',
    position: 'Operations Manager',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    uid: 'YOUR_EMPLOYEE_UID_HERE',
    email: 'employee@company.com',
    displayName: 'Jane Employee',
    role: 'employee',
    department: 'Sales',
    position: 'Sales Executive',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

async function initUsers() {
  console.log('Initializing users in Firestore...');
  
  for (const user of users) {
    if (user.uid.includes('YOUR_')) {
      console.log(`⚠ Skipping ${user.email} - need to replace UID`);
      continue;
    }
    
    try {
      await setDoc(doc(db, 'users', user.uid), user);
      console.log(`✅ Created user: ${user.email} (${user.role})`);
    } catch (error) {
      console.error(`❌ Error creating user ${user.email}:`, error.message);
    }
  }
  
  console.log('\n🎉 User initialization complete!');
  console.log('\n📝 Next: Get UIDs from Firebase Console → Authentication → Users');
  process.exit(0);
}

initUsers();
