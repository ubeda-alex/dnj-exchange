// DNJ Exchange - Onboarding Page
import { api } from '../api.js';
import { getOrCreateUUID, setSession } from '../auth.js';
import { navigate, showToast } from '../main.js';
import { requestNotificationPermission, subscribeToPush } from '../push.js';

export async function renderOnboarding(container) {
  container.innerHTML = `
    <div class="page">
      <div class="onboarding-hero">
        <div class="hero-logo-letters">
          <span class="d">D</span><span class="n">N</span><span class="j">J</span>
        </div>
        <p class="slogan">
          "Tengan valor, yo he vencido al mundo."
          <span class="slogan-verse">Jn 16,33</span>
        </p>
      </div>
      
      <div class="content">
        <div class="card onboarding-card">
          <h2 class="card-title">Intercambio de Entradas para Hakuna Group Music</h2>
          <p class="card-subtitle" style="margin-bottom: 24px; color: var(--text-muted)">Conecta con otros jóvenes de todo el país para intercambiar tus zonas de entrada.</p>
          
          <form id="onboarding-form">
            <div class="form-group">
              <label class="form-label">Tu nombre o apodo</label>
              <input class="input" id="name" type="text" placeholder="Ej: Juan Pérez" autocomplete="name" required />
            </div>
            
            <div class="form-group">
              <label class="form-label">WhatsApp</label>
              <div class="input-wrapper">
                <span class="input-prefix">+506</span>
                <input class="input input-with-prefix" id="phone" type="tel" placeholder="88887777" maxlength="8" pattern="[0-9]{8}" required />
              </div>
              <p class="form-hint">Solo se compartirá cuando haya un match para coordinar.</p>
            </div>
            
            <div class="form-group">
              <label class="form-label">Parroquia</label>
              <input class="input" id="parish" type="text" placeholder="Ej: San Rafael Arcángel" autocomplete="organization" required />
            </div>
            
            <button type="submit" class="btn btn-primary btn-full mt-4" id="save-btn">
              Comenzar intercambio →
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('onboarding-form');
  const btn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('name').value.trim();
    const phoneInput = document.getElementById('phone').value.trim();
    const parishInput = document.getElementById('parish').value.trim();
    
    if (phoneInput.length !== 8 || isNaN(phoneInput)) {
      showToast('El número de WhatsApp debe tener 8 dígitos');
      return;
    }

    const uuid = getOrCreateUUID();
    const fullPhone = `506${phoneInput}`;
    
    // UI Loading state
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Guardando...';

    try {
      // 1. Crear usuario en backend
      await api.createUser({
        uuid,
        name: nameInput,
        phone: fullPhone,
        parish: parishInput
      });

      // 2. Guardar localmente
      setSession({
        uuid,
        name: nameInput,
        phone: fullPhone,
        parish: parishInput
      });

      // 3. Solicitar notificaciones push
      const perm = await requestNotificationPermission();
      if (perm === 'granted') {
        await subscribeToPush();
      } else if (perm === 'denied') {
        showToast('Notificaciones bloqueadas. Te recomendamos activarlas para enterarte de tus matches.', 5000);
      }

      // 4. Ir al dashboard
      navigate('dashboard');
      
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error al guardar el perfil. Intenta de nuevo.');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });
}
