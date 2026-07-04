export default function ResourceTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (val: string) => void;
}) {
  const tabs = [
    { id: 'user', label: 'Users' },
    { id: 'admin', label: 'Admins' },
  ];

  return (
    <div className="flex justify-center border-b border-white/10 mb-8">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-6 py-3 text-sm font-medium transition-all border-b-2 ${active === tab.id ? 'border-brand-accent text-brand-accent' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
