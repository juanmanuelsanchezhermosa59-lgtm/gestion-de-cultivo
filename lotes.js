// =========================================================
// CONFIGURACIÓN - reemplaza con tus propios datos
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyC8Nr1Nwo2JmPD2ecGVFu6VT5niFV7l32o",
  authDomain: "saas-multi-tenant-arroceros.firebaseapp.com",
  databaseURL: "https://saas-multi-tenant-arroceros-default-rtdb.firebaseio.com",
  projectId: "saas-multi-tenant-arroceros",
  storageBucket: "saas-multi-tenant-arroceros.firebasestorage.app",
  messagingSenderId: "39365983216",
  appId: "1:39365983216:web:80e172fa62dbad3baa3b35"
};

// Slug de la finca actual: se guarda en localStorage cuando el usuario
// se registra (registro.js) o inicia sesión. Si no hay slug guardado,
// mandamos al usuario a registrarse/iniciar sesión.
const TENANT_SLUG = localStorage.getItem('tenant_slug');
if (!TENANT_SLUG) {
  window.location.href = 'login.html';
}

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const lotesRef = db.collection('tenants').doc(TENANT_SLUG).collection('lotes');
const tenantRef = db.collection('tenants').doc(TENANT_SLUG);

let lotesCache = [];

// ---------------- ETAPAS FENOLÓGICAS DEL ARROZ ----------------
// % del ciclo total en el que empieza cada etapa
const ETAPAS = [
  { nombre: 'Germinación',        inicio: 0.00, color: '#8FBF9F' },
  { nombre: 'Macollamiento',      inicio: 0.13, color: '#4E8F63' },
  { nombre: 'Elongación de tallo',inicio: 0.35, color: '#1F4D36' },
  { nombre: 'Embuchamiento',      inicio: 0.55, color: '#7A5230' },
  { nombre: 'Floración',          inicio: 0.68, color: '#C9A227' },
  { nombre: 'Llenado de grano',   inicio: 0.78, color: '#E4C860' },
];

function etapaActual(diasTranscurridos, cicloDias) {
  const frac = Math.min(Math.max(diasTranscurridos / cicloDias, 0), 1);
  let actual = ETAPAS[0];
  for (const e of ETAPAS) { if (frac >= e.inicio) actual = e; }
  return { etapa: actual, frac };
}

function diasEntre(fechaISO) {
  const hoy = new Date();
  const inicio = new Date(fechaISO + 'T00:00:00');
  return Math.floor((hoy - inicio) / (1000 * 60 * 60 * 24));
}

function renderBarraCiclo(lote) {
  const dias = diasEntre(lote.fecha_siembra);
  const { etapa, frac } = etapaActual(dias, lote.ciclo_dias);
  const diasRestantes = lote.ciclo_dias - dias;

  let segmentos = '';
  for (let i = 0; i < ETAPAS.length; i++) {
    const inicio = ETAPAS[i].inicio;
    const fin = (i < ETAPAS.length - 1) ? ETAPAS[i + 1].inicio : 1;
    const ancho = (fin - inicio) * 100;
    segmentos += `<div class="ciclo-segmento" style="width:${ancho}%; background:${ETAPAS[i].color};"></div>`;
  }

  const marcadorPos = Math.min(frac, 1) * 100;

  return `
    <div class="ciclo-wrap">
      <div class="ciclo-header">
        <span>Etapa: <span class="ciclo-etapa-actual">${etapa.nombre}</span></span>
        <span>${Math.round(frac * 100)}%</span>
      </div>
      <div class="ciclo-barra">
        ${segmentos}
        <div class="ciclo-marcador" style="left:${marcadorPos}%;"></div>
      </div>
      <div class="ciclo-footer">
        <span>Día ${dias} de ${lote.ciclo_dias}</span>
        <span>${diasRestantes > 0 ? diasRestantes + ' días para cosecha' : 'Lista para cosechar'}</span>
      </div>
    </div>
  `;
}

function fechaCosechaEstimada(lote) {
  const inicio = new Date(lote.fecha_siembra + 'T00:00:00');
  inicio.setDate(inicio.getDate() + parseInt(lote.ciclo_dias));
  return inicio.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------- RENDER ----------------
function renderLotes() {
  const grid = document.getElementById('lotesGrid');
  const vacio = document.getElementById('vacioMsg');

  if (lotesCache.length === 0) {
    grid.innerHTML = '';
    vacio.style.display = 'block';
    actualizarResumen();
    return;
  }
  vacio.style.display = 'none';

  grid.innerHTML = lotesCache.map(lote => {
    const badgeClass = lote.estado === 'cosechado' ? 'badge-cosechado' : 'badge-activo';
    const badgeTexto = lote.estado === 'cosechado' ? 'Cosechado' : 'Activo';

    return `
    <div class="lote-card">
      <div class="lote-header">
        <div>
          <div class="lote-nombre">${lote.nombre}</div>
          <div class="lote-codigo">ID: ${lote.id.slice(0, 8)}</div>
        </div>
        <div class="lote-menu">
          <button class="icon-btn" onclick="editarLote('${lote.id}')" title="Editar">✏️</button>
          <button class="icon-btn" onclick="eliminarLote('${lote.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>

      <div class="lote-datos">
        <div>
          <div class="dato-label">Área</div>
          <div class="dato-valor">${lote.area_ha} ha</div>
        </div>
        <div>
          <div class="dato-label">Variedad</div>
          <div class="dato-valor">${lote.variedad}</div>
        </div>
        <div>
          <div class="dato-label">Siembra</div>
          <div class="dato-valor">${new Date(lote.fecha_siembra + 'T00:00:00').toLocaleDateString('es-CO')}</div>
        </div>
        <div>
          <div class="dato-label">Cosecha estimada</div>
          <div class="dato-valor">${fechaCosechaEstimada(lote)}</div>
        </div>
      </div>

      <span class="badge ${badgeClass}" style="margin-bottom:12px; display:inline-block;">${badgeTexto}</span>

      ${lote.estado !== 'cosechado' ? renderBarraCiclo(lote) : ''}
    </div>`;
  }).join('');

  actualizarResumen();
}

function actualizarResumen() {
  const activos = lotesCache.filter(l => l.estado === 'activo');
  const cosechados = lotesCache.filter(l => l.estado === 'cosechado');
  const hectareas = lotesCache.reduce((sum, l) => sum + parseFloat(l.area_ha || 0), 0);

  document.getElementById('resActivos').textContent = activos.length;
  document.getElementById('resHectareas').textContent = hectareas.toFixed(1);
  document.getElementById('resCosechados').textContent = cosechados.length;

  if (activos.length > 0) {
    const proximos = activos
      .map(l => ({ lote: l, dias: diasEntre(l.fecha_siembra) }))
      .sort((a, b) => (a.lote.ciclo_dias - a.dias) - (b.lote.ciclo_dias - b.dias));
    const proximo = proximos[0];
    const restantes = proximo.lote.ciclo_dias - proximo.dias;
    document.getElementById('resProxima').textContent =
      restantes > 0 ? `${proximo.lote.nombre} (${restantes}d)` : `${proximo.lote.nombre} (lista)`;
  } else {
    document.getElementById('resProxima').textContent = '—';
  }
}

// ---------------- FIRESTORE: escucha en tiempo real ----------------
function iniciarEscucha() {
  lotesRef.orderBy('fecha_siembra', 'desc').onSnapshot(snapshot => {
    lotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderLotes();
  }, error => {
    mostrarToast('Error cargando lotes: ' + error.message, true);
  });

  tenantRef.get().then(doc => {
    if (doc.exists) {
      document.getElementById('nombreFinca').textContent = doc.data().nombre || TENANT_SLUG;
    } else {
      document.getElementById('nombreFinca').textContent = TENANT_SLUG;
    }
  });
}

// ---------------- MODAL / CRUD ----------------
function abrirModal(lote = null) {
  document.getElementById('modalOverlay').classList.add('abierto');
  document.getElementById('formLote').reset();
  if (lote) {
    document.getElementById('modalTitulo').textContent = 'Editar lote';
    document.getElementById('loteId').value = lote.id;
    document.getElementById('nombre').value = lote.nombre;
    document.getElementById('area_ha').value = lote.area_ha;
    document.getElementById('variedad').value = lote.variedad;
    document.getElementById('fecha_siembra').value = lote.fecha_siembra;
    document.getElementById('ciclo_dias').value = lote.ciclo_dias;
    document.getElementById('estado').value = lote.estado;
  } else {
    document.getElementById('modalTitulo').textContent = 'Registrar lote';
    document.getElementById('loteId').value = '';
  }
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('abierto');
}

function editarLote(id) {
  const lote = lotesCache.find(l => l.id === id);
  if (lote) abrirModal(lote);
}

async function eliminarLote(id) {
  const lote = lotesCache.find(l => l.id === id);
  if (!confirm(`¿Eliminar el lote "${lote.nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await lotesRef.doc(id).delete();
    mostrarToast('Lote eliminado');
  } catch (e) {
    mostrarToast('Error al eliminar: ' + e.message, true);
  }
}

document.getElementById('formLote').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('loteId').value;
  const datos = {
    nombre: document.getElementById('nombre').value.trim(),
    area_ha: parseFloat(document.getElementById('area_ha').value),
    variedad: document.getElementById('variedad').value,
    fecha_siembra: document.getElementById('fecha_siembra').value,
    ciclo_dias: parseInt(document.getElementById('ciclo_dias').value),
    estado: document.getElementById('estado').value,
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await lotesRef.doc(id).update(datos);
      mostrarToast('Lote actualizado');
    } else {
      datos.creado = firebase.firestore.FieldValue.serverTimestamp();
      await lotesRef.add(datos);
      mostrarToast('Lote registrado');
    }
    cerrarModal();
  } catch (err) {
    mostrarToast('Error al guardar: ' + err.message, true);
  }
});

function mostrarToast(msg, esError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast mostrar' + (esError ? ' error' : '');
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ---------------- CERRAR SESIÓN ----------------
function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  auth.signOut().then(() => {
    localStorage.removeItem('tenant_slug');
    window.location.href = 'login.html';
  });
}

// ---------------- AUTENTICACIÓN ----------------
auth.onAuthStateChanged(user => {
  if (user) {
    iniciarEscucha();
  } else {
    // Ajusta esto según tu flujo: redirigir a login o autenticar anónimamente para pruebas.
    console.warn('Usuario no autenticado. Conecta tu flujo de login aquí.');
    // Para pruebas locales sin login, puedes comentar la línea de arriba
    // y llamar directamente a iniciarEscucha() (solo si tus reglas lo permiten).
  }
});