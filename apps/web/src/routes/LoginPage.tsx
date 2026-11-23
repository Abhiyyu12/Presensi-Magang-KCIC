import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
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

export default function LoginPage() {
  const { user, loading, login, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mustChange, setMustChange] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <div className="page-enter w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-stone-900">Presensi Magang KCIC</h1>
          <p className="mt-1 text-sm text-stone-600">Masuk dengan akun yang diberikan admin.</p>
        </div>

        <form className="card space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
                  className="input pr-24"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-semibold text-brand-700 hover:text-brand-800"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
            )}
          </FormField>
          <button type="submit" className="btn-primary w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
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
