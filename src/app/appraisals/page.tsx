'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function AppraisalsPage() {
  const { user, role } = useAuth();
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Mock appraisals data - similar to Leave page's approach
  const appraisals = [
    {
      id: '1',
      period: 'Q1 2024',
      overallRating: 4.2,
      status: 'completed',
      criteria: {
        qualityOfWork: { rating: 4, comment: 'Excellent attention to detail' },
        productivity: { rating: 4.5, comment: 'Consistently meets deadlines' },
        communication: { rating: 3.8, comment: 'Good team communication' },
        initiative: { rating: 4, comment: 'Takes initiative on projects' },
        teamwork: { rating: 4.5, comment: 'Great team player' }
      },
      comments: 'Jane has shown exceptional growth this quarter. Her attention to detail and teamwork have been outstanding. Keep up the great work!',
      employeeId: '1',
      managerId: '2',
      date: '2024-03-15'
    },
    {
      id: '2',
      period: 'Q4 2023',
      overallRating: 3.8,
      status: 'completed',
      criteria: {
        qualityOfWork: { rating: 3.5, comment: 'Good work quality' },
        productivity: { rating: 4, comment: 'Productive and efficient' },
        communication: { rating: 3.5, comment: 'Communicates effectively' },
        initiative: { rating: 3, comment: 'Could take more initiative' },
        teamwork: { rating: 4, comment: 'Works well with others' }
      },
      comments: 'Solid performance this quarter. Focus on taking more initiative in upcoming projects.',
      employeeId: '1',
      managerId: '2',
      date: '2023-12-20'
    }
  ];

  // Filter appraisals based on role
  const filteredAppraisals = role === 'manager' 
    ? appraisals.filter(a => a.managerId === '2') // Mock manager ID
    : appraisals.filter(a => a.employeeId === '1'); // Mock employee ID

  const handleSubmitReview = async (data: any) => {
    // In a real app, this would submit to Firestore
    alert('Appraisal submitted successfully! (Demo mode)');
    setShowReviewModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Appraisals</h1>
          <p className="text-sm text-gray-600 mt-1">Track and manage performance reviews</p>
        </div>
        
        {role === 'manager' && (
          <button
            onClick={() => setShowReviewModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
          >
            Schedule Review
          </button>
        )}
      </div>

      {role === 'manager' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Members for Review</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Jane Employee', department: 'Sales', nextReview: 'Q2 2024' },
              { name: 'Mike Developer', department: 'Engineering', nextReview: 'Q2 2024' },
              { name: 'Sarah Designer', department: 'Design', nextReview: 'Q3 2024' }
            ].map((member, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <h3 className="font-medium text-gray-900">{member.name}</h3>
                <p className="text-sm text-gray-600">{member.department}</p>
                <div className="mt-2">
                  <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                    Next: {member.nextReview}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {filteredAppraisals.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No appraisals found</h3>
            <p className="text-gray-600">
              {role === 'manager' 
                ? 'Schedule performance reviews for your team members'
                : 'No performance reviews have been conducted yet'}
            </p>
          </div>
        ) : (
          filteredAppraisals.map((appraisal) => (
            <div key={appraisal.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {appraisal.period} Performance Review
                  </h3>
                  <div className="flex items-center mt-1 space-x-4">
                    <div className="flex items-center">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(appraisal.overallRating / 5) * 100}%` }}
                        />
                      </div>
                      <span className="ml-2 text-sm font-medium text-gray-700">
                        {appraisal.overallRating.toFixed(1)}/5
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(appraisal.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  appraisal.status === 'completed' 
                    ? 'bg-green-100 text-green-800'
                    : appraisal.status === 'in-progress'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {appraisal.status}
                </span>
              </div>
              
              <div className="mt-6 space-y-4">
                <h4 className="font-medium text-gray-900">Performance Criteria</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(appraisal.criteria).map(([key, value]: [string, any]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className="text-sm font-semibold text-blue-600">
                          {value.rating}/5
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(value.rating / 5) * 100}%` }}
                        />
                      </div>
                      {value.comment && (
                        <p className="text-xs text-gray-600 mt-1">{value.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {appraisal.comments && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-2">Manager's Summary</h4>
                  <p className="text-sm text-gray-600">{appraisal.comments}</p>
                </div>
              )}
              
              <div className="mt-6 flex justify-end">
                <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  View Detailed Report →
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal for scheduling review */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Schedule Performance Review</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Employee
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option>Jane Employee - Sales</option>
                  <option>Mike Developer - Engineering</option>
                  <option>Sarah Designer - Design</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Review Period
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option>Q2 2024</option>
                  <option>Q3 2024</option>
                  <option>Q4 2024</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmitReview({})}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
                >
                  Schedule Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
