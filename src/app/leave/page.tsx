'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, addDoc, query, where, orderBy, doc, updateDoc, increment, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { format, isPast, parseISO, isToday, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, isSameDay, eachDayOfInterval, addDays, parse } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface LeaveRequest {
  id: string;
  type: string;
  startDate: any;
  endDate: any;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  createdAt: any;
  updatedAt: any;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  cancelledBy?: string;
  cancelledAt?: any;
}

type LeaveBalanceType = 'annual' | 'sick' | 'maternity' | 'unpaid';

interface LeaveBalance {
  annual: number;
  sick: number;
  maternity: number;
  unpaid: number;
  updatedAt: string;
}

// Helper function to calculate business days
const calculateBusinessDays = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const curDate = new Date(start.getTime());
  
  while (curDate <= end) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: any[];
}

interface BlockedDate {
  date: Date;
  reason: string;
  employeeName: string;
}

export default function LeavePage() {
  const { user, loading: authLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    type: 'annual',
    startDate: '',
    endDate: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [dataInitialized, setDataInitialized] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [departmentLeaves, setDepartmentLeaves] = useState<LeaveRequest[]>([]);


  // Access role from user object
  const role = user?.role || 'employee';
  const userDepartment = user?.department || '';

  // Fetch leave balance from Firestore
  const leaveBalanceRef = user?.uid ? doc(db, 'leaveBalance', user.uid) : null;
  
  // Fetch leave requests for current user
  const leaveRequestsQuery = user?.uid 
    ? query(
        collection(db, 'leaveRequests'),
        where('employeeId', '==', user.uid),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [leaveBalanceSnapshot, balanceLoading, balanceError] = useCollection(
    leaveBalanceRef ? 
      query(collection(db, 'leaveBalance'), where('__name__', '==', user?.uid)) as any 
    : null
  );
  
  const [leaveRequestsSnapshot, requestsLoading, requestsError] = useCollection(leaveRequestsQuery);

  // Fetch all leave requests in the same department (excluding current user's cancelled/rejected leaves)
  useEffect(() => {
    const fetchDepartmentLeaves = async () => {
      if (user?.uid && userDepartment) {
        try {
          // Fetch approved and pending leaves in the same department (excluding current user's leaves)
          const q = query(
            collection(db, 'leaveRequests'),
            where('department', '==', userDepartment),
            where('status', 'in', ['approved', 'pending'])
          );
          
          const querySnapshot = await getDocs(q);
         // In the fetchDepartmentLeaves useEffect, update the mapping:
          const leaves = querySnapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            } as LeaveRequest))
            .filter(leave => leave.employeeId !== user.uid); // Exclude current user's own leaves
          
          setDepartmentLeaves(leaves);

          // Calculate blocked dates
          const blocked: BlockedDate[] = [];
          leaves.forEach((leave: any) => {
            if (leave.startDate && leave.endDate) {
              const start = parseISO(leave.startDate);
              const end = parseISO(leave.endDate);
              
              // Create array of all days in the leave interval
              const daysInLeave = eachDayOfInterval({ start, end });
              
              daysInLeave.forEach(day => {
                // Check if day is a business day (Monday to Friday)
                const dayOfWeek = day.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                  blocked.push({
                    date: day,
                    reason: `${leave.type} leave`,
                    employeeName: leave.employeeName
                  });
                }
              });
            }
          });
          
          setBlockedDates(blocked);
        } catch (error) {
          console.error('Error fetching department leaves:', error);
        }
      }
    };

    if (userDepartment && user?.uid) {
      fetchDepartmentLeaves();
    }
  }, [userDepartment, user?.uid]);

  // Initialize leave balance if it doesn't exist
  useEffect(() => {
    const initLeaveBalance = async () => {
      if (user?.uid && !balanceLoading && !dataInitialized) {
        try {
          const balanceDoc = await getDoc(doc(db, 'leaveBalance', user.uid));
          if (!balanceDoc.exists()) {
            await setDoc(doc(db, 'leaveBalance', user.uid), {
              annual: 15,
              sick: 10,
              maternity: 180,
              unpaid: 999,
              updatedAt: new Date().toISOString()
            });
          }
          setDataInitialized(true);
        } catch (error) {
          console.error('Error initializing leave balance:', error);
        }
      }
    };
    
    initLeaveBalance();
  }, [user?.uid, balanceLoading, dataInitialized]);

  // Get leave balance data
  const leaveBalance = leaveBalanceSnapshot?.docs?.[0]?.data() as LeaveBalance | undefined;

  
  // Get leave requests data
 const leaveRequests = leaveRequestsSnapshot?.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
} as LeaveRequest)) || [];

  // Fetch all pending leave requests for managers/admins
  const allLeaveRequestsQuery = (role === 'manager' || role === 'admin') && user?.uid
    ? query(
        collection(db, 'leaveRequests'),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [allLeaveRequestsSnapshot, allRequestsLoading] = useCollection(allLeaveRequestsQuery);
  
 const allLeaveRequests = allLeaveRequestsSnapshot?.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
} as LeaveRequest)) || [];

  // Check if selected dates overlap with existing department leaves
  const checkDateAvailability = (startDate: string, endDate: string): { available: boolean; conflicts: LeaveRequest[] } => {
  if (!startDate || !endDate || !userDepartment) {
    return { available: true, conflicts: [] };
  }

  const selectedStart = parseISO(startDate);
  const selectedEnd = parseISO(endDate);
  
  const conflicts = departmentLeaves.filter((leave: LeaveRequest) => {
    if (!leave.startDate || !leave.endDate) return false;
    
    const leaveStart = parseISO(leave.startDate);
    const leaveEnd = parseISO(leave.endDate);
    
    // Check if date ranges overlap
    return (
      (selectedStart >= leaveStart && selectedStart <= leaveEnd) ||
      (selectedEnd >= leaveStart && selectedEnd <= leaveEnd) ||
      (leaveStart >= selectedStart && leaveStart <= selectedEnd) ||
      (leaveEnd >= selectedStart && leaveEnd <= selectedEnd)
    );
  });

  return {
    available: conflicts.length === 0,
    conflicts
  };
};

  // Check if a specific date is blocked
  const isDateBlocked = (date: Date): { blocked: boolean; reason?: string; employeeName?: string } => {
    const dayOfWeek = date.getDay();
    // Weekends are not selectable for business days
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { blocked: true, reason: 'Weekend' };
    }

    const blockedDate = blockedDates.find(blocked => 
      isSameDay(blocked.date, date)
    );
    
    if (blockedDate) {
      return {
        blocked: true,
        reason: `${blockedDate.reason} (taken by ${blockedDate.employeeName})`,
        employeeName: blockedDate.employeeName
      };
    }
    
    return { blocked: false };
  };

  // Get minimum selectable date (tomorrow or next business day)
  const getMinSelectableDate = (): string => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    
    // If tomorrow is weekend, skip to next Monday
    let nextBusinessDay = tomorrow;
    while (nextBusinessDay.getDay() === 0 || nextBusinessDay.getDay() === 6) {
      nextBusinessDay = addDays(nextBusinessDay, 1);
    }
    
    return format(nextBusinessDay, 'yyyy-MM-dd');
  };

  // Calendar generation
  const generateCalendarDays = (): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    // Get start and end of the week that contains month start
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    // Get end of the week that contains month end
    const endDate = new Date(monthEnd);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const isCurrentMonth = currentDate.getMonth() === currentMonth.getMonth();
      const isTodayDate = isToday(currentDate);
      
      // Get events for this day
      const dayEvents = leaveRequests.filter((request: any) => {
        if (!request.startDate || !request.endDate) return false;
        const start = new Date(request.startDate);
        const end = new Date(request.endDate);
        return currentDate >= start && currentDate <= end;
      });
      
      days.push({
        date: new Date(currentDate),
        isCurrentMonth,
        isToday: isTodayDate,
        events: dayEvents
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };

  const calendarDays = generateCalendarDays();

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!user?.uid || !formData.startDate || !formData.endDate || !formData.reason) {
    alert('Please fill in all fields');
    return;
  }
  
  setLoading(true);
  
  try {
    const days = calculateBusinessDays(formData.startDate, formData.endDate);
    
    if (isPast(parseISO(formData.startDate))) {
      alert('Cannot apply for leave with a start date in the past');
      setLoading(false);
      return;
    }
    
    // Check for date conflicts
    const { available, conflicts } = checkDateAvailability(formData.startDate, formData.endDate);
    if (!available) {
      alert(`Cannot apply for leave. The selected dates overlap with existing leaves in your department:\n\n${
        conflicts.map((conflict: LeaveRequest) => 
          `${conflict.employeeName}: ${conflict.type} leave (${format(parseISO(conflict.startDate), 'MMM dd')} - ${format(parseISO(conflict.endDate), 'MMM dd')})`
        ).join('\n')
      }`);
      setLoading(false);
      return;
    }
    
    // Type-safe balance check
    const currentBalance = leaveBalance?.[formData.type as LeaveBalanceType];
    if (formData.type !== 'unpaid' && currentBalance !== undefined && days > currentBalance) {
      alert('Insufficient leave balance');
      setLoading(false);
      return;
    }

    const newRequest: Omit<LeaveRequest, 'id'> = {
      type: formData.type,
      startDate: formData.startDate,
      endDate: formData.endDate,
      days,
      reason: formData.reason,
      status: 'pending',
      employeeId: user.uid,
      employeeName: user?.displayName || user?.email?.split('@')[0] || 'Employee',
      employeeEmail: user?.email || '',
      department: user?.department || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, 'leaveRequests'), newRequest);
    
    setShowModal(false);
    setFormData({ type: 'annual', startDate: '', endDate: '', reason: '' });
    
    alert('Leave request submitted successfully! It will be reviewed by management.');
    
  } catch (error) {
    console.error('Error submitting leave request:', error);
    alert('Failed to submit leave request. Please try again.');
  } finally {
    setLoading(false);
  }
};

  // Handle date change with validation
  const handleStartDateChange = (date: string) => {
    setFormData(prev => ({ ...prev, startDate: date }));
    
    // If end date is before start date, reset end date
    if (formData.endDate && date > formData.endDate) {
      setFormData(prev => ({ ...prev, endDate: '' }));
    }
  };

  const handleEndDateChange = (date: string) => {
    setFormData(prev => ({ ...prev, endDate: date }));
  };

  const canCancelRequest = (request: any) => {
    if (!user || request.employeeId !== user.uid) return false;
    if (request.status !== 'pending') return false;
    if (isPast(parseISO(request.startDate))) return false;
    return true;
  };

  const handleCancelRequest = async (requestId: string, request: any) => {
    if (!user?.uid || !canCancelRequest(request)) {
      alert('Cannot cancel this request. It may have already started or been processed.');
      return;
    }
    
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    
    try {
      await updateDoc(doc(db, 'leaveRequests', requestId), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: user.uid,
        updatedAt: new Date().toISOString()
      });
      
      alert('Leave request cancelled successfully!');
      
    } catch (error) {
      console.error('Error cancelling leave request:', error);
      alert('Failed to cancel leave request. Please try again.');
    }
  };

  const handleApprove = async (requestId: string, request: any, action: 'approved' | 'rejected') => {
    if (!user?.uid || !(role === 'manager' || role === 'admin')) return;
    
    try {
      await updateDoc(doc(db, 'leaveRequests', requestId), {
        status: action,
        reviewedBy: user.uid,
        reviewedByName: user?.displayName,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      if (action === 'approved' && request.type !== 'unpaid') {
        await updateDoc(doc(db, 'leaveBalance', request.employeeId), {
          [request.type]: increment(-request.days),
          updatedAt: new Date().toISOString()
        });
      }
      
      alert(`Leave request ${action} successfully!`);
      
    } catch (error) {
      console.error('Error updating leave request:', error);
      alert('Failed to update leave request. Please try again.');
    }
  };

  const displayRequests = (role === 'manager' || role === 'admin') ? allLeaveRequests : leaveRequests;

  const leaveTypes = [
    { id: 'annual', name: 'Annual Leave', color: 'bg-green-100 text-green-800' },
    { id: 'sick', name: 'Sick Leave', color: 'bg-yellow-100 text-yellow-800' },
    { id: 'maternity', name: 'Maternity Leave', color: 'bg-pink-100 text-pink-800' },
    { id: 'unpaid', name: 'Unpaid Leave', color: 'bg-gray-100 text-gray-800' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getLeaveColor = (type: string) => {
    switch (type) {
      case 'annual': return 'bg-green-100 text-green-700 border-green-200';
      case 'sick': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'maternity': return 'bg-pink-100 text-pink-700 border-pink-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Function to check if a date should be disabled in the date picker
  const isDateDisabled = (date: Date): boolean => {
    const today = new Date();
    const isPastDate = date < today && !isSameDay(date, today);
    const { blocked } = isDateBlocked(date);
    return isPastDate || blocked;
  };

  // Get date picker title for disabled dates
  const getDateTitle = (date: Date): string => {
    if (date < new Date() && !isSameDay(date, new Date())) {
      return 'Past dates cannot be selected';
    }
    
    const { blocked, reason } = isDateBlocked(date);
    if (blocked) {
      return reason || 'Date is not available';
    }
    
    return '';
  };

  const isLoading = authLoading || balanceLoading || requestsLoading || ((role === 'manager' || role === 'admin') && allRequestsLoading) || !dataInitialized;

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-full mt-2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (balanceError || requestsError) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
            <p className="mt-1 text-sm text-gray-600">Apply and manage your leave requests</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Data</h3>
          <p className="text-red-700">
            {balanceError?.message || requestsError?.message || 'Unable to load leave data'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="mt-1 text-sm text-gray-600">Apply and manage your leave requests</p>
          {userDepartment && (
            <p className="mt-1 text-sm text-gray-500">
              Department: <span className="font-medium">{userDepartment}</span>
            </p>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveView('list')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'list' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setActiveView('calendar')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeView === 'calendar' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Calendar View
            </button>
          </div>
          
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium text-sm md:text-base"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Apply for Leave'}
          </button>
        </div>
      </div>

      {/* Department Availability Notice */}
      {blockedDates.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm text-yellow-800 font-medium">
                Leave Availability in {userDepartment} Department
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                {blockedDates.length} business day(s) are already booked in your department. 
                You cannot select dates that overlap with existing approved/pending leaves.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Leave Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {leaveTypes.map((type) => (
          <div key={type.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${type.color} mb-3`}>
              {type.name}
            </div>
            <p className="text-2xl md:text-3xl font-bold text-gray-900">
              {leaveBalance?.[type.id as keyof typeof leaveBalance] || 0} days
            </p>
            <p className="mt-1 text-sm text-gray-500">Available balance</p>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      {activeView === 'list' ? (
        /* List View */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {(role === 'manager' || role === 'admin') ? 'Pending Leave Requests' : 'My Leave Requests'}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({displayRequests.length} {displayRequests.length === 1 ? 'request' : 'requests'})
                </span>
              </h2>
              
              {displayRequests.length > 0 && (
                <div className="text-sm text-gray-500">
                  Showing {Math.min(displayRequests.length, 10)} of {displayRequests.length}
                </div>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {displayRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-900 font-medium mb-1">No leave requests found</p>
                <p className="text-sm">
                  {(role === 'manager' || role === 'admin') 
                    ? 'All leave requests have been processed' 
                    : 'Submit your first leave request using the button above'}
                </p>
              </div>
            ) : (
              <div className="min-w-full">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {(role === 'manager' || role === 'admin') && (
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Employee
                        </th>
                      )}
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Days
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayRequests.slice(0, 10).map((request: LeaveRequest) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        {(role === 'manager' || role === 'admin') && (
                          <td className="px-4 sm:px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{request.employeeName}</p>
                              <p className="text-gray-500 text-xs">{request.department}</p>
                            </div>
                          </td>
                        )}
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {format(new Date(request.startDate), 'MMM dd')} - {format(new Date(request.endDate), 'MMM dd')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {isPast(parseISO(request.startDate)) ? 'Started' : 'Upcoming'}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getLeaveColor(request.type)}`}>
                            {request.type}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {request.days} day{request.days !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col sm:flex-row gap-2">
                            {(role === 'manager' || role === 'admin') && request.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(request.id, request, 'approved')}
                                  className="text-sm text-green-600 hover:text-green-900 px-2 py-1 hover:bg-green-50 rounded"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleApprove(request.id, request, 'rejected')}
                                  className="text-sm text-red-600 hover:text-red-900 px-2 py-1 hover:bg-red-50 rounded"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            
                            {request.employeeId === user?.uid && request.status === 'pending' && !isPast(parseISO(request.startDate)) && (
                              <button
                                onClick={() => handleCancelRequest(request.id, request)}
                                className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-50 rounded"
                              >
                                Cancel
                              </button>
                            )}
                            
                            <button
                              onClick={() => alert(`Leave Details:\nType: ${request.type}\nPeriod: ${format(new Date(request.startDate), 'MMM dd, yyyy')} - ${format(new Date(request.endDate), 'MMM dd, yyyy')}\nDays: ${request.days}\nReason: ${request.reason}\nStatus: ${request.status}\nDepartment: ${request.department}`)}
                              className="text-sm text-blue-600 hover:text-blue-900 px-2 py-1 hover:bg-blue-50 rounded"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {displayRequests.length > 10 && (
            <div className="px-4 sm:px-6 py-4 border-t border-gray-200 text-center">
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Load more requests...
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Leave Calendar</h2>
              
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-100 border border-green-300 rounded-full"></div>
                  <span className="text-sm text-gray-600">Annual</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded-full"></div>
                  <span className="text-sm text-gray-600">Sick</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-pink-100 border border-pink-300 rounded-full"></div>
                  <span className="text-sm text-gray-600">Maternity</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded-full"></div>
                  <span className="text-sm text-gray-600">Unavailable</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4">
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
              
              <h3 className="text-lg font-semibold text-gray-900">
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center">
                  <span className="text-xs font-medium text-gray-500">{day}</span>
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, dayIdx) => {
                const { blocked, reason } = isDateBlocked(day.date);
                
                return (
                  <div
                    key={dayIdx}
                    className={`min-h-[80px] p-1 border rounded-lg ${
                      !day.isCurrentMonth ? 'border-gray-100 bg-gray-50' : 'border-gray-200'
                    } ${day.isToday ? 'border-blue-300 bg-blue-50' : ''} ${
                      blocked ? 'bg-red-50 border-red-200' : ''
                    }`}
                    title={reason}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-medium ${
                        day.isCurrentMonth ? (blocked ? 'text-red-600' : 'text-gray-900') : 'text-gray-400'
                      } ${day.isToday ? 'text-blue-600' : ''}`}>
                        {format(day.date, 'd')}
                      </span>
                      {day.events.length > 0 && (
                        <span className="text-xs text-gray-500">{day.events.length}</span>
                      )}
                      {blocked && (
                        <span className="text-xs text-red-500">●</span>
                      )}
                    </div>
                    
                    {/* Events for the day */}
                    <div className="space-y-1 max-h-[48px] overflow-y-auto">
                      {day.events.slice(0, 2).map((event, idx) => (
                        <div
                          key={idx}
                          className={`text-[10px] px-1 py-0.5 rounded truncate ${getLeaveColor(event.type)}`}
                          title={`${event.type} - ${event.reason?.substring(0, 30)}...`}
                        >
                          {event.type}
                        </div>
                      ))}
                      {day.events.length > 2 && (
                        <div className="text-xs text-gray-500 px-1">
                          +{day.events.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Calendar Legend */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Calendar Legend:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-50 border border-red-200 rounded-full"></div>
                  <span className="text-xs text-gray-700">Unavailable (taken by colleague)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-50 border border-blue-300 rounded-full"></div>
                  <span className="text-xs text-gray-700">Today</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded-full"></div>
                  <span className="text-xs text-gray-700">Different month</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-100 border border-green-200 rounded-full"></div>
                  <span className="text-xs text-gray-700">Annual leave</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats & Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">Quick Stats</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Pending Requests:</span>
              <span className="font-medium text-blue-900">
                {leaveRequests.filter((r: any) => r.status === 'pending').length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Approved This Month:</span>
              <span className="font-medium text-blue-900">
               {leaveRequests.filter((r: LeaveRequest) => 
                  r.status === 'approved' && 
                  new Date(r.createdAt).getMonth() === new Date().getMonth()
                ).length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Total Days Used:</span>
              <span className="font-medium text-blue-900">
                {leaveRequests
                  .filter((r: LeaveRequest) => r.status === 'approved')
                  .reduce((sum: number, r: LeaveRequest) => sum + (r.days || 0), 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Days Booked in Dept:</span>
              <span className="font-medium text-blue-900">
                {blockedDates.length}
              </span>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-2">Leave Rules</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li className="flex items-start">
              <span className="text-gray-500 mr-2">•</span>
              Balance deducted only when approved
            </li>
            <li className="flex items-start">
              <span className="text-gray-500 mr-2">•</span>
              Cancel pending requests before start date
            </li>
            <li className="flex items-start">
              <span className="text-gray-500 mr-2">•</span>
              Unpaid leave doesn't affect balance
            </li>
            <li className="flex items-start">
              <span className="text-gray-500 mr-2">•</span>
              Cannot select dates already taken in your department
            </li>
            <li className="flex items-start">
              <span className="text-gray-500 mr-2">•</span>
              Weekends are automatically excluded
            </li>
          </ul>
        </div>
      </div>

      {/* Modal for applying leave */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Apply for Leave</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={loading}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={loading}
                >
                  {leaveTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                    disabled={loading}
                    min={getMinSelectableDate()}
                    title="Select a start date. Past dates and dates already taken in your department are disabled."
                  />
                  {formData.startDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: {format(parseISO(formData.startDate), 'MMM dd, yyyy')}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    required
                    disabled={loading}
                    min={formData.startDate || getMinSelectableDate()}
                    title="Select an end date. Dates already taken in your department are disabled."
                  />
                  {formData.endDate && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: {format(parseISO(formData.endDate), 'MMM dd, yyyy')}
                    </p>
                  )}
                </div>
              </div>
              
              {formData.startDate && formData.endDate && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium">
                    {calculateBusinessDays(formData.startDate, formData.endDate)} business day(s)
                  </p>
                  
                  {/* Check for conflicts */}
                  {(() => {
                    const { available, conflicts } = checkDateAvailability(formData.startDate, formData.endDate);
                    if (!available) {
                      return (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                          <p className="text-sm text-red-700 font-medium mb-1">Date Conflict Detected!</p>
                          <p className="text-xs text-red-600">
                            The selected dates overlap with leaves taken by:
                          </p>
                          <ul className="text-xs text-red-600 mt-1 space-y-1">
                            {conflicts.slice(0, 2).map((conflict: LeaveRequest, idx: number) => (
                              <li key={idx}>
                                • {conflict.employeeName} ({conflict.type} leave)
                              </li>
                            ))}
                            {conflicts.length > 2 && (
                              <li>...and {conflicts.length - 2} more</li>
                            )}
                          </ul>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  {leaveBalance && formData.type !== 'unpaid' && (
                    <p className="text-xs text-blue-700 mt-2">
                      Balance: {(leaveBalance[formData.type as keyof typeof leaveBalance] as number)} days
                      <br />
                      After: {((leaveBalance[formData.type as keyof typeof leaveBalance] as number) - calculateBusinessDays(formData.startDate, formData.endDate))} days
                    </p>
                  )}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Please provide a reason for your leave"
                  rows={3}
                  required
                  disabled={loading}
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 font-medium text-sm"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium text-sm disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}