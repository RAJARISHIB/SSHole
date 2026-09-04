import { useEffect, useState } from 'react';
import * as savedSessionsApi from '../api/savedSessions.js';
import * as credentialsApi from '../api/credentials.js';
import * as credentialGroupsApi from '../api/credentialGroups.js';

// `session` is the sanitized session from the API: it carries
// credentialSource ('none'|'reference'|'inline') and, when 'reference',
// credentialId — but never any secret. `groups` is the list of session
// groups (id/name) to pick from.
export default function EditSessionModal({ session, groups, onCancel, onSaved }) {
  const [name, setName] = useState(session.name);
  const [host, setHost] = useState(session.host);
  const [port, setPort] = useState(session.port);
  const [username, setUsername] = useState(session.username);
  const [groupId, setGroupId] = useState(session.groupId || '');

  const initialMode = session.credentialSource; // 'none' | 'reference' | 'inline'
  const [credentialMode, setCredentialMode] = useState(initialMode);
  const [authenticationType, setAuthenticationType] = useState(session.authenticationType);

  const [selectedCredentialId, setSelectedCredentialId] = useState(session.credentialId || '');
  const [credentialGroupFilter, setCredentialGroupFilter] = useState('');
  const [credentialGroups, setCredentialGroups] = useState([]);
  const [credentials, setCredentials] = useState([]);

  // Only meaningful when switching into (or already in) 'inline': whether
  // to actually replace the stored secret, vs. leaving it untouched while
  // editing other fields.
  const [replaceInlineSecret, setReplaceInlineSecret] = useState(initialMode !== 'inline');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [fileName, setFileName] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    credentialGroupsApi.listGroups().then(setCredentialGroups).catch(() => {});
    credentialsApi.listCredentials().then(setCredentials).catch(() => {});
  }, []);

  const visibleCredentials = credentialGroupFilter
    ? credentials.filter((c) => c.groupId === credentialGroupFilter)
    : credentials;

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
    if (!host.trim()) return setError('Host is required.');
    if (!username.trim()) return setError('Username is required.');
    const portNum = Number(port) || 22;
    if (portNum < 1 || portNum > 65535) return setError('Port must be between 1 and 65535.');

    if (credentialMode === 'reference' && !selectedCredentialId) {
      return setError('Choose a saved credential.');
    }
    if (credentialMode === 'inline' && replaceInlineSecret) {
      if (authenticationType === 'privateKey' && !privateKey.trim()) return setError('Private key is required.');
      if (authenticationType === 'password' && !password) return setError('Password is required.');
    }

    const patch = {
      name: name.trim(),
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      groupId: groupId || null,
    };

    // Only touch the credential source at all when something about it
    // actually changed — otherwise the existing reference/inline secret
    // (or lack of one) is left completely untouched.
    const credentialTouched =
      credentialMode !== initialMode ||
      (credentialMode === 'reference' && selectedCredentialId !== (session.credentialId || '')) ||
      (credentialMode === 'inline' && replaceInlineSecret);

    if (credentialTouched) {
      patch.credentialMode = credentialMode;
      if (credentialMode === 'reference') {
        patch.credentialId = selectedCredentialId;
      } else if (credentialMode === 'inline') {
        patch.authenticationType = authenticationType;
        patch.password = authenticationType === 'password' ? password : undefined;
        patch.privateKey = authenticationType === 'privateKey' ? privateKey : undefined;
        patch.passphrase = authenticationType === 'privateKey' ? passphrase || undefined : undefined;
      } else {
        patch.authenticationType = authenticationType;
      }
    } else if (authenticationType !== session.authenticationType) {
      patch.authenticationType = authenticationType;
    }

    setSubmitting(true);
    try {
      const updated = await savedSessionsApi.updateSession(session.id, patch);
      onSaved(updated);
    } catch (err) {
      setError(err.message || 'Failed to update session.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Edit Session</h2>

        <div className="form-row">
          <label htmlFor="edit-name">Name</label>
          <input id="edit-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="form-row">
          <label htmlFor="edit-host">Host / IP address</label>
          <input id="edit-host" type="text" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>

        <div className="form-row form-row-inline">
          <div>
            <label htmlFor="edit-port">Port</label>
            <input id="edit-port" type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
          <div>
            <label htmlFor="edit-username">Username</label>
            <input id="edit-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="edit-group">Session group</label>
          <select id="edit-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Authentication</label>
          <div className="credential-mode-choices">
            <label className="radio-row">
              <input
                type="radio"
                name="editCredentialMode"
                checked={credentialMode === 'none'}
                onChange={() => setCredentialMode('none')}
              />
              Don't save a credential (ask again next time)
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="editCredentialMode"
                checked={credentialMode === 'inline'}
                onChange={() => {
                  setCredentialMode('inline');
                  setReplaceInlineSecret(initialMode !== 'inline');
                }}
              />
              Store credentials directly in this session (encrypted)
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="editCredentialMode"
                checked={credentialMode === 'reference'}
                onChange={() => setCredentialMode('reference')}
              />
              Use a saved credential
            </label>
          </div>
        </div>

        {credentialMode === 'reference' && (
          <div className="form-row credential-picker-box">
            <div className="form-row">
              <label htmlFor="edit-credential-group">Credential group</label>
              <select
                id="edit-credential-group"
                value={credentialGroupFilter}
                onChange={(e) => setCredentialGroupFilter(e.target.value)}
              >
                <option value="">All groups</option>
                {credentialGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="edit-credential">Credential</label>
              <select id="edit-credential" value={selectedCredentialId} onChange={(e) => setSelectedCredentialId(e.target.value)}>
                <option value="">Select a credential…</option>
                {visibleCredentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type === 'privateKey' ? 'Private Key' : 'Password'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {credentialMode === 'inline' && (
          <>
            {initialMode === 'inline' && (
              <label className="checkbox-row">
                <input type="checkbox" checked={replaceInlineSecret} onChange={(e) => setReplaceInlineSecret(e.target.checked)} />
                Replace the stored credential
              </label>
            )}

            {replaceInlineSecret && (
              <>
                <div className="form-row">
                  <label>Authentication type</label>
                  <div className="auth-toggle">
                    <button
                      type="button"
                      className={authenticationType === 'password' ? 'active' : ''}
                      onClick={() => setAuthenticationType('password')}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      className={authenticationType === 'privateKey' ? 'active' : ''}
                      onClick={() => setAuthenticationType('privateKey')}
                    >
                      Private Key
                    </button>
                  </div>
                </div>

                {authenticationType === 'privateKey' ? (
                  <>
                    <div className="form-row">
                      <label htmlFor="edit-keyfile">Private key file</label>
                      <input id="edit-keyfile" type="file" onChange={handleKeyFile} />
                      {fileName && <span className="file-name">Loaded: {fileName}</span>}
                    </div>
                    <div className="form-row">
                      <label htmlFor="edit-privatekey">Or paste private key</label>
                      <textarea
                        id="edit-privatekey"
                        rows={6}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                      />
                    </div>
                    <div className="form-row">
                      <label htmlFor="edit-passphrase">Passphrase (if key is encrypted)</label>
                      <input
                        id="edit-passphrase"
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : (
                  <div className="form-row">
                    <label htmlFor="edit-password">New password</label>
                    <input
                      id="edit-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {credentialMode === 'none' && (
          <div className="form-row">
            <label>When prompted, ask for</label>
            <div className="auth-toggle">
              <button
                type="button"
                className={authenticationType === 'password' ? 'active' : ''}
                onClick={() => setAuthenticationType('password')}
              >
                Password
              </button>
              <button
                type="button"
                className={authenticationType === 'privateKey' ? 'active' : ''}
                onClick={() => setAuthenticationType('privateKey')}
              >
                Private Key
              </button>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-connect" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
