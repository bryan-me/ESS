'use client';

import { useAuth } from '@/lib/auth-context';
import FirstLoginPasswordChangeModal from '@/components/PasswordChangeModal';
import { 
  BanknotesIcon, 
  CalendarDaysIcon, 
  ChartBarIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightOnRectangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useEffect, useState } from 'react';
import { 
  format, 
  addDays, 
  isToday, 
  isTomorrow,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  parseISO
} from 'date-fns';

interface DashboardStats {
  annualLeave: number;
  sickLeave: number;
  personalLeave: number;
  usedAnnualLeave: number;
  usedSickLeave: number;
  usedPersonalLeave: number;
  totalDaysWorked: number;
  leaveDaysEarned: number;
  pendingLeaveRequests: number;
  approvedLeaveRequests: number;
  upcomingEvents: Event[];
  recentActivities: Activity[];
  hireDate?: any;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: 'meeting' | 'review' | 'training' | 'deadline' | 'leave';
  user?: string;
}

interface Event {
  id: string;
  title: string;
  date: Date;
  type: 'meeting' | 'review' | 'training' | 'deadline';
}

interface Activity {
  id: string;
  action: string;
  date: Date;
  type: 'leave' | 'payslip' | 'appraisal' | 'profile';
  status: 'approved' | 'pending' | 'rejected' | 'completed';
}

interface LeaveRequest {
  id: string;
  status: string;
  type: string;
  startDate: any;
  endDate: any;
}

export default function DashboardPage() {
  const { user, loading, userData, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<Date[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (user && userData) {
      fetchDashboardData();
    }
  }, [user, userData]);

  useEffect(() => {
    if (user && userData) {
      fetchDashboardData();
    }
  }, [user, userData]);

  useEffect(() => {
    generateCalendar();
    loadCalendarEvents();
  }, [currentMonth, stats]);

  useEffect(() => {
    if (user && !loading) {
      const checkPasswordChangeStatus = async () => {
        try {
          if (!user.uid) return;
          
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const requiresPasswordChange = userData?.requiresPasswordChange;
            
            if (requiresPasswordChange && !showPasswordModal) {
              const passwordChangeShown = sessionStorage.getItem(`passwordChangeShown_${user.uid}`);
              if (!passwordChangeShown) {
                setShowPasswordModal(true);
                sessionStorage.setItem(`passwordChangeShown_${user.uid}`, 'true');
              }
            }
          }
        } catch (error) {
          console.error('Error checking password change status:', error);
        }
      };
      
      checkPasswordChangeStatus();
    }
  }, [user, loading, showPasswordModal]);

  const handlePasswordModalClose = () => {
    setShowPasswordModal(false);
    if (user) {
      sessionStorage.setItem(`passwordChangeShown_${user.uid}`, 'true');
    }
  };

  const generateCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days: Date[] = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      days.push(currentDate);
      currentDate = addDays(currentDate, 1);
    }

    setCalendarDays(days);
  };

  const loadCalendarEvents = async () => {
    if (!user) return;
    
    const events: CalendarEvent[] = [];
    
    // Add upcoming events
    if (stats?.upcomingEvents) {
      stats.upcomingEvents.forEach(event => {
        events.push({
          id: event.id,
          title: event.title,
          date: event.date,
          type: event.type
        });
      });
    }

    // Fetch actual leave requests from Firestore
    try {
      const leaveRequestsRef = collection(db, 'leaveRequests');
      const q = query(leaveRequestsRef, 
        where('employeeId', '==', user.uid),
        where('status', '==', 'approved')
      );
      const leaveRequestsSnap = await getDocs(q);
      
      leaveRequestsSnap.forEach(doc => {
        const data = doc.data();
        const startDate = data.startDate?.toDate();
        const endDate = data.endDate?.toDate();
        
        if (startDate && endDate) {
          let currentDate = startDate;
          while (currentDate <= endDate) {
            events.push({
              id: `${doc.id}_${currentDate.getTime()}`,
              title: `${data.type} Leave`,
              date: new Date(currentDate),
              type: 'leave'
            });
            currentDate = addDays(currentDate, 1);
          }
        }
      });

      // Add team events for managers/admins
      if (userData?.role === 'manager' || userData?.role === 'admin') {
        const teamEventsRef = collection(db, 'events');
        const teamQ = query(teamEventsRef, 
          where('date', '>=', startOfMonth(currentMonth)),
          where('date', '<=', endOfMonth(currentMonth))
        );
        const teamEventsSnap = await getDocs(teamQ);
        
        teamEventsSnap.forEach(doc => {
          const data = doc.data();
          events.push({
            id: doc.id,
            title: data.title,
            date: data.date?.toDate(),
            type: data.type || 'meeting'
          });
        });
      }
    } catch (error) {
      console.error('Error loading calendar events:', error);
    }

    setCalendarEvents(events);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      sessionStorage.removeItem(`passwordChangeShown_${user?.uid}`);
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
      alert('Failed to logout. Please try again.');
    }
  };

  const fetchDashboardData = async () => {
    if (!user) return;

    try {
      const calculateAutomaticLeave = async (userId: string) => {
        try {
          const userRef = doc(db, 'users', userId);
          const balanceRef = doc(db, 'leaveBalance', userId);
          
          const [userSnap, balanceSnap] = await Promise.all([
            getDoc(userRef),
            getDoc(balanceRef)
          ]);
          
          if (!userSnap.exists() || !balanceSnap.exists()) {
            return;
          }
          
          const userData = userSnap.data();
          const balanceData = balanceSnap.data();
          
          let hireDate: Date | null = null;
          
          if (userData.hireDate) {
            if (userData.hireDate.toDate) {
              hireDate = userData.hireDate.toDate();
            } else if (userData.hireDate instanceof Date) {
              hireDate = userData.hireDate;
            } else if (typeof userData.hireDate === 'string') {
              hireDate = new Date(userData.hireDate);
            } else if (userData.hireDate.seconds) {
              hireDate = new Date(userData.hireDate.seconds * 1000);
            }
          }
          
          if (!hireDate || isNaN(hireDate.getTime())) {
            return;
          }
          
          const now = new Date();
          const timeDiff = now.getTime() - hireDate.getTime();
          const daysSinceHire = Math.floor(timeDiff / (1000 * 3600 * 24));
          const leaveDaysEarned = Math.floor(daysSinceHire / 2);
          
          const annualLeave = Math.floor(leaveDaysEarned * 0.6);
          const sickLeave = Math.floor(leaveDaysEarned * 0.3);
          const personalLeave = leaveDaysEarned - annualLeave - sickLeave;
          
          const daysAlreadyAccounted = balanceData.totalDaysAccounted || 0;
          
          if (daysSinceHire > daysAlreadyAccounted) {
            await updateDoc(balanceRef, {
              annual: annualLeave,
              sick: sickLeave,
              personal: personalLeave,
              totalDaysAccounted: daysSinceHire,
              lastAutoUpdate: serverTimestamp(),
              lastUpdated: serverTimestamp()
            });
          }
        } catch (error) {
          console.error('Auto leave calculation error:', error);
        }
      };

      await calculateAutomaticLeave(user.uid);
      
      const balanceRef = doc(db, 'leaveBalance', user.uid);
      const balanceSnap = await getDoc(balanceRef);
      
      const leaveRequestsRef = collection(db, 'leaveRequests');
      const q = query(leaveRequestsRef, where('employeeId', '==', user.uid));
      const leaveRequestsSnap = await getDocs(q);
      
      const leaveRequests: LeaveRequest[] = [];
      leaveRequestsSnap.forEach(doc => {
        leaveRequests.push({ id: doc.id, ...doc.data() } as LeaveRequest);
      });

      let annualLeave = 0;
      let sickLeave = 0;
      let personalLeave = 0;
      let daysSinceHire = 0;
      
      if (balanceSnap.exists()) {
        const balanceData = balanceSnap.data();
        annualLeave = balanceData.annual || 0;
        sickLeave = balanceData.sick || 0;
        personalLeave = balanceData.personal || 0;
      }
      
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const hireDate = userData.hireDate?.toDate() || userData.createdAt?.toDate();
        if (hireDate) {
          const now = new Date();
          const timeDiff = now.getTime() - hireDate.getTime();
          daysSinceHire = Math.floor(timeDiff / (1000 * 3600 * 24));
        }
      }
      
      const pendingRequests = leaveRequests.filter(req => req.status === 'pending').length;
      const approvedRequests = leaveRequests.filter(req => req.status === 'approved').length;
      
      const usedAnnualLeave = leaveRequests
        .filter(req => req.status === 'approved' && req.type === 'annual')
        .reduce((total, req) => {
          const days = Math.ceil((req.endDate.toDate() - req.startDate.toDate()) / (1000 * 60 * 60 * 24)) + 1;
          return total + days;
        }, 0);

      const usedSickLeave = leaveRequests
        .filter(req => req.status === 'approved' && req.type === 'sick')
        .reduce((total, req) => {
          const days = Math.ceil((req.endDate.toDate() - req.startDate.toDate()) / (1000 * 60 * 60 * 24)) + 1;
          return total + days;
        }, 0);

      const usedPersonalLeave = leaveRequests
        .filter(req => req.status === 'approved' && req.type === 'personal')
        .reduce((total, req) => {
          const days = Math.ceil((req.endDate.toDate() - req.startDate.toDate()) / (1000 * 60 * 60 * 24)) + 1;
          return total + days;
        }, 0);

      const upcomingEvents = generateUpcomingEvents(userData?.role || 'employee');
      const recentActivities = generateRecentActivities(leaveRequests, userData);

      setStats({
        annualLeave: annualLeave - usedAnnualLeave,
        sickLeave: sickLeave - usedSickLeave,
        personalLeave: personalLeave - usedPersonalLeave,
        usedAnnualLeave,
        usedSickLeave,
        usedPersonalLeave,
        totalDaysWorked: daysSinceHire,
        leaveDaysEarned: Math.floor(daysSinceHire / 2),
        pendingLeaveRequests: pendingRequests,
        approvedLeaveRequests: approvedRequests,
        upcomingEvents,
        recentActivities,
        hireDate: userDoc.data()?.hireDate || userDoc.data()?.createdAt
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setStats({
        annualLeave: 0,
        sickLeave: 0,
        personalLeave: 0,
        usedAnnualLeave: 0,
        usedSickLeave: 0,
        usedPersonalLeave: 0,
        totalDaysWorked: 0,
        leaveDaysEarned: 0,
        pendingLeaveRequests: 0,
        approvedLeaveRequests: 0,
        upcomingEvents: generateUpcomingEvents(userData?.role || 'employee'),
        recentActivities: [],
        hireDate: null
      });
    } finally {
      setLoadingData(false);
    }
  };

  const generateUpcomingEvents = (role: string): Event[] => {
    const baseEvents = [
      {
        id: '1',
        title: 'Team Meeting',
        date: addDays(new Date(), 1),
        type: 'meeting' as const
      },
      {
        id: '2',
        title: 'Monthly Review',
        date: addDays(new Date(), 7),
        type: 'review' as const
      }
    ];

    if (role === 'employee') {
      return [
        ...baseEvents,
        {
          id: '3',
          title: 'Training Session',
          date: addDays(new Date(), 14),
          type: 'training' as const
        }
      ];
    } else if (role === 'manager') {
      return [
        ...baseEvents,
        {
          id: '3',
          title: 'Budget Planning',
          date: addDays(new Date(), 3),
          type: 'meeting' as const
        },
        {
          id: '4',
          title: 'Team Appraisals',
          date: addDays(new Date(), 10),
          type: 'review' as const
        }
      ];
    } else {
      return [
        ...baseEvents,
        {
          id: '3',
          title: 'Board Meeting',
          date: addDays(new Date(), 2),
          type: 'meeting' as const
        },
        {
          id: '4',
          title: 'Quarterly Planning',
          date: addDays(new Date(), 5),
          type: 'deadline' as const
        }
      ];
    }
  };

  const generateRecentActivities = (leaveRequests: LeaveRequest[], userData: any): Activity[] => {
    const activities: Activity[] = [];

    leaveRequests.slice(0, 3).forEach(req => {
      activities.push({
        id: req.id,
        action: `${req.type.charAt(0).toUpperCase() + req.type.slice(1)} Leave ${req.status}`,
        date: req.startDate?.toDate() || new Date(),
        type: 'leave' as const,
        status: req.status as any
      });
    });

    if (userData?.lastPayslip) {
      activities.push({
        id: 'payslip',
        action: 'Payslip Generated',
        date: userData.lastPayslip.toDate(),
        type: 'payslip',
        status: 'completed'
      });
    }

    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  };

  const getRoleBasedStats = () => {
    const baseStats = [
      { 
        name: 'Annual Leave', 
        value: `${stats?.annualLeave || 15}`, 
        icon: CalendarDaysIcon, 
        color: 'bg-gradient-to-br from-green-500 to-emerald-600',
        subtext: `${stats?.usedAnnualLeave || 5} days used`
      },
      { 
        name: 'Sick Leave', 
        value: `${stats?.sickLeave || 10}`, 
        icon: CalendarDaysIcon, 
        color: 'bg-gradient-to-br from-yellow-500 to-amber-600',
        subtext: `${stats?.usedSickLeave || 0} days used`
      }
    ];

    if (userData?.role === 'employee') {
      return [
        ...baseStats,
        { 
          name: 'Pending', 
          value: `${stats?.pendingLeaveRequests || 0}`, 
          icon: ClockIcon, 
          color: 'bg-gradient-to-br from-blue-500 to-indigo-600',
          subtext: 'Awaiting review'
        },
        { 
          name: 'Approved', 
          value: `${stats?.approvedLeaveRequests || 0}`, 
          icon: CheckCircleIcon, 
          color: 'bg-gradient-to-br from-purple-500 to-violet-600',
          subtext: 'This year'
        }
      ];
    } else if (userData?.role === 'manager') {
      return [
        ...baseStats,
        { 
          name: 'Team Pending', 
          value: '8', 
          icon: UserGroupIcon, 
          color: 'bg-gradient-to-br from-blue-500 to-indigo-600',
          subtext: 'To review'
        },
        { 
          name: 'Team On Leave', 
          value: '3', 
          icon: CalendarDaysIcon, 
          color: 'bg-gradient-to-br from-red-500 to-pink-600',
          subtext: 'Currently out'
        }
      ];
    } else {
      return [
        ...baseStats,
        { 
          name: 'Employees', 
          value: '47', 
          icon: UserGroupIcon, 
          color: 'bg-gradient-to-br from-blue-500 to-indigo-600',
          subtext: 'Active'
        },
        { 
          name: 'Pending', 
          value: '12', 
          icon: DocumentTextIcon, 
          color: 'bg-gradient-to-br from-purple-500 to-violet-600',
          subtext: 'Across teams'
        }
      ];
    }
  };

  const getRoleBasedQuickActions = () => {
    const baseActions = [
      { name: 'Leaves', href: '/leave', description: 'Submit new leave request', color: 'bg-blue-100 text-blue-600' },
      { name: 'Payslips', href: '/payslips', description: 'View salary documents', color: 'bg-green-100 text-green-600' },
    ];

    if (userData?.role === 'employee') {
      return [
        ...baseActions,
        { name: 'Appraisal', href: '/appraisals', description: 'Request review', color: 'bg-purple-100 text-purple-600' },
        { name: 'Profile', href: '/profile', description: 'Update information', color: 'bg-amber-100 text-amber-600' },
      ];
    } else if (userData?.role === 'manager') {
      return [
        ...baseActions,
        { name: 'Review Requests', href: '/leave/approvals', description: 'Approve/reject leaves', color: 'bg-red-100 text-red-600' },
        { name: 'Team', href: '/team', description: 'View team analytics', color: 'bg-indigo-100 text-indigo-600' },
      ];
    } else {
      return [
        ...baseActions,
        { name: 'Manage Users', href: '/admin/users', description: 'Add/edit accounts', color: 'bg-red-100 text-red-600' },
        { name: 'Reports', href: '/admin/reports', description: 'Generate analytics', color: 'bg-indigo-100 text-indigo-600' },
      ];
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const statsData = getRoleBasedStats();
  const quickActions = getRoleBasedQuickActions();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">
                Welcome back, <span className="font-semibold">{user.displayName || user.email}</span>
              </p>
              <div className="mt-1 flex items-center space-x-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  userData?.role === 'admin' ? 'bg-red-100 text-red-800' :
                  userData?.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {userData?.role || 'employee'}
                </span>
                {userData?.department && (
                  <>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-600">{userData.department}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm text-gray-600">Today is</p>
                <p className="text-sm font-semibold text-gray-900">{format(new Date(), 'EEE, MMM d')}</p>
              </div>
              
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoggingOut ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    ...
                  </>
                ) : (
                  <>
                    <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                    Logout
                  </>
                )}
              </button>
              
              <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                {(user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {userData?.role === 'admin' ? 'System Overview' :
             userData?.role === 'manager' ? 'Team Management' :
             'Your Dashboard'}
          </h2>
        </div>

        {/* Stats Grid - More compact */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsData.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.name}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="mt-1 text-xs text-gray-400">{stat.subtext}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Calendar - Takes 2/3 on desktop, full width on mobile */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Calendar Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Calendar</h2>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                      className="p-1.5 rounded-md hover:bg-gray-100"
                    >
                      <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
                    </button>
                    <h3 className="text-base font-semibold text-gray-900 px-2">
                      {format(currentMonth, 'MMMM yyyy')}
                    </h3>
                    <button
                      onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                      className="p-1.5 rounded-md hover:bg-gray-100"
                    >
                      <ChevronRightIcon className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="p-4">
                {/* Weekday Headers - Responsive */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                    <div key={day} className="text-center">
                      <span className="text-xs font-medium text-gray-500">{day}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, dayIdx) => {
                    const dayEvents = calendarEvents.filter(event => 
                      isSameDay(event.date, day)
                    );
                    
                    return (
                      <div
                        key={dayIdx}
                        className={`aspect-square p-1 border border-gray-200 rounded-lg ${
                          !isSameMonth(day, currentMonth) ? 'bg-gray-50' : 'bg-white'
                        } ${isToday(day) ? 'border-blue-500 border-2 bg-blue-50' : ''}`}
                      >
                        <div className="flex flex-col h-full">
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-xs font-medium ${
                              isSameMonth(day, currentMonth)
                                ? 'text-gray-900'
                                : 'text-gray-400'
                            } ${isToday(day) ? 'text-blue-600 font-bold' : ''}`}>
                              {format(day, 'd')}
                            </span>
                            {dayEvents.length > 0 && (
                              <span className="text-xs text-gray-500">
                                {dayEvents.length}
                              </span>
                            )}
                          </div>
                          
                          {/* Events for the day */}
                          <div className="flex-1 space-y-0.5 overflow-y-auto">
                            {dayEvents.slice(0, 3).map((event) => (
                              <div
                                key={event.id}
                                className={`text-[10px] px-1 py-0.5 rounded truncate ${
                                  event.type === 'leave' ? 'bg-red-100 text-red-700' :
                                  event.type === 'meeting' ? 'bg-blue-100 text-blue-700' :
                                  event.type === 'review' ? 'bg-green-100 text-green-700' :
                                  event.type === 'training' ? 'bg-purple-100 text-purple-700' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}
                                title={event.title}
                              >
                                {event.title.length > 10 ? event.title.substring(0, 10) + '...' : event.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend - More compact */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-blue-100 border border-blue-300 rounded-full mr-2"></div>
                      <span className="text-xs text-gray-600">Meetings</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-red-100 border border-red-300 rounded-full mr-2"></div>
                      <span className="text-xs text-gray-600">Leave</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-green-100 border border-green-300 rounded-full mr-2"></div>
                      <span className="text-xs text-gray-600">Reviews</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-purple-100 border border-purple-300 rounded-full mr-2"></div>
                      <span className="text-xs text-gray-600">Training</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Quick Actions and Upcoming Events */}
          <div className="space-y-6">
            {/* Quick Actions - More compact */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-1 gap-2">
                {quickActions.map((action) => (
                  <a
                    key={action.name}
                    href={action.href}
                    className="group p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg ${action.color}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600">{action.name}</h3>
                        <p className="text-xs text-gray-500">{action.description}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Upcoming Events - More compact */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Upcoming Events</h2>
              <div className="space-y-3">
                {stats?.upcomingEvents.slice(0, 3).map((event) => (
                  <div key={event.id} className="p-3 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow duration-200">
                    <div className="flex items-start space-x-3">
                      <div className={`p-1.5 rounded-lg ${
                        event.type === 'meeting' ? 'bg-blue-100 text-blue-600' :
                        event.type === 'review' ? 'bg-green-100 text-green-600' :
                        event.type === 'training' ? 'bg-purple-100 text-purple-600' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {event.type === 'meeting' && <UserGroupIcon className="w-4 h-4" />}
                        {event.type === 'review' && <ArrowTrendingUpIcon className="w-4 h-4" />}
                        {event.type === 'training' && <ChartBarIcon className="w-4 h-4" />}
                        {event.type === 'deadline' && <ClockIcon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate">{event.title}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <CalendarDaysIcon className="h-3 w-3 text-gray-400" />
                          <p className="text-xs text-gray-500">
                            {format(event.date, 'MMM d')} • {format(event.date, 'h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <FirstLoginPasswordChangeModal 
              isOpen={showPasswordModal}
              onClose={handlePasswordModalClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}