/**
 * DNJ Exchange — Push Subscriptions Router
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/push/vapid-public-key — Entregar la clave pública VAPID al cliente
router.get('/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: 'VAPID no configurado en el servidor' });
  }
  return res.json({ publicKey });
});

// POST /api/push/subscribe — Guardar o actualizar suscripción Web Push
router.post('/subscribe', async (req, res) => {
  const { user_uuid, subscription } = req.body;

  if (!user_uuid || !subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'user_uuid y subscription (con endpoint y keys) son requeridos' });
  }
  const { p256dh, auth } = subscription.keys;
  if (!p256dh || !auth) {
    return res.status(400).json({ error: 'subscription.keys debe incluir p256dh y auth' });
  }

  try {
    await db.query(
      `INSERT INTO push_subscriptions (user_uuid, endpoint, p256dh, auth_key, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (endpoint) DO UPDATE
         SET user_uuid = EXCLUDED.user_uuid,
             p256dh = EXCLUDED.p256dh,
             auth_key = EXCLUDED.auth_key`,
      [user_uuid, subscription.endpoint, p256dh, auth]
    );
    console.log(`[Push] Suscripción guardada para usuario ${user_uuid}`);
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[Push] Error en POST /push/subscribe:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/push/subscribe — Eliminar suscripción
router.delete('/subscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint es requerido' });
  }

  try {
    await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    return res.status(204).send();
  } catch (err) {
    console.error('[Push] Error en DELETE /push/subscribe:', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
