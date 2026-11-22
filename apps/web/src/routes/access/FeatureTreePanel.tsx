import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isRecord, type FeatureNode } from '../../lib/types';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';

function TreeNode({ node, depth }: { node: FeatureNode; depth: number }) {
  return (
    <li>
      <div
        className="flex flex-wrap items-baseline gap-2 rounded px-2 py-1 hover:bg-slate-50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-sm font-medium text-slate-800">{node.label}</span>
        <span className="font-mono text-xs text-slate-500">{node.code}</span>
        {node.nodeType ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
            {node.nodeType}
          </span>
        ) : null}
        {node.route ? <span className="text-xs text-brand-700">{node.route}</span> : null}
      </div>
      {node.children && node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.code} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FeatureTreePanel() {
  const treeQuery = useQuery({
    queryKey: ['access', 'feature-tree'],
    queryFn: () => api<unknown>('/admin/access/feature-tree'),
  });

  if (treeQuery.isLoading) return <LoadingState />;
  if (treeQuery.isError) {
    return (
      <ErrorState
        message={treeQuery.error instanceof Error ? treeQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void treeQuery.refetch()}
      />
    );
  }

  const raw = treeQuery.data;
  const nodes: FeatureNode[] = (Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw['items'])
      ? raw['items']
      : isRecord(raw) && Array.isArray(raw['featureTree'])
        ? raw['featureTree']
        : []
  ).filter(isRecord) as unknown as FeatureNode[];

  if (nodes.length === 0) {
    return <EmptyState title="Feature tree kosong" description="Belum ada node feature tree dari server." />;
  }

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-slate-800">Feature Tree (read-only)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Struktur navigasi dan fitur yang dilayani server. Perubahan dilakukan lewat konfigurasi
        backend yang diaudit.
      </p>
      <ul className="mt-3" role="tree" aria-label="Feature tree">
        {nodes.map((node) => (
          <TreeNode key={node.code} node={node} depth={0} />
        ))}
      </ul>
    </div>
  );
}
