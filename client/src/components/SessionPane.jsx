import ConnectionForm from './ConnectionForm.jsx';
import TerminalPane from './TerminalPane.jsx';
import StatusBadge from './StatusBadge.jsx';

export default function SessionPane({
  session,
  active,
  onConnect,
  onStatus,
  onReconnectRequest,
  onClose,
  onSessionSaved,
  terminalRef,
}) {
  return (
    <div className={`session-pane ${active ? 'active' : 'hidden'}`}>
      {session.phase === 'form' ? (
        <ConnectionForm onConnect={onConnect} onSessionSaved={onSessionSaved} />
      ) : (
        <div className="terminal-wrapper">
          <div className="terminal-toolbar">
            <StatusBadge status={session.status} message={session.statusMessage} />
            <div className="terminal-toolbar-actions">
              {session.status === 'disconnected' || session.status === 'error' ? (
                <button type="button" onClick={onReconnectRequest}>
                  Reconnect
                </button>
              ) : (
                <button type="button" onClick={() => terminalRef.current?.disconnect()}>
                  Disconnect
                </button>
              )}
              <button type="button" className="btn-close-tab" onClick={onClose}>
                Close Tab
              </button>
            </div>
          </div>
          <TerminalPane ref={terminalRef} sessionId={session.id} config={session.config} active={active} onStatus={onStatus} />
        </div>
      )}
    </div>
  );
}
