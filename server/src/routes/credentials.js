import { Router } from 'express';
import * as credentialsService from '../services/credentials.js';

// Mounted behind requireAuth in index.js.
const router = Router();

router.get('/', async (req, res) => {
  const credentials = await credentialsService.listCredentials(req.userId);
  res.json({ credentials });
});

router.post('/', async (req, res) => {
  try {
    const credential = await credentialsService.createCredential(req.userId, req.body || {});
    res.status(201).json({ credential });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Create credential error:', err);
    res.status(500).json({ error: 'Failed to create credential.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const credential = await credentialsService.updateCredential(req.userId, req.params.id, req.body || {});
    if (!credential) return res.status(404).json({ error: 'Credential not found.' });
    res.json({ credential });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Update credential error:', err);
    res.status(500).json({ error: 'Failed to update credential.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await credentialsService.deleteCredential(req.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Credential not found.' });
    res.status(204).end();
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ error: err.message, referencingSessions: err.referencingSessions });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Delete credential error:', err);
    res.status(500).json({ error: 'Failed to delete credential.' });
  }
});

export default router;
