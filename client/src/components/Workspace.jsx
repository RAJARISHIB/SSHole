import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import TabBar from './TabBar.jsx';
import SessionPane from './SessionPane.jsx';
import Sidebar from './Sidebar.jsx';

function createSession(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    label: 'New Session',
    phase: 'form', // 'form' | 'terminal'
    status: 'idle', // idle | connecting | connected | disconnected | error
    statusMessage: '',
    config: null,
    ...overrides,
  };
}

export default function Workspace() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState(() => [createSession()]);
  const [activeId, setActiveId] = useState(() => sessions[0].id);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  // One imperative ref per session tab (id -> { current: TerminalPane handle
  // | null }), so "Paste to Terminal" can reach exactly the active tab's
  // terminal without every terminal needing to know about every other one.
  // Created lazily and kept for the tab's lifetime; pruned on close.
  const terminalRefs = useRef(new Map());
  const getTerminalRef = useCallback((id) => {
    if (!terminalRefs.current.has(id)) {
      terminalRefs.current.set(id, { current: null });
    }
    return terminalRefs.current.get(id);
  }, []);

  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  const updateSession = useCallback((id, patch) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const addSession = useCallback(() => {
    const s = createSession();
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, []);

  const closeSession = useCallback(
    (id) => {
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx === -1) return;

      terminalRefs.current.delete(id);

      const next = sessions.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh = createSession();
        setSessions([fresh]);
        setActiveId(fresh.id);
        return;
      }

      setSessions(next);
      if (id === activeId) {
        const newActive = next[Math.max(0, idx - 1)];
        setActiveId(newActive.id);
      }
    },
    [sessions, activeId]
  );

  const handleConnect = useCallback(
    (id, config) => {
      updateSession(id, {
        phase: 'terminal',
        config,
        label: `${config.username}@${config.host}`,
        status: 'connecting',
        statusMessage: 'Connecting…',
      });
    },
    [updateSession]
  );

  const handleStatus = useCallback(
    (id, status, message) => {
      updateSession(id, { status, statusMessage: message || '' });
    },
    [updateSession]
  );

  const handleReconnectRequest = useCallback(
    (id) => {
      updateSession(id, { phase: 'form', status: 'idle', statusMessage: '' });
    },
    [updateSession]
  );

  // Connect straight to a terminal for a saved session — no connection
  // form shown, and no password/key re-entry when one is already stored
  // (overrides is {} in that case; the backend decrypts the stored key).
  const connectSavedSession = useCallback((savedSession, overrides) => {
    const s = createSession({
      label: `${savedSession.username}@${savedSession.host}`,
      phase: 'terminal',
      status: 'connecting',
      statusMessage: 'Connecting…',
      config: { savedSessionId: savedSession.id, ...overrides },
    });
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  }, []);

  // "Active session" = whichever tab is currently selected. Paste is only
  // ever offered for — and only ever sent to — this one tab, and only once
  // it's actually connected (not while still connecting, or after it has
  // disconnected/errored).
  const activeSession = sessions.find((s) => s.id === activeId);
  const canPasteToActiveTerminal = Boolean(activeSession && activeSession.phase === 'terminal' && activeSession.status === 'connected');

  const pasteToActiveTerminal = useCallback(
    (commandText) => {
      if (!canPasteToActiveTerminal) return;
      terminalRefs.current.get(activeId)?.current?.sendData(commandText);
    },
    [activeId, canPasteToActiveTerminal]
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-icon">⌨</span>
          <h1>SSH Web Terminal</h1>
        </div>
        <div className="app-header-user">
          <span className="app-header-username">{user.username}</span>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          refreshKey={sidebarRefreshKey}
          onConnect={connectSavedSession}
          onNewSession={addSession}
          canPaste={canPasteToActiveTerminal}
          onPaste={pasteToActiveTerminal}
        />

        <div className="main-area">
          <TabBar sessions={sessions} activeId={activeId} onSelect={setActiveId} onClose={closeSession} onNew={addSession} />

          <div className="session-panes">
            {sessions.map((s) => (
              <SessionPane
                key={s.id}
                session={s}
                active={s.id === activeId}
                onConnect={(config) => handleConnect(s.id, config)}
                onStatus={(status, message) => handleStatus(s.id, status, message)}
                onReconnectRequest={() => handleReconnectRequest(s.id)}
                onClose={() => closeSession(s.id)}
                onSessionSaved={refreshSidebar}
                terminalRef={getTerminalRef(s.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
