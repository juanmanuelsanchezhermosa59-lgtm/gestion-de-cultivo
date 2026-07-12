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

const cosechasRef = db.collection('tenants').doc(TENANT_SLUG).collection('cosechas');
const lotesRef = db.collection('tenants').doc(TENANT_SLUG).collection('lotes');
const laboresRef = db.collection('tenants').doc(TENANT_SLUG).collection('labores');
const tenantRef = db.collection('tenants').doc(TENANT_SLUG);

let cosechasCache = [];
let lotesCache = [];
let laboresCache = [];
let filtroLote = '';

// ---------------- CARGA DE LOTES (para el selector) ----------------
function cargarLotes() {
  lotesRef.onSnapshot(snapshot => {
    lotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    poblarSelectLotes();
    renderCosechas(); // re-render por si cambian nombres de lotes
  });
}

function cargarLabores() {
  laboresRef.onSnapshot(snapshot => {
    laboresCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCosechas(); // el costo por lote depende de labores
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

function costoAcumuladoLote(loteId) {
  return laboresCache
    .filter(l => l.lote_id === loteId)
    .reduce((sum, l) => sum + Number(l.costo || 0), 0);
}

// ---------------- RENDER ----------------
function renderCosechas() {
  const tbody = document.getElementById('cosechasBody');
  const vacio = document.getElementById('vacioMsg');
  const tablaWrap = document.getElementById('tablaWrap');

  let filtradas = cosechasCache;
  if (filtroLote) filtradas = filtradas.filter(c => c.lote_id === filtroLote);

  if (filtradas.length === 0) {
    tablaWrap.style.display = 'none';
    vacio.style.display = 'block';
    actualizarResumen(filtradas);
    return;
  }
  tablaWrap.style.display = 'block';
  vacio.style.display = 'none';

  tbody.innerHTML = filtradas.map(c => {
    const ingreso = Number(c.cantidad_kg || 0) * Number(c.precio_venta_kg || 0);
    return `
    <tr>
      <td class="td-fecha">${new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-CO')}</td>
      <td>${nombreLote(c.lote_id)}</td>
      <td class="td-num">${Number(c.cantidad_kg).toLocaleString('es-CO')} kg</td>
      <td class="td-num">${formatearCOP(c.precio_venta_kg)}/kg</td>
      <td class="td-num td-ingreso">${formatearCOP(ingreso)}</td>
      <td><span class="tag-calidad tag-${c.calidad}">${textoCalidad(c.calidad)}</span></td>
      <td>${c.humedad ? c.humedad + '%' : '—'}</td>
      <td>${c.comprador || '—'}</td>
      <td>
        <div class="acciones-td">
          <button class="icon-btn" onclick="editarCosecha('${c.id}')" title="Editar">✏️</button>
          <button class="icon-btn" onclick="eliminarCosecha('${c.id}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  actualizarResumen(filtradas);
}

function textoCalidad(cal) {
  return { primera: 'Primera', segunda: 'Segunda', descarte: 'Descarte' }[cal] || cal;
}

function formatearCOP(valor) {
  return '$' + Number(valor || 0).toLocaleString('es-CO');
}

function actualizarResumen(filtradas) {
  const totalKg = filtradas.reduce((sum, c) => sum + Number(c.cantidad_kg || 0), 0);
  const ingresoTotal = filtradas.reduce((sum, c) => sum + (Number(c.cantidad_kg || 0) * Number(c.precio_venta_kg || 0)), 0);

  // Costo total: suma de labores de los lotes que aparecen en las cosechas filtradas (sin duplicar por lote)
  const lotesInvolucrados = [...new Set(filtradas.map(c => c.lote_id))];
  const costoTotal = lotesInvolucrados.reduce((sum, loteId) => sum + costoAcumuladoLote(loteId), 0);

  const utilidad = ingresoTotal - costoTotal;

  document.getElementById('resKg').textContent = totalKg.toLocaleString('es-CO');
  document.getElementById('resIngreso').textContent = formatearCOP(ingresoTotal);
  document.getElementById('resCosto').textContent = formatearCOP(costoTotal);

  const elUtilidad = document.getElementById('resUtilidad');
  elUtilidad.textContent = formatearCOP(utilidad);
  elUtilidad.className = 'resumen-valor ' + (utilidad >= 0 ? 'positivo' : 'negativo');
}

// ---------------- FIRESTORE: escucha en tiempo real ----------------
function iniciarEscucha() {
  cosechasRef.orderBy('fecha', 'desc').onSnapshot(snapshot => {
    cosechasCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCosechas();
  }, error => {
    mostrarToast('Error cargando cosechas: ' + error.message, true);
  });

  cargarLotes();
  cargarLabores();

  tenantRef.get().then(doc => {
    document.getElementById('nombreFinca').textContent = doc.exists ? (doc.data().nombre || TENANT_SLUG) : TENANT_SLUG;
  });
}

// ---------------- FILTRO ----------------
document.getElementById('filtroLote').addEventListener('change', (e) => {
  filtroLote = e.target.value;
  renderCosechas();
});

// ---------------- MODAL / CRUD ----------------
function abrirModal(cosecha = null) {
  document.getElementById('modalOverlay').classList.add('abierto');
  document.getElementById('formCosecha').reset();
  if (cosecha) {
    document.getElementById('modalTitulo').textContent = 'Editar registro de cosecha';
    document.getElementById('cosechaId').value = cosecha.id;
    document.getElementById('lote_id').value = cosecha.lote_id;
    document.getElementById('fecha').value = cosecha.fecha;
    document.getElementById('cantidad_kg').value = cosecha.cantidad_kg;
    document.getElementById('precio_venta_kg').value = cosecha.precio_venta_kg;
    document.getElementById('humedad').value = cosecha.humedad || '';
    document.getElementById('calidad').value = cosecha.calidad || 'primera';
    document.getElementById('comprador').value = cosecha.comprador || '';
  } else {
    document.getElementById('modalTitulo').textContent = 'Registrar cosecha';
    document.getElementById('cosechaId').value = '';
    document.getElementById('fecha').value = new Date().toISOString().slice(0, 10);
  }
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('abierto');
}

function editarCosecha(id) {
  const c = cosechasCache.find(c => c.id === id);
  if (c) abrirModal(c);
}

async function eliminarCosecha(id) {
  if (!confirm('¿Eliminar este registro de cosecha? Esta acción no se puede deshacer.')) return;
  try {
    await cosechasRef.doc(id).delete();
    mostrarToast('Registro eliminado');
  } catch (e) {
    mostrarToast('Error al eliminar: ' + e.message, true);
  }
}

document.getElementById('formCosecha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('cosechaId').value;
  const datos = {
    lote_id: document.getElementById('lote_id').value,
    fecha: document.getElementById('fecha').value,
    cantidad_kg: parseFloat(document.getElementById('cantidad_kg').value) || 0,
    precio_venta_kg: parseFloat(document.getElementById('precio_venta_kg').value) || 0,
    humedad: parseFloat(document.getElementById('humedad').value) || null,
    calidad: document.getElementById('calidad').value,
    comprador: document.getElementById('comprador').value.trim(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await cosechasRef.doc(id).update(datos);
      mostrarToast('Cosecha actualizada');
    } else {
      datos.creado = firebase.firestore.FieldValue.serverTimestamp();
      await cosechasRef.add(datos);
      // Marca el lote como cosechado automáticamente
      await lotesRef.doc(datos.lote_id).update({ estado: 'cosechado' });
      mostrarToast('Cosecha registrada');
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