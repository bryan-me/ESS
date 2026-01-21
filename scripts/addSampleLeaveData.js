require('dotenv').config({ path: '.env.local' });

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, setDoc, doc } = require('firebase/firestore');

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

// Get user UIDs from your Firebase Authentication
// Replace these with actual user UIDs
const employeeUid = 'REPLACE_WITH_EMPLOYEE_UID';
const managerUid = 'REPLACE_WITH_MANAGER_UID';

const sampleLeaveRequests = [
  {
    type: 'annual',
    startDate: '2024-01-15',
    endDate: '2024-01-17',
    days: 3,
    reason: 'Family vacation',
    status: 'approved',
    employeeId: employeeUid,
    employeeName: 'Jane Employee',
    employeeEmail: 'employee@company.com',
    department: 'Sales',
    managerId: managerUid,
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-10T10:00:00Z'
  },
  {
    type: 'sick',
    startDate: '2024-02-01',
    endDate: '2024-02-02',
    days: 2,
    reason: 'Flu',
    status: 'pending',
    employeeId: employeeUid,
    employeeName: 'Jane Employee',
    employeeEmail: 'employee@company.com',
    department: 'Sales',
    managerId: '',
    createdAt: '2024-01-28T14:30:00Z',
    updatedAt: '2024-01-28T14:30:00Z'
  }
];

const leaveBalance = {
  annual: 12, // 15 original - 3 used
  sick: 10,
  maternity: 180,
  unpaid: 999,
  updatedAt: new Date().toISOString()
};

async function addSampleData() {
  if (employeeUid.includes('REPLACE') || managerUid.includes('REPLACE')) {
    console.log('⚠ Please replace UIDs with actual user UIDs from Firebase Authentication');
    console.log('Get UIDs from Firebase Console → Authentication → Users');
    process.exit(1);
  }

  console.log('Adding sample leave data to Firestore...');
  
  try {
    // Add leave balance
    await setDoc(doc(db, 'leaveBalance', employeeUid), leaveBalance);
    console.log('✅ Added leave balance');
    
    // Add sample leave requests
    for (const request of sampleLeaveRequests) {
      const docRef = await addDoc(collection(db, 'leaveRequests'), request);
      console.log(`✅ Added leave request: ${request.type} leave from ${request.startDate} to ${request.endDate}`);
    }
    
    console.log('\n🎉 Sample leave data added!');
    console.log('\n📋 Test with:');
    console.log('Employee login: employee@company.com / password123');
    console.log('Manager login: manager@company.com / password123');
    
  } catch (error) {
    console.error('❌ Error adding sample data:', error.message);
  }
  
  process.exit(0);
}

addSampleData();
