import { Router } from 'express';
import * as savedSessions from '../services/savedSessions.js';

// Mounted behind requireAuth in index.js — every handler here can trust
// req.userId. Ownership itself is still re-checked in the service/repo
// layer for every read/update/delete, so nothing here ever needs to (or
// should) trust an id in the URL alone.
const router = Router();

router.get('/', async (req, res) => {
  const sessions = await savedSessions.listSessions(req.userId);
  res.json({ sessions });
});

router.post('/', async (req, res) => {
  try {
    const session = await savedSessions.createSession(req.userId, req.body || {});
    res.status(201).json({ session });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create session.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const session = await savedSessions.updateSession(req.userId, req.params.id, req.body || {});
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.json({ session });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Update session error:', err);
    res.status(500).json({ error: 'Failed to update session.' });
  }
});

router.delete('/:id', async (req, res) => {
  const ok = await savedSessions.deleteSession(req.userId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Session not found.' });
  res.status(204).end();
});

export default router;
