// DNJ Exchange - Application Shell & Router
import { getSession, getOrCreateUUID, setSession } from './auth.js';
import { api } from './api.js';

const app = document.getElementById('app');
let currentPage = null;

/**
 * Mostrar un toast no intrusivo al usuario.
 * @param {string} message 
 * @param {number} duration ms
 */
export function showToast(message, duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Navegador de la SPA
 * @param {string} route 
 * @param {object} params 
 */
export async function navigate(route, params = {}) {
  if (currentPage === route) return;
  currentPage = route;
  
  // Guardar en history para que el botón atrás funcione
  if (window.location.hash !== `#${route}`) {
    window.history.pushState({ route, params }, '', `#${route}`);
  }
  
  await render(route, params);
}

/**
 * Renderizador principal
 */
async function render(route, params = {}) {
  // Estado de carga
  app.innerHTML = '<div class="spinner-fullpage"><div class="spinner"></div></div>';
  
  try {
    switch (route) {
      case 'onboarding': {
        const { renderOnboarding } = await import('./pages/onboarding.js');
        await renderOnboarding(app);
        break;
      }
      case 'new-request': {
        const { renderNewRequest } = await import('./pages/new-request.js');
        await renderNewRequest(app);
        break;
      }
      case 'dashboard':
      default: {
        const { renderDashboard } = await import('./pages/dashboard.js');
        await renderDashboard(app);
        break;
      }
    }
    
    // Animar la entrada
    const pageContainer = app.firstElementChild;
    if (pageContainer && pageContainer.classList.contains('page')) {
      pageContainer.classList.add('page-enter');
    }
  } catch (err) {
    console.error('Error renderizando la ruta:', err);
    app.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Error de carga</div>
        <div class="empty-state-desc">Hubo un problema cargando la página.</div>
        <button class="btn btn-primary" onclick="window.location.reload()">Recargar</button>
      </div>
    `;
  }
}

/**
 * Manejador de navegación con el botón "Atrás"
 */
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.route) {
    currentPage = event.state.route;
    render(event.state.route, event.state.params);
  } else {
    const hashRoute = window.location.hash.replace('#', '') || 'dashboard';
    currentPage = hashRoute;
    render(hashRoute);
  }
});

/**
 * Inicialización de la App
 */
async function init() {
  // Manejar mensajes del Service Worker (ej. click en notificación)
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'MATCH_FOUND') {
      navigate('dashboard');
    }
  });

  const uuid = getOrCreateUUID();
  
  try {
    const data = await api.getUser(uuid);
    // Usuario existe, actualizar sesión local por si acaso
    const currentSession = getSession();
    setSession({ ...currentSession, ...data.user });
    
    // Ver si venimos de un enlace directo
    const hashRoute = window.location.hash.replace('#', '');
    if (hashRoute && hashRoute !== 'onboarding') {
      navigate(hashRoute);
    } else {
      navigate('dashboard');
    }
  } catch (err) {
    // Usuario no existe en backend (404) o error de red
    console.log('Iniciando flujo de onboarding...', err.message);
    navigate('onboarding');
  }
}

/**
 * Muestra un popup de disclaimer la primera vez que el usuario abre la app.
 * Solo aparece una vez por dispositivo (se guarda en localStorage).
 */
function showDisclaimer() {
  return new Promise((resolve) => {
    const SEEN_KEY = 'dnj_disclaimer_seen_v1';
    if (localStorage.getItem(SEEN_KEY)) {
      resolve();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'disclaimer-overlay';
    overlay.innerHTML = `
      <div id="disclaimer-modal">
        <img src="/icons/logo.jpg" alt="DNJ Limón" id="disclaimer-logo" />
        <h2 id="disclaimer-title">Proyecto Independiente</h2>
        <p id="disclaimer-body">
          <strong>DNJ Exchange</strong> es un proyecto <em>independiente</em>, creado por
          <strong>Alexander Ubeda</strong> para facilitar el intercambio de entradas entre
          participantes del DNJ Limón.
        </p>
        <p id="disclaimer-body2">
          Esta herramienta <strong>no está afiliada, respaldada ni relacionada</strong>
          de ninguna forma con la organización oficial del DNJ ni con la Diócesis de Limón.
        </p>
        <button id="disclaimer-accept-btn">Entendido, continuar →</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Trigger animation
    requestAnimationFrame(() => overlay.classList.add('visible'));

    document.getElementById('disclaimer-accept-btn').addEventListener('click', () => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => {
        overlay.remove();
        localStorage.setItem(SEEN_KEY, '1');
        resolve();
      }, { once: true });
    });
  });
}

/**
 * Muestra un tutorial interactivo de bienvenida paso a paso.
 * Solo aparece la primera vez (se guarda en localStorage).
 */
function showTutorial() {
  return new Promise((resolve) => {
    const TUTORIAL_KEY = 'dnj_tutorial_seen_v1';
    if (localStorage.getItem(TUTORIAL_KEY)) {
      resolve();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    
    // Contenido de los pasos
    const steps = [
      {
        icon: '🎫',
        title: '¡Bienvenido a DNJ Exchange!',
        desc: 'Esta plataforma está diseñada para ayudarte a cambiar tus entradas del DNJ Limón de forma segura, equitativa y sin complicaciones.',
        accentClass: 'accent-red'
      },
      {
        icon: '📝',
        title: '1. Crea tu solicitud',
        desc: 'Publica las zonas que <strong>tienes (ofreces)</strong> y las que <strong>buscas (quieres)</strong>. Puedes publicar varias zonas a la vez para aumentar tus posibilidades.',
        accentClass: 'accent-green'
      },
      {
        icon: '🤝',
        title: '2. Encuentra tu Match',
        desc: 'El sistema busca de forma automática a alguien que tenga lo que buscas y quiera lo que ofreces. Si las zonas coinciden, se creará un <strong>Match</strong>.',
        accentClass: 'accent-blue'
      },
      {
        icon: '💬',
        title: '3. Confirma y Coordina',
        desc: 'Una vez en match, seleccionen las zonas exactas a cambiar (debe ser la misma cantidad de cada lado). Se habilitará un botón para abrir un chat directo de <strong>WhatsApp</strong> y coordinar la entrega física.',
        accentClass: 'accent-yellow'
      }
    ];

    let currentStep = 0;

    const renderStep = () => {
      const step = steps[currentStep];
      overlay.innerHTML = `
        <div id="tutorial-modal" class="${step.accentClass}">
          <div class="tutorial-progress-bar">
            ${steps.map((_, idx) => `<span class="progress-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}"></span>`).join('')}
          </div>
          <div class="tutorial-icon">${step.icon}</div>
          <h2 id="tutorial-title">${step.title}</h2>
          <p id="tutorial-body">${step.desc}</p>
          <div class="tutorial-actions">
            ${currentStep > 0 ? '<button id="tutorial-prev-btn">Atrás</button>' : ''}
            <button id="tutorial-next-btn">${currentStep === steps.length - 1 ? '¡Empezar!' : 'Siguiente →'}</button>
          </div>
        </div>
      `;

      // Event listeners para los botones internos
      document.getElementById('tutorial-next-btn').addEventListener('click', () => {
        if (currentStep === steps.length - 1) {
          closeTutorial();
        } else {
          currentStep++;
          renderStep();
        }
      });

      const prevBtn = document.getElementById('tutorial-prev-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          currentStep--;
          renderStep();
        });
      }
    };

    const closeTutorial = () => {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => {
        overlay.remove();
        localStorage.setItem(TUTORIAL_KEY, '1');
        resolve();
      }, { once: true });
    };

    document.body.appendChild(overlay);
    renderStep();

    // Trigger animation
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });
}

// Iniciar aplicación
document.addEventListener('DOMContentLoaded', async () => {
  await showDisclaimer();
  await showTutorial();
  init();
});
