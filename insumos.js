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

const insumosRef = db.collection('tenants').doc(TENANT_SLUG).collection('insumos');
const tenantRef = db.collection('tenants').doc(TENANT_SLUG);

let insumosCache = [];
let filtroCategoria = '';

const CATEGORIAS = {
  semilla: 'Semilla',
  fertilizante: 'Fertilizante',
  agroquimico: 'Agroquímico',
  otro: 'Otro'
};

// ---------------- RENDER ----------------
function renderInsumos() {
  const grid = document.getElementById('insumosGrid');
  const vacio = document.getElementById('vacioMsg');

  let filtrados = insumosCache;
  if (filtroCategoria) filtrados = filtrados.filter(i => i.categoria === filtroCategoria);

  if (filtrados.length === 0) {
    grid.innerHTML = '';
    vacio.style.display = 'block';
    actualizarResumen();
    return;
  }
  vacio.style.display = 'none';

  grid.innerHTML = filtrados.map(insumo => {
    const stockBajo = Number(insumo.stock) <= Number(insumo.stock_minimo || 0);
    const porcentaje = insumo.stock_minimo > 0
      ? Math.min((insumo.stock / (insumo.stock_minimo * 3)) * 100, 100)
      : 100;
    const colorBarra = stockBajo ? 'var(--rojo-alerta)' : 'var(--verde-tallo)';

    return `
    <div class="insumo-card ${stockBajo ? 'stock-bajo' : ''}">
      <div class="insumo-header">
        <div>
          <div class="insumo-nombre">${insumo.nombre}</div>
          <div class="insumo-categoria">${CATEGORIAS[insumo.categoria] || insumo.categoria}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" onclick="editarInsumo('${insumo.id}')" title="Editar">✏️</button>
          <button class="icon-btn" onclick="eliminarInsumo('${insumo.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>

      <div class="stock-barra-wrap">
        <div class="stock-barra">
          <div class="stock-barra-fill" style="width:${porcentaje}%; background:${colorBarra};"></div>
        </div>
        <div class="stock-texto">
          <span>Stock actual</span>
          <span class="stock-valor">${insumo.stock} ${insumo.unidad}</span>
        </div>
      </div>

      ${stockBajo ? `<span class="badge-alerta">⚠ Stock bajo (mínimo: ${insumo.stock_minimo} ${insumo.unidad})</span>` : ''}

      <div class="insumo-datos">
        <span>Costo unit.: <strong>${formatearCOP(insumo.costo_unitario)}</strong></span>
        <span>${insumo.proveedor || 'Sin proveedor'}</span>
      </div>
    </div>`;
  }).join('');

  actualizarResumen();
}

function formatearCOP(valor) {
  return '$' + Number(valor || 0).toLocaleString('es-CO');
}

function actualizarResumen() {
  const bajos = insumosCache.filter(i => Number(i.stock) <= Number(i.stock_minimo || 0));
  const valorTotal = insumosCache.reduce((sum, i) => sum + (Number(i.stock || 0) * Number(i.costo_unitario || 0)), 0);

  document.getElementById('resTotal').textContent = insumosCache.length;
  document.getElementById('resBajos').textContent = bajos.length;
  document.getElementById('resValor').textContent = formatearCOP(valorTotal);
}

// ---------------- FIRESTORE: escucha en tiempo real ----------------
function iniciarEscucha() {
  insumosRef.orderBy('nombre').onSnapshot(snapshot => {
    insumosCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderInsumos();
  }, error => {
    mostrarToast('Error cargando insumos: ' + error.message, true);
  });

  tenantRef.get().then(doc => {
    document.getElementById('nombreFinca').textContent = doc.exists ? (doc.data().nombre || TENANT_SLUG) : TENANT_SLUG;
  });
}

// ---------------- FILTRO ----------------
document.getElementById('filtroCategoria').addEventListener('change', (e) => {
  filtroCategoria = e.target.value;
  renderInsumos();
});

// ---------------- MODAL / CRUD ----------------
function abrirModal(insumo = null) {
  document.getElementById('modalOverlay').classList.add('abierto');
  document.getElementById('formInsumo').reset();
  if (insumo) {
    document.getElementById('modalTitulo').textContent = 'Editar insumo';
    document.getElementById('insumoId').value = insumo.id;
    document.getElementById('nombre').value = insumo.nombre;
    document.getElementById('categoria').value = insumo.categoria;
    document.getElementById('stock').value = insumo.stock;
    document.getElementById('stock_minimo').value = insumo.stock_minimo || 0;
    document.getElementById('unidad').value = insumo.unidad;
    document.getElementById('costo_unitario').value = insumo.costo_unitario || 0;
    document.getElementById('proveedor').value = insumo.proveedor || '';
  } else {
    document.getElementById('modalTitulo').textContent = 'Registrar insumo';
    document.getElementById('insumoId').value = '';
  }
}

function cerrarModal() {
  document.getElementById('modalOverlay').classList.remove('abierto');
}

function editarInsumo(id) {
  const insumo = insumosCache.find(i => i.id === id);
  if (insumo) abrirModal(insumo);
}

async function eliminarInsumo(id) {
  const insumo = insumosCache.find(i => i.id === id);
  if (!confirm(`¿Eliminar el insumo "${insumo.nombre}"? Esta acción no se puede deshacer.`)) return;
  try {
    await insumosRef.doc(id).delete();
    mostrarToast('Insumo eliminado');
  } catch (e) {
    mostrarToast('Error al eliminar: ' + e.message, true);
  }
}

document.getElementById('formInsumo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('insumoId').value;
  const datos = {
    nombre: document.getElementById('nombre').value.trim(),
    categoria: document.getElementById('categoria').value,
    stock: parseFloat(document.getElementById('stock').value) || 0,
    stock_minimo: parseFloat(document.getElementById('stock_minimo').value) || 0,
    unidad: document.getElementById('unidad').value.trim(),
    costo_unitario: parseFloat(document.getElementById('costo_unitario').value) || 0,
    proveedor: document.getElementById('proveedor').value.trim(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await insumosRef.doc(id).update(datos);
      mostrarToast('Insumo actualizado');
    } else {
      datos.creado = firebase.firestore.FieldValue.serverTimestamp();
      await insumosRef.add(datos);
      mostrarToast('Insumo registrado');
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