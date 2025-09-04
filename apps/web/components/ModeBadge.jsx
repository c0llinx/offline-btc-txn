export default function ModeBadge({ label, color = 'bg-zinc-800' }) {
  return <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-white text-xs ${color}`}>{label}</span>;
}
