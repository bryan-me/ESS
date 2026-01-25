const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Update the Cloud Function reset logic
exports.resetAnnualLeaveBalances = functions.pubsub
  .schedule('0 0 1 1 *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    
    try {
      console.log('Starting annual leave balance reset...');
      const usersSnapshot = await db.collection('users').get();
      const currentYear = new Date().getFullYear();
      
      console.log(`Processing ${usersSnapshot.size} users for year ${currentYear}`);
      
      const updatePromises = usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        const userId = userDoc.id;
        let hireDate = null;
        
        // Parse hireDate from various formats
        if (userData.hireDate) {
          if (typeof userData.hireDate === 'string') {
            hireDate = new Date(userData.hireDate);
          } else if (userData.hireDate.toDate) {
            hireDate = userData.hireDate.toDate();
          } else if (userData.hireDate.seconds) {
            hireDate = new Date(userData.hireDate.seconds * 1000);
          } else {
            hireDate = new Date(userData.hireDate);
          }
        }
        
        let annualDays = 21; // Default full entitlement
        
        // If user has a hire date and was hired this year, pro-rate the leave
        if (hireDate && !isNaN(hireDate.getTime()) && hireDate.getFullYear() === currentYear) {
          const monthsRemaining = 12 - hireDate.getMonth();
          annualDays = Math.round((21 / 12) * monthsRemaining);
          annualDays = Math.max(1, annualDays); // Minimum 1 day
          console.log(`User ${userId} hired in ${hireDate.getMonth()+1}/${hireDate.getFullYear()}, prorated to ${annualDays} days`);
        } else {
          console.log(`User ${userId} gets full entitlement: ${annualDays} days`);
        }
        
        // Update with complete structure
        await db.collection('leaveBalance').doc(userId).set({
          annual: annualDays,
          sick: 10,
          maternity: 180,
          unpaid: 999,
          personal: 0,
          totalDaysAccounted: 0,
          updatedAt: new Date().toISOString(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          lastAutoUpdate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`Updated leave balance for user ${userId}: ${annualDays} annual days`);
      });
      
      await Promise.all(updatePromises);
      console.log('Annual leave balances reset completed successfully');
      return null;
    } catch (error) {
      console.error('Error resetting annual leave balances:', error);
      throw error;
    }
  });