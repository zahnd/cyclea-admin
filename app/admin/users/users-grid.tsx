"use client";

import { type ColumnDef, type SortingState, useTable } from "@tanstack/react-table";
import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateShort } from "@/lib/format";

export type UserGridRow = {
  userId: string;
  email: string;
  isYou: boolean;
  role: "admin" | "creator" | "none";
  creatorCode: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  hasAuthenticator: boolean;
};

const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admins" },
  { value: "creator", label: "Creators" },
  { value: "none", label: "No access" },
];

export function RoleBadge({ role, creatorCode }: { role: UserGridRow["role"]; creatorCode?: string | null }) {
  if (role === "admin") return <Badge variant="primary-light">Admin</Badge>;
  if (role === "creator") return <Badge variant="info-light">Creator{creatorCode ? ` · ${creatorCode}` : ""}</Badge>;
  return <Badge variant="secondary">No access</Badge>;
}

export function UsersGrid({ rows }: { rows: UserGridRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: false }]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => (role === "all" || row.role === role) && (!q || row.email.toLowerCase().includes(q)));
  }, [rows, search, role]);

  const columns = useMemo<ColumnDef<DataGridFeatures, UserGridRow>[]>(
    () => [
      {
        accessorKey: "email",
        id: "email",
        header: ({ column }) => <DataGridColumnHeader title="Email" column={column} />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/users/${row.original.userId}`}
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
        accessorKey: "role",
        id: "role",
        header: ({ column }) => <DataGridColumnHeader title="Role" column={column} />,
        cell: ({ row }) => <RoleBadge role={row.original.role} creatorCode={row.original.creatorCode} />,
        size: 190,
      },
      {
        accessorKey: "hasAuthenticator",
        id: "hasAuthenticator",
        header: ({ column }) => <DataGridColumnHeader title="Authenticator" column={column} />,
        cell: ({ row }) =>
          row.original.hasAuthenticator ? (
            <Badge variant="success-outline">Set up</Badge>
          ) : row.original.role === "creator" ? (
            // Creators sign in with an email code only (decided 2026-10-01).
            <span className="text-muted-foreground">Not used</span>
          ) : (
            <Badge variant="warning-outline">Not yet</Badge>
          ),
        size: 140,
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
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: ({ column }) => <DataGridColumnHeader title="Account created" column={column} />,
        cell: ({ row }) => <span className="text-muted-foreground">{formatDateShort(row.original.createdAt)}</span>,
        size: 160,
      },
    ],
    [],
  );

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: filtered,
    getRowId: (row: UserGridRow) => row.userId,
    state: { sorting },
    onSortingChange: setSorting,
    // A handful of accounts: no pagination.
    manualPagination: true,
  });

  return (
    <DataGrid
      table={table}
      recordCount={filtered.length}
      emptyMessage="No account matches."
      onRowClick={(row) => router.push(`/admin/users/${row.userId}`)}
    >
      <Frame className="w-full" stacked dense>
        <FrameHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
          <FrameTitle>{rows.length === 1 ? "1 account" : `${rows.length} accounts`}</FrameTitle>
          <div className="flex flex-wrap items-center gap-2.5">
            <Select items={ROLE_FILTERS} value={role} onValueChange={(value) => setRole(value ?? "all")}>
              <SelectTrigger className="w-36" aria-label="Filter by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ROLE_FILTERS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <InputGroup className="w-48 bg-background">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search email"
                aria-label="Search accounts"
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
            <Button nativeButton={false} render={<Link href="/admin/users/new" />}>
              <UserPlusIcon />
              Add admin
            </Button>
          </div>
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
