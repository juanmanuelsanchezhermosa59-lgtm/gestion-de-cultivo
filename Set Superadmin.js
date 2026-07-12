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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let tenantsCache = [];

function formatearFecha(timestamp) {
  if (!timestamp) return '—';
  const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------- RENDER ----------------
function renderTenants() {
  const tbody = document.getElementById('tenantsBody');
  const vacio = document.getElementById('vacioMsg');
  const tablaWrap = document.getElementById('tablaWrap');

  if (tenantsCache.length === 0) {
    tablaWrap.style.display = 'none';
    vacio.style.display = 'block';
    actualizarResumen();
    return;
  }
  tablaWrap.style.display = 'block';
  vacio.style.display = 'none';

  tbody.innerHTML = tenantsCache.map(t => {
    const suspendida = t.suspendida === true;
    return `
    <tr>
      <td><strong>${t.nombre}</strong></td>
      <td class="td-slug">${t.id}</td>
      <td>${t.propietario || '—'}</td>
      <td>${t.ubicacion || '—'}</td>
      <td>
        <select class="plan-select" onchange="cambiarPlan('${t.id}', this.value)">
          <option value="trial" ${t.plan === 'trial' ? 'selected' : ''}>Trial</option>
          <option value="basico" ${t.plan === 'basico' ? 'selected' : ''}>Básico</option>
          <option value="pro" ${t.plan === 'pro' ? 'selected' : ''}>Pro</option>
        </select>
      </td>
      <td class="td-fecha">${formatearFecha(t.fecha_registro)}</td>
      <td>
        <span class="badge ${suspendida ? 'badge-suspendida' : 'badge-activa'}">
          ${suspendida ? 'Suspendida' : 'Activa'}
        </span>
      </td>
      <td>
        <button class="icon-btn" onclick="toggleSuspension('${t.id}', ${suspendida})" title="${suspendida ? 'Reactivar' : 'Suspender'}">
          ${suspendida ? '▶️' : '⏸️'}
        </button>
      </td>
    </tr>`;
  }).join('');

  actualizarResumen();
}

function actualizarResumen() {
  const activas = tenantsCache.filter(t => !t.suspendida);
  const trial = tenantsCache.filter(t => t.plan === 'trial');
  const pagando = tenantsCache.filter(t => t.plan === 'basico' || t.plan === 'pro');

  document.getElementById('resTotal').textContent = tenantsCache.length;
  document.getElementById('resActivas').textContent = activas.length;
  document.getElementById('resTrial').textContent = trial.length;
  document.getElementById('resPagando').textContent = pagando.length;
}

// ---------------- ACCIONES ----------------
async function cambiarPlan(slug, nuevoPlan) {
  try {
    await db.collection('tenants').doc(slug).update({ plan: nuevoPlan });
  } catch (e) {
    alert('Error al cambiar el plan: ' + e.message);
  }
}

async function toggleSuspension(slug, estaSuspendida) {
  const accion = estaSuspendida ? 'reactivar' : 'suspender';
  if (!confirm(`¿Seguro que quieres ${accion} esta finca?`)) return;
  try {
    await db.collection('tenants').doc(slug).update({ suspendida: !estaSuspendida });
  } catch (e) {
    alert('Error al actualizar el estado: ' + e.message);
  }
}

// ---------------- FIRESTORE: escucha en tiempo real ----------------
function iniciarEscucha() {
  db.collection('tenants').orderBy('fecha_registro', 'desc').onSnapshot(snapshot => {
    tenantsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTenants();
  }, error => {
    console.error('Error cargando fincas:', error);
  });
}

// ---------------- CONTROL DE ACCESO (solo super-admin) ----------------
auth.onAuthStateChanged(async (user) => {
  const cargando = document.getElementById('cargando');
  const panel = document.getElementById('panelSuperAdmin');
  const denegado = document.getElementById('accesoDenegado');

  if (!user) {
    cargando.style.display = 'none';
    denegado.style.display = 'flex';
    return;
  }

  const tokenResult = await user.getIdTokenResult();
  cargando.style.display = 'none';

  if (tokenResult.claims.superadmin === true) {
    panel.style.display = 'block';
    iniciarEscucha();
  } else {
    denegado.style.display = 'flex';
  }
});