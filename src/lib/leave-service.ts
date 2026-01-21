'use client';

import { 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp, 
  collection,  // Add this
  getDocs      // Add this
} from 'firebase/firestore';
import { db } from './firebase';

export const calculateAutomaticLeave = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const balanceRef = doc(db, 'leaveBalance', userId);
    
    // Get user data and balance
    const [userSnap, balanceSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(balanceRef)
    ]);
    
    if (!userSnap.exists() || !balanceSnap.exists()) {
      throw new Error('User or balance not found');
    }
    
    const userData = userSnap.data();
    const balanceData = balanceSnap.data();
    
    // Get hire date
    const hireDate = userData.hireDate?.toDate() || userData.createdAt?.toDate();
    if (!hireDate) {
      console.log('No hire date found for user:', userId);
      return null;
    }
    
    const now = new Date();
    
    // Calculate days since hire
    const timeDiff = now.getTime() - hireDate.getTime();
    const daysSinceHire = Math.floor(timeDiff / (1000 * 3600 * 24));
    
    // Every 2 days = 1 leave day
    const leaveDaysEarned = Math.floor(daysSinceHire / 2);
    
    // Calculate allocation: 60% annual, 30% sick, 10% personal
    const annualLeave = Math.floor(leaveDaysEarned * 0.6);
    const sickLeave = Math.floor(leaveDaysEarned * 0.3);
    const personalLeave = leaveDaysEarned - annualLeave - sickLeave;
    
    // Get total days already accounted for
    const daysAlreadyAccounted = balanceData.totalDaysAccounted || 0;
    
    // Only update if there are new days to account for
    if (daysSinceHire > daysAlreadyAccounted) {
      const newAnnual = annualLeave;
      const newSick = sickLeave;
      const newPersonal = personalLeave;
      
      await updateDoc(balanceRef, {
        annual: newAnnual,
        sick: newSick,
        personal: newPersonal,
        totalDaysAccounted: daysSinceHire,
        lastAutoUpdate: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });
      
      console.log(`Auto-updated leave for user ${userId}:`);
      console.log(`- Days since hire: ${daysSinceHire}`);
      console.log(`- Leave earned: ${leaveDaysEarned} days`);
      console.log(`- Annual: ${newAnnual}, Sick: ${newSick}, Personal: ${newPersonal}`);
      
      return {
        daysSinceHire,
        leaveDaysEarned,
        annual: newAnnual,
        sick: newSick,
        personal: newPersonal
      };
    }
    
    console.log(`No new leave days to add for user ${userId}`);
    return null;
    
  } catch (error) {
    console.error('Error calculating automatic leave:', error);
    throw error;
  }
};

// Function to manually trigger calculation for all users (admin only)
export const recalculateAllUserLeave = async () => {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    const results = [];
    for (const userDoc of snapshot.docs) {
      try {
        const result = await calculateAutomaticLeave(userDoc.id);
        if (result) {
          results.push({
            userId: userDoc.id,
            email: userDoc.data().email,
            ...result
          });
        }
      } catch (error) {
        console.error(`Error for user ${userDoc.id}:`, error);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error recalculating all user leave:', error);
    throw error;
  }
};

// Function to get current leave balance with automatic calculation
export const getCurrentLeaveBalance = async (userId: string) => {
  try {
    // First run automatic calculation
    await calculateAutomaticLeave(userId);
    
    // Then get the updated balance
    const balanceRef = doc(db, 'leaveBalance', userId);
    const balanceSnap = await getDoc(balanceRef);
    
    if (!balanceSnap.exists()) {
      return {
        annual: 0,
        sick: 0,
        personal: 0,
        totalDaysAccounted: 0,
        lastUpdated: null
      };
    }
    
    const data = balanceSnap.data();
    return {
      annual: data.annual || 0,
      sick: data.sick || 0,
      personal: data.personal || 0,
      totalDaysAccounted: data.totalDaysAccounted || 0,
      lastUpdated: data.lastAutoUpdate || data.lastUpdated
    };
  } catch (error) {
    console.error('Error getting current leave balance:', error);
    throw error;
  }
};