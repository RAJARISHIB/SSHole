import { Router } from 'express';
import * as commandsService from '../services/commands.js';

// Mounted behind requireAuth in index.js — global commands are visible to
// any authenticated user, never to an unauthenticated one.
const router = Router();

router.get('/', async (req, res) => {
  const commands = await commandsService.listMyCommands(req.userId);
  res.json({ commands });
});

router.get('/global', async (req, res) => {
  const commands = await commandsService.listGlobalCommands(req.userId);
  res.json({ commands });
});

router.post('/', async (req, res) => {
  try {
    const command = await commandsService.createCommand(req.userId, req.body || {});
    res.status(201).json({ command });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Create command error:', err);
    res.status(500).json({ error: 'Failed to create command.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const command = await commandsService.updateCommand(req.userId, req.params.id, req.body || {});
    if (!command) return res.status(404).json({ error: 'Command not found.' });
    res.json({ command });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Update command error:', err);
    res.status(500).json({ error: 'Failed to update command.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await commandsService.deleteCommand(req.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Command not found.' });
    res.status(204).end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Delete command error:', err);
    res.status(500).json({ error: 'Failed to delete command.' });
  }
});

export default router;
