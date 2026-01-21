// components/AdminNav.tsx
'use client';

import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { 
  UserGroupIcon, 
  Cog6ToothIcon,
  ChartBarIcon,
  DocumentTextIcon 
} from '@heroicons/react/24/outline';

export default function AdminNav() {
  const { user } = useAuth();

  if (user?.role !== 'admin') return null;

  const adminLinks = [
    { name: 'User Management', href: '/admin/users', icon: UserGroupIcon },
    { name: 'System Settings', href: '/admin/settings', icon: Cog6ToothIcon },
    { name: 'Reports', href: '/admin/reports', icon: ChartBarIcon },
    { name: 'Audit Logs', href: '/admin/audit', icon: DocumentTextIcon },
  ];

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-4 py-2">
          <span className="text-sm font-medium text-gray-500 py-2">Admin:</span>
          {adminLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-md"
            >
              <link.icon className="h-4 w-4 mr-2" />
              {link.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}