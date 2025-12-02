'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DataSourceConfiguration from '@/components/analytics/DataSourceConfiguration';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if already configured
    const isConfigured = sessionStorage.getItem('isConfigured');
    if (isConfigured === 'true') {
      router.push('/analytics');
    }
  }, [router]);

  return <DataSourceConfiguration />;
}

