'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  increment, 
  getDoc, 
  setDoc, 
  getDocs,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { format, isPast, parseISO, isToday, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, isSameDay, eachDayOfInterval, addDays } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, XCircleIcon, ArrowDownTrayIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, DocumentTextIcon, UserIcon, BuildingOfficeIcon, CheckBadgeIcon, PaperClipIcon, MagnifyingGlassIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/24/outline';

interface LeaveRequest {
  id: string;
  type: string;
  startDate: any;
  endDate: any;
  days: number;
  reason: string;
  status: 'pending_department_manager' | 'pending_admin' | 'approved' | 'rejected' | 'cancelled';
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  departmentManagerId?: string;
  departmentManagerName?: string;
  departmentManagerEmail?: string;
  createdAt: any;
  updatedAt: any;
  
  // Department Manager Action
  departmentManagerAction?: {
    action: 'approved' | 'rejected';
    by: string;
    byId: string;
    at: any;
    comments: string;
  };
  
  // Admin Action
  adminAction?: {
    action: 'approved' | 'rejected';
    by: string;
    byId: string;
    at: any;
    comments: string;
  };
  
  // Rejection info
  rejectedBy?: string;
  rejectedById?: string;
  rejectionReason?: string;
  rejectionLevel?: 'department_manager' | 'admin';
  
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  cancelledBy?: string;
  cancelledAt?: any;
}

type LeaveBalanceType = 'annual' | 'sick' | 'maternity' | 'unpaid';

// Update the LeaveBalance interface
interface LeaveBalance {
  annual: number;
  sick: number;
  maternity: number;
  unpaid: number;
  personal: number; // Add this
  totalDaysAccounted?: number; // Add this
  lastUpdated?: any; // Add this
  lastAutoUpdate?: any; // Add this
  updatedAt: string;
}


const calculateProratedAnnualLeave = (hireDate: string | Date): number => {
  const date = typeof hireDate === 'string' ? parseISO(hireDate) : hireDate;
  const currentYear = new Date().getFullYear();
  
  // If hired in a previous year, give full entitlement
  if (date.getFullYear() < currentYear) {
    return 21;
  }
  
  // If hired this year, calculate pro-rated leave
  const monthsRemaining = 12 - date.getMonth();
  return Math.round((21 / 12) * monthsRemaining);
};

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

const resetAnnualLeaveBalances = async () => {
  try {
    // This should be called by a scheduled function (Cloud Functions) on Jan 1st each year
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const currentYear = new Date().getFullYear();
    
    const updatePromises = usersSnapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const hireDate = userData.hireDate ? parseISO(userData.hireDate) : null;
      
      let annualDays = 21; // Default full entitlement
      
      // If user has a hire date and was hired this year, pro-rate the leave
      if (hireDate && hireDate.getFullYear() === currentYear) {
        const monthsRemaining = 12 - hireDate.getMonth();
        annualDays = Math.round((21 / 12) * monthsRemaining);
      }
      
      await setDoc(doc(db, 'leaveBalance', userId), {
        annual: annualDays,
        sick: 10,
        maternity: 0,
        unpaid: 0,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });
    
    await Promise.all(updatePromises);
    console.log('Annual leave balances reset for new year');
  } catch (error) {
    console.error('Error resetting annual leave balances:', error);
  }
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

// Pagination component
const Pagination = ({ 
  currentPage, 
  totalPages, 
  onPageChange,
  totalItems,
  itemsPerPage,
  startIndex,
  endIndex 
}: { 
  currentPage: number; 
  totalPages: number; 
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  startIndex: number;
  endIndex: number;
}) => {
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }
    
    let prev = 0;
    for (const i of range) {
      if (prev) {
        if (i - prev === 2) {
          rangeWithDots.push(prev + 1);
        } else if (i - prev !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      prev = i;
    }
    
    return rangeWithDots;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-200 bg-white">
      <div className="text-sm text-gray-700 mb-3 sm:mb-0">
        Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
        <span className="font-medium">{Math.min(endIndex, totalItems)}</span> of{' '}
        <span className="font-medium">{totalItems}</span> results
      </div>
      
      <div className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="px-2 py-1 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronDoubleLeftIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 py-1 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        
        <div className="flex items-center space-x-1">
          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={index} className="px-3 py-1 text-sm text-gray-500">...</span>
            ) : (
              <button
                key={index}
                onClick={() => onPageChange(Number(page))}
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {page}
              </button>
            )
          ))}
        </div>
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 py-1 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="px-2 py-1 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronDoubleRightIcon className="w-4 h-4" />
        </button>
      </div>
      
      <div className="mt-3 sm:mt-0 text-sm text-gray-500">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
};

export default function LeavePage() {
  const { user, loading: authLoading, userData } = useAuth();
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
  const [departmentManager, setDepartmentManager] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Access role from user object
  const role = userData?.role || 'employee';
  const userDepartment = userData?.department || '';

  // Fetch department manager
  const fetchDepartmentManager = async () => {
    if (!userData?.department) {
      console.log('No department found for user');
      return;
    }
    
    try {
      console.log('Looking for manager in department:', userData.department);
      
      const q = query(
        collection(db, 'users'),
        where('department', '==', userData.department),
        where('role', 'in', ['manager', 'department_manager']),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      console.log('Query snapshot size:', snapshot.size);
      
      if (!snapshot.empty) {
        const managerDoc = snapshot.docs[0];
        const managerData = managerDoc.data();
        console.log('Found manager:', managerData.displayName, 'Role:', managerData.role);
        
        setDepartmentManager({
          id: managerDoc.id,
          managerId: managerDoc.id,
          managerName: managerData.displayName || managerData.email?.split('@')[0] || 'Manager',
          managerEmail: managerData.email,
          department: managerData.department,
          role: managerData.role
        });
      } else {
        console.log('No manager found for department:', userData.department);
        setDepartmentManager(null);
      }
    } catch (error: any) {
      console.error('Error fetching department manager:', error);
      setDepartmentManager(null);
    }
  };

  // Fetch leave requests based on user role
  const fetchLeaveRequests = async () => {
    if (!user?.uid || !userData) {
      setLeaveRequests([]);
      setLoadingRequests(false);
      return;
    }
    
    setLoadingRequests(true);
    try {
      let q;
      
      // For employees: Show their own requests
      if (role === 'employee') {
        q = query(
          collection(db, 'leaveRequests'),
          where('employeeId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }
      // For department managers: Show requests from their department
      else if (role === 'manager') {
        const managerDepartment = userData.department;
        console.log('Manager fetching requests for department:', managerDepartment);
        
        q = query(
          collection(db, 'leaveRequests'),
          where('department', '==', managerDepartment),
          orderBy('createdAt', 'desc')
        );
      }
      // For Admin: Show all requests
      else if (role === 'admin') {
        q = query(
          collection(db, 'leaveRequests'),
          orderBy('createdAt', 'desc')
        );
      } else {
        q = query(
          collection(db, 'leaveRequests'),
          where('employeeId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LeaveRequest[];
      
      console.log('Fetched leave requests for', role, ':', requests.length);
      setLeaveRequests(requests);
    } catch (error: any) {
      console.error('Error fetching leave requests:', error);
      setLeaveRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Initialize data on component mount
  useEffect(() => {
    if (!user?.uid || !userData) return;
    
    const initData = async () => {
      await fetchDepartmentManager();
      await fetchLeaveRequests();
      
      // Fetch all leave requests in the same department
      if (userDepartment) {
        try {
          const q = query(
            collection(db, 'leaveRequests'),
            where('department', '==', userDepartment),
            where('status', 'in', ['approved', 'pending_department_manager', 'pending_admin'])
          );
          
          const querySnapshot = await getDocs(q);
          const leaves = querySnapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            } as LeaveRequest))
            .filter(leave => leave.employeeId !== user.uid);
          
          setDepartmentLeaves(leaves);

          const blocked: BlockedDate[] = [];
          leaves.forEach((leave: any) => {
            if (leave.startDate && leave.endDate) {
              const start = parseISO(leave.startDate);
              const end = parseISO(leave.endDate);
              
              const daysInLeave = eachDayOfInterval({ start, end });
              
              daysInLeave.forEach(day => {
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
    
    initData();
  }, [user?.uid, userData, userDepartment]);

  // Initialize leave balance
  useEffect(() => {
    const initLeaveBalance = async () => {
      if (user?.uid && !dataInitialized) {
        try {
          const balanceDoc = await getDoc(doc(db, 'leaveBalance', user.uid));
          if (!balanceDoc.exists()) {
            // Check if user has a hire date in userData
            const currentYear = new Date().getFullYear();
            const startOfYear = new Date(currentYear, 0, 1);
            
            let annualDays = 21; // Default full entitlement
            
            // If user has a hire date and was hired this year, pro-rate the leave
            if (userData?.hireDate) {
              let hireDate: Date;
              
              if (typeof userData.hireDate === 'string') {
                hireDate = parseISO(userData.hireDate);
              } else if (userData.hireDate?.seconds) {
                // Firestore timestamp
                hireDate = new Date(userData.hireDate.seconds * 1000);
              } else if (userData.hireDate?.toDate) {
                // Firestore Timestamp object
                hireDate = userData.hireDate.toDate();
              } else {
                // If it's already a Date object or other format
                hireDate = new Date(userData.hireDate);
              }
              
              if (hireDate.getFullYear() === currentYear) {
                // Calculate pro-rated leave based on hire date
                const monthsRemaining = 12 - hireDate.getMonth();
                annualDays = Math.round((21 / 12) * monthsRemaining);
                // Ensure minimum of 1 day
                annualDays = Math.max(1, annualDays);
              }
            }
            
            await setDoc(doc(db, 'leaveBalance', user.uid), {
              annual: annualDays,
              sick: 10,
              maternity: 180,
              unpaid: 999,
              personal: 0,
              updatedAt: new Date().toISOString(),
              lastUpdated: serverTimestamp(),
              lastAutoUpdate: serverTimestamp(),
              totalDaysAccounted: 0
            });
          } else {
            // If document exists, check if it has the right structure
            const balanceData = balanceDoc.data();
            
            // If annual is less than 21 and it's a new year, reset it
            const currentYear = new Date().getFullYear();
            const balanceYear = balanceData.lastUpdated?.seconds 
              ? new Date(balanceData.lastUpdated.seconds * 1000).getFullYear()
              : new Date(balanceData.updatedAt).getFullYear();
              
            if (currentYear > balanceYear) {
              // It's a new year, reset annual leave
              let annualDays = 21;
              
              if (userData?.hireDate) {
                let hireDate: Date;
                
                if (typeof userData.hireDate === 'string') {
                  hireDate = parseISO(userData.hireDate);
                } else if (userData.hireDate?.seconds) {
                  hireDate = new Date(userData.hireDate.seconds * 1000);
                } else {
                  hireDate = new Date(userData.hireDate);
                }
                
                if (hireDate.getFullYear() === currentYear) {
                  const monthsRemaining = 12 - hireDate.getMonth();
                  annualDays = Math.round((21 / 12) * monthsRemaining);
                  annualDays = Math.max(1, annualDays);
                }
              }
              
              // Update the leave balance for new year
              await updateDoc(doc(db, 'leaveBalance', user.uid), {
                annual: annualDays,
                updatedAt: new Date().toISOString(),
                lastUpdated: serverTimestamp(),
                lastAutoUpdate: serverTimestamp()
              });
            }
          }
          setDataInitialized(true);
        } catch (error) {
          console.error('Error initializing leave balance:', error);
          setDataInitialized(true); // Still set to true to prevent infinite loading
        }
      }
    };
    
    initLeaveBalance();
  }, [user?.uid, userData]);

  // Fetch leave balance using react-firebase-hooks
  const leaveBalanceRef = user?.uid ? doc(db, 'leaveBalance', user.uid) : null;
  const [leaveBalanceSnapshot, balanceLoading] = useCollection(
    leaveBalanceRef ? 
      query(collection(db, 'leaveBalance'), where('__name__', '==', user?.uid)) as any 
    : null
  );
  
  const leaveBalance = leaveBalanceSnapshot?.docs?.[0]?.data() as LeaveBalance | undefined;

  // Filter and search logic
  const filteredRequests = useMemo(() => {
    let filtered = leaveRequests;
    
    // Filter based on user role
    if (role === 'manager') {
      // Managers see pending requests from their department
      filtered = filtered.filter(req => 
        req.department === userDepartment && 
        (req.status === 'pending_department_manager' || req.status === 'pending_admin' || req.status === 'approved')
      );
    } else if (role === 'admin') {
      // Admins see all requests (but we'll filter approved to recent ones)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      filtered = filtered.filter(req => {
        if (req.status === 'pending_department_manager' || req.status === 'pending_admin') {
          return true;
        }
        
        // For approved requests, only show recent ones (last 30 days)
        if (req.status === 'approved') {
          const createdAt = req.createdAt?.seconds 
            ? new Date(req.createdAt.seconds * 1000)
            : new Date(req.createdAt);
          return createdAt > thirtyDaysAgo;
        }
        
        return false;
      });
    } else {
      // Employees see their own requests
      filtered = filtered;
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(request => 
        request.employeeName?.toLowerCase().includes(query) ||
        request.department?.toLowerCase().includes(query) ||
        request.type?.toLowerCase().includes(query) ||
        request.reason?.toLowerCase().includes(query) ||
        request.status?.toLowerCase().includes(query) ||
        format(parseISO(request.startDate), 'MMM dd, yyyy').toLowerCase().includes(query) ||
        format(parseISO(request.endDate), 'MMM dd, yyyy').toLowerCase().includes(query)
      );
    }
    
    // Sort: Pending requests first, then by creation date (newest first)
    return filtered.sort((a, b) => {
      const statusPriority: Record<string, number> = {
        'pending_department_manager': 1,
        'pending_admin': 2,
        'approved': 3,
        'rejected': 4,
        'cancelled': 5
      };
      
      const aPriority = statusPriority[a.status] || 6;
      const bPriority = statusPriority[b.status] || 6;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      const aDate = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
      const bDate = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
      
      return bDate - aDate;
    });
  }, [leaveRequests, role, userDepartment, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

  // Get minimum selectable date
  const getMinSelectableDate = (): string => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    
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
    
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    const endDate = new Date(monthEnd);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const isCurrentMonth = currentDate.getMonth() === currentMonth.getMonth();
      const isTodayDate = isToday(currentDate);
      
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
        status: 'pending_department_manager',
        employeeId: user.uid,
        employeeName: user?.displayName || user?.email?.split('@')[0] || 'Employee',
        employeeEmail: user?.email || '',
        department: userData?.department || '',
        departmentManagerId: departmentManager?.managerId || null,
        departmentManagerName: departmentManager?.managerName || null,
        departmentManagerEmail: departmentManager?.managerEmail || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'leaveRequests'), newRequest);
      
      setShowModal(false);
      setFormData({ type: 'annual', startDate: '', endDate: '', reason: '' });
      
      alert('Leave request submitted successfully! It will be reviewed by your department manager.');
      
      fetchLeaveRequests();
      
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
    
    if (formData.endDate && date > formData.endDate) {
      setFormData(prev => ({ ...prev, endDate: '' }));
    }
  };

  const handleEndDateChange = (date: string) => {
    setFormData(prev => ({ ...prev, endDate: date }));
  };

  const canCancelRequest = (request: LeaveRequest) => {
    if (!user || request.employeeId !== user.uid) return false;
    if (request.status !== 'pending_department_manager') return false;
    if (isPast(parseISO(request.startDate))) return false;
    return true;
  };

  const handleCancelRequest = async (requestId: string, request: LeaveRequest) => {
    if (!user?.uid || !canCancelRequest(request)) {
      alert('Cannot cancel this request. It may have already started or been processed.');
      return;
    }
    
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    
    try {
      await updateDoc(doc(db, 'leaveRequests', requestId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: user.uid,
        updatedAt: serverTimestamp()
      });
      
      alert('Leave request cancelled successfully!');
      fetchLeaveRequests();
      
    } catch (error) {
      console.error('Error cancelling leave request:', error);
      alert('Failed to cancel leave request. Please try again.');
    }
  };

  // Department Manager Approval
  const handleManagerApprove = async (requestId: string, comments: string = '') => {
    try {
      const requestRef = doc(db, 'leaveRequests', requestId);
      await updateDoc(requestRef, {
        status: 'pending_admin',
        departmentManagerAction: {
          action: 'approved',
          by: user?.displayName || user?.email,
          byId: user?.uid,
          at: serverTimestamp(),
          comments
        },
        updatedAt: serverTimestamp()
      });
      
      alert('Leave approved and sent to HR for final approval!');
      fetchLeaveRequests();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Department Manager Rejection
  const handleManagerReject = async (requestId: string, reason: string) => {
    if (!reason) {
      alert('Please provide a rejection reason');
      return;
    }
    
    try {
      const requestRef = doc(db, 'leaveRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        departmentManagerAction: {
          action: 'rejected',
          by: user?.displayName || user?.email,
          byId: user?.uid,
          at: serverTimestamp(),
          comments: reason
        },
        rejectedBy: user?.displayName || user?.email,
        rejectedById: user?.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        rejectionLevel: 'department_manager',
        updatedAt: serverTimestamp()
      });
      
      alert('Leave request rejected successfully!');
      fetchLeaveRequests();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Admin Approval
  const handleAdminApprove = async (requestId: string, request: LeaveRequest, comments: string = '') => {
  try {
    const requestRef = doc(db, 'leaveRequests', requestId);
    await updateDoc(requestRef, {
      status: 'approved',
      adminAction: {
        action: 'approved',
        by: user?.displayName || user?.email,
        byId: user?.uid,
        at: serverTimestamp(),
        comments
      },
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // REMOVE THE BALANCE DEDUCTION - Leave balances are fixed per year
    // DO NOT update leaveBalance document here
    
    alert('Leave approved successfully!');
    fetchLeaveRequests();
  } catch (err: any) {
    alert(`Error: ${err.message}`);
  }
};


  // Admin Rejection
  const handleAdminReject = async (requestId: string, reason: string) => {
    if (!reason) {
      alert('Please provide a rejection reason');
      return;
    }
    
    try {
      const requestRef = doc(db, 'leaveRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        adminAction: {
          action: 'rejected',
          by: user?.displayName || user?.email,
          byId: user?.uid,
          at: serverTimestamp(),
          comments: reason
        },
        rejectedBy: user?.displayName || user?.email,
        rejectedById: user?.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        rejectionLevel: 'admin',
        updatedAt: serverTimestamp()
      });
      
      alert('Leave request rejected successfully!');
      fetchLeaveRequests();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Print approved leave document
  const printApprovedLeaveDocument = (request: LeaveRequest) => {
    try {
      const formatDate = (date: any) => {
        if (!date) return 'N/A';
        if (date.seconds) {
          return format(new Date(date.seconds * 1000), 'MMM dd, yyyy');
        }
        return format(new Date(date), 'MMM dd, yyyy');
      };

      const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Approved Leave Request - ${request.id}</title>
    <style>
        @media print {
            @page {
                size: A4;
                margin: 0.35in 0.3in 0.6in 0.3in;
            }
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: Arial, sans-serif;
                font-size: 10pt;
                line-height: 1.2;
                color: #000;
                position: relative;
                min-height: 100vh;
            }
            
            .watermark {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 80pt;
                font-weight: bold;
                color: rgba(0, 0, 0, 0.07);
                z-index: -1;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0.6;
            }
            
            .content-container {
                padding: 15px 10px 180px 10px;
                min-height: calc(100vh - 180px);
                position: relative;
                z-index: 1;
            }
            
            .print-header {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 8px;
                margin-bottom: 15px;
            }
            .company-name {
                font-size: 14pt;
                font-weight: bold;
                margin-bottom: 2px;
            }
            .document-title {
                font-size: 12pt;
                margin-bottom: 5px;
                text-transform: uppercase;
            }
            .status-badge {
                background-color: #10B981;
                color: white;
                padding: 1px 6px;
                border-radius: 10px;
                font-size: 9pt;
                font-weight: bold;
                display: inline-block;
            }
            .compact-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 15px;
            }
            .compact-section {
                border: 1px solid #ccc;
                padding: 8px;
                border-radius: 3px;
                background-color: white;
            }
            .compact-title {
                font-size: 10pt;
                font-weight: bold;
                margin-bottom: 5px;
                border-bottom: 1px solid #999;
                padding-bottom: 2px;
            }
            .compact-row {
                display: flex;
                margin-bottom: 3px;
                font-size: 9pt;
            }
            .compact-label {
                font-weight: bold;
                min-width: 100px;
                flex-shrink: 0;
            }
            .compact-value {
                flex: 1;
                word-break: break-word;
            }
            .days-highlight {
                font-weight: bold;
                color: #059669;
                font-size: 11pt;
            }
            .reason-box {
                border: 1px solid #ccc;
                padding: 8px;
                margin: 8px 0;
                background-color: #f8f9fa;
                border-radius: 3px;
                max-height: 100px;
                overflow: auto;
                font-size: 9pt;
                line-height: 1.3;
            }
            .approval-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin: 10px 0 20px 0;
            }
            .approval-card {
                border: 1px solid #000;
                padding: 6px;
                border-radius: 3px;
                background-color: #f9f9f9;
            }
            .approval-title {
                font-weight: bold;
                font-size: 9pt;
                margin-bottom: 3px;
                color: #333;
            }
            
            .signature-area {
                position: absolute;
                bottom: 40px;
                left: 10px;
                right: 10px;
                z-index: 2;
                background: white;
                padding-top: 10px;
                border-top: 1px solid #eee;
            }
            
            .signature-title {
                font-size: 11pt;
                font-weight: bold;
                text-align: center;
                margin-bottom: 15px;
                padding-bottom: 5px;
                border-bottom: 1px solid #ccc;
            }
            
            .signature-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 15px;
            }
            .signature-box {
                text-align: center;
                font-size: 9pt;
                min-height: 60px;
                position: relative;
            }
            .signature-line {
                border-top: 1px solid #000;
                margin-top: 5px;
                margin-bottom: 8px;
                padding-top: 25px;
            }
            .signature-name {
                font-size: 8pt;
                color: #333;
                margin-top: 3px;
                min-height: 20px;
                word-break: break-word;
            }
            .signature-label {
                font-weight: bold;
                margin-bottom: 5px;
                font-size: 9pt;
            }
            
            .compact-footer {
                position: absolute;
                bottom: 10px;
                left: 10px;
                right: 10px;
                font-size: 7pt;
                text-align: center;
                color: #666;
                padding-top: 5px;
                border-top: 1px dashed #ccc;
                z-index: 2;
            }
            
            .compact-two-column {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 15px;
            }
            .compact-column {
                flex: 1;
            }
        }
    </style>
</head>
<body>
    <!-- Watermark -->
    <div class="watermark">APPROVED</div>
    
    <!-- Main Content -->
    <div class="content-container">
        <!-- Header -->
        <div class="print-header">
            <div class="company-name">${process.env.NEXT_PUBLIC_COMPANY_NAME || 'Company Name'}</div>
            <div class="document-title">LEAVE REQUEST APPROVAL</div>
            <div>Status: <span class="status-badge">APPROVED</span> | Printed: ${format(new Date(), 'MMM dd, yyyy h:mm a')}</div>
        </div>

        <!-- Main Grid - Leave Info -->
        <div class="compact-grid">
            <div class="compact-section text-container">
                <div class="compact-title">Leave Details</div>
                <div class="compact-row">
                    <span class="compact-label">Type:</span>
                    <span class="compact-value">${request.type?.toUpperCase() || 'ANNUAL'} LEAVE</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Duration:</span>
                    <span class="compact-value days-highlight">${request.days || '0'} working days</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Period:</span>
                    <span class="compact-value">${formatDate(request.startDate)} to ${formatDate(request.endDate)}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Department:</span>
                    <span class="compact-value">${request.department || 'N/A'}</span>
                </div>
            </div>

            <div class="compact-section text-container">
                <div class="compact-title">Employee Information</div>
                <div class="compact-row">
                    <span class="compact-label">Name:</span>
                    <span class="compact-value">${request.employeeName || 'N/A'}</span>
                </div>
              
                <div class="compact-row">
                    <span class="compact-label">Email:</span>
                    <span class="compact-value">${request.employeeEmail || 'N/A'}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Request Date:</span>
                    <span class="compact-value">${formatDate(request.createdAt)}</span>
                </div>
            </div>
        </div>

        <!-- Reason -->
        <div class="compact-title">Reason for Leave</div>
        <div class="reason-box">
            ${request.reason || 'No reason provided.'}
        </div>

        <!-- Approval History -->
        <div class="compact-title" style="margin-top: 10px;">Approval History</div>
        <div class="approval-grid">
            ${request.departmentManagerAction ? `
            <div class="approval-card text-container">
                <div class="approval-title">Department Manager</div>
                <div style="font-size: 8pt;">
                    <div><strong>By:</strong> ${request.departmentManagerAction.by || 'N/A'}</div>
                    <div><strong>Date:</strong> ${formatDate(request.departmentManagerAction.at)}</div>
                    <div><strong>Action:</strong> ${request.departmentManagerAction.action.toUpperCase()}</div>
                    ${request.departmentManagerAction.comments ? `<div><strong>Note:</strong> ${request.departmentManagerAction.comments.substring(0, 40)}${request.departmentManagerAction.comments.length > 40 ? '...' : ''}</div>` : ''}
                </div>
            </div>
            ` : ''}

            ${request.adminAction ? `
            <div class="approval-card text-container">
                <div class="approval-title">Admin Approval</div>
                <div style="font-size: 8pt;">
                    <div><strong>By:</strong> ${request.adminAction.by || 'N/A'}</div>
                    <div><strong>Date:</strong> ${formatDate(request.adminAction.at)}</div>
                    <div><strong>Action:</strong> ${request.adminAction.action.toUpperCase()}</div>
                    ${request.adminAction.comments ? `<div><strong>Note:</strong> ${request.adminAction.comments.substring(0, 40)}${request.adminAction.comments.length > 40 ? '...' : ''}</div>` : ''}
                </div>
            </div>
            ` : ''}

            <div class="approval-card text-container">
                <div class="approval-title">Document Info</div>
                <div style="font-size: 8pt;">
                    <div><strong>Leave ID:</strong> ${request.id.substring(0, 8)}</div>
                    <div><strong>Created:</strong> ${formatDate(request.createdAt)}</div>
                    <div><strong>Status:</strong> ${request.status.toUpperCase()}</div>
                    <div><strong>Printed:</strong> ${format(new Date(), 'MMM dd, yyyy')}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Signature Area -->
    <div class="signature-area">
        <div class="signature-title">AUTHORIZED SIGNATURES</div>
        <div class="signature-grid">
            <div class="signature-box">
                <div class="signature-label">Employee</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.employeeName || 'N/A'}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Department Manager</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.departmentManagerAction?.by || 'Approval Required'}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">HR</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.adminAction?.by || 'Approval Required'}</div>
            </div>
        </div>
    </div>

    <!-- Footer -->
    <div class="compact-footer">
        <div>This is an official document generated by the Employee Self-Service System</div>
        <div>Leave ID: ${request.id} | Printed on: ${format(new Date(), 'MMM dd, yyyy h:mm a')}</div>
        <div>For official use only | Page 1 of 1</div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 500);
            }, 100);
        };
    </script>
</body>
</html>`;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Please allow popups for printing');
      }
      
      printWindow.document.write(printContent);
      printWindow.document.close();
      
    } catch (error) {
      console.error('Error printing document:', error);
      alert('Failed to open print dialog. Please try again or check your browser settings.');
    }
  };

  const handleViewDetails = (request: LeaveRequest) => {
    setSelectedRequest(request);
    setShowDetailsModal(true);
  };

  // Check user permissions
  const canApproveAsManager = role === 'manager' && 
    selectedRequest?.status === 'pending_department_manager' &&
    selectedRequest?.department === userData?.department;

  const canApproveAsAdmin = role === 'admin' && 
    selectedRequest?.status === 'pending_admin';

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
      case 'pending_department_manager': return 'bg-yellow-100 text-yellow-800';
      case 'pending_admin': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
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

  const getStatusText = (status: string) => {
    switch(status) {
      case 'pending_department_manager': return 'Pending Dept Manager';
      case 'pending_admin': return 'Pending HR';
      case 'approved': return 'Approved ✓';
      case 'rejected': return 'Rejected';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const isLoading = authLoading || (!dataInitialized && user?.uid) || balanceLoading || loadingRequests;

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

  // If no user is logged in but auth is done loading, show login prompt
  if (!user && !authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please log in</h1>
          <p className="text-gray-600">You need to be logged in to access the leave management system.</p>
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
          {!departmentManager && role === 'employee' && (
            <div className="mt-2 text-sm text-yellow-600">
              <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
              No department manager assigned. Requests will use simplified workflow.
            </div>
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
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mt-0.5 mr-2" />
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
                {role === 'manager' ? 'Department Leave Requests' : 
                 role === 'admin' ? 'Pending & Recent Approved Leaves' : 
                 'My Leave Requests'}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'})
                </span>
              </h2>
              
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search Input */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, department, type..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm w-full sm:w-64"
                  />
                </div>
                
                {/* Items Per Page Selector */}
                <div className="flex items-center space-x-2">
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="5">5 per page</option>
                    <option value="10">10 per page</option>
                    <option value="20">20 per page</option>
                    <option value="50">50 per page</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {paginatedRequests.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-900 font-medium mb-1">No leave requests found</p>
                <p className="text-sm">
                  {role === 'manager' 
                    ? 'No pending leave requests in your department' 
                    : role === 'admin'
                    ? 'No pending or recent approved leave requests'
                    : 'Submit your first leave request using the button above'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
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
                      {paginatedRequests.map((request: LeaveRequest) => (
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
                              {format(parseISO(request.startDate), 'MMM dd')} - {format(parseISO(request.endDate), 'MMM dd')}
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
                              {getStatusText(request.status)}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                onClick={() => handleViewDetails(request)}
                                className="text-sm text-blue-600 hover:text-blue-900 px-2 py-1 hover:bg-blue-50 rounded flex items-center"
                              >
                                <EyeIcon className="w-4 h-4 mr-1" />
                                Details
                              </button>
                              
                              {role === 'manager' && request.status === 'pending_department_manager' && request.department === userData?.department && (
                                <>
                                  <button
                                    onClick={() => handleManagerApprove(request.id, '')}
                                    className="text-sm text-green-600 hover:text-green-900 px-2 py-1 hover:bg-green-50 rounded"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => {
                                      const reason = prompt('Reason for rejection:');
                                      if (reason) handleManagerReject(request.id, reason);
                                    }}
                                    className="text-sm text-red-600 hover:text-red-900 px-2 py-1 hover:bg-red-50 rounded"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              
                              {role === 'admin' && request.status === 'pending_admin' && (
                                <>
                                  <button
                                    onClick={() => handleAdminApprove(request.id, request, '')}
                                    className="text-sm text-green-600 hover:text-green-900 px-2 py-1 hover:bg-green-50 rounded"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => {
                                      const reason = prompt('Reason for rejection:');
                                      if (reason) handleAdminReject(request.id, reason);
                                    }}
                                    className="text-sm text-red-600 hover:text-red-900 px-2 py-1 hover:bg-red-50 rounded"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              
                              {request.employeeId === user?.uid && request.status === 'pending_department_manager' && !isPast(parseISO(request.startDate)) && (
                                <button
                                  onClick={() => handleCancelRequest(request.id, request)}
                                  className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-gray-50 rounded"
                                >
                                  Cancel
                                </button>
                              )}
                              
                             {request.status === 'approved' && role === 'admin' && (
                              <button
                                onClick={() => printApprovedLeaveDocument(request)}
                                className="text-sm text-purple-600 hover:text-purple-900 px-2 py-1 hover:bg-purple-50 rounded flex items-center"
                              >
                                <ArrowDownTrayIcon className="w-4 h-4 mr-1" />
                                Print
                              </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={filteredRequests.length}
                    itemsPerPage={itemsPerPage}
                    startIndex={startIndex}
                    endIndex={endIndex}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* Calendar View - remains the same as before */
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
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">Quick Stats</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Pending Requests:</span>
              <span className="font-medium text-blue-900">
                {leaveRequests.filter((r: any) => r.status === 'pending_department_manager' || r.status === 'pending_admin').length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Approved This Month:</span>
              <span className="font-medium text-blue-900">
               {leaveRequests.filter((r: LeaveRequest) => 
                  r.status === 'approved' && 
                  r.createdAt?.seconds && 
                  new Date(r.createdAt.seconds * 1000).getMonth() === new Date().getMonth()
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
              Annual leave: 21 days per year (pro-rated if hired during the year)
            </li>
            <li className="flex items-start">
              <span className="text-gray-500 mr-2">•</span>
              Balance deducted only when approved by Admin
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
                <XCircleIcon className="w-6 h-6" />
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

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Leave Request Details</h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircleIcon className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Header Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedRequest.type.toUpperCase()} Leave Request
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-gray-600">
                        {format(parseISO(selectedRequest.startDate), 'MMM dd, yyyy')} - {format(parseISO(selectedRequest.endDate), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    selectedRequest.status === 'approved' ? 'bg-green-100 text-green-800' :
                    selectedRequest.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    selectedRequest.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                    selectedRequest.status === 'pending_admin' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {getStatusText(selectedRequest.status)}
                  </span>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Leave Information</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Type:</span>
                          <span className="text-sm font-semibold text-gray-900 capitalize">
                            {selectedRequest.type} Leave
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Duration:</span>
                          <span className="text-sm text-gray-900">
                            {selectedRequest.days} working days
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Period:</span>
                          <span className="text-sm text-gray-900">
                            {format(parseISO(selectedRequest.startDate), 'MMM dd')} - {format(parseISO(selectedRequest.endDate), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Employee Details</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Name:</span>
                          <span className="text-sm text-gray-900">{selectedRequest.employeeName || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Department:</span>
                          <span className="text-sm text-gray-900">{selectedRequest.department || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Email:</span>
                          <span className="text-sm text-gray-900">{selectedRequest.employeeEmail || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Approval Details */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Reason for Leave</h4>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-900">{selectedRequest.reason || 'No reason provided.'}</p>
                      </div>
                    </div>

                    {selectedRequest.status !== 'pending_department_manager' && selectedRequest.status !== 'pending_admin' && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          {selectedRequest.status === 'approved' ? 'Approval Details' : 'Rejection Details'}
                        </h4>
                        <div className="space-y-2">
                          {selectedRequest.departmentManagerAction && (
                            <div className="border-l-4 border-blue-500 pl-3">
                              <p className="text-sm font-medium text-gray-900">Department Manager</p>
                              <p className="text-xs text-gray-600">
                                {selectedRequest.departmentManagerAction.by} • {format(
                                  selectedRequest.departmentManagerAction.at?.seconds ? 
                                    new Date(selectedRequest.departmentManagerAction.at.seconds * 1000) : new Date(),
                                  'MMM dd, yyyy'
                                )}
                              </p>
                              <p className={`text-xs ${selectedRequest.departmentManagerAction.action === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                                {selectedRequest.departmentManagerAction.action.toUpperCase()}
                              </p>
                              {selectedRequest.departmentManagerAction.comments && (
                                <p className="text-xs text-gray-700 mt-1">{selectedRequest.departmentManagerAction.comments}</p>
                              )}
                            </div>
                          )}
                          
                          {selectedRequest.adminAction && (
                            <div className="border-l-4 border-purple-500 pl-3">
                              <p className="text-sm font-medium text-gray-900">Admin</p>
                              <p className="text-xs text-gray-600">
                                {selectedRequest.adminAction.by} • {format(
                                  selectedRequest.adminAction.at?.seconds ? 
                                    new Date(selectedRequest.adminAction.at.seconds * 1000) : new Date(),
                                  'MMM dd, yyyy'
                                )}
                              </p>
                              <p className={`text-xs ${selectedRequest.adminAction.action === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                                {selectedRequest.adminAction.action.toUpperCase()}
                              </p>
                              {selectedRequest.adminAction.comments && (
                                <p className="text-xs text-gray-700 mt-1">{selectedRequest.adminAction.comments}</p>
                              )}
                            </div>
                          )}
                          
                          {selectedRequest.rejectionReason && (
                            <div className="bg-red-50 p-2 rounded">
                              <p className="text-sm font-medium text-red-800">Rejection Reason</p>
                              <p className="text-sm text-red-700">{selectedRequest.rejectionReason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                  {/* Print button for approved leaves */}
                  {selectedRequest.status === 'approved' && (role === 'admin' || selectedRequest.employeeId === user?.uid) && (
                    <button
                      onClick={() => printApprovedLeaveDocument(selectedRequest)}
                      className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                    >
                      <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                      Print Approved Document
                    </button>
                  )}
                  
                  {/* Manager actions */}
                  {canApproveAsManager && (
                    <>
                      <button
                        onClick={async () => {
                          const comments = prompt('Add comments (optional):');
                          await handleManagerApprove(selectedRequest.id, comments || '');
                          setShowDetailsModal(false);
                        }}
                        className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
                      >
                        <CheckCircleIcon className="h-5 w-5 mr-2" />
                        Approve as Manager
                      </button>
                      <button
                        onClick={async () => {
                          const reason = prompt('Reason for rejection:');
                          if (reason) {
                            await handleManagerReject(selectedRequest.id, reason);
                            setShowDetailsModal(false);
                          }
                        }}
                        className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                      >
                        <XCircleIcon className="h-5 w-5 mr-2" />
                        Reject as Manager
                      </button>
                    </>
                  )}
                  
                  {/* Admin actions */}
                  {canApproveAsAdmin && (
                    <>
                      <button
                        onClick={async () => {
                          const comments = prompt('Add comments (optional):');
                          await handleAdminApprove(selectedRequest.id, selectedRequest, comments || '');
                          setShowDetailsModal(false);
                        }}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                      >
                        <CheckBadgeIcon className="h-5 w-5 mr-2" />
                        Approve as HR
                      </button>
                      <button
                        onClick={async () => {
                          const reason = prompt('Reason for rejection:');
                          if (reason) {
                            await handleAdminReject(selectedRequest.id, reason);
                            setShowDetailsModal(false);
                          }
                        }}
                        className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                      >
                        <XCircleIcon className="h-5 w-5 mr-2" />
                        Reject as HR
                      </button>
                    </>
                  )}
                  
                  {/* Cancel button for employee */}
                  {selectedRequest.employeeId === user?.uid && selectedRequest.status === 'pending_department_manager' && !isPast(parseISO(selectedRequest.startDate)) && (
                    <button
                      onClick={async () => {
                        if (confirm('Are you sure you want to cancel this leave request?')) {
                          await handleCancelRequest(selectedRequest.id, selectedRequest);
                          setShowDetailsModal(false);
                        }
                      }}
                      className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm"
                    >
                      Cancel Request
                    </button>
                  )}
                  
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}