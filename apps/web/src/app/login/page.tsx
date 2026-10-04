'use client';

import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    document.title = 'Log in · Workspace';
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      await login(values.email, values.password);
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to log in.';
      setError('root', { message });
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
            <span className="text-sm font-semibold">W</span>
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted)]">Workspace</p>
        </div>

        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h1 className="text-[22px] font-semibold leading-tight text-[var(--color-text)]">Welcome back</h1>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email ? <p className="mt-1 text-[12px] text-[var(--color-danger)]">{errors.email.message}</p> : null}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
              />
              {errors.password ? <p className="mt-1 text-[12px] text-[var(--color-danger)]">{errors.password.message}</p> : null}
            </div>

            {errors.root ? <p className="text-[12px] text-[var(--color-danger)]">{errors.root.message}</p> : null}

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-muted)]">
            Need an account?{' '}
            <Link href="/signup" className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
