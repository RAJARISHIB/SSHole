import { useCallback, useEffect, useMemo, useState } from 'react';
import * as savedSessionsApi from '../api/savedSessions.js';
import * as sessionGroupsApi from '../api/sessionGroups.js';
import EditSessionModal from './EditSessionModal.jsx';
import CredentialPromptModal from './CredentialPromptModal.jsx';
import GroupModal from './GroupModal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const UNGROUPED_ID = '__ungrouped__';

// Builds the group -> sessions tree, applying the search term (matches
// group name, session name, host, or username — case-insensitive). A group
// whose name matches shows all of its sessions; otherwise only its own
// matching sessions are shown. Groups with no match at all are hidden while
// searching, but always shown (even empty) when not searching.
function buildSections(groups, sessions, term) {
  const t = term.trim().toLowerCase();
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  const sessionMatches = (s) =>
    s.name.toLowerCase().includes(t) || s.host.toLowerCase().includes(t) || s.username.toLowerCase().includes(t);

  const sections = [];

  for (const g of sortedGroups) {
    const groupNameMatches = t && g.name.toLowerCase().includes(t);
    let groupSessions = sessions.filter((s) => s.groupId === g.id);
    if (t && !groupNameMatches) {
      groupSessions = groupSessions.filter(sessionMatches);
    }
    groupSessions = [...groupSessions].sort((a, b) => a.name.localeCompare(b.name));

    if (t && !groupNameMatches && groupSessions.length === 0) continue;
    sections.push({ id: g.id, name: g.name, sessions: groupSessions, isGroup: true });
  }

  const hasAnyUngrouped = sessions.some((s) => !s.groupId);
  let ungrouped = sessions.filter((s) => !s.groupId);
  if (t) ungrouped = ungrouped.filter(sessionMatches);
  ungrouped = [...ungrouped].sort((a, b) => a.name.localeCompare(b.name));
  if (hasAnyUngrouped && (!t || ungrouped.length > 0)) {
    sections.push({ id: UNGROUPED_ID, name: 'Ungrouped', sessions: ungrouped, isGroup: false });
  }

  return sections;
}

export default function SavedSessionsPanel({ refreshKey, onConnect, onNewSession }) {
  const [sessions, setSessions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [groupModal, setGroupModal] = useState(null); // { mode: 'create'|'rename', group? }
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [credentialPromptSession, setCredentialPromptSession] = useState(null);
  const [deletingSession, setDeletingSession] = useState(null);
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessionList, groupList] = await Promise.all([savedSessionsApi.listSessions(), sessionGroupsApi.listGroups()]);
      setSessions(sessionList);
      setGroups(groupList);
    } catch (err) {
      setError(err.message || 'Failed to load saved sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const sections = useMemo(() => buildSections(groups, sessions, search), [groups, sessions, search]);
  const searching = search.trim().length > 0;

  const toggleCollapsed = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConnectClick = (session) => {
    if (session.hasSavedKey) {
      onConnect(session, {});
    } else {
      setCredentialPromptSession(session);
    }
  };

  const handleDeleteSessionConfirmed = async () => {
    setActionError('');
    try {
      await savedSessionsApi.deleteSession(deletingSession.id);
      setDeletingSession(null);
      refresh();
    } catch (err) {
      setActionError(err.message || 'Failed to delete session.');
    }
  };

  const handleDeleteGroupConfirmed = async () => {
    setActionError('');
    try {
      await sessionGroupsApi.deleteGroup(deletingGroup.id);
      setDeletingGroup(null);
      refresh();
    } catch (err) {
      setActionError(err.message || 'Failed to delete group.');
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>SSH Sessions</h2>
        <div className="sidebar-header-actions">
          <button type="button" className="sidebar-add" onClick={() => setGroupModal({ mode: 'create' })}>
            + Group
          </button>
          <button type="button" className="sidebar-add" onClick={onNewSession}>
            + Session
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input type="text" placeholder="Search sessions…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <div className="sidebar-empty">Loading…</div>}
      {!loading && error && <div className="sidebar-empty sidebar-error">{error}</div>}
      {!loading && !error && sections.length === 0 && (
        <div className="sidebar-empty">
          {sessions.length === 0
            ? 'No saved sessions yet. Check "Save this session" on the connection form to add one.'
            : 'No sessions match your search.'}
        </div>
      )}

      <div className="session-groups">
        {sections.map((section) => {
          const isCollapsed = !searching && collapsed.has(section.id);
          return (
            <div key={section.id} className="session-group">
              <div className="session-group-header">
                <button
                  type="button"
                  className="group-collapse-toggle"
                  onClick={() => toggleCollapsed(section.id)}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? '▶' : '▼'}
                </button>
                <span className="session-group-name" onClick={() => toggleCollapsed(section.id)}>
                  {section.name}
                </span>
                {section.isGroup && (
                  <div className="session-group-actions">
                    <button type="button" onClick={() => setGroupModal({ mode: 'rename', group: section })}>
                      Rename
                    </button>
                    <button type="button" className="btn-danger-outline" onClick={() => setDeletingGroup(section)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <ul className="saved-session-list">
                  {section.sessions.length === 0 && <li className="sidebar-empty sidebar-empty-nested">No sessions.</li>}
                  {section.sessions.map((session) => (
                    <li key={session.id} className="saved-session-row">
                      <div className="saved-session-info" onClick={() => handleConnectClick(session)} title="Click to connect">
                        <div className="saved-session-name">
                          <span className={session.hasSavedKey ? 'key-icon key-icon-saved' : 'key-icon'}>
                            {session.hasSavedKey ? '🔒' : '🔓'}
                          </span>
                          {session.name}
                        </div>
                        <div className="saved-session-target">
                          {session.username}@{session.host}:{session.port}
                        </div>
                      </div>
                      <div className="saved-session-actions">
                        <button type="button" onClick={() => handleConnectClick(session)}>
                          Connect
                        </button>
                        <button type="button" onClick={() => setEditingSession(session)}>
                          Edit
                        </button>
                        <button type="button" className="btn-danger-outline" onClick={() => setDeletingSession(session)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {actionError && <div className="sidebar-error sidebar-error-footer">{actionError}</div>}

      {groupModal && (
        <GroupModal
          mode={groupModal.mode}
          group={groupModal.group}
          api={sessionGroupsApi}
          title="Session Group"
          onCancel={() => setGroupModal(null)}
          onSaved={() => {
            setGroupModal(null);
            refresh();
          }}
        />
      )}

      {editingSession && (
        <EditSessionModal
          session={editingSession}
          groups={groups}
          onCancel={() => setEditingSession(null)}
          onSaved={() => {
            setEditingSession(null);
            refresh();
          }}
        />
      )}

      {credentialPromptSession && (
        <CredentialPromptModal
          session={credentialPromptSession}
          onCancel={() => setCredentialPromptSession(null)}
          onSaved={refresh}
          onConnect={(config) => {
            setCredentialPromptSession(null);
            onConnect(credentialPromptSession, config);
          }}
        />
      )}

      {deletingSession && (
        <ConfirmDialog
          title="Delete saved session?"
          message={`"${deletingSession.name}" will be permanently deleted. A credential stored directly in it goes with it; a saved (reusable) credential it references is not affected and stays available for other sessions.`}
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setDeletingSession(null);
            setActionError('');
          }}
          onConfirm={handleDeleteSessionConfirmed}
        />
      )}

      {deletingGroup && (
        <ConfirmDialog
          title="Delete group?"
          message={`"${deletingGroup.name}" will be deleted. Its sessions are kept and moved to Ungrouped.`}
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setDeletingGroup(null);
            setActionError('');
          }}
          onConfirm={handleDeleteGroupConfirmed}
        />
      )}
    </div>
  );
}
