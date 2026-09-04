import { useState } from 'react';
import SavedSessionsPanel from './SavedSessionsPanel.jsx';
import CredentialsPanel from './CredentialsPanel.jsx';
import CommandDictionaryPanel from './CommandDictionaryPanel.jsx';

export default function Sidebar({ refreshKey, onConnect, onNewSession, canPaste, onPaste }) {
  const [tab, setTab] = useState('sessions'); // 'sessions' | 'credentials' | 'commands'

  return (
    <div className="sidebar-shell">
      <div className="sidebar-tabs">
        <button type="button" className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>
          Sessions
        </button>
        <button type="button" className={tab === 'credentials' ? 'active' : ''} onClick={() => setTab('credentials')}>
          Credentials
        </button>
        <button type="button" className={tab === 'commands' ? 'active' : ''} onClick={() => setTab('commands')}>
          Command Dictionary
        </button>
      </div>

      {tab === 'sessions' && <SavedSessionsPanel refreshKey={refreshKey} onConnect={onConnect} onNewSession={onNewSession} />}
      {tab === 'credentials' && <CredentialsPanel refreshKey={refreshKey} />}
      {tab === 'commands' && <CommandDictionaryPanel canPaste={canPaste} onPaste={onPaste} />}
    </div>
  );
}
