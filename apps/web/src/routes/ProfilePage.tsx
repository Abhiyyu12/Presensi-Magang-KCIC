import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, fieldErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Profile, ProfileScheduleDay } from '../lib/types';
import { formatDateWib } from '../lib/format';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { FormField } from '../components/FormField';
import { ConfirmDialog } from '../components/ConfirmDialog';

const contactSchema = z.object({
  displayName: z.string().min(1, 'Nama tampilan wajib diisi.'),
  email: z.string().email('Format email tidak valid.').or(z.literal('')).optional(),
  phone: z
    .string()
    .regex(/^(?:\+62|62|0)8\d{7,12}$/, 'Nomor telepon wajib format nomor Indonesia (mis. 081234567890).')
    .or(z.literal(''))
    .optional(),
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

const WEEKDAY_LABELS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const;

function scheduleRowLabel(day: ProfileScheduleDay): string {
  if (!day.isWorkingDay) return 'Libur';
  if (day.startTime && day.endTime) return `${day.startTime} – ${day.endTime}`;
  return 'Hari kerja (jam bebas)';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<{ user: Profile | null }>('/profile'),
  });

  const contactForm = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    values: {
      displayName: profileQuery.data?.user?.displayName ?? '',
      email: profileQuery.data?.user?.email ?? '',
      phone: profileQuery.data?.user?.phone ?? '',
    },
  });

  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const contactMutation = useMutation({
    mutationFn: (values: ContactForm) =>
      api<Profile>('/profile', {
        method: 'PATCH',
        body: {
          displayName: values.displayName,
          email: values.email ? values.email : null,
          phone: values.phone ? values.phone : null,
        },
      }),
    onSuccess: async () => {
      setNotice({ kind: 'ok', text: 'Profil berhasil diperbarui.' });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      // Sinkronkan nama tampilan pada header tanpa perlu reload halaman.
      await refresh();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.fieldErrors) {
        let matched = false;
        for (const field of ['displayName', 'email', 'phone'] as const) {
          const msg = fieldErrorMessage(error.fieldErrors, field);
          if (msg) {
            contactForm.setError(field, { type: 'manual', message: msg });
            matched = true;
          }
        }
        if (matched) {
          setNotice({ kind: 'error', text: 'Periksa kembali isian formulir.' });
          return;
        }
      }
      setNotice({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Gagal memperbarui profil.',
      });
    },
  });

  const submitContact = contactForm.handleSubmit((values) => contactMutation.mutate(values));

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordForm) =>
      api<null>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      }),
    onSuccess: () => {
      setNotice({ kind: 'ok', text: 'Kata sandi berhasil diubah.' });
      passwordForm.reset();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.fieldErrors) {
        let matched = false;
        for (const field of ['currentPassword', 'newPassword'] as const) {
          const msg = fieldErrorMessage(error.fieldErrors, field);
          if (msg) {
            passwordForm.setError(field, { type: 'manual', message: msg });
            matched = true;
          }
        }
        if (matched) {
          setNotice({ kind: 'error', text: 'Periksa kembali isian formulir.' });
          return;
        }
      }
      setNotice({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Gagal mengubah kata sandi.',
      });
    },
  });

  const submitPassword = passwordForm.handleSubmit((values) => passwordMutation.mutate(values));

  if (profileQuery.isLoading) return <LoadingState label="Memuat profil…" />;
  if (profileQuery.isError) {
    return (
      <ErrorState
        message={profileQuery.error instanceof Error ? profileQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void profileQuery.refetch()}
      />
    );
  }

  const profile = profileQuery.data?.user ?? null;
  const intern = profile?.internProfile ?? null;
  const rolesLabel =
    (profile?.roles ?? []).map((r) => r.name || r.code).join(', ') ||
    (user?.roles ?? []).map((r) => r.name || r.code).join(', ') ||
    '-';
  const schedule = profile?.schedule ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Profil / Akun</h1>
        <p className="text-sm text-slate-600">
          Masuk sebagai <strong>{user?.username}</strong>
          {profile?.accountStatus ? ` · status akun ${profile.accountStatus}` : ''}
        </p>
      </header>

      {notice ? (
        <p
          className={
            notice.kind === 'ok'
              ? 'rounded-lg bg-green-50 p-3 text-sm text-green-700'
              : 'rounded-lg bg-red-50 p-3 text-sm text-red-700'
          }
          role={notice.kind === 'ok' ? 'status' : 'alert'}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="card space-y-3" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-sm font-semibold text-slate-800">
          Detail akun
        </h2>
        <dl className="space-y-1 text-sm text-slate-700">
          <DetailRow label="Username" value={profile?.username ?? '-'} />
          <DetailRow label="Role" value={rolesLabel} />
        </dl>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            setNotice(null);
            void submitContact(e);
          }}
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
          <FormField
            label="Telepon"
            hint="Format nomor Indonesia, mis. 081234567890."
            error={contactForm.formState.errors.phone?.message}
          >
            {(props) => (
              <input {...props} {...contactForm.register('phone')} type="tel" className="input" autoComplete="tel" />
            )}
          </FormField>
          <button type="submit" className="btn-primary w-full" disabled={contactMutation.isPending}>
            {contactMutation.isPending ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </form>
      </section>

      {intern ? (
        <section className="card space-y-1" aria-labelledby="assignment-heading">
          <h2 id="assignment-heading" className="pb-2 text-sm font-semibold text-slate-800">
            Data penugasan
          </h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <DetailRow label="Nomor peserta" value={intern.participantNumber} />
            <DetailRow label="Biro" value={intern.bureauName ?? '-'} />
            <DetailRow label="Divisi" value={intern.divisionName ?? '-'} />
            <DetailRow label="Penempatan" value={intern.placementName ?? '-'} />
            <DetailRow
              label="Periode magang"
              value={`${formatDateWib(intern.startDate)} s.d. ${intern.endDate ? formatDateWib(intern.endDate) : '-'}`}
            />
            <DetailRow label="Status peserta" value={intern.status === 'COMPLETED' ? 'Selesai' : 'Aktif'} />
          </dl>
        </section>
      ) : null}

      {schedule && schedule.days.length > 0 ? (
        <section className="card space-y-2" aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className="text-sm font-semibold text-slate-800">
            Jadwal kerja
          </h2>
          <p className="text-xs text-slate-500">{schedule.name}</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {schedule.days.map((day) => (
              <li key={day.weekday} className="flex justify-between gap-2 py-1.5">
                <span className="text-slate-600">{WEEKDAY_LABELS[day.weekday - 1] ?? `Hari ${day.weekday}`}</span>
                <span className={day.isWorkingDay ? 'font-medium' : 'text-slate-400'}>
                  {scheduleRowLabel(day)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {intern && intern.supervisors.length > 0 ? (
        <section className="card space-y-2" aria-labelledby="supervisor-heading">
          <h2 id="supervisor-heading" className="text-sm font-semibold text-slate-800">
            Pembimbing
          </h2>
          <ul className="space-y-1 text-sm text-slate-700">
            {intern.supervisors.map((s) => (
              <li key={s.displayName} className="flex justify-between gap-2">
                <span className="font-medium">{s.displayName}</span>
                <span className="text-slate-500">{s.email ?? '-'}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card space-y-3" aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-sm font-semibold text-slate-800">
          Ubah kata sandi
        </h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            setNotice(null);
            void submitPassword(e);
          }}
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
