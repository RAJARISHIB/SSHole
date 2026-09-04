import { useState } from 'react';
import * as savedSessionsApi from '../api/savedSessions.js';

/**
 * Shown when the user clicks Connect on a saved session that has no stored
 * key. Collects the password/private key just for this connection, with an
 * option to persist it (via PUT, which encrypts it at rest) so it isn't
 * asked for again next time.
 */
export default function CredentialPromptModal({ session, onCancel, onConnect, onSaved }) {
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [fileName, setFileName] = useState('');
  const [saveKey, setSaveKey] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isPrivateKey = session.authenticationType === 'privateKey';

  const handleKeyFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPrivateKey(await file.text());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isPrivateKey && !privateKey.trim()) {
      return setError('Private key is required.');
    }
    if (!isPrivateKey && !password) {
      return setError('Password is required.');
    }

    const overrides = isPrivateKey
      ? { privateKey, passphrase: passphrase || undefined }
      : { password };

    setSubmitting(true);
    try {
      if (saveKey) {
        await savedSessionsApi.updateSession(session.id, {
          credentialMode: 'inline',
          authenticationType: session.authenticationType,
          password: isPrivateKey ? undefined : password,
          privateKey: isPrivateKey ? privateKey : undefined,
          passphrase: isPrivateKey ? passphrase || undefined : undefined,
        });
        onSaved?.();
        // Now stored server-side — connect via savedSessionId alone so the
        // backend decrypts it, rather than resending the raw secret.
        onConnect({ savedSessionId: session.id });
      } else {
        onConnect({ savedSessionId: session.id, ...overrides });
      }
    } catch (err) {
      setError(err.message || 'Failed to connect.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Connect to {session.name}</h2>
        <p className="modal-message">
          {session.username}@{session.host}:{session.port} — no key saved for this session.
        </p>

        {isPrivateKey ? (
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
                autoFocus
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
              autoFocus
            />
          </div>
        )}

        <label className="checkbox-row">
          <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
          Save this key for future connections
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-connect" disabled={submitting}>
            {submitting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  );
}
