// DNJ Exchange - Dashboard Page
import { api } from '../api.js';
import { getSession, setSession } from '../auth.js';
import { navigate, showToast } from '../main.js';

let refreshInterval;
let allRequests = [];
let allSearching = [];
let currentFilter = 'matches';

export async function renderDashboard(container) {
  const session = getSession();
  if (!session || !session.uuid) {
    navigate('onboarding');
    return;
  }

  container.innerHTML = `
    <div class="page">
      <header class="header">
        <div class="header-logo">
          <img src="/icons/logo.jpg" alt="DNJ Limon" class="header-logo-img" />
          <span class="logo-subtitle">Exchange</span>
        </div>
        <div class="header-actions">
          <button class="btn-icon" id="refresh-btn" title="Actualizar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </button>
          <button class="btn-icon" id="edit-profile-btn" title="Editar perfil">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
        </div>
      </header>
      
      <div class="content">
        <div class="tabs-container">
          <button class="tab-btn tab-matches active" data-filter="matches">✨ Mis Matches</button>
          <button class="tab-btn" data-filter="todos">🌐 Todos</button>
          <button class="tab-btn" data-filter="completadas">✅ Completadas</button>
          <button class="tab-btn" data-filter="canceladas">❌ Canceladas</button>
        </div>
        
        <div id="requests-container">
          <div class="spinner-fullpage" style="position:relative; height: 50vh; background: transparent;">
            <div class="spinner"></div>
          </div>
        </div>

        <!-- Disclaimer del creador -->
        <div class="creator-disclaimer">
          Creado por <strong>Alexander Ubeda</strong> · Herramienta no oficial, sin relación con la organización del DNJ.
        </div>
      </div>
      
      <button class="fab" id="new-request-fab" title="Nueva Solicitud">+</button>
    </div>
    
    <!-- Modal Editar Perfil -->
    <div class="modal-overlay" id="profile-modal">
      <div class="modal">
        <h3 class="modal-title">Editar Perfil</h3>
        <form id="profile-form">
          <div class="form-group">
            <label class="form-label">Tu nombre</label>
            <input class="input" id="edit-name" type="text" required />
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp</label>
            <div class="input-wrapper">
              <span class="input-prefix">+506</span>
              <input class="input input-with-prefix" id="edit-phone" type="tel" placeholder="88887777" maxlength="8" pattern="[0-9]{8}" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Parroquia</label>
            <input class="input" id="edit-parish" type="text" required />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="close-profile-btn">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="save-profile-btn">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('new-request-fab').addEventListener('click', () => navigate('new-request'));
  document.getElementById('refresh-btn').addEventListener('click', () => loadRequests(session.uuid));
  
  // Tabs logic
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedBtn = e.target.closest('.tab-btn');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      clickedBtn.classList.add('active');
      currentFilter = clickedBtn.dataset.filter;
      renderFilteredRequests();
    });
  });
  
  // Profile modal logic
  const modal = document.getElementById('profile-modal');
  document.getElementById('edit-profile-btn').addEventListener('click', () => {
    const currentSession = getSession();
    document.getElementById('edit-name').value = currentSession.name || '';
    document.getElementById('edit-parish').value = currentSession.parish || '';
    const phone = currentSession.phone || '';
    document.getElementById('edit-phone').value = phone.replace(/^506/, '');
    modal.classList.add('active');
  });
  
  document.getElementById('close-profile-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });
  
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    
    try {
      const currentSession = getSession();
      const phoneInput = document.getElementById('edit-phone').value.trim();
      const fullPhone = `506${phoneInput}`;
      
      const updated = {
        ...currentSession,
        name: document.getElementById('edit-name').value.trim(),
        phone: fullPhone,
        parish: document.getElementById('edit-parish').value.trim()
      };
      
      await api.createUser(updated);
      setSession(updated);
      showToast('Perfil actualizado');
      modal.classList.remove('active');
    } catch (err) {
      showToast('Error al actualizar: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // Initial load
  await loadRequests(session.uuid);
  
  // Auto-refresh every 5 seconds
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (!document.hidden && document.getElementById('requests-container')) {
      loadRequestsSilent(session.uuid);
    }
  }, 5000);
}

async function loadRequests(uuid) {
  const container = document.getElementById('requests-container');
  try {
    const data = await api.getUser(uuid);
    allRequests = data.requests || [];
    allSearching = data.all_searching || [];
    renderFilteredRequests();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Error de conexión</div>
        <div class="empty-state-desc">${err.message}</div>
        <button class="btn btn-primary" onclick="window.location.reload()">Reintentar</button>
      </div>
    `;
  }
}

// Carga silenciosa para el auto-refresh (no borra la UI)
async function loadRequestsSilent(uuid) {
  try {
    const data = await api.getUser(uuid);
    allRequests = data.requests || [];
    allSearching = data.all_searching || [];
    if (document.getElementById('requests-container')) {
      renderFilteredRequests();
    }
  } catch (err) {
    console.error('Silent refresh failed', err);
  }
}

function renderFilteredRequests() {
  const container = document.getElementById('requests-container');
  if (!container) return;

  if (currentFilter === 'todos') {
    renderAllSearchingList(container, allSearching);
    return;
  }

  const filtered = allRequests.filter(req => {
    if (currentFilter === 'matches') return req.status === 'searching';
    if (currentFilter === 'completadas') return req.status === 'completed';
    if (currentFilter === 'canceladas') return req.status === 'cancelled';
    return true;
  });

  renderRequestList(container, filtered);
}

function renderAllSearchingList(container, items) {
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">No hay solicitudes activas</div>
        <div class="empty-state-desc">Nadie más está buscando intercambios en este momento.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <p class="all-searching-hint">Solicitudes activas de otros usuarios — solo lectura</p>
    ${items.map(item => `
      <div class="card all-searching-card ${parseInt(item.my_match_count) > 0 ? 'has-my-match' : ''}">
        ${parseInt(item.my_match_count) > 0 ? `<div class="all-searching-match-badge">🤝 Match contigo</div>` : ''}
        <div class="all-searching-user">
          <div class="match-avatar" style="width:32px;height:32px;font-size:14px;">${item.user_name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="all-searching-name">${item.user_name}</div>
            <div class="all-searching-parish">${item.user_parish}</div>
          </div>
        </div>
        <div class="all-searching-zones">
          <div class="zones-row">
            <span class="zones-label">Ofrece:</span>
            <div class="zones-list">${item.offers.map(z => `<span class="zone-tag offer">${z}</span>`).join('')}</div>
          </div>
          <div class="zones-row">
            <span class="zones-label">Busca:</span>
            <div class="zones-list">${item.wants.map(z => `<span class="zone-tag want">${z}</span>`).join('')}</div>
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

function renderRequestList(container, requests) {
  if (!requests || requests.length === 0) {
    let msg = 'Aún no tienes solicitudes activas';
    if (currentFilter === 'completadas') msg = 'No tienes intercambios completados';
    if (currentFilter === 'canceladas') msg = 'No tienes solicitudes canceladas';
    
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎫</div>
        <div class="empty-state-title">${msg}</div>
        ${currentFilter === 'matches' ? '<div class="empty-state-desc">Publica las zonas que tienes y las que buscas para encontrar un intercambio.</div><button class="btn btn-primary" onclick="document.getElementById(\'new-request-fab\').click()">Crear Solicitud</button>' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  
  requests.forEach(req => {
    const hasMatches = req.matches && req.matches.length > 0;
    const isActive = req.status === 'searching';
    const card = document.createElement('div');
    card.className = `card request-card ${hasMatches && isActive ? 'match-card' : ''}`;
    
    // Header & Badge — status takes priority over match count
    let badgeHtml = '';
    if (req.status === 'completed') {
      badgeHtml = `<span class="badge badge-completed">✅ Completado</span>`;
    } else if (req.status === 'cancelled') {
      badgeHtml = `<span class="badge badge-cancelled">Cancelado</span>`;
    } else if (hasMatches) {
      badgeHtml = `<span class="badge badge-reserved">🎉 ${req.matches.length} Match${req.matches.length > 1 ? 'es' : ''}</span>`;
    } else {
      badgeHtml = `<span class="badge badge-searching">Buscando...</span>`;
    }

    const dateStr = new Date(req.created_at).toLocaleDateString('es-CR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    let html = `
      <div class="request-header">
        <div>${badgeHtml}</div>
        <div class="request-date">${dateStr}</div>
      </div>
      
      <div class="request-zones">
        <span class="zones-label">Tienes (Ofreces):</span>
        <div class="zones-list">
          ${req.offers.map(z => `<span class="zone-tag offer">${z}</span>`).join('')}
        </div>
      </div>
      
      <div class="request-zones">
        <span class="zones-label">Buscas (Quieres):</span>
        <div class="zones-list">
          ${req.wants.map(z => `<span class="zone-tag want">${z}</span>`).join('')}
        </div>
      </div>
    `;

    // Render each match
    if (hasMatches) {
      html += `<div class="matches-list">`;
      req.matches.forEach((match, idx) => {
        const other = match.other_user;
        const giveCandidates  = match.zones_i_give    || [];
        const recvCandidates  = match.zones_i_receive || [];
        const matchNum = req.matches.length > 1 ? ` #${idx + 1}` : '';

        const gives    = giveCandidates.join(', ');
        const receives = recvCandidates.join(', ');

        if (req.status === 'completed') {
          // Vista de historial — resumen + botón de WhatsApp por si quieren volver a contactarse
          const whatsappUrl = `https://wa.me/${other.phone}?text=${encodeURIComponent(`Hola ${other.name}! Te contacto de nuevo desde DNJ Exchange. 🎫`)}`;
          html += `
            <div class="match-detail match-detail-completed">
              <div class="match-label">✅ Intercambio realizado${matchNum} con:</div>
              <div class="match-user-info">
                <div class="match-avatar">${other.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div style="font-weight: 700; font-size: 16px;">${other.name}</div>
                  <div style="font-size: 13px; color: var(--text-muted);">Intercambio completado</div>
                </div>
              </div>
              <div class="match-exchange-box">
                <div class="match-exchange-side">
                  <span class="zones-label" style="color:var(--danger)">Diste:</span>
                  <div class="zones-list">
                    ${giveCandidates.map(z => `<span class="zone-tag offer">${z}</span>`).join('')}
                  </div>
                </div>
                <div class="match-exchange-divider">
                  <span class="divider-line"></span>
                  <span class="divider-icon">✅</span>
                  <span class="divider-line"></span>
                </div>
                <div class="match-exchange-side">
                  <span class="zones-label" style="color:var(--success)">Recibiste:</span>
                  <div class="zones-list">
                    ${recvCandidates.map(z => `<span class="zone-tag want">${z}</span>`).join('')}
                  </div>
                </div>
              </div>
              <a href="${whatsappUrl}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-full mb-4" style="opacity:0.85;">
                💬 Volver a contactar por WhatsApp
              </a>
            </div>
          `;
        } else {
          // Vista activa — con botones de WhatsApp y completar
          const whatsappUrl = `https://wa.me/${other.phone}?text=${encodeURIComponent(`Hola ${other.name}! Encontré un match contigo en DNJ Exchange.\n\nYo te doy: ${gives}\nTú me das: ${receives}\n\n¿Coordinamos el intercambio? 🎫🎵`)}`;
          html += `
            <div class="match-detail">
              <div class="match-label">Match${matchNum} con:</div>
              <div class="match-user-info">
                <div class="match-avatar">${other.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div style="font-weight: 700; font-size: 16px;">${other.name}</div>
                  <div style="font-size: 13px; color: var(--text-muted);">Toca el botón abajo para escribirle</div>
                </div>
              </div>
              <div class="match-exchange-box">
                <div class="match-exchange-side">
                  <span class="zones-label" style="color:var(--danger)">Tú entregas:</span>
                  <div class="zones-list">
                    ${giveCandidates.map(z => `<span class="zone-tag offer">${z}</span>`).join('')}
                  </div>
                </div>
                <div class="match-exchange-divider">
                  <span class="divider-line"></span>
                  <span class="divider-icon">🤝</span>
                  <span class="divider-line"></span>
                </div>
                <div class="match-exchange-side">
                  <span class="zones-label" style="color:var(--success)">Tú recibes:</span>
                  <div class="zones-list">
                    ${recvCandidates.map(z => `<span class="zone-tag want">${z}</span>`).join('')}
                  </div>
                </div>
              </div>
              <a href="${whatsappUrl}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-full mb-4">
                💬 Contactar por WhatsApp
              </a>
              <button class="btn btn-success btn-full btn-complete-match mb-4" data-match-id="${match.id}">
                ✓ Marcar este intercambio como Completado
              </button>
            </div>
          `;
        }
      });
      html += `</div>`;
    }

    // Actions
    if (req.status === 'searching') {
      html += `
        <div class="request-actions">
          <button class="btn btn-secondary btn-full btn-cancel" data-id="${req.id}">Cancelar Solicitud</button>
        </div>
      `;
    }

    card.innerHTML = html;
    
    // Cancel button
    const cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => updateRequestStatus(req.id, 'cancelled'));
    }

    // Complete match buttons
    card.querySelectorAll('.btn-complete-match').forEach(completeBtn => {
      completeBtn.addEventListener('click', async () => {
        if (!confirm('¿Confirmas que ya realizaste este intercambio?')) return;
        completeBtn.disabled = true;
        try {
          await api.completeMatch(parseInt(completeBtn.dataset.matchId));
          showToast('¡Intercambio completado!');
          const session = getSession();
          loadRequests(session.uuid);
        } catch (err) {
          showToast('Error: ' + err.message);
          completeBtn.disabled = false;
        }
      });
    });

    container.appendChild(card);
  });
}

async function updateRequestStatus(id, newStatus) {
  const msg = newStatus === 'cancelled' 
    ? '¿Estás seguro de cancelar esta solicitud?' 
    : '¿Confirmas que ya realizaste el intercambio?';
    
  if (!confirm(msg)) return;
  
  try {
    await api.updateRequest(id, { status: newStatus });
    showToast(`Solicitud ${newStatus === 'completed' ? 'completada' : 'cancelada'}`);
    const session = getSession();
    loadRequests(session.uuid);
  } catch (err) {
    showToast(err.message);
  }
}
