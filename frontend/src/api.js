// DNJ Exchange - API Client

const BASE_URL = '/api';

/**
 * Helper genérico para peticiones HTTP
 */
async function request(method, path, body = undefined) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${BASE_URL}${path}`, opts);
  
  if (!response.ok) {
    let errBody = {};
    try {
      errBody = await response.json();
    } catch (e) {
      // No JSON body
    }
    throw new Error(errBody.error || `Error HTTP: ${response.status}`);
  }
  
  if (response.status === 204) {
    return null;
  }
  
  return response.json();
}

export const api = {
  // Usuarios
  createUser: (data) => request('POST', '/users', data),
  getUser: (uuid) => request('GET', `/users/${uuid}`),
  
  // Solicitudes
  createRequest: (data) => request('POST', '/requests', data),
  getRequest: (id) => request('GET', `/requests/${id}`),
  updateRequest: (id, data) => request('PATCH', `/requests/${id}`, data),
  // matchId + requestId del usuario actual
  confirmZone: (matchId, requestId, zonesGive, zonesReceive) => request('PATCH', `/requests/${matchId}/confirm-zone`, { request_id: requestId, zones_i_give: zonesGive, zones_i_receive: zonesReceive }),
  completeMatch: (matchId) => request('PATCH', `/requests/match/${matchId}/complete`, {}),

  // Push Notifications
  subscribePush: (data) => request('POST', '/push/subscribe', data),
  deletePushSubscription: (endpoint) => request('DELETE', '/push/subscribe', { endpoint }),
  getVapidKey: () => request('GET', '/push/vapid-public-key'),
};

