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
import { SUPPORT_STATUS_LABELS, SUPPORT_STATUSES, type SupportStatus } from "@/lib/support/validation";

export type SupportRow = {
  id: string;
  status: SupportStatus;
  /** "@lena · Lena". */
  user: string;
  /** "iOS · 1.2.0 (14)". */
  app: string | null;
  entitled: boolean;
  /** For "waiting since" on open threads. */
  lastUserMessageAt: string | null;
  lastActivity: string;
  messageCount: number;
  userMessageCount: number;
};

const STATUS_BADGE_VARIANTS = {
  open: "info-outline",
  answered: "success-outline",
  closed: "outline",
} as const;

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{SUPPORT_STATUS_LABELS[status]}</Badge>;
}

export function EntitledBadge({ entitled }: { entitled: boolean }) {
  return entitled ? <Badge variant="primary-light">Subscriber</Badge> : <Badge variant="outline">Free</Badge>;
}

const ALL = "all";
const ACTIVE = "active";

const STATUS_ITEMS = [
  { value: "open", label: SUPPORT_STATUS_LABELS.open },
  { value: ACTIVE, label: "Not closed" },
  ...SUPPORT_STATUSES.filter((value) => value !== "open").map((value) => ({ value, label: SUPPORT_STATUS_LABELS[value] })),
  { value: ALL, label: "All statuses" },
];

function matchesStatus(status: SupportStatus, filter: string): boolean {
  if (filter === ALL) return true;
  if (filter === ACTIVE) return status !== "closed";
  return status === filter;
}

/**
 * The inbox. Rows arrive in inbox order (waiting first, longest waiting at the
 * top); with no column sorted the grid keeps that order.
 */
export function SupportGrid({ rows, limit }: { rows: SupportRow[]; limit: number }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("open");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesStatus(row.status, status)) return false;
      if (!q) return true;
      return row.user.toLowerCase().includes(q);
    });
  }, [rows, search, status]);

  const columns = useMemo<ColumnDef<DataGridFeatures, SupportRow>[]>(
    () => [
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) => <SupportStatusBadge status={row.original.status} />,
        size: 140,
        enableSorting: false,
      },
      {
        accessorKey: "user",
        id: "user",
        header: "User",
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-foreground" title={row.original.user}>
              {row.original.user}
            </span>
            {row.original.entitled && (
              <Badge variant="primary-light" size="sm">
                Subscriber
              </Badge>
            )}
          </span>
        ),
        size: 260,
        meta: { autoSize: true },
        enableSorting: false,
      },
      {
        accessorKey: "lastActivity",
        id: "lastActivity",
        header: ({ column }) => <DataGridColumnHeader title="Last activity" column={column} />,
        cell: ({ row }) => (
          <span className="flex flex-col whitespace-nowrap">
            <span className="text-muted-foreground">{formatDateTimeUtc(row.original.lastActivity)}</span>
            {row.original.status === "open" && row.original.lastUserMessageAt && (
              <span className="text-xs text-muted-foreground">
                waiting since {formatDateTimeUtc(row.original.lastUserMessageAt)}
              </span>
            )}
          </span>
        ),
        size: 220,
      },
      {
        accessorKey: "messageCount",
        id: "messageCount",
        header: ({ column }) => <DataGridColumnHeader title="Messages" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
            {row.original.messageCount}
            <span className="text-xs"> ({row.original.userMessageCount} from user)</span>
          </span>
        ),
        size: 150,
      },
      {
        accessorKey: "app",
        id: "app",
        header: "App",
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.app ?? "—"}</span>,
        size: 170,
        enableSorting: false,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: SupportRow) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const filtering = search !== "" || status !== ALL;
  const waiting = rows.filter((row) => row.status === "open").length;

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage={
        rows.length === 0
          ? "No conversations yet."
          : status === "open" && search === ""
            ? "Nobody is waiting for us."
            : filtering
              ? "Nothing matches these filters."
              : "No conversations."
      }
      onRowClick={(row) => router.push(`/admin/support/${row.id}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>
            {rows.length >= limit
              ? `${rows.length} conversations (most recent ${limit})`
              : `${rows.length === 1 ? "1 conversation" : `${rows.length} conversations`}, ${waiting} waiting`}
          </FrameTitle>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select items={STATUS_ITEMS} value={status} onValueChange={(value) => setStatus(value ?? "open")}>
              <SelectTrigger className="w-44" aria-label="Filter by status">
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
            <InputGroup className="w-56 bg-background">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search name"
                aria-label="Search conversations"
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
