'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SchoolLogin from '@/components/auth/SchoolLogin';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if already logged in
    const isAuthenticated = sessionStorage.getItem('isAuthenticated');
    if (isAuthenticated === 'true') {
      router.push('/analytics');
    }
  }, [router]);

  return <SchoolLogin />;
}

