import { api } from '../../lib/api';
import type { ComboboxOption } from '../../components/MasterCombobox';
import { asString, isRecord, type Paginated } from '../../lib/types';

type Row = Record<string, unknown>;

const COMBO_PAGE_SIZE = 100;

async function fetchPage(path: string, query: Record<string, string>): Promise<Row[]> {
  const data = await api<Paginated<Row>>(path, { query: { pageSize: String(COMBO_PAGE_SIZE), ...query } });
  return (data.items ?? []).filter(isRecord);
}

function toOption(row: Row, valueKey: string, labelKey: string, ...descKeys: string[]): ComboboxOption {
  const descriptions = descKeys.map((key) => asString(row[key])).filter(Boolean);
  return {
    value: asString(row[valueKey]),
    label: asString(row[labelKey]),
    ...(descriptions.length > 0 ? { description: descriptions.join(' · ') } : {}),
  };
}

function nested(row: Row | undefined, key: string): Row | undefined {
  const value = row?.[key];
  return isRecord(value) ? value : undefined;
}

export async function fetchBureauOptions(search: string): Promise<ComboboxOption[]> {
  const rows = await fetchPage('/admin/organizations/bureaus', search ? { search } : {});
  return rows.map((row) => toOption(row, 'id', 'name', 'code'));
}

export async function fetchDivisionOptions(search: string, bureauId: string): Promise<ComboboxOption[]> {
  const rows = await fetchPage('/admin/organizations/divisions', {
    ...(search ? { search } : {}),
    ...(bureauId ? { bureauId } : {}),
  });
  return rows.map((row) => toOption(row, 'id', 'name', 'code'));
}

export async function fetchPlacementOptions(search: string): Promise<ComboboxOption[]> {
  const rows = await fetchPage('/admin/placements', search ? { search } : {});
  return rows.map((row) => toOption(row, 'id', 'name', 'code'));
}

export function fetchUserOptions(roleCode?: string) {
  return async (search: string): Promise<ComboboxOption[]> => {
    const rows = await fetchPage('/admin/users', {
      ...(search ? { search } : {}),
      ...(roleCode ? { roleCode } : {}),
    });
    return rows.map((row) => ({ value: asString(row['id']), label: asString(row['displayName']), description: asString(row['username']) }));
  };
}

export async function fetchInternProfileOptions(search: string): Promise<ComboboxOption[]> {
  const rows = await fetchPage('/admin/intern-profiles', search ? { search } : {});
  return rows.map((row) => {
    const user = nested(row, 'user');
    return {
      value: asString(row['id']),
      label: asString(user?.['displayName']),
      description: asString(row['participantNumber']) || asString(user?.['username']),
    };
  });
}

/** scopeId untuk Data Master > Cakupan: BUREAU → biro, DIVISION → divisi. */
export function fetchScopeIdOptions(search: string, scopeType: string): Promise<ComboboxOption[]> {
  if (scopeType === 'BUREAU') return fetchBureauOptions(search);
  if (scopeType === 'DIVISION') return fetchDivisionOptions(search, '');
  return Promise.resolve([]);
}

/** scopeId untuk jadwal kerja: BUREAU/DIVISION/INDIVIDUAL. */
export function fetchScheduleScopeOptions(search: string, scopeType: string): Promise<ComboboxOption[]> {
  if (scopeType === 'BUREAU') return fetchBureauOptions(search);
  if (scopeType === 'DIVISION') return fetchDivisionOptions(search, '');
  if (scopeType === 'INDIVIDUAL') return fetchUserOptions()(search);
  return Promise.resolve([]);
}
