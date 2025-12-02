'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function InternalSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const sessionToken = searchParams.get('sessionToken');
    
    if (!sessionToken) {
      setStatus('error');
      setError('No session token provided');
      return;
    }

    // Use NextAuth to sign in with the internal access provider
    const performSignIn = async () => {
      try {
        console.log('Attempting to sign in with internal access');
        
        const result = await signIn('internal-access', {
          token: sessionToken,
          redirect: false,
        });

        console.log('Sign in result:', result);

        if (result?.error) {
          setStatus('error');
          setError(result.error);
        } else if (result?.ok) {
          setStatus('success');
          // Redirect to dashboard after successful login
          setTimeout(() => {
            router.push('/dashboard');
          }, 1000);
        } else {
          setStatus('error');
          setError('Unknown error occurred');
        }
      } catch (error) {
        console.error('Sign in error:', error);
        setStatus('error');
        setError('Failed to authenticate');
      }
    };

    performSignIn();
  }, [searchParams, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Authenticating internal access...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Granted</h1>
          <p className="text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-red-600 text-6xl mb-4">✗</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => router.push('/login')}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}