import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { EASE_OUT_EXPO } from '../lib/motion';
import { FormField } from '../components/FormField';
import { ConfirmDialog } from '../components/ConfirmDialog';

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});
type LoginForm = z.infer<typeof loginSchema>;

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
    newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter.'),
    confirmPassword: z.string().min(1, 'Konfirmasi kata sandi wajib diisi.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok.',
    path: ['confirmPassword'],
  });
type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {off ? (
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a13.16 13.16 0 0 1 1.67-2.94M6.23 6.23A10 10 0 0 1 12 4c7 0 10 7 10 7a13.17 13.17 0 0 1-1.32 2.4M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function LoginPage() {
  const { user, loading, login, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mustChange, setMustChange] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();
  const shakeControls = useAnimationControls();

  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const changeForm = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) });

  if (!loading && user && !mustChange) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    setLoginError(null);
    try {
      const loggedIn = await login(values.username, values.password);
      if (loggedIn.mustChangePassword) {
        setMustChange(true);
      } else {
        const from = (location.state as { from?: string } | null)?.from ?? '/';
        navigate(from, { replace: true });
      }
    } catch (error) {
      setLoginError(
        error instanceof ApiError ? error.message : 'Login gagal. Coba lagi.',
      );
      if (!reduceMotion) {
        void shakeControls.start({
          x: [0, -6, 6, -4, 4, 0],
          transition: { duration: 0.4, ease: EASE_OUT_EXPO },
        });
      }
    }
  };

  const onChangePassword = async (values: ChangePasswordForm) => {
    setChangeError(null);
    try {
      await api<null>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      await refresh();
      setMustChange(false);
      navigate('/', { replace: true });
    } catch (error) {
      setChangeError(
        error instanceof ApiError ? error.message : 'Gagal mengubah kata sandi. Coba lagi.',
      );
    }
  };

  return (
    <div className="flex min-h-screen bg-stone-100">
      {/* Panel identitas merah — hanya desktop; motif garis diagonal kereta cepat. */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
        className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 to-brand-900 p-10 text-white lg:flex"
      >
        <div
          aria-hidden="true"
          className="speed-lines streak-drift pointer-events-none absolute -inset-16"
        />
        <div className="relative">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 font-display text-lg font-bold"
          >
            P
          </span>
          <p className="mt-4 font-display text-2xl font-bold leading-tight">Presensi Magang</p>
          <p className="text-sm text-white/70">KCIC</p>
        </div>
        <p className="relative max-w-xs text-sm leading-relaxed text-white/80">
          Presensi peserta magang — cepat, tepat, tercatat.
        </p>
      </motion.div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 font-display text-sm font-bold text-white"
            >
              P
            </span>
            <span className="leading-tight">
              <span className="block font-display font-bold text-stone-900">Presensi Magang KCIC</span>
              <span className="block text-xs text-stone-500">Masuk dengan akun yang diberikan admin.</span>
            </span>
          </div>

          <motion.form
            animate={shakeControls}
            className="card space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            {loginError ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {loginError}
              </p>
            ) : null}
            <FormField label="Username" required error={form.formState.errors.username?.message}>
              {(props) => (
                <input
                  {...props}
                  {...form.register('username')}
                  className="input"
                  autoComplete="username"
                  autoFocus
                />
              )}
            </FormField>
            <FormField label="Kata sandi" required error={form.formState.errors.password?.message}>
              {(props) => (
                <div className="relative">
                  <input
                    {...props}
                    {...form.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-12"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 my-auto flex h-9 w-9 items-center justify-center rounded-md text-stone-500 transition-colors duration-150 hover:bg-stone-100 hover:text-brand-700"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  >
                    <span className="relative block h-5 w-5">
                      <span
                        className={`absolute inset-0 transition-opacity duration-150 ${
                          showPassword ? 'opacity-0' : 'opacity-100'
                        }`}
                      >
                        <EyeIcon />
                      </span>
                      <span
                        className={`absolute inset-0 transition-opacity duration-150 ${
                          showPassword ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        <EyeIcon off />
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </FormField>
            <button type="submit" className="btn-primary w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  Memproses…
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </motion.form>
        </div>
      </div>

      <ConfirmDialog
        open={mustChange}
        title="Wajib ganti kata sandi"
        description="Akun Anda wajib mengganti kata sandi sebelum melanjutkan."
        confirmLabel="Simpan Kata Sandi Baru"
        busy={changeForm.formState.isSubmitting}
        onClose={() => undefined}
        onConfirm={() => void changeForm.handleSubmit(onChangePassword)()}
      >
        <form className="mt-3 space-y-3" id="change-password-form" onSubmit={changeForm.handleSubmit(onChangePassword)} noValidate>
          {changeError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {changeError}
            </p>
          ) : null}
          <FormField
            label="Kata sandi saat ini"
            required
            error={changeForm.formState.errors.currentPassword?.message}
          >
            {(props) => (
              <input
                {...props}
                {...changeForm.register('currentPassword')}
                type="password"
                className="input"
                autoComplete="current-password"
              />
            )}
          </FormField>
          <FormField
            label="Kata sandi baru"
            required
            hint="Minimal 8 karakter."
            error={changeForm.formState.errors.newPassword?.message}
          >
            {(props) => (
              <input
                {...props}
                {...changeForm.register('newPassword')}
                type="password"
                className="input"
                autoComplete="new-password"
              />
            )}
          </FormField>
          <FormField
            label="Konfirmasi kata sandi baru"
            required
            error={changeForm.formState.errors.confirmPassword?.message}
          >
            {(props) => (
              <input
                {...props}
                {...changeForm.register('confirmPassword')}
                type="password"
                className="input"
                autoComplete="new-password"
              />
            )}
          </FormField>
        </form>
      </ConfirmDialog>
    </div>
  );
}
