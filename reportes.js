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
const laboresRef = db.collection('tenants').doc(TENANT_SLUG).collection('labores');
const cosechasRef = db.collection('tenants').doc(TENANT_SLUG).collection('cosechas');
const tenantRef = db.collection('tenants').doc(TENANT_SLUG);

let lotesCache = [];
let laboresCache = [];
let cosechasCache = [];

function formatearCOP(valor) {
  return '$' + Math.round(Number(valor || 0)).toLocaleString('es-CO');
}

// ---------------- CÁLCULO POR LOTE ----------------
function calcularDatosLote(lote) {
  const costo = laboresCache
    .filter(l => l.lote_id === lote.id)
    .reduce((sum, l) => sum + Number(l.costo || 0), 0);

  const cosechasDelLote = cosechasCache.filter(c => c.lote_id === lote.id);
  const ingreso = cosechasDelLote.reduce((sum, c) => sum + (Number(c.cantidad_kg || 0) * Number(c.precio_venta_kg || 0)), 0);
  const kgTotal = cosechasDelLote.reduce((sum, c) => sum + Number(c.cantidad_kg || 0), 0);

  const utilidad = ingreso - costo;
  const utilidadPorHa = lote.area_ha > 0 ? utilidad / lote.area_ha : 0;

  return { costo, ingreso, kgTotal, utilidad, utilidadPorHa };
}

// ---------------- RENDER ----------------
function renderReportes() {
  const cont = document.getElementById('lotesRentabilidad');
  const vacio = document.getElementById('vacioMsg');

  if (lotesCache.length === 0) {
    cont.innerHTML = '';
    vacio.style.display = 'block';
    actualizarResumenGeneral();
    return;
  }
  vacio.style.display = 'none';

  cont.innerHTML = lotesCache.map(lote => {
    const { costo, ingreso, kgTotal, utilidad, utilidadPorHa } = calcularDatosLote(lote);
    const maxBarra = Math.max(costo, ingreso, 1);
    const anchoIngreso = (ingreso / maxBarra) * 100;
    const anchoCosto = (costo / maxBarra) * 100;
    const utilClase = utilidad >= 0 ? 'positivo' : 'negativo';

    return `
    <div class="lote-rent-card">
      <div class="lote-rent-header">
        <div class="lote-rent-nombre">${lote.nombre}</div>
        <div class="lote-rent-meta">${lote.area_ha} ha · ${lote.variedad}</div>
      </div>

      <div class="comparacion-barras">
        <div class="barra-fila">
          <div class="barra-label">Ingreso</div>
          <div class="barra-track"><div class="barra-fill ingreso" style="width:${anchoIngreso}%;"></div></div>
          <div class="barra-valor">${formatearCOP(ingreso)}</div>
        </div>
        <div class="barra-fila">
          <div class="barra-label">Costo</div>
          <div class="barra-track"><div class="barra-fill costo" style="width:${anchoCosto}%;"></div></div>
          <div class="barra-valor">${formatearCOP(costo)}</div>
        </div>
      </div>

      <div class="lote-rent-footer">
        <div>
          <div class="utilidad-label">Utilidad neta (${kgTotal.toLocaleString('es-CO')} kg cosechados)</div>
          <div class="utilidad-valor ${utilClase}">${formatearCOP(utilidad)}</div>
        </div>
        <div class="rent-por-ha">${formatearCOP(utilidadPorHa)} / ha</div>
      </div>
    </div>`;
  }).join('');

  actualizarResumenGeneral();
}

function actualizarResumenGeneral() {
  let ingresoTotal = 0, costoTotal = 0, kgTotal = 0, hectareasTotal = 0;

  lotesCache.forEach(lote => {
    const d = calcularDatosLote(lote);
    ingresoTotal += d.ingreso;
    costoTotal += d.costo;
    kgTotal += d.kgTotal;
    hectareasTotal += Number(lote.area_ha || 0);
  });

  const utilidadTotal = ingresoTotal - costoTotal;

  document.getElementById('resIngreso').textContent = formatearCOP(ingresoTotal);
  document.getElementById('resCosto').textContent = formatearCOP(costoTotal);

  const elUtilidad = document.getElementById('resUtilidad');
  elUtilidad.textContent = formatearCOP(utilidadTotal);
  elUtilidad.className = 'resumen-valor ' + (utilidadTotal >= 0 ? 'positivo' : 'negativo');

  document.getElementById('resHectareas').textContent = hectareasTotal.toFixed(1) + ' ha';
}

// ---------------- FIRESTORE: escucha en tiempo real ----------------
function iniciarEscucha() {
  lotesRef.onSnapshot(snapshot => {
    lotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderReportes();
  });

  laboresRef.onSnapshot(snapshot => {
    laboresCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderReportes();
  });

  cosechasRef.onSnapshot(snapshot => {
    cosechasCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderReportes();
  });

  tenantRef.get().then(doc => {
    document.getElementById('nombreFinca').textContent = doc.exists ? (doc.data().nombre || TENANT_SLUG) : TENANT_SLUG;
  });
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