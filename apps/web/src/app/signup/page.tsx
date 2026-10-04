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

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();

  useEffect(() => {
    document.title = 'Create account · Workspace';
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof signupSchema>) => {
    try {
      await signup(values.name, values.email, values.password);
      router.push('/');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to create account.';
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
          <h1 className="text-[22px] font-semibold leading-tight text-[var(--color-text)]">Create your account</h1>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
                Full name
              </label>
              <Input id="name" type="text" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register('name')} />
              {errors.name ? <p className="mt-1 text-[12px] text-[var(--color-danger)]">{errors.name.message}</p> : null}
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
                Email
              </label>
              <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
              {errors.email ? <p className="mt-1 text-[12px] text-[var(--color-danger)]">{errors.email.message}</p> : null}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-[var(--color-text)]">
                Password
              </label>
              <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register('password')} />
              {errors.password ? <p className="mt-1 text-[12px] text-[var(--color-danger)]">{errors.password.message}</p> : null}
            </div>

            {errors.root ? <p className="text-[12px] text-[var(--color-danger)]">{errors.root.message}</p> : null}

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-muted)]">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
