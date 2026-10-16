/**
 * Shown inside the console's frame the moment a section is opened, so the
 * sidebar answers at once while the page's queries (and, on Settle and the
 * slate builder, a feed refresh) finish.
 */
function Bone({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-lg bg-surface-2 motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <Bone className="h-7 w-48" />
      <Bone className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-28" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Bone className="h-64 lg:col-span-2" />
        <Bone className="h-64" />
      </div>
    </div>
  );
}
