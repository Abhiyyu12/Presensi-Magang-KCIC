import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  formatDateWib,
  fromDatetimeLocalWib,
  LEAVE_TYPE_LABELS,
  leaveStatusLabel,
} from '../lib/format';
import type { Leave, LeaveCategory, Paginated } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { ServerPagination } from '../components/ServerPagination';

const requestSchema = z
  .object({
    leaveType: z.enum(['TEMPORARY', 'EARLY_DEPARTURE'], {
      errorMap: () => ({ message: 'Jenis izin wajib dipilih.' }),
    }),
    categoryId: z.string().min(1, 'Kategori izin wajib dipilih.'),
    reason: z.string().min(5, 'Alasan wajib diisi (minimal 5 karakter).'),
    estimatedDepartureAt: z.string().min(1, 'Estimasi waktu keluar wajib diisi.'),
    estimatedReturnAt: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.leaveType === 'TEMPORARY' && !values.estimatedReturnAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimatedReturnAt'],
        message: 'Estimasi waktu kembali wajib diisi untuk izin sementara.',
      });
    }
  });
type RequestForm = z.infer<typeof requestSchema>;

export default function LeavesPage() {
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const canRequest = has('leave:request');
  const scope = canRequest ? 'mine' : 'all';
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const leavesQuery = useQuery({
    queryKey: ['leaves', scope, page],
    queryFn: () =>
      api<Paginated<Leave>>('/leaves', { query: { scope, page, pageSize: 15 } }),
  });

  const categoriesQuery = useQuery({
    queryKey: ['leave-categories'],
    queryFn: () => api<{ items: LeaveCategory[] }>('/leaves/categories'),
    enabled: formOpen,
    retry: false,
  });

  const form = useForm<RequestForm>({ resolver: zodResolver(requestSchema) });
  const leaveType = form.watch('leaveType');

  const createMutation = useMutation({
    mutationFn: async (values: RequestForm) => {
      const departureIso = fromDatetimeLocalWib(values.estimatedDepartureAt);
      const returnIso = values.estimatedReturnAt
        ? fromDatetimeLocalWib(values.estimatedReturnAt)
        : null;
      if (!departureIso) throw new ApiError('VALIDATION', 'Format waktu keluar tidak valid.', 400);
      return api<Leave>('/leaves', {
        method: 'POST',
        body: {
          leaveType: values.leaveType,
          categoryId: values.categoryId,
          reason: values.reason,
          estimatedDepartureAt: departureIso,
          ...(returnIso ? { estimatedReturnAt: returnIso } : {}),
        },
      });
    },
    onSuccess: () => {
      setFormError(null);
      setFormOpen(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : 'Gagal mengajukan izin. Coba lagi.');
    },
  });

  const categories: LeaveCategory[] = Array.isArray(categoriesQuery.data)
    ? (categoriesQuery.data as unknown as LeaveCategory[])
    : (categoriesQuery.data?.items ?? []);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{canRequest ? 'Izin' : 'Izin Peserta'}</h1>
          <p className="text-sm text-slate-600">
            {canRequest
              ? 'Pengajuan izin hanya dapat dilakukan setelah absen masuk.'
              : 'Daftar izin peserta dalam cakupan Anda (hanya baca).'}
          </p>
        </div>
        {canRequest ? (
          <button
            type="button"
            className="btn-primary shrink-0"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            {formOpen ? 'Tutup Form' : 'Ajukan Izin'}
          </button>
        ) : null}
      </header>

      {canRequest && formOpen ? (
        <form
          className="card space-y-3"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          noValidate
          aria-labelledby="leave-form-heading"
        >
          <h2 id="leave-form-heading" className="text-sm font-semibold text-slate-800">
            Form pengajuan izin
          </h2>
          {formError ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : null}
          <FormField label="Jenis izin" required error={form.formState.errors.leaveType?.message}>
            {(props) => (
              <select {...props} {...form.register('leaveType')} className="input" defaultValue="">
                <option value="" disabled>
                  Pilih jenis izin
                </option>
                {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            label="Kategori izin"
            required
            error={form.formState.errors.categoryId?.message}
          >
            {(props) =>
              categoriesQuery.isError ? (
                <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
                  Kategori izin belum dapat dimuat, hubungi admin
                </p>
              ) : categoriesQuery.isLoading ? (
                <p className="text-sm text-slate-500">Memuat kategori…</p>
              ) : (
                <select {...props} {...form.register('categoryId')} className="input" defaultValue="">
                  <option value="" disabled>
                    Pilih kategori
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )
            }
          </FormField>
          <FormField label="Alasan" required error={form.formState.errors.reason?.message}>
            {(props) => (
              <textarea
                {...props}
                {...form.register('reason')}
                className="input"
                rows={3}
                maxLength={500}
                placeholder="Jelaskan alasan izin secara singkat dan jelas."
              />
            )}
          </FormField>
          <FormField
            label="Estimasi waktu keluar"
            required
            error={form.formState.errors.estimatedDepartureAt?.message}
          >
            {(props) => (
              <input
                {...props}
                {...form.register('estimatedDepartureAt')}
                type="datetime-local"
                className="input"
              />
            )}
          </FormField>
          {leaveType === 'TEMPORARY' ? (
            <FormField
              label="Estimasi waktu kembali"
              required
              error={form.formState.errors.estimatedReturnAt?.message}
            >
              {(props) => (
                <input
                  {...props}
                  {...form.register('estimatedReturnAt')}
                  type="datetime-local"
                  className="input"
                />
              )}
            </FormField>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => setFormOpen(false)}
              disabled={createMutation.isPending}
            >
              Batal
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Mengirim…' : 'Ajukan Izin'}
            </button>
          </div>
        </form>
      ) : null}

      {leavesQuery.isLoading ? <LoadingState label="Memuat daftar izin…" /> : null}
      {leavesQuery.isError ? (
        <ErrorState
          message={leavesQuery.error instanceof Error ? leavesQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void leavesQuery.refetch()}
        />
      ) : null}
      {leavesQuery.data ? (
        <>
          {leavesQuery.data.items.length === 0 ? (
            <EmptyState
              title="Belum ada pengajuan izin"
              description={
                canRequest
                  ? 'Ajukan izin bila diperlukan. Pengajuan hanya bisa dilakukan setelah absen masuk.'
                  : 'Belum ada izin dari peserta dalam cakupan Anda.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {leavesQuery.data.items.map((leave) => (
                <li key={leave.id}>
                  <Link
                    to={`/izin/${leave.id}`}
                    className="card flex items-center justify-between gap-3 hover:border-brand-600"
                  >
                    <div className="min-w-0">
                      {!canRequest && leave.participantName ? (
                        <p className="truncate text-sm font-semibold text-slate-900">{leave.participantName}</p>
                      ) : null}
                      <p className="truncate text-sm font-medium text-slate-800">
                        {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
                        {leave.categoryName ? ` · ${leave.categoryName}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateWib(leave.estimatedDepartureAt ?? leave.createdAt)}
                        {leave.status === 'PENDING' ? ' · Pengajuan izin menunggu persetujuan.' : ''}
                      </p>
                    </div>
                    <StatusBadge kind="leaveStatus" status={leave.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ServerPagination pagination={leavesQuery.data.pagination} onPageChange={setPage} />
        </>
      ) : null}
      <p className="text-xs text-slate-500">
        Status izin ({leaveStatusLabel('PENDING')}, {leaveStatusLabel('DEPARTED')}, dst.) selalu
        mengikuti data server.
      </p>
    </div>
  );
}
