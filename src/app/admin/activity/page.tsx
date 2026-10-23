import { format, parseISO } from "date-fns";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { listLog } from "@/lib/platform/store";

export default async function AdminActivityPage() {
  const log = await listLog();
  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="Activity" />
      <Card className="overflow-hidden">
        {!log.length ? (
          <EmptyState title="Nothing yet" />
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  {["When", "Action", "On", "By"].map((h) => (
                    <th key={h} className="label-caps px-4 py-2.5 font-medium first:pl-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2.5 pl-6 pr-4 tabular-nums text-muted-foreground">{format(parseISO(e.at), "d MMM yyyy, HH:mm")}</td>
                    <td className="px-4 py-2.5 font-medium">{e.action}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.target ?? "—"}</td>
                    <td className="px-4 py-2.5 pr-6 text-muted-foreground">{e.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y md:hidden">
              {log.map((e) => (
                <li key={e.id} className="space-y-0.5 px-4 py-3 text-sm">
                  <p className="font-medium">{e.action}</p>
                  {e.target && <p className="text-muted-foreground">{e.target}</p>}
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(e.at), "d MMM, HH:mm")} · {e.actor}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
