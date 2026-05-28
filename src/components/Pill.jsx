export default function Pill({ label, subtle = false }) {
  if (!label) return <span className="text-ink-500">-</span>;
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-xs font-semibold text-ink-950 shadow-sm ${subtle ? 'uppercase' : ''}`}
      style={{
        backgroundColor: label.color,
        boxShadow: 'none',
      }}
      title={label.value}
    >
      {label.value}
    </span>
  );
}
