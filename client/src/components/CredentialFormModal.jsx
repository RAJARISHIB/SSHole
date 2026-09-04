import { useState } from 'react';
import * as credentialsApi from '../api/credentials.js';

// mode: 'create' | 'edit'. `credential` (for edit) is { id, name, type, groupId }.
// `groups` is the list of credential groups (id/name) to pick from.
export default function CredentialFormModal({ mode, credential, groups, onCancel, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(credential?.name || '');
  const [groupId, setGroupId] = useState(credential?.groupId || '');
  const [type, setType] = useState(credential?.type || 'password');
  const [replaceSecret, setReplaceSecret] = useState(!isEdit); // creating always needs a secret
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleKeyFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPrivateKey(await file.text());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Name is required.');
    if (replaceSecret) {
      if (type === 'privateKey' && !privateKey.trim()) return setError('Private key is required.');
      if (type === 'password' && !password) return setError('Password is required.');
    }

    const payload = { name: name.trim(), groupId: groupId || null };
    if (!isEdit) payload.type = type;
    if (replaceSecret) {
      payload.type = type;
      payload.password = type === 'password' ? password : undefined;
      payload.privateKey = type === 'privateKey' ? privateKey : undefined;
      payload.passphrase = type === 'privateKey' ? passphrase || undefined : undefined;
    }

    setSubmitting(true);
    try {
      const saved = isEdit ? await credentialsApi.updateCredential(credential.id, payload) : await credentialsApi.createCredential(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message || 'Failed to save credential.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{isEdit ? 'Edit Credential' : 'New Credential'}</h2>

        <div className="form-row">
          <label htmlFor="cred-name">Name</label>
          <input
            id="cred-name"
            type="text"
            placeholder="Production Admin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-row">
          <label htmlFor="cred-group">Group</label>
          <select id="cred-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Type</label>
          <div className="auth-toggle">
            <button
              type="button"
              className={type === 'password' ? 'active' : ''}
              onClick={() => {
                setType('password');
                if (isEdit) setReplaceSecret(true);
              }}
            >
              Password
            </button>
            <button
              type="button"
              className={type === 'privateKey' ? 'active' : ''}
              onClick={() => {
                setType('privateKey');
                if (isEdit) setReplaceSecret(true);
              }}
            >
              Private Key
            </button>
          </div>
        </div>

        {isEdit && (
          <label className="checkbox-row">
            <input type="checkbox" checked={replaceSecret} onChange={(e) => setReplaceSecret(e.target.checked)} />
            Replace the stored {type === 'privateKey' ? 'private key' : 'password'}
          </label>
        )}

        {replaceSecret &&
          (type === 'privateKey' ? (
            <>
              <div className="form-row">
                <label htmlFor="cred-keyfile">Private key file</label>
                <input id="cred-keyfile" type="file" onChange={handleKeyFile} />
                {fileName && <span className="file-name">Loaded: {fileName}</span>}
              </div>
              <div className="form-row">
                <label htmlFor="cred-privatekey">Or paste private key</label>
                <textarea
                  id="cred-privatekey"
                  rows={6}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label htmlFor="cred-passphrase">Passphrase (if key is encrypted)</label>
                <input
                  id="cred-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </>
          ) : (
            <div className="form-row">
              <label htmlFor="cred-password">Password</label>
              <input
                id="cred-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </div>
          ))}

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
