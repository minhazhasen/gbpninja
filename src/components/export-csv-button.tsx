"use client";

// "Export CSV" button. Server pages pass the rows; client boards can pass `rows` as a function so the export follows their filters.
import { toast } from "sonner";
import { Download } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { cn } from "@/lib/utils";

export function ExportCsvButton({
  filename,
  rows,
  label = "Export CSV",
  what = "rows",
  className,
}: {
  filename: string;
  /** Header row first. */
  rows: CsvCell[][] | (() => CsvCell[][]);
  label?: string;
  /** Used in the toast: "Exported 23 reviews". */
  what?: string;
  className?: string;
}) {
  const run = () => {
    const data = typeof rows === "function" ? rows() : rows;
    const count = Math.max(0, data.length - 1);
    if (!count) return void toast.error("Nothing to export");
    downloadCsv(filename, data);
    toast.success(`Exported ${count.toLocaleString()} ${what}`);
  };
  return (
    <button type="button" onClick={run} className={buttonClass("outline", "sm", cn("h-9 shrink-0", className))} title={label}>
      <Download /> <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}
