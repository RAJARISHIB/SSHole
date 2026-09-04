import { useEffect, useState } from 'react';
import * as savedSessionsApi from '../api/savedSessions.js';
import * as sessionGroupsApi from '../api/sessionGroups.js';
import * as credentialsApi from '../api/credentials.js';
import * as credentialGroupsApi from '../api/credentialGroups.js';
import GroupModal from './GroupModal.jsx';
import CredentialFormModal from './CredentialFormModal.jsx';

const initialState = {
  host: '',
  port: 22,
  username: '',
  authMethod: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  saveSession: false,
  sessionName: '',
  groupId: '',
  credentialMode: 'none', // 'none' | 'inline' | 'reference'
  credentialGroupFilter: '',
  credentialId: '',
};

export default function ConnectionForm({ onConnect, onSessionSaved }) {
  const [form, setForm] = useState(initialState);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [sessionGroups, setSessionGroups] = useState([]);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);

  const [credentialGroups, setCredentialGroups] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [newCredentialModalOpen, setNewCredentialModalOpen] = useState(false);

  useEffect(() => {
    sessionGroupsApi.listGroups().then(setSessionGroups).catch(() => {});
    credentialGroupsApi.listGroups().then(setCredentialGroups).catch(() => {});
    credentialsApi.listCredentials().then(setCredentials).catch(() => {});
  }, []);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleKeyFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setForm((f) => ({ ...f, privateKey: text }));
  };

  const usingReferenceForSave = form.saveSession && form.credentialMode === 'reference';

  const visibleCredentials = form.credentialGroupFilter
    ? credentials.filter((c) => c.groupId === form.credentialGroupFilter)
    : credentials;

  const selectedCredential = credentials.find((c) => c.id === form.credentialId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.host.trim()) return setError('Host is required.');
    // A referenced credential supplies its own username — this form never
    // asks for one in that case, so there's nothing to validate here.
    if (!usingReferenceForSave && !form.username.trim()) return setError('Username is required.');

    const port = Number(form.port) || 22;
    if (port < 1 || port > 65535) return setError('Port must be between 1 and 65535.');

    // The top-of-form password/key is only required when it's actually
    // going to be used — not when the saved session will reference a
    // credential picked below instead.
    if (!usingReferenceForSave) {
      if (form.authMethod === 'password' && !form.password) {
        return setError('Password is required.');
      }
      if (form.authMethod === 'privateKey' && !form.privateKey.trim()) {
        return setError('Private key is required (paste it or upload a file).');
      }
    }

    if (form.saveSession) {
      if (!form.sessionName.trim()) return setError('Give this saved session a name.');
      if (form.credentialMode === 'reference' && !form.credentialId) {
        return setError('Choose a saved credential.');
      }
    }

    setSubmitting(true);
    try {
      let savedSession = null;
      if (form.saveSession) {
        const payload = {
          name: form.sessionName.trim(),
          host: form.host.trim(),
          port,
          groupId: form.groupId || null,
          credentialMode: form.credentialMode,
        };
        if (form.credentialMode === 'reference') {
          // Username comes from the credential, not this form.
          payload.credentialId = form.credentialId;
        } else {
          // 'inline' and 'none' both need their own username, plus knowing
          // password-vs-key; 'inline' additionally carries the secret itself.
          payload.username = form.username.trim();
          payload.authenticationType = form.authMethod;
          if (form.credentialMode === 'inline') {
            payload.password = form.authMethod === 'password' ? form.password : undefined;
            payload.privateKey = form.authMethod === 'privateKey' ? form.privateKey : undefined;
            payload.passphrase = form.authMethod === 'privateKey' ? form.passphrase : undefined;
          }
        }
        savedSession = await savedSessionsApi.createSession(payload);
        onSessionSaved?.();
      }

      setSubmitting(false);

      if (usingReferenceForSave) {
        // Auth comes entirely from the referenced credential — connect via
        // the saved session so the backend decrypts it, rather than
        // resending anything from this form.
        onConnect({ savedSessionId: savedSession.id });
        return;
      }

      onConnect({
        host: form.host.trim(),
        port,
        username: form.username.trim(),
        authMethod: form.authMethod,
        password: form.authMethod === 'password' ? form.password : undefined,
        privateKey: form.authMethod === 'privateKey' ? form.privateKey : undefined,
        passphrase: form.authMethod === 'privateKey' ? form.passphrase : undefined,
      });
    } catch (err) {
      setSubmitting(false);
      setError(err.message || 'Failed to save session.');
    }
  };

  return (
    <div className="connection-form-wrapper">
      <form className="connection-form" onSubmit={handleSubmit}>
        <h2>New SSH Connection</h2>

        <div className="form-row">
          <label htmlFor="host">Host / IP address</label>
          <input
            id="host"
            type="text"
            placeholder="example.com or 192.168.1.10"
            value={form.host}
            onChange={update('host')}
            autoFocus
          />
        </div>

        <div className="form-row form-row-inline">
          <div>
            <label htmlFor="port">Port</label>
            <input id="port" type="number" min="1" max="65535" value={form.port} onChange={update('port')} />
          </div>
          {!usingReferenceForSave && (
            <div>
              <label htmlFor="username">Username</label>
              <input id="username" type="text" placeholder="root" value={form.username} onChange={update('username')} />
            </div>
          )}
        </div>

        {usingReferenceForSave && (
          <div className="form-row">
            <label>Username</label>
            <div className="derived-username">
              {selectedCredential ? (
                <>
                  🔒 <strong>{selectedCredential.username}</strong> (from credential "{selectedCredential.name}")
                </>
              ) : (
                'Choose a credential below — its username will be used automatically.'
              )}
            </div>
          </div>
        )}

        {!usingReferenceForSave && (
          <>
            <div className="form-row">
              <label>Authentication method</label>
              <div className="auth-toggle">
                <button
                  type="button"
                  className={form.authMethod === 'password' ? 'active' : ''}
                  onClick={() => setForm((f) => ({ ...f, authMethod: 'password' }))}
                >
                  Password
                </button>
                <button
                  type="button"
                  className={form.authMethod === 'privateKey' ? 'active' : ''}
                  onClick={() => setForm((f) => ({ ...f, authMethod: 'privateKey' }))}
                >
                  Private Key
                </button>
              </div>
            </div>

            {form.authMethod === 'password' ? (
              <div className="form-row">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={form.password} onChange={update('password')} autoComplete="off" />
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label htmlFor="keyfile">Private key file</label>
                  <input id="keyfile" type="file" onChange={handleKeyFile} />
                  {fileName && <span className="file-name">Loaded: {fileName}</span>}
                </div>
                <div className="form-row">
                  <label htmlFor="privateKey">Or paste private key</label>
                  <textarea
                    id="privateKey"
                    rows={6}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={form.privateKey}
                    onChange={update('privateKey')}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="passphrase">Passphrase (if key is encrypted)</label>
                  <input
                    id="passphrase"
                    type="password"
                    value={form.passphrase}
                    onChange={update('passphrase')}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </>
        )}

        <div className="save-session-box">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.saveSession}
              onChange={(e) => setForm((f) => ({ ...f, saveSession: e.target.checked }))}
            />
            Save this session
          </label>

          {form.saveSession && (
            <>
              <div className="form-row">
                <label htmlFor="sessionName">Session name</label>
                <input
                  id="sessionName"
                  type="text"
                  placeholder="Production Server"
                  value={form.sessionName}
                  onChange={update('sessionName')}
                />
              </div>
              <div className="form-row">
                <label htmlFor="sessionGroup">Session group</label>
                <div className="group-picker-row">
                  <select id="sessionGroup" value={form.groupId} onChange={update('groupId')}>
                    <option value="">No group</option>
                    {sessionGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setNewGroupModalOpen(true)}>
                    + New Group
                  </button>
                </div>
              </div>

              <div className="form-row">
                <label>Authentication</label>
                <div className="credential-mode-choices">
                  <label className="radio-row">
                    <input
                      type="radio"
                      name="credentialMode"
                      checked={form.credentialMode === 'none'}
                      onChange={() => setForm((f) => ({ ...f, credentialMode: 'none' }))}
                    />
                    Don't save a credential (ask again next time)
                  </label>
                  <label className="radio-row">
                    <input
                      type="radio"
                      name="credentialMode"
                      checked={form.credentialMode === 'inline'}
                      onChange={() => setForm((f) => ({ ...f, credentialMode: 'inline' }))}
                    />
                    Store credentials directly in this session (encrypted)
                  </label>
                  <label className="radio-row">
                    <input
                      type="radio"
                      name="credentialMode"
                      checked={form.credentialMode === 'reference'}
                      onChange={() => setForm((f) => ({ ...f, credentialMode: 'reference' }))}
                    />
                    Use a saved credential
                  </label>
                </div>
              </div>

              {form.credentialMode === 'reference' && (
                <div className="form-row credential-picker-box">
                  <div className="form-row">
                    <label htmlFor="credentialGroupFilter">Credential group</label>
                    <select
                      id="credentialGroupFilter"
                      value={form.credentialGroupFilter}
                      onChange={(e) => setForm((f) => ({ ...f, credentialGroupFilter: e.target.value, credentialId: '' }))}
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
                    <label htmlFor="credentialId">Credential</label>
                    <div className="group-picker-row">
                      <select id="credentialId" value={form.credentialId} onChange={update('credentialId')}>
                        <option value="">Select a credential…</option>
                        {visibleCredentials.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type === 'privateKey' ? 'Private Key' : 'Password'})
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setNewCredentialModalOpen(true)}>
                        + New Credential
                      </button>
                    </div>
                    {visibleCredentials.length === 0 && (
                      <span className="form-hint">No credentials yet — create one to reference it here.</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {newGroupModalOpen && (
          <GroupModal
            mode="create"
            api={sessionGroupsApi}
            title="Session Group"
            onCancel={() => setNewGroupModalOpen(false)}
            onSaved={(group) => {
              setSessionGroups((prev) => [...prev, group]);
              setForm((f) => ({ ...f, groupId: group.id }));
              setNewGroupModalOpen(false);
            }}
          />
        )}

        {newCredentialModalOpen && (
          <CredentialFormModal
            mode="create"
            groups={credentialGroups}
            onCancel={() => setNewCredentialModalOpen(false)}
            onSaved={(credential) => {
              setCredentials((prev) => [...prev, credential]);
              setForm((f) => ({ ...f, credentialId: credential.id, credentialGroupFilter: credential.groupId || '' }));
              setNewCredentialModalOpen(false);
            }}
          />
        )}

        {error && <div className="form-error">{error}</div>}

        <button type="submit" className="btn-connect" disabled={submitting}>
          {submitting ? 'Saving…' : 'Connect'}
        </button>

        <p className="form-hint">
          Credentials are sent directly to this app's own server to establish your SSH session and are held only in
          memory for the life of the connection — never written to disk, unless you choose to save or reference a
          credential, in which case it's encrypted at rest and visible only to your account.
        </p>
      </form>
    </div>
  );
}
