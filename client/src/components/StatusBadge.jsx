const LABELS = {
  idle: 'Idle',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Error',
};

export default function StatusBadge({ status, message }) {
  return (
    <div className={`status-badge status-${status}`} title={message || ''}>
      <span className={`status-dot status-dot-${status}`} />
      <span>{LABELS[status] || status}</span>
    </div>
  );
}
