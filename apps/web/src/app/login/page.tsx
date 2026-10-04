'use client';

import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowUpRight, Check, Eye, EyeOff, FolderKanban, Layers3, Sparkles } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="login-page min-h-screen bg-[var(--color-bg)] p-3 text-[var(--color-text)] sm:p-5 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1440px] overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(28,25,23,0.10)] sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="login-visual relative hidden min-h-[720px] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
          <div className="login-glow login-glow-one" aria-hidden="true" />
          <div className="login-glow login-glow-two" aria-hidden="true" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-lg shadow-black/10">
              <FolderKanban size={20} strokeWidth={1.8} />
            </div>
            <span className="text-lg font-semibold tracking-tight">Workspace</span>
          </div>

          <div className="relative z-10 max-w-[570px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-100">
              <Sparkles size={14} />
              A calmer way to move work forward
            </div>
            <h2 className="max-w-[540px] text-4xl font-semibold leading-[1.08] tracking-[-0.04em] xl:text-[54px]">
              Organize your work. Move projects forward.
            </h2>
            <p className="mt-5 max-w-[440px] text-base leading-7 text-emerald-50/75">
              Bring the people, projects, and next steps that matter into one thoughtful workspace.
            </p>

            <div className="login-preview mt-10 max-w-[520px] rounded-2xl border border-white/15 bg-[#102722]/75 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-300/10 text-emerald-200">
                    <Layers3 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Project board</p>
                    <p className="mt-0.5 text-xs text-emerald-50/55">A clear view of what’s next</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200/15 bg-emerald-200/10 px-2.5 py-1 text-[11px] text-emerald-100">Preview</span>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-4">
                {[
                  { name: 'To do', number: '01', dot: 'bg-slate-300' },
                  { name: 'In progress', number: '02', dot: 'bg-amber-300' },
                  { name: 'Done', number: '03', dot: 'bg-emerald-300' },
                ].map((column) => (
                  <div key={column.name} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.045] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-[11px] text-emerald-50/75">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${column.dot}`} />
                        {column.name}
                      </span>
                      <span className="text-[10px] text-emerald-50/45">{column.number}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="h-2 rounded-full bg-white/15" />
                      <div className="h-2 w-2/3 rounded-full bg-white/10" />
                      <div className="h-2 w-4/5 rounded-full bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs text-emerald-50/75">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200"><Check size={12} /></span>
                  Keep every update in sync
                </div>
                <ArrowUpRight size={15} className="text-emerald-100/60" />
              </div>
            </div>
          </div>

          <p className="relative z-10 text-xs text-emerald-50/45">A shared space for focused, collaborative work.</p>
        </section>

        <section className="flex min-h-[calc(100vh-2rem)] items-center justify-center px-5 py-16 sm:px-10 lg:min-h-0 lg:px-12 xl:px-20">
          <div className="login-form-panel w-full max-w-[410px]">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white">
                <FolderKanban size={20} />
              </div>
              <span className="text-lg font-semibold tracking-tight">Workspace</span>
            </div>

            <div className="mb-8">
              <div className="mb-5 hidden h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-subtle)] text-[var(--color-accent)] lg:flex">
                <FolderKanban size={19} />
              </div>
              <p className="mb-2 text-sm font-medium text-[var(--color-accent)]">Your workspace is waiting</p>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--color-text)] sm:text-[34px]">Welcome back</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">Sign in to pick up where your team left off.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[var(--color-text)]">
                  Email address
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className="h-11 rounded-lg px-3.5 focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/10"
                  {...register('email')}
                />
                {errors.email ? <p id="email-error" role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">{errors.email.message}</p> : null}
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-[var(--color-text)]">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    className="h-11 rounded-lg px-3.5 pr-12 focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-[var(--color-muted)] hover:text-[var(--color-text)] focus-visible:text-[var(--color-text)]"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {errors.password ? <p id="password-error" role="alert" className="mt-1.5 text-xs text-[var(--color-danger)]">{errors.password.message}</p> : null}
              </div>

              {errors.root ? (
                <p role="alert" className="login-error rounded-lg border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 px-3.5 py-3 text-sm text-[var(--color-danger)]">
                  {errors.root.message}
                </p>
              ) : null}

              <Button type="submit" className="h-11 w-full rounded-lg shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" loading={isSubmitting}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
                {!isSubmitting ? <ArrowUpRight size={16} /> : null}
              </Button>
            </form>

            <p className="mt-7 text-center text-sm text-[var(--color-muted)]">
              Need an account?{' '}
              <Link href="/signup" className="font-semibold text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
                Create one
              </Link>
            </p>
            <p className="mt-12 text-center text-xs text-[var(--color-muted)]">Secure sign-in for your team workspace</p>
          </div>
        </section>
      </div>
    </main>
  );
}
