function darkenedLabelColor(color = '') {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#10101a';
  const channels = [0, 2, 4].map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * 0.34));
  return `rgb(${channels.join(', ')})`;
}

export default function Pill({ label, subtle = false }) {
  if (!label) return <span className="text-ink-500">-</span>;
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-xs font-semibold text-ink-950 shadow-sm"
      style={{
        backgroundColor: subtle ? `${label.color}cc` : label.color,
        color: darkenedLabelColor(label.color),
        boxShadow: `0 0 0 1px ${label.color}33, 0 6px 16px ${label.color}18`,
      }}
      title={label.value}
    >
      {label.value}
    </span>
  );
}
