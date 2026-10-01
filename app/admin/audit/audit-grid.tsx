"use client";

import { type ColumnDef, type PaginationState, useTable } from "@tanstack/react-table";
import { SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeUtc } from "@/lib/format";

export type AuditGridRow = {
  id: number;
  occurredAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  /** Whether the target still has a page; a deleted account or removed creator has none. */
  targetHasPage: boolean;
};

const ALL = "all";

/** The code or email an entry recorded for its target, if it recorded one. */
function namedIn(row: AuditGridRow): string | undefined {
  const { code, email } = row.details as { code?: unknown; email?: unknown };
  if (typeof code === "string") return code;
  if (typeof email === "string") return email;
  return undefined;
}

/** A readable name for the target, from this entry or any other that named it. */
function targetLabel(row: AuditGridRow, names: Map<string, string>): string {
  return namedIn(row) ?? names.get(row.targetId) ?? `${row.targetId.slice(0, 8)}…`;
}

function targetHref(row: AuditGridRow): string | null {
  if (!row.targetHasPage) return null;
  if (row.targetType === "creator") return `/admin/creators/${row.targetId}`;
  // Admin actions and account deletion both target a login.
  if (row.targetType === "admin" || row.targetType === "user") return `/admin/users/${row.targetId}`;
  return null;
}

function actionVariant(action: string) {
  if (/\.(revoke|delete|deactivate|reset_mfa|remove_login)$/.test(action)) return "destructive-outline" as const;
  if (/\.(grant|create|adopt|activate|invite_login)$/.test(action)) return "success-outline" as const;
  return "info-outline" as const;
}

export function AuditGrid({ rows, limit }: { rows: AuditGridRow[]; limit: number }) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>(ALL);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const actions = useMemo(() => [...new Set(rows.map((row) => row.action))].sort(), [rows]);
  // e.g. creator.update_record carries no code, but that creator's
  // creator.create entry does.
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const name = namedIn(row);
      if (name && !map.has(row.targetId)) map.set(row.targetId, name);
    }
    return map;
  }, [rows]);
  const actionItems = useMemo(
    () => [{ value: ALL, label: "All actions" }, ...actions.map((a) => ({ value: a, label: a }))],
    [actions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (action !== ALL && row.action !== action) return false;
      if (!q) return true;
      return [row.actor, row.action, targetLabel(row, names), row.targetId, JSON.stringify(row.details)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, action, names]);

  const columns = useMemo<ColumnDef<DataGridFeatures, AuditGridRow>[]>(
    () => [
      {
        accessorKey: "occurredAt",
        id: "occurredAt",
        header: "Time",
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTimeUtc(row.original.occurredAt)}</span>,
        size: 190,
      },
      {
        accessorKey: "actor",
        id: "actor",
        header: "Actor",
        cell: ({ row }) => <span className="text-foreground">{row.original.actor}</span>,
        size: 230,
      },
      {
        accessorKey: "action",
        id: "action",
        header: "Action",
        cell: ({ row }) => (
          <Badge variant={actionVariant(row.original.action)} className="font-mono">
            {row.original.action}
          </Badge>
        ),
        size: 200,
      },
      {
        id: "target",
        header: "Target",
        cell: ({ row }) => {
          const href = targetHref(row.original);
          const label = targetLabel(row.original, names);
          return href ? (
            <Link href={href} className="font-medium text-foreground underline-offset-4 hover:underline">
              {label}
            </Link>
          ) : (
            <span className="text-foreground">{label}</span>
          );
        },
        size: 220,
      },
      {
        id: "details",
        header: "Details",
        cell: ({ row }) => {
          const text = JSON.stringify(row.original.details);
          return (
            <span className="block truncate font-mono text-xs text-muted-foreground" title={text}>
              {text === "{}" ? "—" : text}
            </span>
          );
        },
        size: 360,
        meta: { autoSize: true },
      },
    ],
    [names],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: AuditGridRow) => String(row.id),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <DataGrid table={table} recordCount={filtered.length} emptyMessage="No entries match.">
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>
            {rows.length >= limit ? `Newest ${limit} entries` : `${rows.length} entries`}
          </FrameTitle>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select items={actionItems} value={action} onValueChange={(value) => setAction(value ?? ALL)}>
              <SelectTrigger className="w-48" aria-label="Filter by action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {actionItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <InputGroup className="w-56 bg-background">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search actor, target, details"
                aria-label="Search the audit log"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="button" aria-label="Clear search" size="icon-xs" onClick={() => setSearch("")}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
        </FrameHeader>
        <FramePanel className="p-0 shadow-none">
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
        <FrameFooter className="py-1.5 pr-2 pl-2.5">
          <DataGridPagination />
        </FrameFooter>
      </Frame>
    </DataGrid>
  );
}
