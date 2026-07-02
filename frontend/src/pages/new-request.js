// DNJ Exchange - New Request Page
import { api } from '../api.js';
import { getSession } from '../auth.js';
import { navigate, showToast } from '../main.js';

const SECTORS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SUBZONES = Array.from({length: 10}, (_, i) => i + 1);

let step = 1;
let selectedOffers = [];
let selectedWants = [];

export async function renderNewRequest(container) {
  // Reset state
  step = 1;
  selectedOffers = [];
  selectedWants = [];

  container.innerHTML = `
    <div class="page">
      <header class="header">
        <button class="btn-icon" id="back-btn" title="Volver">←</button>
        <div class="header-logo" style="font-size: 20px;">
          <span class="logo-d">D</span><span class="logo-n">N</span><span class="logo-j">J</span>
        </div>
        <div style="width:40px"></div>
      </header>
      
      <div class="step-indicator">
        <div class="step-dot active" id="dot-1"></div>
        <div class="step-dot" id="dot-2"></div>
      </div>
      
      <div class="content text-center">
        <h2 class="card-title" id="step-title">¿Qué zonas TIENES?</h2>
        <p class="card-subtitle" id="step-subtitle">Selecciona las zonas que ofreces para intercambiar.</p>
      </div>

      <div class="zone-selector">
        <div class="selected-pills-bar" id="pills-container">
          <span style="color: var(--text-dim); font-size: 13px; font-weight: 600;">Ninguna seleccionada</span>
        </div>
        
        <div class="zone-grid" id="grid-container">
          <!-- Grid is injected here -->
        </div>
      </div>
      
      <div style="padding: 16px; position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg); border-top: 1px solid var(--border); z-index: 50; max-width: 480px; margin: 0 auto;">
        <button class="btn btn-primary btn-full" id="next-btn" disabled>Siguiente →</button>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('back-btn').addEventListener('click', () => {
    if (step === 2) {
      step = 1;
      updateUI();
    } else {
      navigate('dashboard');
    }
  });

  document.getElementById('next-btn').addEventListener('click', async () => {
    if (step === 1) {
      if (selectedOffers.length === 0) return;
      step = 2;
      updateUI();
    } else {
      if (selectedWants.length === 0) return;
      await submitRequest();
    }
  });

  updateUI();
}

function updateUI() {
  const title = document.getElementById('step-title');
  const subtitle = document.getElementById('step-subtitle');
  const dot1 = document.getElementById('dot-1');
  const dot2 = document.getElementById('dot-2');
  const nextBtn = document.getElementById('next-btn');

  if (step === 1) {
    title.textContent = '¿Qué zonas TIENES?';
    title.style.background = 'var(--gradient)';
    title.style.webkitBackgroundClip = 'text';
    title.style.color = 'transparent';
    subtitle.textContent = 'Toca los números de las zonas que ofreces.';
    dot1.classList.add('active');
    dot2.classList.remove('active');
    nextBtn.textContent = 'Siguiente →';
    nextBtn.disabled = selectedOffers.length === 0;
    
    renderZoneGrid(selectedOffers, []);
    renderPills(selectedOffers, 'offers');
  } else {
    title.textContent = '¿Qué zonas QUIERES?';
    title.style.background = 'var(--gradient)';
    title.style.webkitBackgroundClip = 'text';
    title.style.color = 'transparent';
    subtitle.textContent = 'Selecciona las zonas que aceptarías a cambio.';
    dot1.classList.remove('active');
    dot2.classList.add('active');
    nextBtn.textContent = '✓ Publicar Solicitud';
    nextBtn.disabled = selectedWants.length === 0;
    
    renderZoneGrid(selectedWants, selectedOffers); // offers are disabled
    renderPills(selectedWants, 'wants');
  }
}

function renderZoneGrid(selectedArray, disabledArray) {
  const container = document.getElementById('grid-container');
  container.innerHTML = '';
  
  // Optimización: crear document fragment
  const frag = document.createDocumentFragment();

  SECTORS.forEach(sector => {
    const row = document.createElement('div');
    row.className = 'zone-sector-row';
    
    const label = document.createElement('span');
    label.className = 'zone-sector-label';
    label.textContent = sector;
    row.appendChild(label);
    
    SUBZONES.forEach(num => {
      const zone = `${sector}-${num}`;
      const chip = document.createElement('button');
      chip.className = 'zone-chip';
      chip.textContent = num;
      chip.dataset.zone = zone;
      
      if (disabledArray.includes(zone)) {
        chip.classList.add('disabled');
      } else if (selectedArray.includes(zone)) {
        chip.classList.add('selected');
      }
      
      chip.addEventListener('click', () => {
        if (disabledArray.includes(zone)) return;
        
        const idx = selectedArray.indexOf(zone);
        if (idx === -1) {
          selectedArray.push(zone);
          chip.classList.add('selected');
        } else {
          selectedArray.splice(idx, 1);
          chip.classList.remove('selected');
        }
        
        renderPills(selectedArray, step === 1 ? 'offers' : 'wants');
        document.getElementById('next-btn').disabled = selectedArray.length === 0;
      });
      
      row.appendChild(chip);
    });
    
    frag.appendChild(row);
  });
  
  container.appendChild(frag);
}

function renderPills(selectedArray, type) {
  const container = document.getElementById('pills-container');
  if (selectedArray.length === 0) {
    container.innerHTML = '<span style="color: var(--text-dim); font-size: 13px; font-weight: 600;">Ninguna seleccionada</span>';
    return;
  }
  
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  
  // Sort alphabetically
  const sorted = [...selectedArray].sort();
  
  sorted.forEach(zone => {
    const pill = document.createElement('div');
    pill.className = 'pill';
    if (type === 'wants') {
      pill.style.background = 'linear-gradient(135deg, #3b82f6, #8b5cf6)';
    }
    
    pill.innerHTML = `
      ${zone}
      <button class="pill-remove" data-zone="${zone}">×</button>
    `;
    
    pill.querySelector('.pill-remove').addEventListener('click', () => {
      const idx = selectedArray.indexOf(zone);
      if (idx > -1) {
        selectedArray.splice(idx, 1);
        renderZoneGrid(selectedArray, step === 1 ? [] : selectedOffers);
        renderPills(selectedArray, type);
        document.getElementById('next-btn').disabled = selectedArray.length === 0;
      }
    });
    
    frag.appendChild(pill);
  });
  
  container.appendChild(frag);
}

async function submitRequest() {
  const btn = document.getElementById('next-btn');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Publicando...';

  const session = getSession();
  
  try {
    await api.createRequest({
      user_uuid: session.uuid,
      offers: selectedOffers,
      wants: selectedWants
    });
    
    showToast('Solicitud publicada con éxito 🎉');
    navigate('dashboard');
  } catch (err) {
    console.error(err);
    showToast('Error al publicar: ' + err.message);
    btn.disabled = false;
    btn.textContent = oldText;
  }
}
