"use client";

import { type ColumnDef, useTable } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { formatMonth } from "@/lib/format";

type Row = { month: string; referrals: number };

export function ReferralsGrid({ rows, total }: { rows: Row[]; total: number }) {
  const columns = useMemo<ColumnDef<DataGridFeatures, Row>[]>(
    () => [
      {
        accessorKey: "month",
        id: "month",
        header: "Month",
        cell: ({ row }) => <span className="text-foreground">{formatMonth(row.original.month)}</span>,
        size: 220,
        meta: { autoSize: true },
      },
      {
        accessorKey: "referrals",
        id: "referrals",
        header: "Sign-ups with your code",
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.referrals}</span>,
        size: 200,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row: Row) => row.month,
    // Newest month first, as the server sends them; every month shown.
    manualPagination: true,
  });

  return (
    <DataGrid table={table} recordCount={rows.length} emptyMessage="No sign-ups with your code yet.">
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row items-center justify-between gap-3">
          <FrameTitle>Sign-ups</FrameTitle>
          <span className="text-sm text-muted-foreground">{total === 1 ? "1 in total" : `${total} in total`}</span>
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
