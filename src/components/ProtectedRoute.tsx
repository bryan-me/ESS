'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
  
  useEffect(() => {
    if (!loading) {
      const isPublicRoute = publicRoutes.includes(pathname);
      
      if (!user && !isPublicRoute) {
        // User is not authenticated and trying to access protected route
        // Store the attempted URL for redirect after login
        sessionStorage.setItem('redirectAfterLogin', pathname);
        router.replace('/login');
      } else if (user && isPublicRoute) {
        // User is authenticated but trying to access public route (like login)
        // Redirect to dashboard
        router.replace('/dashboard');
      } else {
        setIsAuthenticated(true);
      }
    }
  }, [user, loading, pathname, router]);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // If authenticated or on public route, show children
  if (isAuthenticated || publicRoutes.includes(pathname)) {
    return <>{children}</>;
  }
  
  // Otherwise show nothing (will redirect)
  return null;
}