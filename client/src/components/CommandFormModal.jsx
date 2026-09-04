import { useState } from 'react';
import * as commandsApi from '../api/commands.js';

// `command` (for edit) is the full sanitized command from the API:
// { id, name, command, category, visibility, editPermission, isMine, canEdit, canDelete }.
// Omit for create.
export default function CommandFormModal({ command, onCancel, onSaved }) {
  const isEdit = Boolean(command);
  const [name, setName] = useState(command?.name || '');
  const [commandText, setCommandText] = useState(command?.command || '');
  const [category, setCategory] = useState(command?.category || '');

  // Create: choose visibility up front. Edit of a personal command: offer a
  // one-way "make this global" conversion. Edit of an already-global
  // command: visibility can't change, only (if owner) its editPermission.
  const [makeGlobal, setMakeGlobal] = useState(false);
  const [visibility, setVisibility] = useState(isEdit ? command.visibility : 'personal');
  const [editPermission, setEditPermission] = useState(command?.editPermission || 'owner_only');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOwner = !isEdit || command.isMine;
  const convertingToGlobal = !isEdit && visibility === 'global';
  const showEditPermissionForExistingGlobal = isEdit && command.visibility === 'global' && isOwner;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Name is required.');
    if (!commandText.trim()) return setError('Command is required.');

    const payload = { name: name.trim(), command: commandText.trim(), category: category.trim() || null };

    if (!isEdit) {
      payload.visibility = visibility;
      if (visibility === 'global') payload.editPermission = editPermission;
    } else if (isEdit && command.visibility === 'personal' && makeGlobal) {
      payload.visibility = 'global';
      payload.editPermission = editPermission;
    } else if (showEditPermissionForExistingGlobal) {
      payload.editPermission = editPermission;
    }

    setSubmitting(true);
    try {
      const saved = isEdit ? await commandsApi.updateCommand(command.id, payload) : await commandsApi.createCommand(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message || 'Failed to save command.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{isEdit ? 'Edit Command' : 'New Command'}</h2>

        <div className="form-row">
          <label htmlFor="cmd-name">Name</label>
          <input
            id="cmd-name"
            type="text"
            placeholder="Check disk space"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-row">
          <label htmlFor="cmd-command">Command</label>
          <textarea
            id="cmd-command"
            rows={3}
            placeholder="df -h"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label htmlFor="cmd-category">Category (optional)</label>
          <input
            id="cmd-category"
            type="text"
            placeholder="Linux"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        {!isEdit && (
          <div className="form-row">
            <label>Visibility</label>
            <div className="credential-mode-choices">
              <label className="radio-row">
                <input type="radio" name="visibility" checked={visibility === 'personal'} onChange={() => setVisibility('personal')} />
                Personal — only you can see it
              </label>
              <label className="radio-row">
                <input type="radio" name="visibility" checked={visibility === 'global'} onChange={() => setVisibility('global')} />
                Global — every user can see it
              </label>
            </div>
          </div>
        )}

        {isEdit && command.visibility === 'personal' && isOwner && (
          <label className="checkbox-row">
            <input type="checkbox" checked={makeGlobal} onChange={(e) => setMakeGlobal(e.target.checked)} />
            Make this a global command (visible to everyone — cannot be undone)
          </label>
        )}

        {isEdit && command.visibility === 'global' && !isOwner && (
          <div className="form-hint command-form-note">
            This is a global command owned by someone else. You can edit its text because it allows everyone to edit,
            but only its owner can change who can edit it or delete it.
          </div>
        )}

        {(convertingToGlobal || (isEdit && command.visibility === 'personal' && makeGlobal) || showEditPermissionForExistingGlobal) && (
          <div className="form-row">
            <label>Global edit permission</label>
            <div className="credential-mode-choices">
              <label className="radio-row">
                <input
                  type="radio"
                  name="editPermission"
                  checked={editPermission === 'owner_only'}
                  onChange={() => setEditPermission('owner_only')}
                />
                Only me
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="editPermission"
                  checked={editPermission === 'everyone'}
                  onChange={() => setEditPermission('everyone')}
                />
                Everyone
              </label>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-connect" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
