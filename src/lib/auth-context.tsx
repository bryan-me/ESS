'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  getIdTokenResult,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useRouter } from 'next/navigation';

// UPDATED: Department types based on your structure
export type Department = 'Finance/Admin' | 'Human Resource' | 'Procurement/Logistics' | 'Marketing and Sales' | 'General';

// UPDATED: Roles with department-specific variations
export type UserRole = 'employee' | 'manager' | 'hr' | 'admin' | 'ceo' | 'finance_manager' | 'finance' | 'procurement' | 'logistics' | 'marketing' | 'sales';

// Update the UserData interface to include hireDate
interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  department: Department; // Changed from optional to required
  position?: string;
  customClaims?: any;
  createdAt?: any;
  lastLogin?: any;
  requiresPasswordChange?: boolean;
  createdBy?: string;
  passwordChangedAt?: any;
  hireDate?: string | any; // Add this line - could be string or Firestore timestamp
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (requiredRole: UserRole) => boolean;
  hasDepartmentAccess: (requiredDepartment: Department | Department[]) => boolean;
  refreshToken: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  userData: UserData | null;
  changePasswordOnFirstLogin: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  createUser: (userData: AdminCreateUserData) => Promise<string>;
  updateUser: (uid: string, updates: Partial<UserData>) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updateUserRequiresPasswordChange: (requiresChange: boolean) => void;
  // UPDATED: Better permission checking
  canPerformAction: (action: PurchaseAction | FinanceAction | HRAction | AdminAction) => boolean;
  // NEW: Department management
  getDepartmentManagers: () => Promise<{department: Department, managers: UserData[]}>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Action types for permission checking
type PurchaseAction = 
  | 'submit_purchase_request'
  | 'approve_department_purchase'
  | 'approve_ceo_purchase'
  | 'process_procurement'
  | 'view_all_purchases';

type FinanceAction = 
  | 'process_finance_approval'
  | 'generate_purchase_order'
  | 'view_finance_reports'
  | 'manage_budget';

type HRAction = 
  | 'manage_leave_requests'
  | 'manage_employees'
  | 'view_hr_reports'
  | 'approve_hr_requests';

type AdminAction = 
  | 'manage_users'
  | 'manage_departments'
  | 'system_settings'
  | 'view_all_reports';

interface AdminCreateUserData {
  email: string;
  displayName: string;
  role: UserRole;
  department: Department;
  position?: string;
  temporaryPassword: string;
}

// Store temporary password for first login (in memory only)
let temporaryPasswordStore: Record<string, string> = {};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUserWithClaims = async (firebaseUser: User) => {
    const userRef = doc(db, 'users', firebaseUser.uid);
    
    try {
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        // Create user document with default data
        const userData = {
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          role: 'employee' as UserRole,
          department: 'General' as Department,
          position: 'Employee',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          requiresPasswordChange: true
        };
        
        await setDoc(userRef, userData);
        
        // Create leave balance
        const balanceRef = doc(db, 'leaveBalance', firebaseUser.uid);
        await setDoc(balanceRef, {
          annual: 0,
          sick: 0,
          personal: 0,
          createdAt: serverTimestamp(),
          totalDaysWorked: 0,
          lastUpdated: serverTimestamp()
        });
        
        const fullUserData: UserData = {
          uid: firebaseUser.uid,
          ...userData,
          requiresPasswordChange: true
        };
        
        setUser(fullUserData);
        return fullUserData;
      } else {
        // Update last login
        await updateDoc(userRef, {
          lastLogin: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        const docData = userDoc.data();
        const fullUserData: UserData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || docData.displayName || firebaseUser.email?.split('@')[0] || 'User',
          role: (docData.role as UserRole) || 'employee',
          department: (docData.department as Department) || 'General',
          position: docData.position,
          createdAt: docData.createdAt,
          lastLogin: serverTimestamp(),
          requiresPasswordChange: !!docData.requiresPasswordChange,
          createdBy: docData.createdBy,
          passwordChangedAt: docData.passwordChangedAt
        };
        
        setUser(fullUserData);
        return fullUserData;
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      const fallbackUserData: UserData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        role: 'employee',
        department: 'General',
        requiresPasswordChange: true
      };
      
      setUser(fallbackUserData);
      return fallbackUserData;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await fetchUserWithClaims(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      temporaryPasswordStore[email] = password;
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await fetchUserWithClaims(userCredential.user);
      
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (!userData?.requiresPasswordChange) {
          delete temporaryPasswordStore[email];
        }
      }
      
    } catch (error: any) {
      delete temporaryPasswordStore[email];
      
      console.error('Login error:', error);
      
      if (error.code === 'auth/invalid-credential' || 
          error.code === 'auth/user-not-found' || 
          error.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please try again later');
      } else if (error.code === 'auth/user-disabled') {
        throw new Error('This account has been disabled');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection');
      } else {
        throw new Error(`Login failed: ${error.message}`);
      }
    }
  };

  const logout = async () => {
    try {
      temporaryPasswordStore = {};
      sessionStorage.removeItem('passwordChangeShown');
      
      await firebaseSignOut(auth);
      setUser(null);
      
      window.location.replace('/login');
      
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const createUser = async (userData: AdminCreateUserData): Promise<string> => {
  console.log('🚀 Starting user creation. Current admin:', auth.currentUser?.email);
  
  try {
    if (!auth.currentUser) {
      throw new Error('You must be logged in to create users');
    }

    const currentUserRef = doc(db, 'users', auth.currentUser.uid);
    const currentUserDoc = await getDoc(currentUserRef);
    
    if (!currentUserDoc.exists() || currentUserDoc.data().role !== 'admin') {
      throw new Error('Only administrators can create users');
    }

    const adminBefore = {
      email: auth.currentUser.email,
      uid: auth.currentUser.uid
    };
    console.log('👑 Admin before creation:', adminBefore);

    const { initializeApp } = await import('firebase/app');
    const { 
      getAuth, 
      createUserWithEmailAndPassword: createUserAlt,
      updateProfile: updateProfileAlt,
      signOut: signOutAlt 
    } = await import('firebase/auth');
    const { getFirestore } = await import('firebase/firestore');

    const altFirebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    };

    const altApp = initializeApp(altFirebaseConfig, `alt_app_${Date.now()}`);
    const altAuth = getAuth(altApp);
    const altDb = getFirestore(altApp);

    try {
      console.log('🔄 Creating user in separate Firebase instance...');
      
      const userCredential = await createUserAlt(
        altAuth, 
        userData.email, 
        userData.temporaryPassword
      );

      console.log('✅ User created in alt instance:', userCredential.user.email);

      await updateProfileAlt(userCredential.user, {
        displayName: userData.displayName
      });

      await signOutAlt(altAuth);
      console.log('👋 Signed out from alt instance');

      console.log('📝 Creating Firestore documents...');
      
      const newUserRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(newUserRef, {
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        department: userData.department,
        position: userData.position || 'Employee',
        createdAt: serverTimestamp(),
        hireDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        requiresPasswordChange: true,
        passwordChangedAt: null
      });

      // In the createUser function, update the leave balance initialization:
      const balanceRef = doc(db, 'leaveBalance', userCredential.user.uid);

      // Get current year for pro-rating
      const currentYear = new Date().getFullYear();
      let annualDays = 21;

      // If creating user with hire date (you should add hireDate to AdminCreateUserData)
      // For now, we'll use current date as hire date for new users
      const hireDate = new Date();
      if (hireDate.getFullYear() === currentYear) {
        const monthsRemaining = 12 - hireDate.getMonth();
        annualDays = Math.round((21 / 12) * monthsRemaining);
        annualDays = Math.max(1, annualDays);
      }

      await setDoc(balanceRef, {
        annual: annualDays,
        sick: 10,
        maternity: 180,
        unpaid: 999,
        personal: 0,
        createdAt: serverTimestamp(),
        totalDaysAccounted: 0,
        lastUpdated: serverTimestamp(),
        lastAutoUpdate: serverTimestamp(),
        updatedAt: new Date().toISOString()
      });

      console.log('🔍 Checking admin status after creation...');
      console.log('Admin after creation (main auth):', auth.currentUser?.email);
      console.log('User created successfully:', userData.email);

      return userCredential.user.uid;
      
    } finally {
      console.log('🧹 Cleanup complete');
    }
    
  } catch (error: any) {
    console.error('❌ Create user error:', error);
    
    console.log('Admin status after error:', auth.currentUser?.email);
    
    // Return the error with the original Firebase error code
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email address is already registered. Please use a different email.');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('The email address is not valid. Please enter a valid email.');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('The password is too weak. Please use at least 6 characters.');
    } else if (error.code === 'auth/operation-not-allowed') {
      throw new Error('Email/password accounts are not enabled. Please contact your administrator.');
    } else {
      // Include the original error message for debugging
      throw new Error(`Failed to create user: ${error.message || 'Unknown error occurred'}`);
    }
  }
};

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error('No user logged in');
      }

      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        currentPassword
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      
    } catch (error: any) {
      console.error('Change password error:', error);
      
      if (error.code === 'auth/wrong-password') {
        throw new Error('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('New password is too weak. Please use at least 6 characters.');
      } else if (error.code === 'auth/requires-recent-login') {
        throw new Error('Your session has expired. Please log out and log in again to change your password.');
      } else {
        throw new Error(`Failed to change password: ${error.message}`);
      }
    }
  };

  const changePasswordOnFirstLogin = async (newPassword: string) => {
    try {
      if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error('No user logged in or email not available');
      }

      const email = auth.currentUser.email;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      
      // Check if password change is actually required
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }
      
      const userData = userDoc.data();
      const requiresPasswordChange = userData?.requiresPasswordChange;
      
      if (!requiresPasswordChange) {
        throw new Error('Password change is not required. If you want to change your password, use the profile settings.');
      }

      // Try to reauthenticate with temporary password if available
      if (temporaryPasswordStore[email]) {
        try {
          const credential = EmailAuthProvider.credential(
            email,
            temporaryPasswordStore[email]
          );
          await reauthenticateWithCredential(auth.currentUser, credential);
        } catch (reauthError) {
          console.log('Reauthentication failed:', reauthError);
          // Don't throw error - let them try with their current session
        }
        
        delete temporaryPasswordStore[email];
      }

      // Update password
      await updatePassword(auth.currentUser, newPassword);
      
      // Update user document
      await updateDoc(userRef, {
        requiresPasswordChange: false,
        passwordChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Update local state
      setUser(prev => {
        if (!prev) return null;
        return { ...prev, requiresPasswordChange: false };
      });
      
      console.log('Password changed successfully, requiresPasswordChange set to false');
      
    } catch (error: any) {
      console.error('Change password error:', error);
      
      if (error.code === 'auth/weak-password') {
        throw new Error('New password is too weak. Please use at least 6 characters.');
      } else if (error.code === 'auth/requires-recent-login') {
        await logout();
        throw new Error('Your session has expired. Please log in again to change your password.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Network error. Please check your internet connection.');
      } else {
        throw new Error(`Failed to change password: ${error.message}`);
      }
    }
  };

  const updateUserRequiresPasswordChange = (requiresChange: boolean) => {
    setUser(prev => {
      if (!prev) return null;
      return { ...prev, requiresPasswordChange: requiresChange };
    });
  };

  const sendPasswordResetEmailToUser = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('Send password reset email error:', error);
      
      if (error.code === 'auth/user-not-found') {
        throw new Error('No user found with this email address');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many requests. Please try again later.');
      } else {
        throw new Error(`Failed to send reset email: ${error.message}`);
      }
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      if (displayName && userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: displayName
        });
      }
      
      await fetchUserWithClaims(userCredential.user);
    } catch (error: any) {
      console.error('Sign up error:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already in use');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      } else {
        throw new Error(`Sign up failed: ${error.message}`);
      }
    }
  };

  const updateUser = async (uid: string, updates: Partial<UserData>) => {
    try {
      if (!auth.currentUser) {
        throw new Error('You must be logged in to update users');
      }

      const currentUserRef = doc(db, 'users', auth.currentUser.uid);
      const currentUserDoc = await getDoc(currentUserRef);
      
      if (!currentUserDoc.exists() || currentUserDoc.data().role !== 'admin') {
        throw new Error('Only administrators can update users');
      }

      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error('Update user error:', error);
      throw new Error(`Failed to update user: ${error.message}`);
    }
  };

  const refreshToken = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken(true);
        await fetchUserWithClaims(auth.currentUser);
      } catch (error) {
        console.error('Error refreshing token:', error);
      }
    }
  };

  // UPDATED: Enhanced role hierarchy with departments
  const hasPermission = (requiredRole: UserRole): boolean => {
    if (!user) return false;
    
    const roleHierarchy: Record<UserRole, number> = {
      employee: 1,
      procurement: 2,
      logistics: 2,
      marketing: 2,
      sales: 2,
      finance: 2,
      hr: 3,
      manager: 4,
      finance_manager: 4,
      ceo: 5,
      admin: 6
    };
    
    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  };

  // NEW: Check if user has access to specific department(s)
  const hasDepartmentAccess = (requiredDepartment: Department | Department[]): boolean => {
    if (!user) return false;
    
    const departments = Array.isArray(requiredDepartment) 
      ? requiredDepartment 
      : [requiredDepartment];
    
    // Admins have access to all departments
    if (user.role === 'admin' || user.role === 'ceo') {
      return true;
    }
    
    // HR typically has access to view all departments for HR purposes
    if (user.role === 'hr' && departments.includes('Human Resource')) {
      return true;
    }
    
    // Check if user's department matches any required department
    return departments.includes(user.department);
  };

  // UPDATED: Enhanced action permission checking with department awareness
  const canPerformAction = (action: PurchaseAction | FinanceAction | HRAction | AdminAction): boolean => {
    if (!user) return false;
    
    switch(action) {
      // Purchase Actions
      case 'submit_purchase_request':
        // All employees can submit purchase requests
        return true;
      
      case 'approve_department_purchase':
        // Department managers and admins can approve within their department
        return (user.role === 'manager' || user.role === 'admin') && 
               user.department !== 'General';
      
      case 'approve_ceo_purchase':
        // CEO and admins for final approval
        return user.role === 'ceo' || user.role === 'admin';
      
      case 'process_procurement':
        // Procurement/Logistics department for processing
        return user.department === 'Procurement/Logistics' || 
               user.role === 'admin';
      
      case 'view_all_purchases':
        // Managers, HR, Finance, CEOs, Admins can view all
        return ['manager', 'hr', 'finance', 'finance_manager', 'ceo', 'admin'].includes(user.role);
      
      // Finance Actions
      case 'process_finance_approval':
        // Finance department only
        return user.department === 'Finance/Admin' || 
               user.role === 'finance' || 
               user.role === 'finance_manager' || 
               user.role === 'admin';
      
      case 'generate_purchase_order':
        // Finance department and admins
        return user.department === 'Finance/Admin' || 
               user.role === 'finance_manager' || 
               user.role === 'admin';
      
      case 'view_finance_reports':
        // Finance department, managers, admins, CEO
        return user.department === 'Finance/Admin' || 
               ['manager', 'ceo', 'admin'].includes(user.role);
      
      case 'manage_budget':
        // Finance managers and admins only
        return user.role === 'finance_manager' || user.role === 'admin';
      
      // HR Actions
      case 'manage_leave_requests':
        // HR department and managers
        return user.department === 'Human Resource' || 
               user.role === 'manager' || 
               user.role === 'admin';
      
      case 'manage_employees':
        // HR department and admins
        return user.department === 'Human Resource' || user.role === 'admin';
      
      case 'view_hr_reports':
        // HR, managers, admins, CEO
        return user.department === 'Human Resource' || 
               ['manager', 'ceo', 'admin'].includes(user.role);
      
      case 'approve_hr_requests':
        // HR managers and admins
        return (user.department === 'Human Resource' && user.role === 'manager') || 
               user.role === 'admin';
      
      // Admin Actions
      case 'manage_users':
        // Only admins
        return user.role === 'admin';
      
      case 'manage_departments':
        // Only admins
        return user.role === 'admin';
      
      case 'system_settings':
        // Only admins
        return user.role === 'admin';
      
      case 'view_all_reports':
        // Managers, HR, Finance, CEOs, Admins
        return ['manager', 'hr', 'finance', 'finance_manager', 'ceo', 'admin'].includes(user.role);
      
      default:
        return false;
    }
  };

  // NEW: Get department managers for a specific department
  const getDepartmentManagers = async (): Promise<{department: Department, managers: UserData[]}> => {
    try {
      if (!user) throw new Error('User not authenticated');
      
      // Query for managers in the user's department
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef, 
        where('department', '==', user.department),
        where('role', '==', 'manager')
      );
      const snapshot = await getDocs(q);
      
      const managers: UserData[] = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      } as UserData));
      
      return {
        department: user.department,
        managers
      };
    } catch (error) {
      console.error('Error fetching department managers:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    userData: user,
    loading,
    login,
    logout,
    hasPermission,
    hasDepartmentAccess,
    refreshToken,
    signUp,
    changePasswordOnFirstLogin,
    changePassword,
    createUser,
    updateUser,
    sendPasswordResetEmail: sendPasswordResetEmailToUser,
    updateUserRequiresPasswordChange,
    canPerformAction,
    getDepartmentManagers
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}