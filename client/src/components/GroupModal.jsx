import { useState } from 'react';

// mode: 'create' | 'rename'. `group` (for rename) is { id, name }.
// `api` is the groups API module to use — either sessionGroups.js or
// credentialGroups.js (same { createGroup, renameGroup } shape), so this
// one modal serves both kinds of group.
export default function GroupModal({ mode, group, api, title = 'Group', onCancel, onSaved }) {
  const [name, setName] = useState(mode === 'rename' ? group.name : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError(`${title} name is required.`);

    setSubmitting(true);
    try {
      const saved = mode === 'rename' ? await api.renameGroup(group.id, name.trim()) : await api.createGroup(name.trim());
      onSaved(saved);
    } catch (err) {
      setError(err.message || `Failed to save ${title.toLowerCase()}.`);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box modal-small" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{mode === 'rename' ? `Rename ${title}` : `New ${title}`}</h2>

        <div className="form-row">
          <label htmlFor="group-name">{title} name</label>
          <input
            id="group-name"
            type="text"
            placeholder="Production"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

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
