'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { EyeIcon, EyeSlashIcon, LockClosedIcon, EnvelopeIcon, BuildingOfficeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError('');
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-md w-full space-y-8 z-10">
        {/* Header Section */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 transform rotate-6">
                <BuildingOfficeIcon className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <ShieldCheckIcon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent mb-2">
            Employee Portal
          </h1>
          <p className="text-gray-400 text-lg font-light">
            Secure Self-Service Dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-700/50 overflow-hidden">
          <div className="p-8">
            {/* Progress Indicator */}
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <div className="w-12 h-1 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"></div>
                <div className="w-3 h-3 rounded-full bg-gray-600"></div>
                <div className="w-12 h-1 rounded-full bg-gray-600"></div>
                <div className="w-3 h-3 rounded-full bg-gray-600"></div>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-5">
                {/* Email Input */}
                <div className="group">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2 ml-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <EnvelopeIcon className="h-5 w-5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-12 pr-4 py-4 bg-gray-900/50 border border-gray-700 rounded-2xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 hover:border-gray-600"
                      placeholder="employee@company.com"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="group">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2 ml-1">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <LockClosedIcon className="h-5 w-5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-12 pr-12 py-4 bg-gray-900/50 border border-gray-700 rounded-2xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 hover:border-gray-600"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-gray-500 hover:text-gray-300 transition-colors" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-500 hover:text-gray-300 transition-colors" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="animate-fadeIn bg-red-900/30 border border-red-700/50 rounded-xl p-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 to-red-500 flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-red-200">{error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className="relative inline-flex items-center"
                  >
                    <div className={`w-5 h-5 rounded border ${rememberMe ? 'bg-blue-500 border-blue-500' : 'border-gray-600'} transition-all duration-200 flex items-center justify-center`}>
                      {rememberMe && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="ml-3 text-sm text-gray-400 hover:text-gray-300 transition-colors cursor-pointer">
                      Remember me
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="relative w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white font-semibold text-lg hover:from-blue-500 hover:via-blue-400 hover:to-indigo-400 focus:outline-none focus:ring-4 focus:ring-blue-500/30 transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center">
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <LockClosedIcon className="w-5 h-5 mr-2" />
                      Sign In to Dashboard
                    </>
                  )}
                </span>
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-gray-800/50 text-gray-500 font-medium">
                    Secure Connection
                  </span>
                </div>
              </div>

              {/* Security Badge */}
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                <span>256-bit SSL Encryption</span>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="bg-gray-900/50 px-8 py-6 border-t border-gray-700/50 rounded-b-3xl">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                <span>Powered by</span>
                <span className="ml-2 font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                  Quadrah
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-xs text-gray-500">System Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Credentials */}
        {/* <div className="mt-8 p-4 bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/50">
          <div className="text-center text-sm text-gray-400 mb-2">
            Demo Credentials
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <div className="text-gray-500">Email:</div>
              <div className="text-gray-300 font-mono">admin@example.com</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-500">Password:</div>
              <div className="text-gray-300 font-mono">password123</div>
            </div>
          </div>
        </div> */}
      </div>

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}