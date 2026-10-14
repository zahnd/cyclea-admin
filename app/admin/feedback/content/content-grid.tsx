"use client";

import { type ColumnDef, type PaginationState, type SortingState, useTable } from "@tanstack/react-table";
import { SearchIcon, ThumbsDownIcon, ThumbsUpIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONTENT_KIND_LABELS,
  CONTENT_KINDS,
  contentLabel,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  RATING_DOWN,
  RATING_UP,
  ratingLabel,
  type ContentKind,
  type FeedbackStatus,
} from "@/lib/feedback/validation";
import { formatDateTimeUtc } from "@/lib/format";

import { FeedbackStatusBadge } from "../app/feedback-grid";

export type ContentRatingRow = {
  id: string;
  contentKind: ContentKind;
  directusId: number;
  rating: number;
  note: string | null;
  title: string | null;
  updatedAt: string;
  /** Null for a bare thumb, which is not triaged. */
  status: FeedbackStatus | null;
  noteChangedSinceTriage: boolean;
};

export function RatingBadge({ rating }: { rating: number }) {
  if (rating === RATING_UP) {
    return (
      <Badge variant="success-light">
        <ThumbsUpIcon aria-hidden />
        {ratingLabel(rating)}
      </Badge>
    );
  }
  if (rating === RATING_DOWN) {
    return (
      <Badge variant="destructive-light">
        <ThumbsDownIcon aria-hidden />
        {ratingLabel(rating)}
      </Badge>
    );
  }
  return <Badge variant="outline">{ratingLabel(rating)}</Badge>;
}

const ALL = "all";
const OPEN = "open";
/** Bare thumbs: nothing to triage. */
const NONE = "none";

const STATUS_ITEMS = [
  { value: ALL, label: "All statuses" },
  { value: OPEN, label: "Open" },
  ...FEEDBACK_STATUSES.map((value) => ({ value, label: FEEDBACK_STATUS_LABELS[value] })),
  { value: NONE, label: "No note" },
];
const THUMB_ITEMS = [
  { value: ALL, label: "All ratings" },
  { value: String(RATING_UP), label: "Thumbs up" },
  { value: String(RATING_DOWN), label: "Thumbs down" },
];
const KIND_ITEMS = [
  { value: ALL, label: "All kinds" },
  ...CONTENT_KINDS.map((value) => ({ value, label: CONTENT_KIND_LABELS[value] })),
];

function matchesStatus(status: FeedbackStatus | null, filter: string): boolean {
  if (filter === ALL) return true;
  if (filter === NONE) return status === null;
  if (filter === OPEN) return status === "new" || status === "in_progress";
  return status === filter;
}

function FilterSelect({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => onChange(next ?? ALL)}>
      <SelectTrigger className="w-40" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * Every rating, or one item's ratings (`item` set: the kind and title
 * columns and the kind filter go, they would say the same thing on every row).
 */
export function ContentGrid({
  rows,
  limit,
  item = false,
}: {
  rows: ContentRatingRow[];
  limit: number;
  item?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [thumb, setThumb] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [notesOnly, setNotesOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesStatus(row.status, status)) return false;
      if (thumb !== ALL && String(row.rating) !== thumb) return false;
      if (kind !== ALL && row.contentKind !== kind) return false;
      if (notesOnly && row.note === null) return false;
      if (!q) return true;
      return [row.title, row.note].join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, status, thumb, kind, notesOnly]);

  const columns = useMemo<ColumnDef<DataGridFeatures, ContentRatingRow>[]>(
    () => [
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: ({ column }) => <DataGridColumnHeader title="Rated" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDateTimeUtc(row.original.updatedAt)}</span>
        ),
        size: 190,
      },
      {
        accessorKey: "rating",
        id: "rating",
        header: "Rating",
        cell: ({ row }) => <RatingBadge rating={row.original.rating} />,
        size: 140,
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <FeedbackStatusBadge status={row.original.status} />
              {row.original.noteChangedSinceTriage && <span className="text-xs text-muted-foreground">note changed</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        size: 170,
      },
      ...(item
        ? []
        : ([
            {
              accessorKey: "contentKind",
              id: "contentKind",
              header: "Kind",
              cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                  {CONTENT_KIND_LABELS[row.original.contentKind]}
                </span>
              ),
              size: 130,
            },
            {
              accessorKey: "title",
              id: "title",
              header: "Content",
              cell: ({ row }) => {
                const label = contentLabel(row.original.contentKind, row.original.directusId, row.original.title);
                return (
                  <span className="block truncate text-foreground" title={label}>
                    {label}
                  </span>
                );
              },
              size: 240,
            },
          ] satisfies ColumnDef<DataGridFeatures, ContentRatingRow>[])),
      {
        accessorKey: "note",
        id: "note",
        header: "Note",
        cell: ({ row }) =>
          row.original.note ? (
            <span className="block truncate text-foreground" title={row.original.note}>
              {row.original.note}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        size: 360,
        meta: { autoSize: true },
      },
    ],
    [item],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: ContentRatingRow) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const filtering = search !== "" || status !== ALL || thumb !== ALL || kind !== ALL || notesOnly;

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage={rows.length === 0 ? "No ratings yet." : filtering ? "Nothing matches these filters." : "No ratings."}
      onRowClick={(row) => router.push(`/admin/feedback/content/${row.id}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>
            {rows.length >= limit
              ? `${rows.length} ratings (newest ${limit})`
              : rows.length === 1
                ? "1 rating"
                : `${rows.length} ratings`}
          </FrameTitle>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <Checkbox id="notes-only" checked={notesOnly} onCheckedChange={(checked) => setNotesOnly(checked)} />
              <Label htmlFor="notes-only" className="font-normal">
                With note only
              </Label>
            </div>
            <FilterSelect items={STATUS_ITEMS} value={status} onChange={setStatus} label="Filter by status" />
            <FilterSelect items={THUMB_ITEMS} value={thumb} onChange={setThumb} label="Filter by rating" />
            {!item && <FilterSelect items={KIND_ITEMS} value={kind} onChange={setKind} label="Filter by kind" />}
            <InputGroup className="w-56 bg-background">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder={item ? "Search notes" : "Search title, note"}
                aria-label="Search ratings"
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
