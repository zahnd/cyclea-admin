"use client";

import { type ColumnDef, type PaginationState, type SortingState, useTable } from "@tanstack/react-table";
import { ImageIcon, SearchIcon, XIcon } from "lucide-react";
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
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackSource,
  type FeedbackStatus,
} from "@/lib/feedback/validation";
import { formatDateShort, formatDateTimeUtc } from "@/lib/format";

export type FeedbackRow = {
  id: string;
  source: FeedbackSource;
  /** ISO; for a manual entry the day it was said, as midnight UTC. */
  receivedAt: string;
  /** A manual entry's date has no time of day. */
  dateOnly: boolean;
  category: FeedbackCategory;
  message: string;
  appVersion: string | null;
  device: string | null;
  screen: string | null;
  /** An app screenshot or a manual entry's image. */
  hasScreenshot: boolean;
  status: FeedbackStatus;
};

const STATUS_BADGE_VARIANTS = {
  new: "info-outline",
  in_progress: "warning-outline",
  done: "success-outline",
  wont_fix: "secondary",
} as const;

const CATEGORY_BADGE_VARIANTS = {
  bug: "destructive-outline",
  idea: "primary-outline",
  other: "outline",
} as const;

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{FEEDBACK_STATUS_LABELS[status]}</Badge>;
}

export function FeedbackCategoryBadge({ category }: { category: FeedbackCategory }) {
  return <Badge variant={CATEGORY_BADGE_VARIANTS[category]}>{FEEDBACK_CATEGORY_LABELS[category]}</Badge>;
}

const ALL = "all";
/** Everything not finished: the default view of a triage list. */
const OPEN = "open";

const STATUS_ITEMS = [
  { value: OPEN, label: "Open" },
  { value: ALL, label: "All statuses" },
  ...FEEDBACK_STATUSES.map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] })),
];
const CATEGORY_ITEMS = [
  { value: ALL, label: "All categories" },
  ...FEEDBACK_CATEGORIES.map((value) => ({ value, label: FEEDBACK_CATEGORY_LABELS[value] })),
];
const SOURCE_ITEMS = [
  { value: ALL, label: "All sources" },
  ...FEEDBACK_SOURCES.map((value) => ({ value, label: FEEDBACK_SOURCE_LABELS[value] })),
];

function matchesStatus(status: FeedbackStatus, filter: string): boolean {
  if (filter === ALL) return true;
  if (filter === OPEN) return status === "new" || status === "in_progress";
  return status === filter;
}

export function FeedbackGrid({ rows, limit }: { rows: FeedbackRow[]; limit: number }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(OPEN);
  const [category, setCategory] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([{ id: "receivedAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesStatus(row.status, status)) return false;
      if (category !== ALL && row.category !== category) return false;
      if (source !== ALL && row.source !== source) return false;
      if (!q) return true;
      return [row.message, row.appVersion, row.device, row.screen].join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, status, category, source]);

  const columns = useMemo<ColumnDef<DataGridFeatures, FeedbackRow>[]>(
    () => [
      {
        accessorKey: "receivedAt",
        id: "receivedAt",
        header: ({ column }) => <DataGridColumnHeader title="Received" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {row.original.dateOnly ? formatDateShort(row.original.receivedAt) : formatDateTimeUtc(row.original.receivedAt)}
          </span>
        ),
        size: 190,
      },
      {
        accessorKey: "source",
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{FEEDBACK_SOURCE_LABELS[row.original.source]}</span>
        ),
        size: 110,
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) => <FeedbackStatusBadge status={row.original.status} />,
        size: 120,
      },
      {
        accessorKey: "category",
        id: "category",
        header: "Category",
        cell: ({ row }) => <FeedbackCategoryBadge category={row.original.category} />,
        size: 110,
      },
      {
        accessorKey: "message",
        id: "message",
        header: "Message",
        cell: ({ row }) => (
          <span className="block truncate text-foreground" title={row.original.message}>
            {row.original.message}
          </span>
        ),
        size: 380,
        meta: { autoSize: true },
      },
      {
        accessorKey: "appVersion",
        id: "appVersion",
        header: "Version",
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.appVersion ?? "—"}</span>,
        size: 110,
      },
      {
        accessorKey: "device",
        id: "device",
        header: "Device",
        cell: ({ row }) => (
          <span className="block truncate text-muted-foreground" title={row.original.device ?? undefined}>
            {row.original.device ?? "—"}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: "screen",
        id: "screen",
        header: "Screen",
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.screen ?? "—"}</span>,
        size: 120,
      },
      {
        accessorKey: "hasScreenshot",
        id: "hasScreenshot",
        header: () => (
          <>
            <ImageIcon className="size-4" aria-hidden />
            <span className="sr-only">Screenshot or image</span>
          </>
        ),
        cell: ({ row }) =>
          row.original.hasScreenshot ? (
            <>
              <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Has a screenshot or image</span>
            </>
          ) : null,
        size: 56,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: FeedbackRow) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const filtering = search !== "" || status !== ALL || category !== ALL || source !== ALL;

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage={rows.length === 0 ? "No feedback yet." : filtering ? "Nothing matches these filters." : "No feedback."}
      onRowClick={(row) => router.push(`/admin/feedback/app/${row.id}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>
            {rows.length >= limit
              ? `${rows.length} items (newest ${limit} per source)`
              : rows.length === 1
                ? "1 item"
                : `${rows.length} items`}
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
            <Select items={CATEGORY_ITEMS} value={category} onValueChange={(value) => setCategory(value ?? ALL)}>
              <SelectTrigger className="w-40" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CATEGORY_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select items={SOURCE_ITEMS} value={source} onValueChange={(value) => setSource(value ?? ALL)}>
              <SelectTrigger className="w-40" aria-label="Filter by source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SOURCE_ITEMS.map((item) => (
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
                placeholder="Search message, version, screen"
                aria-label="Search feedback"
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
