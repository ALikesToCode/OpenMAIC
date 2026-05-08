'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AccessCodeModal } from '@/components/access-code-modal';

export default function AccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  return (
    <AccessCodeModal
      open={true}
      onSuccess={() => {
        router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      }}
    />
  );
}
