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
  ChevronRightIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp
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
  parseISO,
  differenceInDays,
  isPast
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
  upcomingEvents: CalendarEvent[];
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

interface Activity {
  id: string;
  action: string;
  date: Date;
  type: 'leave' | 'purchase_request' | 'appraisal' | 'profile';
  status: 'approved' | 'pending' | 'rejected' | 'completed';
  details?: string;
}

interface LeaveRequest {
  id: string;
  type: string;
  startDate: any;
  endDate: any;
  status: string;
  reason?: string;
  employeeId: string;
  employeeName: string;
  department: string;
  createdAt: any;
}

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

export default function DashboardPage() {
  const { user, loading, userData, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<Date[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [teamStats, setTeamStats] = useState<{
    teamPending: number;
    teamOnLeave: number;
    teamSize: number;
  }>({ teamPending: 0, teamOnLeave: 0, teamSize: 0 });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        } catch (error: any) {
          // Handle offline mode gracefully
          if (error.code === 'unavailable' || error.code === 'failed-precondition') {
            console.warn('Offline - skipping password change check');
          } else {
            console.error('Error checking password change status:', error);
          }
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
        
        // Convert startDate
        let startDate: Date;
        if (data.startDate?.toDate) {
          startDate = data.startDate.toDate();
        } else if (data.startDate instanceof Date) {
          startDate = data.startDate;
        } else if (typeof data.startDate === 'string') {
          startDate = new Date(data.startDate);
        } else if (data.startDate?.seconds) {
          startDate = new Date(data.startDate.seconds * 1000);
        } else {
          return; // Skip if no valid startDate
        }
        
        // Convert endDate
        let endDate: Date;
        if (data.endDate?.toDate) {
          endDate = data.endDate.toDate();
        } else if (data.endDate instanceof Date) {
          endDate = data.endDate;
        } else if (typeof data.endDate === 'string') {
          endDate = new Date(data.endDate);
        } else if (data.endDate?.seconds) {
          endDate = new Date(data.endDate.seconds * 1000);
        } else {
          return; // Skip if no valid endDate
        }
        
        if (startDate && endDate) {
          let currentDate = startDate;
          while (currentDate <= endDate) {
            events.push({
              id: `${doc.id}_${currentDate.getTime()}`,
              title: `${data.type} Leave - ${data.employeeName || 'You'}`,
              date: new Date(currentDate),
              type: 'leave'
            });
            currentDate = addDays(currentDate, 1);
          }
        }
      });

      // Add team events for managers/admins
      if (userData?.role === 'manager' || userData?.role === 'admin') {
        // Fetch team leave requests
        if (userData?.department) {
          const teamLeavesRef = collection(db, 'leaveRequests');
          const teamQ = query(
            teamLeavesRef, 
            where('department', '==', userData.department),
            where('status', '==', 'approved')
          );
          const teamLeavesSnap = await getDocs(teamQ);
          
          teamLeavesSnap.forEach(doc => {
            const data = doc.data();
            if (data.employeeId === user.uid) return; // Skip own leaves
            
            let startDate: Date;
            if (data.startDate?.toDate) {
              startDate = data.startDate.toDate();
            } else if (data.startDate instanceof Date) {
              startDate = data.startDate;
            } else if (typeof data.startDate === 'string') {
              startDate = new Date(data.startDate);
            } else if (data.startDate?.seconds) {
              startDate = new Date(data.startDate.seconds * 1000);
            } else {
              return;
            }
            
            let endDate: Date;
            if (data.endDate?.toDate) {
              endDate = data.endDate.toDate();
            } else if (data.endDate instanceof Date) {
              endDate = data.endDate;
            } else if (typeof data.endDate === 'string') {
              endDate = new Date(data.endDate);
            } else if (data.endDate?.seconds) {
              endDate = new Date(data.endDate.seconds * 1000);
            } else {
              return;
            }
            
            if (startDate && endDate) {
              const today = new Date();
              let currentDate = startDate;
              while (currentDate <= endDate) {
                if (currentDate >= today) {
                  events.push({
                    id: `${doc.id}_${currentDate.getTime()}_team`,
                    title: `${data.type} Leave - ${data.employeeName}`,
                    date: new Date(currentDate),
                    type: 'leave',
                    user: data.employeeName
                  });
                }
                currentDate = addDays(currentDate, 1);
              }
            }
          });
        }
      }

      // Fetch upcoming meetings/events
      const eventsRef = collection(db, 'events');
      const now = new Date();
      const nextMonth = addMonths(now, 1);
      const upcomingQ = query(
        eventsRef,
        where('date', '>=', now),
        where('date', '<=', nextMonth)
      );
      const eventsSnap = await getDocs(upcomingQ);
      
      eventsSnap.forEach(doc => {
        const data = doc.data();
        
        let eventDate: Date;
        if (data.date?.toDate) {
          eventDate = data.date.toDate();
        } else if (data.date instanceof Date) {
          eventDate = data.date;
        } else if (typeof data.date === 'string') {
          eventDate = new Date(data.date);
        } else if (data.date?.seconds) {
          eventDate = new Date(data.date.seconds * 1000);
        } else {
          return;
        }
        
        events.push({
          id: doc.id,
          title: data.title,
          date: eventDate,
          type: data.type || 'meeting'
        });
      });

    } catch (error) {
      console.error('Error loading calendar events:', error);
    }

    setCalendarEvents(events);
  };

  const fetchDashboardData = async () => {
    if (!user) return;

    setLoadingData(true);
    
    try {
      // Fetch user's leave balance
      const balanceRef = doc(db, 'leaveBalance', user.uid);
      const balanceSnap = await getDoc(balanceRef);
      
      // Fetch user's leave requests
      const leaveRequestsRef = collection(db, 'leaveRequests');
      const leaveQ = query(leaveRequestsRef, where('employeeId', '==', user.uid));
      const leaveRequestsSnap = await getDocs(leaveQ);
      
      // Fetch user details
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      // Initialize stats with defaults
      let annualLeave = 15;
      let sickLeave = 10;
      let personalLeave = 5;
      let usedAnnualLeave = 0;
      let usedSickLeave = 0;
      let usedPersonalLeave = 0;
      let pendingLeaveRequests = 0;
      let approvedLeaveRequests = 0;
      let totalDaysWorked = 0;
      let leaveDaysEarned = 0;
      let hireDateValue: any = null;
      
      // Calculate leave balance
      if (balanceSnap.exists()) {
        const balanceData = balanceSnap.data();
        annualLeave = balanceData.annual || 15;
        sickLeave = balanceData.sick || 10;
        personalLeave = balanceData.personal || 5;
      }
      
      // Process leave requests
      const leaveRequests: LeaveRequest[] = [];
      leaveRequestsSnap.forEach(doc => {
        const data = doc.data();
        leaveRequests.push({ 
          id: doc.id, 
          ...data 
        } as LeaveRequest);
      });
      
      // Calculate used leave and counts
      leaveRequests.forEach(req => {
        if (req.status === 'pending') pendingLeaveRequests++;
        if (req.status === 'approved') approvedLeaveRequests++;
        
        if (req.status === 'approved') {
          let startDate: Date;
          let endDate: Date;
          
          // Convert start date
          if (req.startDate?.toDate) {
            startDate = req.startDate.toDate();
          } else if (req.startDate instanceof Date) {
            startDate = req.startDate;
          } else if (typeof req.startDate === 'string') {
            startDate = new Date(req.startDate);
          } else if (req.startDate?.seconds) {
            startDate = new Date(req.startDate.seconds * 1000);
          } else {
            return;
          }
          
          // Convert end date
          if (req.endDate?.toDate) {
            endDate = req.endDate.toDate();
          } else if (req.endDate instanceof Date) {
            endDate = req.endDate;
          } else if (typeof req.endDate === 'string') {
            endDate = new Date(req.endDate);
          } else if (req.endDate?.seconds) {
            endDate = new Date(req.endDate.seconds * 1000);
          } else {
            return;
          }
          
          const days = differenceInDays(endDate, startDate) + 1;
          
          switch (req.type) {
            case 'annual':
              usedAnnualLeave += days;
              break;
            case 'sick':
              usedSickLeave += days;
              break;
            case 'personal':
              usedPersonalLeave += days;
              break;
          }
        }
      });
      
      // Calculate days worked based on hire date
      if (userDoc.exists()) {
        const userDocData = userDoc.data();
        const hireDate = userDocData.hireDate || userDocData.createdAt;
        
        // Convert hire date
        let hireDateObj: Date | null = null;
        if (hireDate) {
          if (typeof hireDate.toDate === 'function') {
            hireDateObj = hireDate.toDate();
          } else if (hireDate instanceof Date) {
            hireDateObj = hireDate;
          } else if (typeof hireDate === 'string') {
            hireDateObj = new Date(hireDate);
          } else if (hireDate?.seconds) {
            hireDateObj = new Date(hireDate.seconds * 1000);
          }
        }
        
        if (hireDateObj && !isNaN(hireDateObj.getTime())) {
          const now = new Date();
          totalDaysWorked = Math.max(0, differenceInDays(now, hireDateObj));
          // Calculate leave days earned (1 day per 2 weeks worked)
          leaveDaysEarned = Math.floor(totalDaysWorked / 14);
          hireDateValue = hireDate;
        }
      }
      
      // Fetch team stats for managers/admins
      if (userData?.role === 'manager' || userData?.role === 'admin') {
        await fetchTeamStats(userData.department);
      }
      
      // Generate upcoming events from real data
      const upcomingEvents = await generateUpcomingEvents();
      
      // Generate recent activities from real leave requests
      const recentActivities = generateRecentActivities(leaveRequests);
      
      setStats({
        annualLeave,
        sickLeave,
        personalLeave,
        usedAnnualLeave,
        usedSickLeave,
        usedPersonalLeave,
        totalDaysWorked,
        leaveDaysEarned,
        pendingLeaveRequests,
        approvedLeaveRequests,
        upcomingEvents,
        recentActivities,
        hireDate: hireDateValue
      });

    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      
      // Provide fallback data
      setStats({
        annualLeave: 15,
        sickLeave: 10,
        personalLeave: 5,
        usedAnnualLeave: 0,
        usedSickLeave: 0,
        usedPersonalLeave: 0,
        totalDaysWorked: 0,
        leaveDaysEarned: 0,
        pendingLeaveRequests: 0,
        approvedLeaveRequests: 0,
        upcomingEvents: [],
        recentActivities: [],
        hireDate: null
      });
    } finally {
      setLoadingData(false);
    }
  };

  const fetchTeamStats = async (department: string) => {
    try {
      // Fetch team members
      const usersRef = collection(db, 'users');
      const teamQ = query(usersRef, where('department', '==', department));
      const teamSnap = await getDocs(teamQ);
      const teamSize = teamSnap.size;
      
      // Fetch pending leave requests from team
      const leaveRequestsRef = collection(db, 'leaveRequests');
      const pendingQ = query(
        leaveRequestsRef, 
        where('department', '==', department),
        where('status', '==', 'pending')
      );
      const pendingSnap = await getDocs(pendingQ);
      const teamPending = pendingSnap.size;
      
      // Fetch current leave requests (approved and ongoing)
      const today = new Date();
      const leaveQ = query(
        leaveRequestsRef,
        where('department', '==', department),
        where('status', '==', 'approved')
      );
      const leaveSnap = await getDocs(leaveQ);
      
      let teamOnLeave = 0;
      leaveSnap.forEach(doc => {
        const data = doc.data();
        
        let startDate: Date;
        let endDate: Date;
        
        // Convert dates
        if (data.startDate?.toDate) {
          startDate = data.startDate.toDate();
        } else if (data.startDate instanceof Date) {
          startDate = data.startDate;
        } else if (typeof data.startDate === 'string') {
          startDate = new Date(data.startDate);
        } else if (data.startDate?.seconds) {
          startDate = new Date(data.startDate.seconds * 1000);
        } else {
          return;
        }
        
        if (data.endDate?.toDate) {
          endDate = data.endDate.toDate();
        } else if (data.endDate instanceof Date) {
          endDate = data.endDate;
        } else if (typeof data.endDate === 'string') {
          endDate = new Date(data.endDate);
        } else if (data.endDate?.seconds) {
          endDate = new Date(data.endDate.seconds * 1000);
        } else {
          return;
        }
        
        if (startDate <= today && endDate >= today) {
          teamOnLeave++;
        }
      });
      
      setTeamStats({ teamPending, teamOnLeave, teamSize });
      
    } catch (error) {
      console.error('Error fetching team stats:', error);
    }
  };

  const generateUpcomingEvents = async (): Promise<CalendarEvent[]> => {
    const events: CalendarEvent[] = [];
    
    try {
      // Fetch upcoming leave requests
      const leaveRequestsRef = collection(db, 'leaveRequests');
      const today = new Date();
      const nextWeek = addDays(today, 7);
      
      const upcomingLeavesQ = query(
        leaveRequestsRef,
        where('employeeId', '==', user?.uid),
        where('status', '==', 'approved'),
        where('startDate', '>=', today),
        where('startDate', '<=', nextWeek)
      );
      
      const leavesSnap = await getDocs(upcomingLeavesQ);
      
      leavesSnap.forEach(doc => {
        const data = doc.data();
        
        let startDate: Date;
        if (data.startDate?.toDate) {
          startDate = data.startDate.toDate();
        } else if (data.startDate instanceof Date) {
          startDate = data.startDate;
        } else if (typeof data.startDate === 'string') {
          startDate = new Date(data.startDate);
        } else if (data.startDate?.seconds) {
          startDate = new Date(data.startDate.seconds * 1000);
        } else {
          return;
        }
        
        events.push({
          id: doc.id,
          title: `${data.type} Leave`,
          date: startDate,
          type: 'leave'
        });
      });
      
      // Add some default events if no real events
      if (events.length === 0) {
        events.push({
          id: 'default1',
          title: 'Team Meeting',
          date: addDays(new Date(), 1),
          type: 'meeting'
        });
        
        if (userData?.role === 'manager' || userData?.role === 'admin') {
          events.push({
            id: 'default2',
            title: 'Department Review',
            date: addDays(new Date(), 3),
            type: 'review'
          });
        }
      }
      
    } catch (error) {
      console.error('Error generating upcoming events:', error);
      
      // Fallback events
      events.push({
        id: 'fallback1',
        title: 'Monthly Review',
        date: addDays(new Date(), 5),
        type: 'review'
      });
    }
    
    return events.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
  };

  const generateRecentActivities = (leaveRequests: LeaveRequest[]): Activity[] => {
    const activities: Activity[] = [];
    
    // Add leave request activities
    leaveRequests.slice(0, 5).forEach(req => {
      let activityDate = new Date();
      
      // Try to get a valid date
      if (req.createdAt) {
        if (req.createdAt?.toDate) {
          activityDate = req.createdAt.toDate();
        } else if (req.createdAt instanceof Date) {
          activityDate = req.createdAt;
        } else if (typeof req.createdAt === 'string') {
          activityDate = new Date(req.createdAt);
        } else if (req.createdAt?.seconds) {
          activityDate = new Date(req.createdAt.seconds * 1000);
        }
      }
      
      activities.push({
        id: req.id,
        action: `${req.type.charAt(0).toUpperCase() + req.type.slice(1)} Leave`,
        date: activityDate,
        type: 'leave',
        status: req.status as any,
        details: req.reason ? `Reason: ${req.reason.substring(0, 30)}...` : undefined
      });
    });
    
    // Sort by date (newest first)
    return activities.sort((a, b) => b.date.getTime() - a.date.getTime());
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

  const getRoleBasedStats = () => {
    const baseStats = [
      { 
        name: 'Annual Leave', 
        value: `${stats?.annualLeave || 15}`, 
        icon: CalendarDaysIcon, 
        color: 'bg-gradient-to-br from-green-500 to-emerald-600',
        subtext: `${stats?.usedAnnualLeave || 0} days used`
      },
      { 
        name: 'Sick Leave', 
        value: `${stats?.sickLeave || 10}`, 
        icon: CalendarDaysIcon, 
        color: 'bg-gradient-to-br from-yellow-500 to-amber-600',
        subtext: `${stats?.usedSickLeave || 0} days used`
      },
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

    if (userData?.role === 'manager' || userData?.role === 'admin') {
      return [
        ...baseStats.slice(0, 2),
        { 
          name: 'Team Pending', 
          value: `${teamStats.teamPending}`, 
          icon: UserGroupIcon, 
          color: 'bg-gradient-to-br from-blue-500 to-indigo-600',
          subtext: 'To review'
        },
        { 
          name: 'Team On Leave', 
          value: `${teamStats.teamOnLeave}`, 
          icon: CalendarDaysIcon, 
          color: 'bg-gradient-to-br from-red-500 to-pink-600',
          subtext: 'Currently out'
        }
      ];
    }

    return baseStats;
  };

  const getRoleBasedQuickActions = () => {
    const baseActions = [
      { name: 'Leaves', href: '/leave', description: 'Submit new leave request', color: 'bg-blue-100 text-blue-600' },
      { name: 'Purchase Requests', href: '/purchase-requests', description: 'View purchase requests', color: 'bg-green-100 text-green-600' },
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

        {/* Stats Grid */}
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
                  {stat.name.includes('Team') && teamStats.teamSize > 0 && (
                    <span className="text-xs text-gray-500">
                      Team: {teamStats.teamSize}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="mt-1 text-xs text-gray-400">{stat.subtext}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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

              <div className="p-4">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center">
                      <span className="text-xs font-medium text-gray-500">{day}</span>
                    </div>
                  ))}
                </div>

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

          {/* Right Column */}
          <div className="space-y-6">
            {/* Quick Actions */}
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

            {/* Offline Indicator */}
            {!isOnline && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex items-center">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
                  <p className="ml-3 text-sm text-yellow-700">
                    You're currently offline. Some features may be limited.
                  </p>
                </div>
              </div>
            )}

            {/* Upcoming Events */}
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
                        {event.type === 'leave' && <CalendarDaysIcon className="w-4 h-4" />}
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
                {(!stats?.upcomingEvents || stats.upcomingEvents.length === 0) && (
                  <p className="text-sm text-gray-500 text-center py-2">No upcoming events</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FirstLoginPasswordChangeModal 
        isOpen={showPasswordModal}
        onClose={handlePasswordModalClose}
      />
    </div>
  );
}