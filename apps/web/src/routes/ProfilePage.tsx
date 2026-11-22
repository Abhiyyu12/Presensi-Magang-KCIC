import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Profile } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { FormField } from '../components/FormField';
import { ConfirmDialog } from '../components/ConfirmDialog';

const contactSchema = z.object({
  displayName: z.string().min(1, 'Nama tampilan wajib diisi.'),
  email: z.string().email('Format email tidak valid.').or(z.literal('')).optional(),
  phone: z.string().max(32, 'Nomor telepon terlalu panjang.').optional(),
});
type ContactForm = z.infer<typeof contactSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
    newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter.'),
    confirmPassword: z.string().min(1, 'Konfirmasi wajib diisi.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok.',
    path: ['confirmPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<Profile>('/profile'),
  });

  const contactForm = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    values: {
      displayName: profileQuery.data?.displayName ?? '',
      email: profileQuery.data?.email ?? '',
      phone: profileQuery.data?.phone ?? '',
    },
  });

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const contactMutation = useMutation({
    mutationFn: (values: ContactForm) =>
      api<Profile>('/profile', {
        method: 'PATCH',
        body: {
          displayName: values.displayName,
          email: values.email || undefined,
          phone: values.phone || undefined,
        },
      }),
    onSuccess: () => {
      setMessage('Profil berhasil diperbarui.');
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiError ? error.message : 'Gagal memperbarui profil.');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordForm) =>
      api<null>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      }),
    onSuccess: () => {
      setPasswordError(null);
      setMessage('Kata sandi berhasil diubah.');
      passwordForm.reset();
    },
    onError: (error: unknown) => {
      setPasswordError(error instanceof ApiError ? error.message : 'Gagal mengubah kata sandi.');
    },
  });

  if (profileQuery.isLoading) return <LoadingState label="Memuat profil…" />;
  if (profileQuery.isError) {
    return (
      <ErrorState
        message={profileQuery.error instanceof Error ? profileQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void profileQuery.refetch()}
      />
    );
  }

  const profile = profileQuery.data;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Profil / Akun</h1>
        <p className="text-sm text-slate-600">
          Masuk sebagai <strong>{user?.username}</strong>
          {profile?.accountStatus ? ` · status akun ${profile.accountStatus}` : ''}
        </p>
      </header>

      {message ? (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700" role="status">
          {message}
        </p>
      ) : null}

      <section className="card space-y-3" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-sm font-semibold text-slate-800">
          Detail akun
        </h2>
        <dl className="space-y-1 text-sm text-slate-700">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Username</dt>
            <dd className="font-medium">{profile?.username ?? '-'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium">{(user?.roles ?? []).map((r) => r.code).join(', ') || '-'}</dd>
          </div>
        </dl>
        <form
          className="space-y-3"
          onSubmit={contactForm.handleSubmit((values) => contactMutation.mutate(values))}
          noValidate
        >
          <FormField label="Nama tampilan" required error={contactForm.formState.errors.displayName?.message}>
            {(props) => <input {...props} {...contactForm.register('displayName')} className="input" />}
          </FormField>
          <FormField label="Email" error={contactForm.formState.errors.email?.message}>
            {(props) => (
              <input {...props} {...contactForm.register('email')} type="email" className="input" autoComplete="email" />
            )}
          </FormField>
          <FormField label="Telepon" error={contactForm.formState.errors.phone?.message}>
            {(props) => (
              <input {...props} {...contactForm.register('phone')} type="tel" className="input" autoComplete="tel" />
            )}
          </FormField>
          <button type="submit" className="btn-primary w-full" disabled={contactMutation.isPending}>
            {contactMutation.isPending ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </form>
      </section>

      <section className="card space-y-3" aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-sm font-semibold text-slate-800">
          Ubah kata sandi
        </h2>
        {passwordError ? (
          <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
            {passwordError}
          </p>
        ) : null}
        <form
          className="space-y-3"
          onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutate(values))}
          noValidate
        >
          <FormField label="Kata sandi saat ini" required error={passwordForm.formState.errors.currentPassword?.message}>
            {(props) => (
              <input
                {...props}
                {...passwordForm.register('currentPassword')}
                type="password"
                className="input"
                autoComplete="current-password"
              />
            )}
          </FormField>
          <FormField label="Kata sandi baru" required hint="Minimal 8 karakter." error={passwordForm.formState.errors.newPassword?.message}>
            {(props) => (
              <input
                {...props}
                {...passwordForm.register('newPassword')}
                type="password"
                className="input"
                autoComplete="new-password"
              />
            )}
          </FormField>
          <FormField label="Konfirmasi kata sandi baru" required error={passwordForm.formState.errors.confirmPassword?.message}>
            {(props) => (
              <input
                {...props}
                {...passwordForm.register('confirmPassword')}
                type="password"
                className="input"
                autoComplete="new-password"
              />
            )}
          </FormField>
          <button type="submit" className="btn-primary w-full" disabled={passwordMutation.isPending}>
            {passwordMutation.isPending ? 'Memproses…' : 'Ubah Kata Sandi'}
          </button>
        </form>
      </section>

      <button type="button" className="btn-danger w-full" onClick={() => setLogoutOpen(true)}>
        Keluar
      </button>

      <ConfirmDialog
        open={logoutOpen}
        title="Keluar dari akun?"
        description="Anda harus login kembali untuk menggunakan aplikasi."
        confirmLabel="Ya, Keluar"
        danger
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false);
          void logout().then(() => navigate('/login', { replace: true }));
        }}
      />
    </div>
  );
}
