'use client';

interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, active, onChange }: TabsProps) {
  const activeIndex = items.findIndex((i) => i.key === active);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const next = items[(activeIndex + delta + items.length) % items.length];
    if (next) onChange(next.key);
  };

  return (
    <div role="tablist" onKeyDown={onKeyDown} className="flex gap-0.5 bg-panel-2 border border-hairline rounded-full p-0.5 w-fit">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={active === item.key}
          tabIndex={active === item.key ? 0 : -1}
          onClick={() => onChange(item.key)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-colors ${
            active === item.key ? 'bg-panel text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
