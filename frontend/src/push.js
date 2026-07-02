// DNJ Exchange - Web Push Subscription Management
import { api } from './api.js';
import { getSession } from './auth.js';

/**
 * Convierte string en base64 de VAPID key a Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Solicita permiso al usuario para enviar notificaciones.
 * @returns {Promise<string>} 'granted', 'denied' o 'unsupported'
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('El navegador no soporta notificaciones.');
    return 'unsupported';
  }
  
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    console.error('Error solicitando permisos:', e);
    return 'denied';
  }
}

/**
 * Suscribe el Service Worker a Web Push y guarda la suscripción en el backend.
 * @returns {Promise<boolean>} Éxito de la operación
 */
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push no es soportado en este navegador.');
    return false;
  }
  
  try {
    // 1. Obtener llave pública VAPID del backend
    const { publicKey } = await api.getVapidKey();
    if (!publicKey) throw new Error('Llave VAPID no disponible');
    
    // 2. Obtener registro del service worker
    const registration = await navigator.serviceWorker.ready;
    
    // 3. Revisar si ya hay una suscripción
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      // Opcional: podríamos desuscribir para renovar si cambió algo, pero asumiremos que es válida
      // await existingSub.unsubscribe();
    }
    
    // 4. Suscribir
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
    
    // 5. Enviar al backend
    const session = getSession();
    if (!session || !session.uuid) {
      throw new Error('No hay sesión activa para guardar la suscripción');
    }
    
    await api.subscribePush({
      user_uuid: session.uuid,
      subscription: subscription.toJSON()
    });
    
    console.log('[Push] Suscripción exitosa');
    return true;
  } catch (error) {
    console.error('[Push] Error suscribiendo a notificaciones:', error);
    return false;
  }
}
