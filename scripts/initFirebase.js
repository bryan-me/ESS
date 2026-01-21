require('dotenv').config({ path: '.env.local' });

const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
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
const auth = getAuth(app);
const db = getFirestore(app);

const users = [
  {
    email: 'admin@company.com',
    password: 'password123',
    data: {
      displayName: 'Admin User',
      role: 'admin',
      department: 'IT',
      position: 'System Administrator',
      createdAt: new Date().toISOString()
    }
  },
  {
    email: 'manager@company.com',
    password: 'password123',
    data: {
      displayName: 'John Manager',
      role: 'manager',
      department: 'Operations',
      position: 'Operations Manager',
      createdAt: new Date().toISOString()
    }
  },
  {
    email: 'hr@company.com',
    password: 'password123',
    data: {
      displayName: 'Sarah HR',
      role: 'hr',
      department: 'Human Resources',
      position: 'HR Manager',
      createdAt: new Date().toISOString()
    }
  },
  {
    email: 'employee@company.com',
    password: 'password123',
    data: {
      displayName: 'Jane Employee',
      role: 'employee',
      department: 'Sales',
      position: 'Sales Executive',
      createdAt: new Date().toISOString()
    }
  }
];

const initialLeaveBalance = {
  annual: 15,
  sick: 10,
  maternity: 180,
  unpaid: 999
};

async function createUsers() {
  console.log('Starting user creation...');
  
  for (const user of users) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
      console.log(`✓ Created user: ${user.email}`);
      
      // Create user document
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        ...user.data,
        email: user.email,
        uid: userCredential.user.uid
      });
      
      // Create initial leave balance
      await setDoc(doc(db, 'leaveBalance', userCredential.user.uid), {
        ...initialLeaveBalance,
        updatedAt: new Date().toISOString()
      });
      
      console.log(`✓ Added user data for: ${user.email}`);
      
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`⚠ User ${user.email} already exists, updating data...`);
        
        // Find existing user by email (you'd need to query users collection in real scenario)
        // For now, we'll just note it exists
      } else {
        console.error(`✗ Error creating user ${user.email}:`, error.message);
      }
    }
  }
  
  console.log('\n✅ User creation complete!');
  console.log('\nTest credentials:');
  console.log('----------------');
  users.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${user.password}`);
    console.log(`Role: ${user.data.role}`);
    console.log('---');
  });
  
  process.exit(0);
}

createUsers();
