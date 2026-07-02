// DNJ Exchange - Session Management

const STORAGE_KEY = 'dnj_session';

/**
 * Obtener la sesión actual desde localStorage.
 * @returns {object|null}
 */
export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error leyendo sesión:', e);
    return null;
  }
}

/**
 * Guardar o actualizar la sesión en localStorage.
 * @param {object} data 
 */
export function setSession(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error guardando sesión:', e);
  }
}

/**
 * Eliminar la sesión (logout).
 */
export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Obtener el UUID del usuario. Si no existe, genera uno nuevo y lo guarda.
 * @returns {string} UUID
 */
export function getOrCreateUUID() {
  let session = getSession();
  
  if (!session || !session.uuid) {
    session = { uuid: crypto.randomUUID() };
    setSession(session);
  }
  
  return session.uuid;
}
