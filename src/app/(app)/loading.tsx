// Shown the moment a sidebar link is clicked, while the next page renders (and prefetched in production, so it appears instantly).
const Bar = ({ className }: { className: string }) => <div className={`animate-pulse rounded-md bg-muted ${className}`} />;

export default function Loading() {
  return (
    <div className="space-y-5 pb-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`space-y-2 px-4 py-4 sm:px-5 lg:px-6 lg:py-5 ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i ? "lg:border-l" : ""}`}>
            <Bar className="h-3 w-20" />
            <Bar className="h-7 w-16" />
            <Bar className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4 lg:px-6">
          <Bar className="h-5 w-40" />
        </div>
        <div className="space-y-4 px-5 py-5 lg:px-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bar className="h-3.5 w-2/3" />
                <Bar className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
