export default function TabBar({ sessions, activeId, onSelect, onClose, onNew }) {
  return (
    <div className="tab-bar">
      <div className="tabs">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`tab ${s.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
            title={s.statusMessage || s.label}
          >
            <span className={`status-dot status-dot-${s.status}`} />
            <span className="tab-label">{s.label}</span>
            <button
              type="button"
              className="tab-close"
              title="Close session"
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="tab-new" onClick={onNew} title="New session">
        + New Session
      </button>
    </div>
  );
}
