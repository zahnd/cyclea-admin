"use client";

import { type ColumnDef, type SortingState, useTable } from "@tanstack/react-table";
import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format";

export type AdminGridRow = {
  userId: string;
  email: string;
  isYou: boolean;
  addedAt: string;
  addedBy: string | null;
  lastSignInAt: string | null;
  hasAuthenticator: boolean;
};

export function AdminsGrid({ rows }: { rows: AdminGridRow[] }) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "addedAt", desc: false }]);

  const columns = useMemo<ColumnDef<DataGridFeatures, AdminGridRow>[]>(
    () => [
      {
        accessorKey: "email",
        id: "email",
        header: ({ column }) => <DataGridColumnHeader title="Email" column={column} />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/admins/${row.original.userId}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.email}
            </Link>
            {row.original.isYou && <Badge variant="info-outline">You</Badge>}
          </div>
        ),
        size: 300,
        meta: { autoSize: true },
      },
      {
        accessorKey: "hasAuthenticator",
        id: "hasAuthenticator",
        header: ({ column }) => <DataGridColumnHeader title="Authenticator" column={column} />,
        cell: ({ row }) =>
          row.original.hasAuthenticator ? (
            <Badge variant="success-outline">Set up</Badge>
          ) : (
            <Badge variant="warning-outline">Not yet</Badge>
          ),
        size: 150,
      },
      {
        accessorKey: "addedAt",
        id: "addedAt",
        header: ({ column }) => <DataGridColumnHeader title="Added" column={column} />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-foreground">{formatDateShort(row.original.addedAt)}</span>
            {row.original.addedBy && <span className="text-xs text-muted-foreground">by {row.original.addedBy}</span>}
          </div>
        ),
        size: 220,
      },
      {
        accessorKey: "lastSignInAt",
        id: "lastSignInAt",
        header: ({ column }) => <DataGridColumnHeader title="Last sign-in" column={column} />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastSignInAt ? formatDateShort(row.original.lastSignInAt) : "Never"}
          </span>
        ),
        size: 140,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row: AdminGridRow) => row.userId,
    state: { sorting },
    onSortingChange: setSorting,
    // A handful of rows: no pagination.
    manualPagination: true,
  });

  return (
    <DataGrid
      table={table}
      recordCount={rows.length}
      onRowClick={(row) => router.push(`/admin/admins/${row.userId}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>{rows.length === 1 ? "1 admin" : `${rows.length} admins`}</FrameTitle>
          <Button nativeButton={false} render={<Link href="/admin/admins/new" />}>
            <UserPlusIcon />
            Add admin
          </Button>
        </FrameHeader>
        <FramePanel className="p-0 shadow-none">
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        </FramePanel>
      </Frame>
    </DataGrid>
  );
}
