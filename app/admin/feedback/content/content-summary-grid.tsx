"use client";

import { type ColumnDef, type PaginationState, type SortingState, useTable } from "@tanstack/react-table";
import { ExternalLinkIcon, SearchIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONTENT_KIND_LABELS,
  CONTENT_KINDS,
  contentLabel,
  directusItemUrl,
  type ContentKind,
} from "@/lib/feedback/validation";
import { formatDateTimeUtc } from "@/lib/format";

import { itemHref } from "./rows";

export type ContentItemRow = {
  key: string;
  contentKind: ContentKind;
  directusId: number;
  /** Newest first; empty when no title was ever synced. */
  titles: string[];
  up: number;
  down: number;
  notes: number;
  newNotes: number;
  lastRatedAt: string;
};

const ALL = "all";
const KIND_ITEMS = [
  { value: ALL, label: "All kinds" },
  ...CONTENT_KINDS.map((value) => ({ value, label: CONTENT_KIND_LABELS[value] })),
];

/** One line per content item: how it is rated, and how many notes it has. */
export function ContentSummaryGrid({ rows }: { rows: ContentItemRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([{ id: "lastRatedAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== ALL && row.contentKind !== kind) return false;
      if (!q) return true;
      // Every title the item had, so a renamed item is found by either name.
      return row.titles.join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, kind]);

  const columns = useMemo<ColumnDef<DataGridFeatures, ContentItemRow>[]>(
    () => [
      {
        id: "title",
        accessorFn: (row) => row.titles[0] ?? "",
        header: ({ column }) => <DataGridColumnHeader title="Content" column={column} />,
        cell: ({ row }) => {
          const [latest, ...older] = row.original.titles;
          const label = contentLabel(row.original.contentKind, row.original.directusId, latest ?? null);
          return (
            <span className="block truncate" title={row.original.titles.join(" · ") || label}>
              <span className="text-foreground">{label}</span>
              {older.length > 0 && <span className="text-muted-foreground"> · also: {older.join(", ")}</span>}
            </span>
          );
        },
        size: 320,
        meta: { autoSize: true },
      },
      {
        accessorKey: "contentKind",
        id: "contentKind",
        header: "Kind",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{CONTENT_KIND_LABELS[row.original.contentKind]}</span>
        ),
        size: 130,
      },
      {
        accessorKey: "up",
        id: "up",
        header: ({ column }) => <DataGridColumnHeader title="Up" column={column} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.up}</span>,
        size: 72,
      },
      {
        accessorKey: "down",
        id: "down",
        header: ({ column }) => <DataGridColumnHeader title="Down" column={column} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.down}</span>,
        size: 72,
      },
      {
        accessorKey: "notes",
        id: "notes",
        header: ({ column }) => <DataGridColumnHeader title="Notes" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {row.original.notes}
            {row.original.newNotes > 0 && <span className="text-muted-foreground"> ({row.original.newNotes} new)</span>}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: "lastRatedAt",
        id: "lastRatedAt",
        header: ({ column }) => <DataGridColumnHeader title="Last rated" column={column} />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatDateTimeUtc(row.original.lastRatedAt)}</span>
        ),
        size: 190,
      },
      {
        id: "directus",
        header: () => <span className="sr-only">Open in Directus</span>,
        cell: ({ row }) => (
          <a
            href={directusItemUrl(row.original.contentKind, row.original.directusId)}
            target="_blank"
            rel="noopener noreferrer"
            // The row opens the item's page; this link opens Directus instead.
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Directus
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        ),
        size: 110,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: ContentItemRow) => row.key,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage={rows.length === 0 ? "No ratings yet." : "Nothing matches these filters."}
      onRowClick={(row) => router.push(itemHref(row.contentKind, row.directusId))}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>{rows.length === 1 ? "1 item" : `${rows.length} items`}</FrameTitle>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select items={KIND_ITEMS} value={kind} onValueChange={(value) => setKind(value ?? ALL)}>
              <SelectTrigger className="w-40" aria-label="Filter by kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {KIND_ITEMS.map((item) => (
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
                placeholder="Search titles"
                aria-label="Search content"
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
