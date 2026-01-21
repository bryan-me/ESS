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
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useRouter } from 'next/navigation';

export type UserRole = 'employee' | 'manager' | 'hr' | 'admin';

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  department?: string;
  position?: string;
  customClaims?: any;
  createdAt?: any;
  lastLogin?: any;
  requiresPasswordChange?: boolean;
  createdBy?: string;
  passwordChangedAt?: any;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (requiredRole: UserRole) => boolean;
  refreshToken: () => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  userData: UserData | null;
  changePasswordOnFirstLogin: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>; // Add this
  createUser: (userData: AdminCreateUserData) => Promise<string>;
  updateUser: (uid: string, updates: Partial<UserData>) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updateUserRequiresPasswordChange: (requiresChange: boolean) => void; // Add this
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AdminCreateUserData {
  email: string;
  displayName: string;
  role: UserRole;
  department?: string;
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
          department: 'General',
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
          annual: 0,  // Start at 0
          sick: 0,    // Start at 0
          personal: 0, // Start at 0
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
          department: docData.department,
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
          department: userData.department || 'General',
          position: userData.position || 'Employee',
          createdAt: serverTimestamp(),
          hireDate: serverTimestamp(), // Add this to track actual hire date
          updatedAt: serverTimestamp(),
          createdBy: auth.currentUser.uid,
          requiresPasswordChange: true,
          passwordChangedAt: null
        });

        // In createUser function, change the balance initialization:
        const balanceRef = doc(db, 'leaveBalance', userCredential.user.uid);
        await setDoc(balanceRef, {
          annual: 0,  // Changed from 20 to 0
          sick: 0,    // Changed from 10 to 0
          personal: 0, // Changed from 5 to 0
          createdAt: serverTimestamp(),
          totalDaysWorked: 0,
          lastUpdated: serverTimestamp()
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
      
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already in use');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please use at least 6 characters.');
      } else {
        throw new Error(`Failed to create user: ${error.message}`);
      }
    }
  };

  // Regular password change function (for users who already have a password)
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

  // First-time password change function (for users with temporary passwords)
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

  // Function to update user's requiresPasswordChange in local state
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

  const hasPermission = (requiredRole: UserRole): boolean => {
    if (!user) return false;
    
    const roleHierarchy: Record<UserRole, number> = {
      employee: 1,
      manager: 2,
      hr: 3,
      admin: 4
    };
    
    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  };

  const value: AuthContextType = {
    user,
    userData: user,
    loading,
    login,
    logout,
    hasPermission,
    refreshToken,
    signUp,
    changePasswordOnFirstLogin,
    changePassword, // Export this
    createUser,
    updateUser,
    sendPasswordResetEmail: sendPasswordResetEmailToUser,
    updateUserRequiresPasswordChange // Export this
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

