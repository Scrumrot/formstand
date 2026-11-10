import type { ComponentProps } from "react";
import { cn } from "../cn";

// shadcn's table recipe: thin wrappers over the native table elements, each
// a data-slot for the kit's styling. The generated forms render an array of
// flat object rows through these (one `<TableRow>` per field-array row, a
// cell per row field, a Remove cell), so the typecheck against the real
// components needs the real export surface here.

export type TableProps = Readonly<ComponentProps<"table">>;

export const Table = ({ className, ...props }: TableProps) => (
  <div data-slot="table-container" className="relative w-full overflow-x-auto">
    <table
      data-slot="table"
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
);

export type TableHeaderProps = Readonly<ComponentProps<"thead">>;

export const TableHeader = ({ className, ...props }: TableHeaderProps) => (
  <thead
    data-slot="table-header"
    className={cn("[&_tr]:border-b", className)}
    {...props}
  />
);

export type TableBodyProps = Readonly<ComponentProps<"tbody">>;

export const TableBody = ({ className, ...props }: TableBodyProps) => (
  <tbody
    data-slot="table-body"
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
);

export type TableRowProps = Readonly<ComponentProps<"tr">>;

export const TableRow = ({ className, ...props }: TableRowProps) => (
  <tr
    data-slot="table-row"
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className,
    )}
    {...props}
  />
);

export type TableHeadProps = Readonly<ComponentProps<"th">>;

export const TableHead = ({ className, ...props }: TableHeadProps) => (
  <th
    data-slot="table-head"
    className={cn(
      "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
);

export type TableCellProps = Readonly<ComponentProps<"td">>;

export const TableCell = ({ className, ...props }: TableCellProps) => (
  <td
    data-slot="table-cell"
    className={cn(
      "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
);
