"use client";

import { type ColumnDef, type PaginationState, type SortingState, useTable } from "@tanstack/react-table";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameFooter, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { formatDateShort } from "@/lib/format";

export type CreatorRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  hasRecord: boolean;
};

export function CreatorsGrid({ rows }: { rows: CreatorRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q));
  }, [rows, search]);

  const columns = useMemo<ColumnDef<DataGridFeatures, CreatorRow>[]>(
    () => [
      {
        accessorKey: "code",
        id: "code",
        header: ({ column }) => <DataGridColumnHeader title="Code" column={column} />,
        // A real link, so the detail page is reachable by keyboard; the row
        // click below is only a mouse convenience.
        cell: ({ row }) => (
          <Link
            href={`/admin/creators/${row.original.id}`}
            className="font-mono font-medium text-foreground underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.code}
          </Link>
        ),
        size: 200,
      },
      {
        accessorKey: "name",
        id: "name",
        header: ({ column }) => <DataGridColumnHeader title="Name" column={column} />,
        cell: ({ row }) => <span className="text-foreground">{row.original.name}</span>,
        size: 260,
        meta: { autoSize: true },
      },
      {
        accessorKey: "active",
        id: "active",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.active ? (
              <Badge variant="success-outline">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {!row.original.hasRecord && <Badge variant="warning-outline">No admin record</Badge>}
          </div>
        ),
        size: 220,
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: ({ column }) => <DataGridColumnHeader title="Created" column={column} />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateShort(row.original.createdAt)}</span>
        ),
        size: 140,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: CreatorRow) => row.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage={search ? "No creator matches." : "No creators yet."}
      onRowClick={(row) => router.push(`/admin/creators/${row.id}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>
            {rows.length === 1 ? "1 creator" : `${rows.length} creators`}
          </FrameTitle>
          <div className="flex items-center gap-2.5">
            <InputGroup className="w-48 bg-background">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search code or name"
                aria-label="Search creators"
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
            <Button nativeButton={false} render={<Link href="/admin/creators/new" />}>
              <PlusIcon />
              New creator
            </Button>
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
