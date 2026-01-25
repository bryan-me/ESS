'use client';

import { useState, useEffect } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  getDocs,
  limit
} from 'firebase/firestore';
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
  ClockIcon,
  XCircleIcon,
  PlusIcon,
  PaperClipIcon,
  UserIcon,
  BuildingOfficeIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';

interface PurchaseRequest {
  id: string;
  title: string;
  description: string;
  amount: number;
  vendorName: string;
  vendorContact: string;
  category: string;
  urgency: string;
  justification: string;
  attachmentUrl?: string;
  
  // Workflow fields
  status: 'pending_manager' | 'pending_ceo' | 'pending_finance' | 'approved' | 'rejected';
  currentLevel?: 'department_manager' | 'ceo' | 'finance';
  
  // Requester info
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  employeeEmail?: string;
  employeeRole?: string;
  
  // Manager info
  departmentManagerId?: string;
  departmentManagerName?: string;
  departmentManagerEmail?: string;
  
  // Timestamps
  createdAt: any;
  submittedAt?: any;
  departmentManagerReviewedAt?: any;
  ceoReviewedAt?: any;
  financeReviewedAt?: any;
  finalApprovedAt?: any;
  approvedAt?: any;
  rejectedAt?: any;
  updatedAt?: any;
  
  // Actions
  departmentManagerAction?: {
    action: 'approved' | 'rejected';
    by: string;
    byId: string;
    at: any;
    comments: string;
  };
  
  ceoAction?: {
    action: 'approved' | 'rejected';
    by: string;
    byId: string;
    at: any;
    comments: string;
  };
  
  financeAction?: {
    action: 'processed' | 'rejected';
    by: string;
    byId: string;
    at: any;
    poNumber: string;
    processedDate: any;
    comments: string;
  };
  
  // Rejection
  rejectedBy?: string;
  rejectedById?: string;
  rejectionReason?: string;
  rejectionLevel?: 'department_manager' | 'ceo' | 'finance';
  
  // Tracking
  referenceNumber?: string;
  purchaseOrderNumber?: string;
  financeNotes?: string;
}

const isStatusMatch = (request: PurchaseRequest, filter: 'pending' | 'approved' | 'rejected'): boolean => {
  if (filter === 'pending') {
    return request.status === 'pending_manager' || 
           request.status === 'pending_ceo' || 
           request.status === 'pending_finance';
  }
  return request.status === filter;
};

export default function PurchaseRequestsPage() {
  const { user, loading: authLoading, userData } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [selectedView, setSelectedView] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [departmentManager, setDepartmentManager] = useState<any>(null);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    vendorName: '',
    vendorContact: '',
    category: 'office_supplies',
    urgency: 'normal',
    justification: '',
    attachmentUrl: ''
  });

  useEffect(() => {
    setMounted(true);
    fetchDepartmentManager();
    fetchPurchaseRequests();
  }, [user, userData]);

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

  // Fetch purchase requests based on user role
  const fetchPurchaseRequests = async () => {
    if (!user?.uid || !userData) {
      setLoadingRequests(false);
      return;
    }
    
    setLoadingRequests(true);
    try {
      let q;
      
      // For employees: Show their own requests
      if (userData.role === 'employee') {
        q = query(
          collection(db, 'purchaseRequests'),
          where('employeeId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }
      // For department managers: Show requests from their department
      else if (userData.role === 'manager') {
        q = query(
          collection(db, 'purchaseRequests'),
          where('employeeDepartment', '==', userData.department),
          orderBy('createdAt', 'desc')
        );
      }
      // For CEO/Admin: Show all requests
      else if (userData.role === 'admin' || userData.role === 'ceo') {
        q = query(
          collection(db, 'purchaseRequests'),
          orderBy('createdAt', 'desc')
        );
      }
      // For Finance: Show all requests
      else if (userData.department?.toLowerCase() === 'finance' || userData.role === 'finance_manager') {
        q = query(
          collection(db, 'purchaseRequests'),
          orderBy('createdAt', 'desc')
        );
      } else {
        // Default: show user's own requests
        q = query(
          collection(db, 'purchaseRequests'),
          where('employeeId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PurchaseRequest[];
      
      console.log('Fetched purchase requests:', requests.length);
      console.log('Sample request:', requests[0]);
      
      setPurchaseRequests(requests);
    } catch (error: any) {
      console.error('Error fetching purchase requests:', error);
      setPurchaseRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Filter requests based on status
  const filteredRequests = purchaseRequests.filter(request => {
    if (statusFilter === 'all') return true;
    return isStatusMatch(request, statusFilter);
  });

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!user?.uid || !userData) throw new Error('User not authenticated');
      
      const referenceNumber = `PR-${format(new Date(), 'yyyy-MM')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      
      const purchaseRequest: Omit<PurchaseRequest, 'id'> = {
        ...formData,
        amount: parseFloat(formData.amount),
        
        // Initial workflow state
        status: 'pending_manager',
        currentLevel: 'department_manager',
        
        // Requester info
        employeeId: user.uid,
        employeeName: user.displayName || user.email?.split('@')[0] || 'Employee',
        employeeDepartment: userData.department || 'General',
        employeeEmail: user.email || '',
        employeeRole: user.role || '',
      
        // Department manager info
        departmentManagerId: departmentManager?.managerId || null,
        departmentManagerName: departmentManager?.managerName || null,
        departmentManagerEmail: departmentManager?.managerEmail || null,
        
        // Timestamps
        createdAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Additional tracking
        referenceNumber,
        justification: formData.justification
      };

      console.log('Creating purchase request:', purchaseRequest);
      await addDoc(collection(db, 'purchaseRequests'), purchaseRequest);
      
      setSuccess(`Purchase request submitted successfully! Reference: ${referenceNumber}. Awaiting department manager approval.`);
      
      setShowCreateModal(false);
      setFormData({
        title: '',
        description: '',
        amount: '',
        vendorName: '',
        vendorContact: '',
        category: 'office_supplies',
        urgency: 'normal',
        justification: '',
        attachmentUrl: ''
      });

      // Refresh the requests list
      fetchPurchaseRequests();
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  // Department Manager Approval
  const handleManagerApprove = async (requestId: string, comments: string = '') => {
    try {
      const requestRef = doc(db, 'purchaseRequests', requestId);
      await updateDoc(requestRef, {
        status: 'pending_ceo',
        currentLevel: 'ceo',
        departmentManagerAction: {
          action: 'approved',
          by: user?.displayName || user?.email,
          byId: user?.uid,
          at: serverTimestamp(),
          comments
        },
        departmentManagerReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      alert('Request approved and sent to CEO for final approval!');
      fetchPurchaseRequests(); // Refresh
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
      const requestRef = doc(db, 'purchaseRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        currentLevel: 'department_manager',
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
      
      alert('Request rejected successfully!');
      fetchPurchaseRequests(); // Refresh
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // CEO Approval
  const handleCEOApprove = async (requestId: string, comments: string = '') => {
    try {
      const requestRef = doc(db, 'purchaseRequests', requestId);
      await updateDoc(requestRef, {
        status: 'approved', // Changed from 'pending_finance'
        currentLevel: 'finance',
        ceoAction: {
          action: 'approved',
          by: user?.displayName || user?.email,
          byId: user?.uid,
          at: serverTimestamp(),
          comments
        },
        ceoReviewedAt: serverTimestamp(),
        finalApprovedAt: serverTimestamp(),
        approvedAt: serverTimestamp(), // Add this
        updatedAt: serverTimestamp()
      });
      
      alert('Request approved successfully! Finance can now process the purchase order.');
      fetchPurchaseRequests(); // Refresh
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // CEO Rejection
  const handleCEOReject = async (requestId: string, reason: string) => {
    if (!reason) {
      alert('Please provide a rejection reason');
      return;
    }
    
    try {
      const requestRef = doc(db, 'purchaseRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        currentLevel: 'ceo',
        ceoAction: {
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
        rejectionLevel: 'ceo',
        updatedAt: serverTimestamp()
      });
      
      alert('Request rejected successfully!');
      fetchPurchaseRequests(); // Refresh
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };




  // Finance Processing
  const handleFinanceProcess = async (requestId: string, poNumber: string, notes: string = '') => {
    if (!poNumber) {
      alert('Please enter a Purchase Order number');
      return;
    }
    
    try {
      const requestRef = doc(db, 'purchaseRequests', requestId);
      await updateDoc(requestRef, {
        // Status remains 'approved' - we're just adding finance processing details
        financeAction: {
          action: 'processed',
          by: user?.displayName || user?.email,
          byId: user?.uid,
          at: serverTimestamp(),
          poNumber,
          processedDate: serverTimestamp(),
          comments: notes
        },
        purchaseOrderNumber: poNumber,
        financeNotes: notes,
        financeReviewedAt: serverTimestamp(),
        processedAt: serverTimestamp(), // Add this
        updatedAt: serverTimestamp()
      });
      
      alert(`Purchase Order ${poNumber} generated successfully!`);
      fetchPurchaseRequests(); // Refresh
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleViewDetails = (request: PurchaseRequest) => {
    setSelectedRequest(request);
    setShowDetailsModal(true);
  };

  // Check user permissions
  const canApproveAsManager = userData?.role === 'manager' && 
    selectedRequest?.status === 'pending_manager' &&
    selectedRequest?.employeeDepartment === userData.department;

  const canApproveAsCEO = (userData?.role === 'admin' || userData?.role === 'ceo') && 
    selectedRequest?.status === 'pending_ceo';

  const canProcessAsFinance = (userData?.department?.toLowerCase() === 'finance' || 
    userData?.role === 'finance_manager') && 
    selectedRequest?.status === 'approved';

  const canApproveReject = userData?.role === 'admin' || 
                           userData?.role === 'ceo' || 
                           userData?.role === 'manager' || 
                           userData?.department?.toLowerCase() === 'finance';
  
  const isFinance = userData?.department?.toLowerCase() === 'finance';



 const printApprovedDocument = (request: PurchaseRequest) => {
  try {
    // Format dates
    const formatDate = (date: any) => {
      if (!date) return 'N/A';
      if (date.seconds) {
        return format(new Date(date.seconds * 1000), 'MMM dd, yyyy');
      }
      return format(new Date(date), 'MMM dd, yyyy');
    };
    
    const formatTime = (date: any) => {
      if (!date) return 'N/A';
      if (date.seconds) {
        return format(new Date(date.seconds * 1000), 'h:mm a');
      }
      return format(new Date(date), 'h:mm a');
    };

    // Create a compact print-friendly HTML document
    const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Approved Purchase Request - ${request.referenceNumber || request.id}</title>
    <style>
        @media print {
            @page {
                size: A4;
                margin: 0.35in 0.3in 0.6in 0.3in; /* More bottom margin for signatures */
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
            
            /* Watermark */
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
            
            /* Main Content Container */
            .content-container {
                padding: 15px 10px 180px 10px; /* Extra bottom padding for signatures */
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
            .reference-number {
                font-size: 10pt;
                font-weight: bold;
                margin-bottom: 3px;
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
                min-width: 90px;
                flex-shrink: 0;
            }
            .compact-value {
                flex: 1;
                word-break: break-word;
            }
            .amount-highlight {
                font-weight: bold;
                color: #059669;
                font-size: 11pt;
            }
            .justification-box {
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
            
            /* Signature Area - Fixed at bottom */
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
                grid-template-columns: repeat(4, 1fr);
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
                padding-top: 25px; /* Space above line for signature */
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
            
            /* Footer */
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
            
            /* Ensure text doesn't get cut */
            .text-container {
                max-height: none;
                overflow: visible;
            }
        }
        
        /* Non-print styles */
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
            z-index: 0;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0.6;
        }
        
        .content-container {
            padding: 15px 10px 180px 10px;
            min-height: calc(100vh - 180px);
        }
        
        .signature-area {
            position: fixed;
            bottom: 40px;
            left: 10px;
            right: 10px;
            background: white;
            padding-top: 10px;
            border-top: 1px solid #eee;
        }
        
        .compact-footer {
            position: fixed;
            bottom: 10px;
            left: 10px;
            right: 10px;
        }
    </style>
</head>
<body>
    <!-- Watermark -->
    <div class="watermark">${request.status.toUpperCase()}</div>
    
    <!-- Main Content -->
    <div class="content-container">
        <!-- Header -->
        <div class="print-header">
            <div class="company-name">${process.env.NEXT_PUBLIC_COMPANY_NAME || 'Company Name'}</div>
            <div class="document-title">PURCHASE REQUEST APPROVAL</div>
            <div class="reference-number">REF: ${request.referenceNumber || 'N/A'}</div>
            <div>Status: <span class="status-badge">APPROVED</span> | Printed: ${format(new Date(), 'MMM dd, yyyy h:mm a')}</div>
        </div>

        <!-- Main Grid - Request Info -->
        <div class="compact-grid">
            <div class="compact-section text-container">
                <div class="compact-title">Request Details</div>
                <div class="compact-row">
                    <span class="compact-label">Title:</span>
                    <span class="compact-value">${request.title}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Amount:</span>
                    <span class="compact-value amount-highlight">₵${request.amount?.toFixed(2) || '0.00'}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Category:</span>
                    <span class="compact-value">${request.category?.replace('_', ' ') || 'N/A'}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Urgency:</span>
                    <span class="compact-value">${request.urgency || 'N/A'}</span>
                </div>
            </div>

            <div class="compact-section text-container">
                <div class="compact-title">Requester & Vendor</div>
                <div class="compact-row">
                    <span class="compact-label">Employee:</span>
                    <span class="compact-value">${request.employeeName || 'N/A'}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Department:</span>
                    <span class="compact-value">${request.employeeDepartment || 'N/A'}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Vendor:</span>
                    <span class="compact-value">${request.vendorName || 'N/A'}</span>
                </div>
                <div class="compact-row">
                    <span class="compact-label">Date:</span>
                    <span class="compact-value">${formatDate(request.createdAt)}</span>
                </div>
            </div>
        </div>

        <!-- Description & Justification -->
        <div class="compact-two-column">
            <div class="compact-column text-container">
                <div class="compact-title">Description</div>
                <div style="font-size: 9pt; line-height: 1.3; padding: 5px; border: 1px solid #eee; border-radius: 3px; min-height: 60px;">
                    ${request.description || 'No description provided.'}
                </div>
            </div>
            <div class="compact-column text-container">
                <div class="compact-title">Business Justification</div>
                <div class="justification-box">
                    ${request.justification || 'No justification provided.'}
                </div>
            </div>
        </div>

        <!-- Approval History - Compact Version -->
        <div class="compact-title" style="margin-top: 10px;">Approval History</div>
        <div class="approval-grid">
            ${request.departmentManagerAction ? `
            <div class="approval-card text-container">
                <div class="approval-title">Dept Manager</div>
                <div style="font-size: 8pt;">
                    <div><strong>By:</strong> ${request.departmentManagerAction.by || 'N/A'}</div>
                    <div><strong>Date:</strong> ${formatDate(request.departmentManagerAction.at)}</div>
                    <div><strong>Action:</strong> ${request.departmentManagerAction.action.toUpperCase()}</div>
                    ${request.departmentManagerAction.comments ? `<div><strong>Note:</strong> ${request.departmentManagerAction.comments.substring(0, 40)}${request.departmentManagerAction.comments.length > 40 ? '...' : ''}</div>` : ''}
                </div>
            </div>
            ` : ''}

            ${request.ceoAction ? `
            <div class="approval-card text-container">
                <div class="approval-title">CEO Approval</div>
                <div style="font-size: 8pt;">
                    <div><strong>By:</strong> ${request.ceoAction.by || 'N/A'}</div>
                    <div><strong>Date:</strong> ${formatDate(request.ceoAction.at)}</div>
                    <div><strong>Action:</strong> ${request.ceoAction.action.toUpperCase()}</div>
                    ${request.ceoAction.comments ? `<div><strong>Note:</strong> ${request.ceoAction.comments.substring(0, 40)}${request.ceoAction.comments.length > 40 ? '...' : ''}</div>` : ''}
                </div>
            </div>
            ` : ''}

            ${request.financeAction ? `
            <div class="approval-card text-container">
                <div class="approval-title">Finance Processing</div>
                <div style="font-size: 8pt;">
                    <div><strong>PO #:</strong> ${request.purchaseOrderNumber || 'N/A'}</div>
                    <div><strong>By:</strong> ${request.financeAction.by || 'N/A'}</div>
                    <div><strong>Date:</strong> ${formatDate(request.financeAction.at)}</div>
                    ${request.financeNotes ? `<div><strong>Note:</strong> ${request.financeNotes.substring(0, 40)}${request.financeNotes.length > 40 ? '...' : ''}</div>` : ''}
                </div>
            </div>
            ` : ''}

            <div class="approval-card text-container">
                <div class="approval-title">Document Info</div>
                <div style="font-size: 8pt;">
                    <div><strong>Reference:</strong> ${request.referenceNumber || 'N/A'}</div>
                    <div><strong>Created:</strong> ${formatDate(request.createdAt)}</div>
                    <div><strong>Status:</strong> ${request.status.toUpperCase()}</div>
                    <div><strong>Printed:</strong> ${format(new Date(), 'MMM dd, yyyy')}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Signature Area - Fixed at bottom -->
    <div class="signature-area">
        <div class="signature-title">AUTHORIZED SIGNATURES</div>
        <div class="signature-grid">
            <div class="signature-box">
                <div class="signature-label">Requester</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.employeeName || 'N/A'}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Department Manager</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.departmentManagerAction?.by || 'Approval Required'}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">CEO</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.ceoAction?.by || 'Approval Required'}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Finance</div>
                <div class="signature-line"></div>
                <div class="signature-name">${request.financeAction?.by || 'Processing Required'}</div>
            </div>
        </div>
    </div>

    <!-- Footer -->
    <div class="compact-footer">
        <div>This is an official document generated by the Employee Self-Service System</div>
        <div>Document ID: ${request.referenceNumber || request.id} | Printed on: ${format(new Date(), 'MMM dd, yyyy h:mm a')}</div>
        <div>For official use only | Page 1 of 1</div>
    </div>

    <script>
        // Auto-trigger print when the document loads
        window.onload = function() {
            // Small delay to ensure content is rendered
            setTimeout(function() {
                window.print();
                // Close the window after printing
                setTimeout(function() {
                    window.close();
                }, 500);
            }, 100);
        };
    </script>
</body>
</html>`;

    // Create a new window for printing
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

  // Show loading state
  if (authLoading || !mounted || loadingRequests) {
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
        
        {/* Content Loading */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Requests</h1>
          <p className="text-sm text-gray-600 mt-1">
            Submit and track your purchase requests
          </p>
          {!departmentManager && userData?.role === 'employee' && (
            <div className="mt-2 text-sm text-yellow-600">
              <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
              No department manager assigned. Requests will use simplified workflow.
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === status 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {status === 'all' ? 'All' : 
                 status === 'pending' ? 'Pending' :
                 status === 'approved' ? 'Approved' : 'Rejected'}
              </button>
            ))}
          </div>

          {/* View Toggle */}
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

          {/* Create Request Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            New Request
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Stats */}
      <PurchaseStats requests={filteredRequests} />

      {/* Purchase Requests */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No purchase requests</h3>
          <p className="text-sm text-gray-600">No {statusFilter !== 'all' ? statusFilter : ''} requests found</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Create Your First Request
          </button>
        </div>
      ) : selectedView === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRequests.map((request) => (
            <PurchaseCard 
              key={request.id} 
              request={request} 
              onViewDetails={handleViewDetails}
              userRole={userData?.role}
              userDepartment={userData?.department}
              canApproveReject={canApproveReject}
              isFinance={isFinance}
              onManagerApprove={handleManagerApprove}
              onManagerReject={handleManagerReject}
              onCEOApprove={handleCEOApprove}
              onCEOReject={handleCEOReject}
              onFinanceProcess={handleFinanceProcess}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {filteredRequests.map((request) => (
            <PurchaseListItem 
              key={request.id} 
              request={request} 
              onViewDetails={handleViewDetails}
              userRole={userData?.role}
              userDepartment={userData?.department}
              canApproveReject={canApproveReject}
              isFinance={isFinance}
              onManagerApprove={handleManagerApprove}
              onManagerReject={handleManagerReject}
              onCEOApprove={handleCEOApprove}
              onCEOReject={handleCEOReject}
              onFinanceProcess={handleFinanceProcess}
            />
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      {showCreateModal && (
        <CreateRequestModal
          formData={formData}
          setFormData={setFormData}
          loading={loading}
          setShowCreateModal={setShowCreateModal}
          handleSubmitRequest={handleSubmitRequest}
        />
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <DetailsModal
          selectedRequest={selectedRequest}
          setShowDetailsModal={setShowDetailsModal}
          canApproveAsManager={canApproveAsManager}
          canApproveAsCEO={canApproveAsCEO}
          canProcessAsFinance={canProcessAsFinance}
          canApproveReject={canApproveReject}
          isFinance={isFinance}
          onManagerApprove={handleManagerApprove}
          onManagerReject={handleManagerReject}
          onCEOApprove={handleCEOApprove}
          onCEOReject={handleCEOReject}
          onFinanceProcess={handleFinanceProcess}
          downloadApprovedPDF={printApprovedDocument}
        />
      )}
    </div>
  );
}

// Stats Component
function PurchaseStats({ requests }: { requests: PurchaseRequest[] }) {
  const totalRequests = requests.length;
  const pendingRequests = requests.filter(r => 
    r.status === 'pending_manager' || 
    r.status === 'pending_ceo' || 
    r.status === 'pending_finance'
  ).length;
  const approvedRequests = requests.filter(r => r.status === 'approved').length;
  const approvedAmount = requests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DocumentTextIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Requests</p>
            <p className="text-xl font-bold text-gray-900">{totalRequests}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <ClockIcon className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Pending</p>
            <p className="text-xl font-bold text-gray-900">{pendingRequests}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Approved</p>
            <p className="text-xl font-bold text-gray-900">{approvedRequests}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <CurrencyDollarIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Approved</p>
            <p className="text-xl font-bold text-gray-900">₵{approvedAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grid Card Component
function PurchaseCard({ request, onViewDetails, userRole, userDepartment, canApproveReject, isFinance, onManagerApprove, onManagerReject, onCEOApprove, onCEOReject, onFinanceProcess }: any) {
  const isPending = request.status === 'pending_manager' || 
                   request.status === 'pending_ceo' || 
                   request.status === 'pending_finance';
  const isApproved = request.status === 'approved';
  const isRejected = request.status === 'rejected';
  
  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'equipment': return 'bg-blue-100 text-blue-800';
      case 'software': return 'bg-purple-100 text-purple-800';
      case 'furniture': return 'bg-green-100 text-green-800';
      case 'services': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'pending_manager': return 'Pending Manager';
      case 'pending_ceo': return 'Pending CEO';
      case 'pending_finance': return 'Pending Finance';
      case 'approved': return 'Approved ✓'; // Add checkmark for approved
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const canUserApproveThis = () => {
    if (userRole === 'manager' && request.status === 'pending_manager' && request.employeeDepartment === userDepartment) {
      return 'manager';
    }
    if ((userRole === 'admin' || userRole === 'ceo') && request.status === 'pending_ceo') {
      return 'ceo';
    }
    if (isFinance && request.status === 'pending_finance') {
      return 'finance';
    }
    return null;
  };

  const approvalType = canUserApproveThis();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">
            {request.title}
          </h3>
          <div className="flex items-center mt-1 text-sm text-gray-500">
            <CalendarIcon className="w-4 h-4 mr-1 flex-shrink-0" />
            <span className="truncate">
              {format(
                request.createdAt?.seconds ? 
                  new Date(request.createdAt.seconds * 1000) : 
                  new Date(request.createdAt), 
                'MMM dd, yyyy'
              )}
            </span>
            {request.referenceNumber && (
              <>
                <span className="mx-2">•</span>
                <span className="truncate">{request.referenceNumber}</span>
              </>
            )}
          </div>
        </div>
        <span className={`ml-2 px-2.5 py-0.5 text-xs font-medium rounded-full ${
          isApproved ? 'bg-green-100 text-green-800' :
          isRejected ? 'bg-red-100 text-red-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {getStatusText(request.status)}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {request.description}
      </p>

      {/* Details */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <CurrencyDollarIcon className="w-4 h-4 mr-2 flex-shrink-0" />
          <span className="font-medium text-gray-900">₵{request.amount?.toFixed(2) || '0.00'}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <BuildingOfficeIcon className="w-4 h-4 mr-2 flex-shrink-0" />
          <span className="truncate">{request.vendorName || 'No vendor specified'}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <UserIcon className="w-4 h-4 mr-2 flex-shrink-0" />
          <span>{request.employeeDepartment || 'N/A'}</span>
        </div>
      </div>

      {/* Category and Urgency */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          getCategoryColor(request.category)
        }`}>
          {request.category?.replace('_', ' ') || 'Other'}
        </span>
        <span className={`text-xs font-medium ${
          request.urgency === 'high' || request.urgency === 'urgent' 
            ? 'text-red-600' 
            : 'text-gray-500'
        }`}>
          {request.urgency?.charAt(0).toUpperCase() + request.urgency?.slice(1)} Priority
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onViewDetails(request)}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <EyeIcon className="w-4 h-4 mr-1.5" />
          View
        </button>
        
        {isFinance && isApproved && (
          <button
            onClick={() => alert(`Downloading purchase order for ${request.referenceNumber}...`)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-1.5" />
            PO
          </button>
        )}
        
        {approvalType === 'manager' && (
          <>
            <button
              onClick={() => onManagerApprove(request.id, '')}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
            >
              <CheckCircleIcon className="w-4 h-4 mr-1.5" />
              Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt('Reason for rejection:');
                if (reason) onManagerReject(request.id, reason);
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
            >
              <XCircleIcon className="w-4 h-4 mr-1.5" />
              Reject
            </button>
          </>
        )}
        
        {request.attachmentUrl && (
          <a
            href={request.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <PaperClipIcon className="w-4 h-4 mr-1.5" />
            Attachment
          </a>
        )}
      </div>
    </div>
  );
}

// List Item Component
function PurchaseListItem({ request, onViewDetails, userRole, userDepartment, canApproveReject, isFinance, onManagerApprove, onManagerReject, onCEOApprove, onCEOReject, onFinanceProcess }: any) {
  const isPending = request.status === 'pending_manager' || 
                   request.status === 'pending_ceo' || 
                   request.status === 'pending_finance';
  const isApproved = request.status === 'approved';
  const isRejected = request.status === 'rejected';
  
  const getStatusIcon = () => {
    if (isApproved) return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    if (isRejected) return <XCircleIcon className="w-5 h-5 text-red-500" />;
    return <ClockIcon className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'pending_manager': return 'Pending Manager';
      case 'pending_ceo': return 'Pending CEO';
      case 'pending_finance': return 'Pending Finance';
      default: return status;
    }
  };

  const canUserApproveThis = () => {
    if (userRole === 'manager' && request.status === 'pending_manager' && request.employeeDepartment === userDepartment) {
      return 'manager';
    }
    if ((userRole === 'admin' || userRole === 'ceo') && request.status === 'pending_ceo') {
      return 'ceo';
    }
    if (isFinance && request.status === 'pending_finance') {
      return 'finance';
    }
    return null;
  };

  const approvalType = canUserApproveThis();

  return (
    <div className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
      <div className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left side - Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {getStatusIcon()}
              <div>
                <h3 className="text-base font-semibold text-gray-900 truncate">
                  {request.title}
                </h3>
                <div className="flex items-center mt-1 text-sm text-gray-500">
                  <span>Ref: {request.referenceNumber || 'N/A'}</span>
                  <span className="mx-2">•</span>
                  <span>{request.employeeDepartment || 'N/A'}</span>
                  <span className="mx-2">•</span>
                  <span className="capitalize">{request.category?.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
              {request.description}
            </p>
            
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center text-gray-700">
                <BuildingOfficeIcon className="w-4 h-4 mr-1.5" />
                <span className="truncate max-w-[200px]">{request.vendorName || 'No vendor'}</span>
              </div>
              <div className="flex items-center text-gray-700">
                <CalendarIcon className="w-4 h-4 mr-1.5" />
                <span>
                  {format(
                    request.createdAt?.seconds ? 
                      new Date(request.createdAt.seconds * 1000) : 
                      new Date(request.createdAt), 
                    'MMM dd, yyyy'
                  )}
                </span>
              </div>
              <div className="flex items-center text-gray-700">
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  request.urgency === 'high' || request.urgency === 'urgent' 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {request.urgency} priority
                </span>
              </div>
            </div>
          </div>

          {/* Right side - Amount and actions */}
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">
                ₵{request.amount?.toFixed(2) || '0.00'}
              </p>
              <span className={`text-sm font-medium ${
                isApproved ? 'text-green-600' :
                isRejected ? 'text-red-600' :
                'text-yellow-600'
              }`}>
                {isPending ? getStatusText(request.status) : 
                 request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onViewDetails(request)}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <EyeIcon className="w-4 h-4 mr-1.5" />
                Details
              </button>
              
              {isFinance && isApproved && (
                <button
                  onClick={() => alert(`Downloading purchase order for ${request.referenceNumber}...`)}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 mr-1.5" />
                  Download
                </button>
              )}
              
              {approvalType === 'manager' && (
                <>
                  <button
                    onClick={() => onManagerApprove(request.id, '')}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Reason for rejection:');
                      if (reason) onManagerReject(request.id, reason);
                    }}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Create Request Modal Component
function CreateRequestModal({ formData, setFormData, loading, setShowCreateModal, handleSubmitRequest }: any) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">New Purchase Request</h2>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="w-6 h-6" />
            </button>
          </div>
          
          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Request Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="e.g., Laptop Purchase"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (GHS) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                rows={3}
                placeholder="Describe what you need and why..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor Name
                </label>
                <input
                  type="text"
                  value={formData.vendorName}
                  onChange={(e) => setFormData({...formData, vendorName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Company name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor Contact
                </label>
                <input
                  type="text"
                  value={formData.vendorContact}
                  onChange={(e) => setFormData({...formData, vendorContact: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Email or phone"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="office_supplies">Office Supplies</option>
                  <option value="equipment">Equipment</option>
                  <option value="furniture">Furniture</option>
                  <option value="software">Software</option>
                  <option value="services">Services</option>
                  <option value="travel">Travel</option>
                  <option value="training">Training</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Urgency *
                </label>
                <select
                  required
                  value={formData.urgency}
                  onChange={(e) => setFormData({...formData, urgency: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Justification *
              </label>
              <textarea
                required
                value={formData.justification}
                onChange={(e) => setFormData({...formData, justification: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                rows={2}
                placeholder="Explain why this purchase is necessary..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attachment URL (Optional)
              </label>
              <input
                type="url"
                value={formData.attachmentUrl}
                onChange={(e) => setFormData({...formData, attachmentUrl: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="https://example.com/quote.pdf"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Details Modal Component
function DetailsModal({ selectedRequest, setShowDetailsModal, canApproveAsManager, canApproveAsCEO, canProcessAsFinance, canApproveReject, isFinance, onManagerApprove, onManagerReject, onCEOApprove, onCEOReject, onFinanceProcess, downloadApprovedPDF }: any) {

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Request Details</h2>
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
                <h3 className="text-lg font-semibold text-gray-900">{selectedRequest.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-600">Ref: {selectedRequest.referenceNumber || 'N/A'}</span>
                  <span className="text-sm text-gray-600">•</span>
                  <span className="text-sm text-gray-600">
                    {format(new Date(selectedRequest.createdAt?.seconds ? 
                      new Date(selectedRequest.createdAt.seconds * 1000) : 
                      selectedRequest.createdAt), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                selectedRequest.status === 'approved' ? 'bg-green-100 text-green-800' :
                selectedRequest.status === 'rejected' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {selectedRequest.status.replace('_', ' ')}
              </span>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Request Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Amount:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        ₵{selectedRequest.amount?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Category:</span>
                      <span className="text-sm text-gray-900 capitalize">
                        {selectedRequest.category?.replace('_', ' ') || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Urgency:</span>
                      <span className="text-sm text-gray-900 capitalize">{selectedRequest.urgency || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Vendor Details</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Vendor:</span>
                      <span className="text-sm text-gray-900">{selectedRequest.vendorName || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Contact:</span>
                      <span className="text-sm text-gray-900">{selectedRequest.vendorContact || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
  <div>
    <h4 className="text-sm font-medium text-gray-700 mb-2">Requester</h4>
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">Name:</span>
        <span className="text-sm text-gray-900">{selectedRequest.employeeName || 'N/A'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">Department:</span>
        <span className="text-sm text-gray-900">{selectedRequest.employeeDepartment || 'N/A'}</span>
      </div>
    </div>
  </div>

  {selectedRequest.status !== 'pending_manager' && selectedRequest.status !== 'pending_ceo' && selectedRequest.status !== 'pending_finance' && (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">
        {selectedRequest.status === 'approved' ? 'Approval Details' : 'Rejection Details'}
      </h4>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">
            {selectedRequest.status === 'approved' ? 'Approved By:' : 'Rejected By:'}
          </span>
          <span className="text-sm text-gray-900">
            {selectedRequest.approvedBy || selectedRequest.rejectedBy || 
             selectedRequest.financeAction?.by || 
             selectedRequest.ceoAction?.by || 
             selectedRequest.departmentManagerAction?.by || 'N/A'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Date:</span>
          <span className="text-sm text-gray-900">
            {format(
              selectedRequest.approvedAt?.seconds ? 
                new Date(selectedRequest.approvedAt.seconds * 1000) :
              selectedRequest.rejectedAt?.seconds ? 
                new Date(selectedRequest.rejectedAt.seconds * 1000) :
                new Date(), 
              'MMM dd, yyyy'
            )}
          </span>
        </div>
        
        {/* Show approval comments if available */}
        {selectedRequest.ceoAction?.comments && (
          <div>
            <span className="text-sm text-gray-600">CEO Comments:</span>
            <p className="text-sm text-gray-900 mt-1">{selectedRequest.ceoAction.comments}</p>
          </div>
        )}
        
        {selectedRequest.departmentManagerAction?.comments && (
          <div>
            <span className="text-sm text-gray-600">Manager Comments:</span>
            <p className="text-sm text-gray-900 mt-1">{selectedRequest.departmentManagerAction.comments}</p>
          </div>
        )}
        
        {selectedRequest.rejectionReason && (
          <div>
            <span className="text-sm text-gray-600">Reason:</span>
            <p className="text-sm text-gray-900 mt-1">{selectedRequest.rejectionReason}</p>
          </div>
        )}
      </div>
      
      {/* PDF Download and Finance Processing Buttons for Approved Requests */}
      {selectedRequest.status === 'approved' && (
        <div className="mt-4 space-y-3">
          <div className="border-t border-gray-200 pt-3">
            <h5 className="text-sm font-medium text-gray-700 mb-3">Document Actions</h5>
            <div className="flex flex-wrap gap-3">
              {/* Download approved document button */}
              <button
                onClick={() => downloadApprovedPDF(selectedRequest)}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
              >
                <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                Download Approved Doc (PDF)
              </button>
              
              {/* Finance processing button */}
              {isFinance && !selectedRequest.purchaseOrderNumber && (
                <button
                  onClick={async () => {
                    const poNumber = prompt('Enter Purchase Order Number (e.g., PO-2024-001):');
                    if (poNumber) {
                      const notes = prompt('Add processing notes (optional):');
                      await onFinanceProcess(selectedRequest.id, poNumber, notes || '');
                    }
                  }}
                  className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                >
                  <BanknotesIcon className="h-5 w-5 mr-2" />
                  Generate Purchase Order
                </button>
              )}
              
              {/* View PO button if already processed */}
              {isFinance && selectedRequest.purchaseOrderNumber && (
                <button
                  onClick={() => alert(`PO Number: ${selectedRequest.purchaseOrderNumber}\nProcessed by: ${selectedRequest.financeAction?.by}\nDate: ${format(new Date(selectedRequest.financeAction?.at?.seconds ? new Date(selectedRequest.financeAction.at.seconds * 1000) : new Date()), 'MMM dd, yyyy')}`)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  View PO: {selectedRequest.purchaseOrderNumber}
                </button>
              )}
              
              {/* Show PO number for non-finance users */}
              {!isFinance && selectedRequest.purchaseOrderNumber && (
                <div className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-800 rounded-lg font-medium text-sm">
                  <BanknotesIcon className="h-5 w-5 mr-2 text-gray-600" />
                  PO: {selectedRequest.purchaseOrderNumber}
                </div>
              )}
            </div>
          </div>
          
          {/* Show finance processing details if available */}
          {selectedRequest.financeAction && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="text-sm font-medium text-blue-800 mb-1">Finance Processing Details</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-blue-700">PO Number:</span>
                  <span className="ml-2 font-medium">{selectedRequest.purchaseOrderNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-blue-700">Processed By:</span>
                  <span className="ml-2 font-medium">{selectedRequest.financeAction.by || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-blue-700">Processed Date:</span>
                  <span className="ml-2 font-medium">
                    {format(
                      selectedRequest.financeAction.at?.seconds ? 
                        new Date(selectedRequest.financeAction.at.seconds * 1000) : new Date(),
                      'MMM dd, yyyy'
                    )}
                  </span>
                </div>
                {selectedRequest.financeNotes && (
                  <div className="md:col-span-2">
                    <span className="text-blue-700">Finance Notes:</span>
                    <p className="mt-1 text-blue-800">{selectedRequest.financeNotes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )}
</div>
            </div>

            {/* Description and Justification */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                <p className="text-sm text-gray-900">{selectedRequest.description || 'No description provided.'}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Business Justification</h4>
                <p className="text-sm text-gray-900">{selectedRequest.justification || 'No justification provided.'}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
              {/* Workflow-specific actions */}
              {canApproveAsManager && (
                <>
                  <button
                    onClick={async () => {
                      const comments = prompt('Add comments (optional):');
                      await onManagerApprove(selectedRequest.id, comments || '');
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
                        await onManagerReject(selectedRequest.id, reason);
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                  >
                    <XCircleIcon className="h-5 w-5 mr-2" />
                    Reject as Manager
                  </button>
                </>
              )}
              
              {canApproveAsCEO && (
                <>
                  <button
                    onClick={async () => {
                      const comments = prompt('Add comments (optional):');
                      await onCEOApprove(selectedRequest.id, comments || '');
                    }}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                  >
                    <CheckBadgeIcon className="h-5 w-5 mr-2" />
                    Approve as CEO
                  </button>
                  <button
                    onClick={async () => {
                      const reason = prompt('Reason for rejection:');
                      if (reason) {
                        await onCEOReject(selectedRequest.id, reason);
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
                  >
                    <XCircleIcon className="h-5 w-5 mr-2" />
                    Reject as CEO
                  </button>
                </>
              )}
              
              {canProcessAsFinance && (
                <>
                  <button
                    onClick={async () => {
                      const poNumber = prompt('Enter Purchase Order Number (e.g., PO-2024-001):');
                      if (poNumber) {
                        const notes = prompt('Add processing notes (optional):');
                        await onFinanceProcess(selectedRequest.id, poNumber, notes || '');
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                  >
                    <BanknotesIcon className="h-5 w-5 mr-2" />
                    Generate Purchase Order
                  </button>
                </>
              )}
              
              {/* Download PO for Finance */}
              {isFinance && selectedRequest.status === 'approved' && (
                <button
                  onClick={() => alert(`Downloading purchase order for ${selectedRequest.referenceNumber}...`)}
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                >
                  <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                  Download PO
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
  );
}