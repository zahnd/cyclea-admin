"use client";

import { type ColumnDef, type PaginationState, type SortingState, useTable } from "@tanstack/react-table";
import { SearchIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeUtc } from "@/lib/format";
import {
  REPORT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  type ReportAction,
  type ReportReason,
  type ReportStatus,
} from "@/lib/reports/validation";

export type ReportRow = {
  id: string;
  createdAt: string;
  reason: ReportReason;
  /** "@lena", or "@lena (deleted)". */
  reported: string;
  reportsOnAccount: number | null;
  status: ReportStatus;
  action: ReportAction | null;
  /** For the search only; shown on the report's page. */
  note: string | null;
};

const STATUS_BADGE_VARIANTS = {
  new: "info-outline",
  in_progress: "warning-outline",
  closed: "success-outline",
} as const;

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{REPORT_STATUS_LABELS[status]}</Badge>;
}

export function ReportReasonBadge({ reason }: { reason: ReportReason }) {
  // Self-harm and underage can need more than moderation: they stand out.
  const urgent = reason === "self_harm" || reason === "underage";
  return <Badge variant={urgent ? "destructive-light" : "outline"}>{REPORT_REASON_LABELS[reason]}</Badge>;
}

const ALL = "all";
const OPEN = "open";

const STATUS_ITEMS = [
  { value: OPEN, label: "Open" },
  { value: ALL, label: "All statuses" },
  ...REPORT_STATUSES.map((value) => ({ value, label: REPORT_STATUS_LABELS[value] })),
];
const REASON_ITEMS = [
  { value: ALL, label: "All reasons" },
  ...REPORT_REASONS.map((value) => ({ value, label: REPORT_REASON_LABELS[value] })),
];

function matchesStatus(status: ReportStatus, filter: string): boolean {
  if (filter === ALL) return true;
  if (filter === OPEN) return status !== "closed";
  return status === filter;
}

export function ReportsGrid({ rows, limit }: { rows: ReportRow[]; limit: number }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(OPEN);
  const [reason, setReason] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesStatus(row.status, status)) return false;
      if (reason !== ALL && row.reason !== reason) return false;
      if (!q) return true;
      return [row.reported, row.note].join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, status, reason]);

  const columns = useMemo<ColumnDef<DataGridFeatures, ReportRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: ({ column }) => <DataGridColumnHeader title="Received" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDateTimeUtc(row.original.createdAt)}</span>
        ),
        size: 190,
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) => <ReportStatusBadge status={row.original.status} />,
        size: 120,
      },
      {
        accessorKey: "reason",
        id: "reason",
        header: "Reason",
        cell: ({ row }) => <ReportReasonBadge reason={row.original.reason} />,
        size: 180,
      },
      {
        accessorKey: "reported",
        id: "reported",
        header: "Reported",
        cell: ({ row }) => (
          <span className="block truncate text-foreground" title={row.original.reported}>
            {row.original.reported}
          </span>
        ),
        size: 220,
        meta: { autoSize: true },
      },
      {
        accessorKey: "reportsOnAccount",
        id: "reportsOnAccount",
        header: ({ column }) => <DataGridColumnHeader title="Reports on account" column={column} />,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.reportsOnAccount ?? "—"}</span>
        ),
        size: 150,
      },
      {
        accessorKey: "action",
        id: "action",
        header: "Action",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {row.original.action ? REPORT_ACTION_LABELS[row.original.action] : "—"}
          </span>
        ),
        size: 150,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: ReportRow) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const filtering = search !== "" || status !== ALL || reason !== ALL;

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage={rows.length === 0 ? "No reports yet." : filtering ? "Nothing matches these filters." : "No reports."}
      onRowClick={(row) => router.push(`/admin/reports/${row.id}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>
            {rows.length >= limit
              ? `${rows.length} reports (newest ${limit})`
              : rows.length === 1
                ? "1 report"
                : `${rows.length} reports`}
          </FrameTitle>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select items={STATUS_ITEMS} value={status} onValueChange={(value) => setStatus(value ?? OPEN)}>
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STATUS_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select items={REASON_ITEMS} value={reason} onValueChange={(value) => setReason(value ?? ALL)}>
              <SelectTrigger className="w-48" aria-label="Filter by reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {REASON_ITEMS.map((item) => (
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
                placeholder="Search name, note"
                aria-label="Search reports"
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
