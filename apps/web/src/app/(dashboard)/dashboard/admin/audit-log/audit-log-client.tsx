'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi, projectsApi, AuditLogItem, AdminUser } from '@/lib/api';
import { formatAuditAction } from '@/lib/audit-log-format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Filters {
  fromDate: string;
  toDate: string;
  userId: string;
  actionType: string;
}

const EMPTY_FILTERS: Filters = { fromDate: '', toDate: '', userId: '', actionType: '' };

type SortDir = 'desc' | 'asc';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Fetches and renders the audit log table client-side with filter controls and sortable columns. */
export function AuditLogClient() {
  const [pending, setPending] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const projectNamesCache = useRef<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load filter option lists on mount
  useEffect(() => {
    Promise.all([
      adminApi.getAuditLogActionTypes(),
      adminApi.getAdminUsers(),
    ])
      .then(([atResult, usersResult]) => {
        setActionTypes(atResult.actionTypes);
        setUsers(usersResult.users);
      })
      .catch(() => {});
  }, []);

  // Load audit log whenever applied filters change
  useEffect(() => {
    setLoading(true);
    setError(false);
    adminApi
      .getAuditLogs({
        fromDate: applied.fromDate || undefined,
        toDate: applied.toDate || undefined,
        userId: applied.userId || undefined,
        actionType: applied.actionType || undefined,
      })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);

        const ids = [...new Set(result.items.map((i) => i.projectId).filter(Boolean))] as string[];
        const missing = ids.filter((id) => !(id in projectNamesCache.current));
        if (missing.length > 0) {
          Promise.allSettled(missing.map((id) => projectsApi.get(id))).then((results) => {
            const newNames: Record<string, string> = {};
            results.forEach((r, idx) => {
              if (r.status === 'fulfilled') {
                newNames[missing[idx]] = r.value.data.name;
                projectNamesCache.current[missing[idx]] = r.value.data.name;
              }
            });
            if (Object.keys(newNames).length > 0) {
              setProjectNames((prev) => ({ ...prev, ...newNames }));
            }
          });
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [applied]);

  const applyFilters = useCallback(() => setApplied({ ...pending }), [pending]);

  const resetFilters = useCallback(() => {
    setPending(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  }, []);

  const toggleSort = useCallback(() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')), []);

  const sorted = [...items].sort((a, b) => {
    const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return sortDir === 'desc' ? -diff : diff;
  });

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <div className="rounded-md border p-4 space-y-3">
        <p className="text-sm font-medium">Filters</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="auditFromDate">From</Label>
            <Input
              id="auditFromDate"
              type="datetime-local"
              value={pending.fromDate}
              onChange={(e) => setPending((f) => ({ ...f, fromDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auditToDate">To</Label>
            <Input
              id="auditToDate"
              type="datetime-local"
              value={pending.toDate}
              onChange={(e) => setPending((f) => ({ ...f, toDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auditUser">User</Label>
            <select
              id="auditUser"
              aria-label="User"
              value={pending.userId}
              onChange={(e) => setPending((f) => ({ ...f, userId: e.target.value }))}
              className={SELECT_CLASS}
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.displayName}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="auditActionType">Action Type</Label>
            <select
              id="auditActionType"
              aria-label="Action Type"
              value={pending.actionType}
              onChange={(e) => setPending((f) => ({ ...f, actionType: e.target.value }))}
              className={SELECT_CLASS}
            >
              <option value="">All action types</option>
              {actionTypes.map((at) => (
                <option key={at} value={at}>{formatAuditAction(at)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={applyFilters}>Apply</Button>
          <Button variant="outline" onClick={resetFilters}>Reset</Button>
        </div>
      </div>

      {/* Table / states */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">Failed to load audit log.</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">No audit log entries found.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    className="flex items-center gap-1 font-medium hover:text-foreground"
                    onClick={toggleSort}
                    aria-label={`Timestamp — sorted ${sortDir === 'desc' ? 'newest first' : 'oldest first'}`}
                  >
                    Timestamp
                    <span aria-hidden>{sortDir === 'desc' ? '↓' : '↑'}</span>
                  </button>
                </th>
                <th className="px-4 py-2 text-left font-medium">Actor</th>
                <th className="px-4 py-2 text-left font-medium">Action Type</th>
                <th className="px-4 py-2 text-left font-medium">Resource Type</th>
                <th className="px-4 py-2 text-left font-medium">Resource ID</th>
                <th className="px-4 py-2 text-left font-medium">Project</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span title={entry.userId ?? undefined}>
                      {entry.actorDisplayName ?? entry.userId ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span title={entry.action}>{formatAuditAction(entry.action, entry.metadata)}</span>
                  </td>
                  <td className="px-4 py-2">{entry.resourceType}</td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.resourceId}</td>
                  <td className="px-4 py-2">
                    {entry.projectId ? (
                      <span title={entry.projectId}>
                        {projectNames[entry.projectId] ?? entry.projectId}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (
        <p className="text-xs text-muted-foreground">
          Showing {items.length} of {total} entries
        </p>
      )}
    </div>
  );
}
