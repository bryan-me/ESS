'use client';

import { useState, useEffect } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { format } from 'date-fns';
import { 
  ArrowDownTrayIcon, 
  EyeIcon, 
  DocumentTextIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

export default function PayslipsPage() {
  const { user, loading: authLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [mounted, setMounted] = useState(false);
  const [selectedView, setSelectedView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only create query when user exists
  const q = user?.uid 
    ? query(
        collection(db, 'payslips'),
        where('employeeId', '==', user.uid),
        where('year', '==', selectedYear),
        orderBy('month', 'desc')
      )
    : null;

  const [snapshot, firestoreLoading, error] = useCollection(q);

  const payslips = snapshot?.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Show loading state
  if (authLoading || !mounted) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {/* Header Loading */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
        
        {/* Stats Loading */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
        
        {/* Content Loading */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="flex justify-between items-center mb-4">
                <div className="h-6 bg-gray-200 rounded w-32"></div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show error if Firestore query failed
  if (error) {
    console.error('Firestore error:', error);
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
            <p className="text-sm text-gray-600 mt-1">View and download your salary documents</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {[2025, 2024, 2023].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setSelectedView('grid')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedView === 'grid' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setSelectedView('list')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedView === 'list' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-base font-medium text-red-800 mb-2">Error Loading Payslips</h3>
          <p className="text-sm text-red-700">{error.message}</p>
          <p className="text-xs text-red-600 mt-1">
            Using demo data. To fix, add sample payslips to Firestore.
          </p>
        </div>
        
        {/* Stats */}
        <PayslipStats payslips={demoPayslips} />
        
        {/* Show demo payslips */}
        {selectedView === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {demoPayslips.map((payslip) => (
              <PayslipCard key={payslip.id} payslip={payslip} months={months} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {demoPayslips.map((payslip) => (
              <PayslipListItem key={payslip.id} payslip={payslip} months={months} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Display payslips (real or demo)
  const displayPayslips = payslips.length > 0 ? payslips : demoPayslips;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
          <p className="text-sm text-gray-600 mt-1">
            {payslips.length > 0 ? 'View and download your salary documents' : 'Demo payslips (add data to Firestore)'}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {[2025, 2024, 2023].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSelectedView('grid')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedView === 'grid' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setSelectedView('list')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedView === 'list' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Information Banner */}
      {payslips.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            No payslips found in Firestore. Showing demo data. Add payslip documents to Firestore collection "payslips".
          </p>
        </div>
      )}

      {/* Stats */}
      <PayslipStats payslips={displayPayslips} />

      {/* Payslips */}
      {displayPayslips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No payslips available</h3>
          <p className="text-sm text-gray-600">No payslips found for {selectedYear}</p>
        </div>
      ) : selectedView === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayPayslips.map((payslip) => (
            <PayslipCard key={payslip.id} payslip={payslip} months={months} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {displayPayslips.map((payslip) => (
            <PayslipListItem key={payslip.id} payslip={payslip} months={months} />
          ))}
        </div>
      )}
    </div>
  );
}

// Stats Component
function PayslipStats({ payslips }: { payslips: any[] }) {
  const totalPayslips = payslips.length;
  const totalPaid = payslips.filter(p => p.status === 'paid').length;
  const totalAmount = payslips.reduce((sum, p) => sum + (p.netPay || 0), 0);
  const averageAmount = totalPayslips > 0 ? totalAmount / totalPayslips : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DocumentTextIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Payslips</p>
            <p className="text-xl font-bold text-gray-900">{totalPayslips}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Paid</p>
            <p className="text-xl font-bold text-gray-900">{totalPaid}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <CurrencyDollarIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg. Net Pay</p>
            <p className="text-xl font-bold text-gray-900">${averageAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grid Card Component
function PayslipCard({ payslip, months }: { payslip: any, months: string[] }) {
  const monthName = payslip.month ? months[payslip.month - 1] : 'Unknown';
  const isPaid = payslip.status === 'paid';
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {monthName} {payslip.year}
          </h3>
          <div className="flex items-center mt-1 text-sm text-gray-500">
            <CalendarIcon className="w-4 h-4 mr-1" />
            Issued on {format(new Date(), 'MMM dd')}
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          isPaid
            ? 'bg-green-100 text-green-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          {payslip.status}
        </span>
      </div>
      
      {/* Salary Breakdown */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Basic Salary</span>
          <span className="font-medium">${payslip.basicSalary?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Allowances</span>
          <span className="font-medium text-green-600">+${payslip.allowances?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Deductions</span>
          <span className="font-medium text-red-600">-${payslip.deductions?.toFixed(2)}</span>
        </div>
        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between font-semibold">
            <span>Net Pay</span>
            <span className="text-blue-600">${payslip.netPay?.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex space-x-2">
        <button
          onClick={() => alert(`Payslip details:\nMonth: ${monthName} ${payslip.year}\nBasic: $${payslip.basicSalary?.toFixed(2)}\nAllowances: $${payslip.allowances?.toFixed(2)}\nDeductions: $${payslip.deductions?.toFixed(2)}\nNet: $${payslip.netPay?.toFixed(2)}`)}
          className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          <EyeIcon className="w-4 h-4" />
          View
        </button>
        <button
          onClick={() => alert(`Downloading ${monthName} ${payslip.year} payslip...`)}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          PDF
        </button>
      </div>
    </div>
  );
}

// List Item Component
function PayslipListItem({ payslip, months }: { payslip: any, months: string[] }) {
  const monthName = payslip.month ? months[payslip.month - 1] : 'Unknown';
  const isPaid = payslip.status === 'paid';
  
  return (
    <div className="p-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isPaid ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <DocumentTextIcon className={`w-5 h-5 ${isPaid ? 'text-green-600' : 'text-yellow-600'}`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {monthName} {payslip.year}
              </h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm text-gray-600">
                  Basic: ${payslip.basicSalary?.toFixed(2)}
                </span>
                <span className="text-sm text-gray-600">
                  Net: <span className="font-medium">${payslip.netPay?.toFixed(2)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            isPaid
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {payslip.status}
          </span>
          
          <div className="flex gap-2">
            <button
              onClick={() => alert(`Payslip details:\nMonth: ${monthName} ${payslip.year}\nNet Pay: $${payslip.netPay?.toFixed(2)}`)}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              View
            </button>
            <button
              onClick={() => alert(`Downloading ${monthName} ${payslip.year} payslip...`)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Download
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile-only details */}
      <div className="md:hidden mt-3 pt-3 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-600">Allowances:</span>
            <span className="ml-2 font-medium text-green-600">${payslip.allowances?.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600">Deductions:</span>
            <span className="ml-2 font-medium text-red-600">${payslip.deductions?.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Demo payslips data (extended for better demo)
const demoPayslips = [
  {
    id: '1',
    month: 1,
    year: 2024,
    basicSalary: 4500.00,
    allowances: 850.00,
    deductions: 420.00,
    netPay: 4930.00,
    status: 'paid',
    issuedDate: '2024-01-31'
  },
  {
    id: '2',
    month: 12,
    year: 2023,
    basicSalary: 4500.00,
    allowances: 800.00,
    deductions: 410.00,
    netPay: 4890.00,
    status: 'paid',
    issuedDate: '2023-12-31'
  },
  {
    id: '3',
    month: 11,
    year: 2023,
    basicSalary: 4500.00,
    allowances: 850.00,
    deductions: 430.00,
    netPay: 4920.00,
    status: 'paid',
    issuedDate: '2023-11-30'
  },
  {
    id: '4',
    month: 10,
    year: 2023,
    basicSalary: 4500.00,
    allowances: 820.00,
    deductions: 415.00,
    netPay: 4905.00,
    status: 'paid',
    issuedDate: '2023-10-31'
  },
  {
    id: '5',
    month: 9,
    year: 2023,
    basicSalary: 4500.00,
    allowances: 830.00,
    deductions: 425.00,
    netPay: 4905.00,
    status: 'paid',
    issuedDate: '2023-09-30'
  },
  {
    id: '6',
    month: 8,
    year: 2023,
    basicSalary: 4500.00,
    allowances: 840.00,
    deductions: 420.00,
    netPay: 4920.00,
    status: 'paid',
    issuedDate: '2023-08-31'
  }
];