import { useCallback, useEffect, useMemo, useState } from 'react';
import * as credentialsApi from '../api/credentials.js';
import * as credentialGroupsApi from '../api/credentialGroups.js';
import CredentialFormModal from './CredentialFormModal.jsx';
import GroupModal from './GroupModal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const UNGROUPED_ID = '__ungrouped__';
const TYPE_LABELS = { password: 'Password', privateKey: 'Private Key' };

// Search matches credential name, credential group name, or credential
// type (case-insensitive) — same shape as the session tree's search, just
// over different fields per the spec.
function buildSections(groups, credentials, term) {
  const t = term.trim().toLowerCase();
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  const credMatches = (c) =>
    c.name.toLowerCase().includes(t) || (TYPE_LABELS[c.type] || '').toLowerCase().includes(t) || c.type.toLowerCase().includes(t);

  const sections = [];

  for (const g of sortedGroups) {
    const groupNameMatches = t && g.name.toLowerCase().includes(t);
    let groupCreds = credentials.filter((c) => c.groupId === g.id);
    if (t && !groupNameMatches) groupCreds = groupCreds.filter(credMatches);
    groupCreds = [...groupCreds].sort((a, b) => a.name.localeCompare(b.name));

    if (t && !groupNameMatches && groupCreds.length === 0) continue;
    sections.push({ id: g.id, name: g.name, credentials: groupCreds, isGroup: true });
  }

  const hasAnyUngrouped = credentials.some((c) => !c.groupId);
  let ungrouped = credentials.filter((c) => !c.groupId);
  if (t) ungrouped = ungrouped.filter(credMatches);
  ungrouped = [...ungrouped].sort((a, b) => a.name.localeCompare(b.name));
  if (hasAnyUngrouped && (!t || ungrouped.length > 0)) {
    sections.push({ id: UNGROUPED_ID, name: 'Ungrouped', credentials: ungrouped, isGroup: false });
  }

  return sections;
}

export default function CredentialsPanel({ refreshKey, onDataChanged }) {
  const [credentials, setCredentials] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [groupModal, setGroupModal] = useState(null); // { mode: 'create'|'rename', group? }
  const [deletingGroup, setDeletingGroup] = useState(null);
  const [formModal, setFormModal] = useState(null); // { mode: 'create'|'edit', credential? }
  const [deletingCredential, setDeletingCredential] = useState(null);
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [credList, groupList] = await Promise.all([credentialsApi.listCredentials(), credentialGroupsApi.listGroups()]);
      setCredentials(credList);
      setGroups(groupList);
    } catch (err) {
      setError(err.message || 'Failed to load credentials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const sections = useMemo(() => buildSections(groups, credentials, search), [groups, credentials, search]);
  const searching = search.trim().length > 0;

  const toggleCollapsed = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const notifyChanged = () => {
    refresh();
    onDataChanged?.(); // lets sessions pickers (which reference credentials) refresh too
  };

  const handleDeleteConfirmed = async () => {
    setActionError('');
    try {
      await credentialsApi.deleteCredential(deletingCredential.id);
      setDeletingCredential(null);
      notifyChanged();
    } catch (err) {
      if (err.status === 409 && err.body?.referencingSessions?.length) {
        const names = err.body.referencingSessions.map((s) => s.name).join(', ');
        setActionError(`Can't delete — still used by: ${names}. Change those sessions' credential first.`);
      } else {
        setActionError(err.message || 'Failed to delete credential.');
      }
    }
  };

  const handleDeleteGroupConfirmed = async () => {
    setActionError('');
    try {
      await credentialGroupsApi.deleteGroup(deletingGroup.id);
      setDeletingGroup(null);
      refresh();
    } catch (err) {
      setActionError(err.message || 'Failed to delete group.');
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Credentials</h2>
        <div className="sidebar-header-actions">
          <button type="button" className="sidebar-add" onClick={() => setGroupModal({ mode: 'create' })}>
            + Group
          </button>
          <button type="button" className="sidebar-add" onClick={() => setFormModal({ mode: 'create' })}>
            + New Credential
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input type="text" placeholder="Search credentials…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <div className="sidebar-empty">Loading…</div>}
      {!loading && error && <div className="sidebar-empty sidebar-error">{error}</div>}
      {!loading && !error && sections.length === 0 && (
        <div className="sidebar-empty">
          {credentials.length === 0 ? 'No saved credentials yet.' : 'No credentials match your search.'}
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
                  {section.credentials.length === 0 && (
                    <li className="sidebar-empty sidebar-empty-nested">No credentials.</li>
                  )}
                  {section.credentials.map((cred) => (
                    <li key={cred.id} className="saved-session-row">
                      <div className="saved-session-info">
                        <div className="saved-session-name">{cred.name}</div>
                        <div className="saved-session-target">
                          {cred.username} · {TYPE_LABELS[cred.type] || cred.type}
                        </div>
                      </div>
                      <div className="saved-session-actions">
                        <button type="button" onClick={() => setFormModal({ mode: 'edit', credential: cred })}>
                          Edit
                        </button>
                        <button type="button" className="btn-danger-outline" onClick={() => setDeletingCredential(cred)}>
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
          api={credentialGroupsApi}
          title="Credential Group"
          onCancel={() => setGroupModal(null)}
          onSaved={() => {
            setGroupModal(null);
            refresh();
          }}
        />
      )}

      {formModal && (
        <CredentialFormModal
          mode={formModal.mode}
          credential={formModal.credential}
          groups={groups}
          onCancel={() => setFormModal(null)}
          onSaved={() => {
            setFormModal(null);
            notifyChanged();
          }}
        />
      )}

      {deletingCredential && (
        <ConfirmDialog
          title="Delete credential?"
          message={`"${deletingCredential.name}" will be permanently deleted. This is blocked if any session still uses it.`}
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setDeletingCredential(null);
            setActionError('');
          }}
          onConfirm={handleDeleteConfirmed}
        />
      )}

      {deletingGroup && (
        <ConfirmDialog
          title="Delete group?"
          message={`"${deletingGroup.name}" will be deleted. Its credentials are kept and moved to Ungrouped.`}
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
