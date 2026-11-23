import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
    .regex(
      /^(?:08\d{7,12}|62\d{8,13}|\+\d{7,15})$/,
      'Nomor telepon tidak valid. Gunakan 08xxxxxxxxxx atau awali kode negara, mis. +6281234567890.',
    )
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

const INTERN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  COMPLETED: 'Selesai',
  WITHDRAWN: 'Mundur',
};

function scheduleRowLabel(day: ProfileScheduleDay): string {
  if (!day.isWorkingDay) return 'Libur';
  if (day.startTime && day.endTime) return `${day.startTime} – ${day.endTime}`;
  return 'Hari kerja (jam bebas)';
}

function initialsOf(name: string | undefined, fallback: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-stone-100 py-2">
      <dt className="shrink-0 text-sm text-stone-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-stone-800">{value}</dd>
    </div>
  );
}

function SectionCard({ title, headingId, children }: { title: string; headingId: string; children: ReactNode }) {
  return (
    <section className="card space-y-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-semibold text-stone-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Tombol simpan dengan feedback: spinner saat proses, centang singkat setelah sukses.
function SaveButton({
  pending,
  flash,
  label,
  busyLabel,
}: {
  pending: boolean;
  flash: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
      {pending ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          {busyLabel}
        </>
      ) : flash ? (
        <>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
          {label}
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState<'contact' | 'password' | null>(null);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => flashTimers.current.forEach(clearTimeout), []);
  const flash = (kind: 'contact' | 'password') => {
    setSavedFlash(kind);
    flashTimers.current.push(setTimeout(() => setSavedFlash(null), 1400));
  };

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
      flash('contact');
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
      flash('password');
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
  const roles = (profile?.roles ?? user?.roles ?? []).map((r) => r.name || r.code).filter(Boolean);
  const schedule = profile?.schedule ?? null;
  const accountStatusLabel = profile?.accountStatus === 'ACTIVE' ? 'Aktif' : (profile?.accountStatus ?? '-');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-lg font-bold text-stone-900">Profil</h1>
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

      <section className="overflow-hidden rounded-xl border border-stone-200 shadow-sm" aria-label="Identitas akun">
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-700 to-brand-800 p-5">
          <div aria-hidden="true" className="speed-lines streak-drift pointer-events-none absolute -inset-16" />
          <div className="relative flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold text-white ring-2 ring-white/30"
            >
              {initialsOf(profile?.displayName ?? undefined, profile?.username ?? user?.username ?? 'A')}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">{profile?.displayName ?? user?.username ?? '-'}</p>
              <p className="truncate font-mono text-sm text-white/80">@{profile?.username ?? user?.username ?? '-'}</p>
            </div>
          </div>
          <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
            {roles.length > 0 ? (
              roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white"
                >
                  {role}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white">-</span>
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                profile?.accountStatus === 'ACTIVE' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-amber-400/20 text-amber-100'
              }`}
            >
              {accountStatusLabel}
            </span>
          </div>
        </div>
      </section>

      <SectionCard title="Informasi akun" headingId="account-heading">
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
            hint="Isi 08xxxxxxxxxx atau kode negara, mis. +6281234567890."
            error={contactForm.formState.errors.phone?.message}
          >
            {(props) => (
              <input {...props} {...contactForm.register('phone')} type="tel" className="input" autoComplete="tel" />
            )}
          </FormField>
          <div className="flex justify-end pt-1">
            <SaveButton pending={contactMutation.isPending} flash={savedFlash === 'contact'} label="Simpan Perubahan" busyLabel="Menyimpan…" />
          </div>
        </form>
      </SectionCard>

      {intern ? (
        <SectionCard title="Data penugasan" headingId="assignment-heading">
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <DetailRow label="Nomor peserta" value={intern.participantNumber} />
            <DetailRow
              label="Status peserta"
              value={INTERN_STATUS_LABEL[intern.status] ?? intern.status}
            />
            <DetailRow label="Direktorat" value={intern.bureauName ?? '-'} />
            <DetailRow label="Biro" value={intern.divisionName ?? '-'} />
            <DetailRow label="Penempatan" value={intern.placementName ?? '-'} />
            <DetailRow
              label="Periode magang"
              value={`${formatDateWib(intern.startDate)} s.d. ${intern.endDate ? formatDateWib(intern.endDate) : '-'}`}
            />
          </dl>

          {intern.supervisors.length > 0 ? (
            <div className="border-t border-stone-100 pt-3">
              <h3 className="text-xs font-semibold text-stone-500">Pembimbing</h3>
              <ul className="mt-2 space-y-2">
                {intern.supervisors.map((s) => (
                  <li key={s.displayName} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-800"
                    >
                      {initialsOf(s.displayName, 'P')}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800">{s.displayName}</p>
                      <p className="truncate text-xs text-stone-500">{s.email ?? '-'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {schedule && schedule.days.length > 0 ? (
        <SectionCard title="Jadwal kerja" headingId="schedule-heading">
          <p className="text-sm text-stone-500">{schedule.name}</p>
          <ul className="divide-y divide-stone-100">
            {schedule.days.map((day) => (
              <li key={day.weekday} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-stone-700">{WEEKDAY_LABELS[day.weekday - 1] ?? `Hari ${day.weekday}`}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    day.isWorkingDay ? 'bg-brand-soft text-brand-800' : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {scheduleRowLabel(day)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Keamanan" headingId="password-heading">
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
          <div className="flex justify-end pt-1">
            <SaveButton pending={passwordMutation.isPending} flash={savedFlash === 'password'} label="Ubah Kata Sandi" busyLabel="Memproses…" />
          </div>
        </form>
      </SectionCard>

      <section
        className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Keluar dari akun"
      >
        <div>
          <p className="text-sm font-semibold text-red-800">Keluar dari akun</p>
          <p className="text-xs text-red-700/80">Anda harus login kembali untuk menggunakan aplikasi.</p>
        </div>
        <button type="button" className="btn-danger shrink-0 sm:w-auto" onClick={() => setLogoutOpen(true)}>
          Keluar
        </button>
      </section>

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
