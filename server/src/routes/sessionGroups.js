import { Router } from 'express';
import * as sessionGroupsService from '../services/sessionGroups.js';

// Mounted behind requireAuth in index.js.
const router = Router();

router.get('/', async (req, res) => {
  const groups = await sessionGroupsService.listGroups(req.userId);
  res.json({ groups });
});

router.post('/', async (req, res) => {
  try {
    const group = await sessionGroupsService.createGroup(req.userId, req.body || {});
    res.status(201).json({ group });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Create session group error:', err);
    res.status(500).json({ error: 'Failed to create group.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const group = await sessionGroupsService.renameGroup(req.userId, req.params.id, req.body || {});
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    res.json({ group });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Rename session group error:', err);
    res.status(500).json({ error: 'Failed to rename group.' });
  }
});

router.delete('/:id', async (req, res) => {
  const ok = await sessionGroupsService.deleteGroup(req.userId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Group not found.' });
  res.status(204).end();
});

export default router;
