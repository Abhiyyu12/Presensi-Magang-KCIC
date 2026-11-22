import { useEffect, useMemo, useRef, useState } from 'react';

/** Debounce a rapidly-changing value (search inputs). */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Track previous value (e.g. to detect filter changes and reset page). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/** Reset page to 1 whenever the given filter key changes. */
export function usePagedFilters<T extends object>(filters: T, initialPageSize = 15) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const serialized = JSON.stringify(filters);
  const prev = usePrevious(serialized);
  useEffect(() => {
    if (prev !== undefined && prev !== serialized) setPage(1);
  }, [prev, serialized]);
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
  };
  return { page, setPage, pageSize, setPageSize };
}

export function useMemoizedObject<T extends object>(value: T): T {
  const serialized = JSON.stringify(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => JSON.parse(serialized) as T, [serialized]);
}
