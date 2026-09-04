import { useCallback, useEffect, useMemo, useState } from 'react';
import * as commandsApi from '../api/commands.js';
import CommandFormModal from './CommandFormModal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const UNCATEGORIZED = 'Uncategorized';

function groupByCategory(commands) {
  const groups = new Map();
  for (const cmd of commands) {
    const key = cmd.category || UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cmd);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });
}

function matches(cmd, term) {
  return (
    cmd.name.toLowerCase().includes(term) ||
    cmd.command.toLowerCase().includes(term) ||
    (cmd.category || '').toLowerCase().includes(term)
  );
}

export default function CommandDictionaryPanel({ canPaste, onPaste }) {
  const [myCommands, setMyCommands] = useState([]);
  const [globalCommands, setGlobalCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState(null);
  const [deletingCommand, setDeletingCommand] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mine, global] = await Promise.all([commandsApi.listCommands(), commandsApi.listGlobalCommands()]);
      setMyCommands(mine);
      setGlobalCommands(global);
    } catch (err) {
      setError(err.message || 'Failed to load commands.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const term = search.trim().toLowerCase();
  const filteredMine = useMemo(() => (term ? myCommands.filter((c) => matches(c, term)) : myCommands), [myCommands, term]);
  const filteredGlobal = useMemo(
    () => (term ? globalCommands.filter((c) => matches(c, term)) : globalCommands),
    [globalCommands, term]
  );

  const handleCopy = async (cmd) => {
    try {
      await navigator.clipboard.writeText(cmd.command);
      setCopiedId(cmd.id);
      setTimeout(() => setCopiedId((id) => (id === cmd.id ? null : id)), 1500);
    } catch {
      // Clipboard API unavailable/denied — silently ignore, Paste still works.
    }
  };

  const handleDeleteConfirmed = async () => {
    try {
      await commandsApi.deleteCommand(deletingCommand.id);
      setDeletingCommand(null);
      refresh();
    } catch (err) {
      setError(err.message || 'Failed to delete command.');
    }
  };

  const renderRow = (cmd) => (
    <li key={cmd.id} className="command-row">
      <div className="command-name">
        {cmd.name}
        {cmd.visibility === 'global' && (
          <span className="command-badge" title={cmd.editPermission === 'everyone' ? 'Anyone can edit' : 'Owner-only edit'}>
            {cmd.editPermission === 'everyone' ? 'Global · Everyone can edit' : 'Global · Owner only'}
          </span>
        )}
      </div>
      <code className="command-text">{cmd.command}</code>
      <div className="command-actions">
        <button type="button" onClick={() => handleCopy(cmd)}>
          {copiedId === cmd.id ? 'Copied!' : 'Copy'}
        </button>
        <button
          type="button"
          disabled={!canPaste}
          title={canPaste ? 'Paste into the active terminal' : 'No active connected terminal'}
          onClick={() => onPaste(cmd.command)}
        >
          Paste to Terminal
        </button>
        {cmd.canEdit && (
          <button type="button" onClick={() => setEditingCommand(cmd)}>
            Edit
          </button>
        )}
        {cmd.canDelete && (
          <button type="button" className="btn-danger-outline" onClick={() => setDeletingCommand(cmd)}>
            Delete
          </button>
        )}
      </div>
    </li>
  );

  const renderSection = (title, items) => (
    <div className="command-section">
      <div className="command-section-header">{title}</div>
      {items.length === 0 ? (
        <div className="sidebar-empty sidebar-empty-nested">
          {term ? 'No matches.' : title === 'My Commands' ? 'No personal commands yet.' : 'No global commands yet.'}
        </div>
      ) : (
        groupByCategory(items).map(([category, categoryItems]) => (
          <div key={category} className="command-category">
            <div className="command-category-header">{category}</div>
            <ul className="command-list">{categoryItems.map(renderRow)}</ul>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Command Dictionary</h2>
        <button type="button" className="sidebar-add" onClick={() => setFormOpen(true)} title="New command">
          + Command
        </button>
      </div>

      <div className="sidebar-search">
        <input type="text" placeholder="Search commands…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <div className="sidebar-empty">Loading…</div>}
      {!loading && error && <div className="sidebar-empty sidebar-error">{error}</div>}

      {!loading && !error && (
        <div className="command-groups">
          {renderSection('My Commands', filteredMine)}
          {renderSection('Global Commands', filteredGlobal)}
        </div>
      )}

      {formOpen && (
        <CommandFormModal
          onCancel={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {editingCommand && (
        <CommandFormModal
          command={editingCommand}
          onCancel={() => setEditingCommand(null)}
          onSaved={() => {
            setEditingCommand(null);
            refresh();
          }}
        />
      )}

      {deletingCommand && (
        <ConfirmDialog
          title="Delete command?"
          message={`"${deletingCommand.name}" will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeletingCommand(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  );
}
