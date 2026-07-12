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

const laboresRef = db.collection('tenants').doc(TENANT_SLUG).collection('labores');
const lotesRef = db.collection('tenants').doc(TENANT_SLUG).collection('lotes');
const tenantRef = db.collection('tenants').doc(TENANT_SLUG);

let laboresCache = [];
let lotesCache = [];
let filtroLote = '';
let filtroTipo = '';

const TIPOS_LABOR = {
  riego: 'Riego',
  fertilizacion: 'Fertilización',
  fumigacion: 'Fumigación',
  control_plagas: 'Control de plagas',
  deshierbe: 'Deshierbe',
  otra: 'Otra'
};

// ---------------- CARGA DE LOTES (para el selector) ----------------
function cargarLotes() {
  lotesRef.onSnapshot(snapshot => {
    lotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    poblarSelectLotes();
  });
}

function poblarSelectLotes() {
  const selectFiltro = document.getElementById('filtroLote');
  const selectForm = document.getElementById('lote_id');

  const opciones = lotesCache.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');

  selectFiltro.innerHTML = '<option value="">Todos los lotes</option>' + opciones;
  selectForm.innerHTML = '<option value="">Selecciona un lote...</option>' + opciones;
}

function nombreLote(loteId) {
  const lote = lotesCache.find(l => l.id === loteId);
  return lote ? lote.nombre : '(lote eliminado)';
}

// ---------------- RENDER ----------------
function renderLabores() {
  const tbody = document.getElementById('laboresBody');
  const vacio = document.getElementById('vacioMsg');
  const tablaWrap = document.getElementById('tablaWrap');

  let filtradas = laboresCache;
  if (filtroLote) filtradas = filtradas.filter(l => l.lote_id === filtroLote);
  if (filtroTipo) filtradas = filtradas.filter(l => l.tipo === filtroTipo);

  if (filtradas.length === 0) {
    tablaWrap.style.display = 'none';
    vacio.style.display = 'block';
    actualizarResumen(filtradas);
    return;
  }
  tablaWrap.style.display = 'block';
  vacio.style.display = 'none';

  tbody.innerHTML = filtradas.map(labor => `
    <tr>
      <td class="td-fecha">${new Date(labor.fecha + 'T00:00:00').toLocaleDateString('es-CO')}</td>
      <td>${nombreLote(labor.lote_id)}</td>
      <td><span class="tag-tipo tag-${labor.tipo}">${TIPOS_LABOR[labor.tipo] || labor.tipo}</span></td>
      <td>${labor.insumo_usado || '—'}${labor.cantidad ? ' · ' + labor.cantidad : ''}</td>
      <td class="td-costo">${formatearCOP(labor.costo)}</td>
      <td>${labor.responsable || '—'}</td>
      <td>
        <div class="acciones-td">
          <button class="icon-btn" onclick="editarLabor('${labor.id}')" title="Editar">✏️</button>
          <button class="icon-btn" onclick="eliminarLabor('${labor.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');

  actualizarResumen(filtradas);
}

function formatearCOP(valor) {
  return '$' + Number(valor || 0).toLocaleString('es-CO');
}

function actualizarResumen(filtradas) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const delMes = laboresCache.filter(l => new Date(l.fecha + 'T00:00:00') >= inicioMes);
  const costoMes = delMes.reduce((sum, l) => sum + Number(l.costo || 0), 0);

  document.getElementById('resTotal').textContent = filtradas.length;
  document.getElementById('resMes').textContent = delMes.length;
  document.getElementById('resCostoMes').textContent = formatearCOP(costoMes);
}

// ---------------- FIRESTORE: escucha en tiempo real ----------------
function iniciarEscucha() {
  laboresRef.orderBy('fecha', 'desc').onSnapshot(snapshot => {
    laboresCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderLabores();
  }, error => {
    mostrarToast('Error cargando labores: ' + error.message, true);
  });

  cargarLotes();

  tenantRef.get().then(doc => {
    document.getElementById('nombreFinca').textContent = doc.exists ? (doc.data().nombre || TENANT_SLUG) : TENANT_SLUG;
  });
}

// ---------------- FILTROS ----------------
document.getElementById('filtroLote').addEventListener('change', (e) => {
  filtroLote = e.target.value;
  renderLabores();
});
document.getElementById('filtroTipo').addEventListener('change', (e) => {
  filtroTipo = e.target.value;
  renderLabores();
});

// ---------------- MODAL / CRUD ----------------
function abrirModal(labor = null) {
  document.getElementById('modalOverlay').classList.add('abierto');
  document.getElementById('formLabor').reset();
  if (labor) {
    document.getElementById('modalTitulo').textContent = 'Editar labor';
    document.getElementById('laborId').value = labor.id;
    document.getElementById('lote_id').value = labor.lote_id;
    document.getElementById('tipo').value = labor.tipo;
    document.getElementById('fecha').value = labor.fecha;
    document.getElementById('costo').value = labor.costo;
    document.getElementById('insumo_usado').value = labor.insumo_usado || '';
    document.getElementById('cantidad').value = labor.cantidad || '';
    document.getElementById('responsable').value = labor.responsable || '';
    document.getElementById('notas').value = labor.notas || '';
  } else {
    document.getElementById('modalTitulo').textContent = 'Registrar labor';
    document.getElementById('laborId').value = '';
    document.getElementById('fecha').value = new Date().toISOString().slice(0, 10);
  }
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('abierto');
}

function editarLabor(id) {
  const labor = laboresCache.find(l => l.id === id);
  if (labor) abrirModal(labor);
}

async function eliminarLabor(id) {
  if (!confirm('¿Eliminar este registro de labor? Esta acción no se puede deshacer.')) return;
  try {
    await laboresRef.doc(id).delete();
    mostrarToast('Labor eliminada');
  } catch (e) {
    mostrarToast('Error al eliminar: ' + e.message, true);
  }
}

document.getElementById('formLabor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('laborId').value;
  const datos = {
    lote_id: document.getElementById('lote_id').value,
    tipo: document.getElementById('tipo').value,
    fecha: document.getElementById('fecha').value,
    costo: parseFloat(document.getElementById('costo').value) || 0,
    insumo_usado: document.getElementById('insumo_usado').value.trim(),
    cantidad: document.getElementById('cantidad').value.trim(),
    responsable: document.getElementById('responsable').value.trim(),
    notas: document.getElementById('notas').value.trim(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await laboresRef.doc(id).update(datos);
      mostrarToast('Labor actualizada');
    } else {
      datos.creado = firebase.firestore.FieldValue.serverTimestamp();
      await laboresRef.add(datos);
      mostrarToast('Labor registrada');
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
    console.warn('Usuario no autenticado. Conecta tu flujo de login aquí.');
  }
});