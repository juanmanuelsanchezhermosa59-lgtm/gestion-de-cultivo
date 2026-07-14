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

const tenantRef = db.collection('tenants').doc(TENANT_SLUG);
const lotesRef = db.collection('tenants').doc(TENANT_SLUG).collection('lotes');

// Coordenadas por defecto: Campoalegre, Huila (ajustables en "Cambiar ubicación")
const COORDS_DEFAULT = { lat: 2.689, lon: -75.3266 };

let lotesCache = [];
let pronosticoCache = null;
let whatsappNumero = null;

// ---------------- ETAPAS FENOLÓGICAS DEL ARROZ (igual que en lotes.js) ----------------
const ETAPAS = [
  { nombre: 'Germinación',        inicio: 0.00 },
  { nombre: 'Macollamiento',      inicio: 0.13 },
  { nombre: 'Elongación de tallo',inicio: 0.35 },
  { nombre: 'Embuchamiento',      inicio: 0.55 },
  { nombre: 'Floración',          inicio: 0.68 },
  { nombre: 'Llenado de grano',   inicio: 0.78 },
];

function etapaActual(diasTranscurridos, cicloDias) {
  const frac = Math.min(Math.max(diasTranscurridos / cicloDias, 0), 1);
  let actual = ETAPAS[0];
  for (const e of ETAPAS) { if (frac >= e.inicio) actual = e; }
  return actual;
}

function diasEntre(fechaISO) {
  const hoy = new Date();
  const inicio = new Date(fechaISO + 'T00:00:00');
  return Math.floor((hoy - inicio) / (1000 * 60 * 60 * 24));
}

// ---------------- MAPEO DE CÓDIGOS DE CLIMA (Open-Meteo / WMO) ----------------
function iconoClima(codigo) {
  if (codigo === 0) return '☀️';
  if ([1, 2].includes(codigo)) return '🌤️';
  if (codigo === 3) return '☁️';
  if ([45, 48].includes(codigo)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(codigo)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(codigo)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(codigo)) return '❄️';
  if ([95, 96, 99].includes(codigo)) return '⛈️';
  return '🌡️';
}

function nombreDia(fechaISO, index) {
  if (index === 0) return 'Hoy';
  const fecha = new Date(fechaISO + 'T00:00:00');
  return fecha.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
}

// ---------------- OBTENER UBICACIÓN Y WHATSAPP GUARDADOS ----------------
async function obtenerCoords() {
  const doc = await tenantRef.get();
  if (doc.exists) {
    whatsappNumero = doc.data().whatsapp_numero || null;
    if (doc.data().lat && doc.data().lon) {
      return { lat: doc.data().lat, lon: doc.data().lon };
    }
  }
  return COORDS_DEFAULT;
}

// ---------------- AVISAR POR WHATSAPP ----------------
function avisarWhatsApp(tituloAlerta, mensaje) {
  if (!whatsappNumero) {
    alert('Primero configura un número de WhatsApp con el botón "📲 Configurar WhatsApp".');
    return;
  }
  const texto = encodeURIComponent(`🌾 ArrozGestión - Alerta de clima\n${tituloAlerta}\n${mensaje}`);
  window.open(`https://wa.me/${whatsappNumero}?text=${texto}`, '_blank');
}

function toggleFormWhatsapp() {
  document.getElementById('formWhatsapp').classList.toggle('abierto');
  if (whatsappNumero) document.getElementById('inputWhatsapp').value = whatsappNumero;
}

document.getElementById('guardarWhatsapp').addEventListener('click', async () => {
  const numero = document.getElementById('inputWhatsapp').value.replace(/\D/g, '');
  if (numero.length < 10) { alert('Ingresa un número válido con indicativo de país (ej: 573001234567).'); return; }

  await tenantRef.update({ whatsapp_numero: numero });
  whatsappNumero = numero;
  document.getElementById('formWhatsapp').classList.remove('abierto');
  alert('Número de WhatsApp guardado.');
});

// ---------------- LLAMADA A OPEN-METEO (gratis, sin API key) ----------------
async function obtenerPronostico(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max` +
    `&timezone=auto&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo obtener el pronóstico del clima');
  return res.json();
}

// ---------------- RENDER: TARJETAS DE PRONÓSTICO ----------------
function renderPronostico(data) {
  const cont = document.getElementById('pronosticoGrid');
  const dias = data.daily.time;

  cont.innerHTML = dias.map((fechaISO, i) => {
    const codigo = data.daily.weathercode[i];
    const tempMax = Math.round(data.daily.temperature_2m_max[i]);
    const tempMin = Math.round(data.daily.temperature_2m_min[i]);
    const lluvia = data.daily.precipitation_sum[i];
    const viento = Math.round(data.daily.windspeed_10m_max[i]);

    return `
    <div class="dia-card ${i === 0 ? 'hoy' : ''}">
      <div class="dia-nombre">${nombreDia(fechaISO, i)}</div>
      <div class="dia-icono">${iconoClima(codigo)}</div>
      <div class="dia-temp">${tempMax}° <span class="dia-temp-min">/ ${tempMin}°</span></div>
      <div class="dia-lluvia">${lluvia > 0 ? '💧 ' + lluvia.toFixed(1) + ' mm' : 'Sin lluvia'}</div>
      <div class="dia-viento">viento ${viento} km/h</div>
    </div>`;
  }).join('');
}

// ---------------- RECOMENDACIONES GENERALES (hoy + próximas 48h) ----------------
function renderRecomendacionesGenerales(data) {
  const lluviaHoy = data.daily.precipitation_sum[0];
  const lluviaManana = data.daily.precipitation_sum[1] || 0;
  const vientoHoy = data.daily.windspeed_10m_max[0];
  const tempMaxHoy = data.daily.temperature_2m_max[0];

  // --- Fumigación / aplicación de agroquímicos ---
  let fumigacion = { estado: 'favorable', texto: 'Buenas condiciones: sin lluvia próxima y viento moderado.' };
  if (lluviaHoy > 2 || lluviaManana > 2) {
    fumigacion = { estado: 'desfavorable', texto: 'Se espera lluvia en las próximas horas: el producto puede lavarse. Mejor espera.' };
  } else if (vientoHoy > 20) {
    fumigacion = { estado: 'precaucion', texto: `Viento de hasta ${Math.round(vientoHoy)} km/h: riesgo de deriva. Aplica temprano en la mañana.` };
  }

  // --- Riego ---
  let riego = { estado: 'favorable', texto: 'No se espera lluvia significativa: procede con el riego programado.' };
  if (lluviaHoy > 5 || lluviaManana > 5) {
    riego = { estado: 'precaucion', texto: 'Se espera lluvia considerable: podrías posponer el riego y ahorrar agua/costo.' };
  }

  // --- Calor / estrés térmico ---
  let calor = { estado: 'favorable', texto: `Máxima de ${Math.round(tempMaxHoy)}°C: dentro del rango normal para el cultivo (16-35°C).` };
  if (tempMaxHoy > 35) {
    calor = { estado: 'precaucion', texto: `Máxima de ${Math.round(tempMaxHoy)}°C: calor por encima del ideal, vigila estrés hídrico.` };
  } else if (tempMaxHoy < 18) {
    calor = { estado: 'precaucion', texto: `Máxima de ${Math.round(tempMaxHoy)}°C: temperatura baja, puede ralentizar el crecimiento.` };
  }

  const cont = document.getElementById('recosGenerales');
  cont.innerHTML = `
    ${tarjetaReco('💦 Fumigación / aplicación', fumigacion)}
    ${tarjetaReco('🚿 Riego', riego)}
    ${tarjetaReco('🌡️ Estrés térmico', calor)}
  `;
}

function tarjetaReco(titulo, reco) {
  return `
    <div class="reco-card ${reco.estado}">
      <div class="reco-titulo">${titulo}</div>
      <span class="reco-estado ${reco.estado}">${textoEstado(reco.estado)}</span>
      <div class="reco-texto">${reco.texto}</div>
    </div>`;
}

function textoEstado(estado) {
  return { favorable: 'Favorable', precaucion: 'Precaución', desfavorable: 'No recomendado' }[estado];
}

// ---------------- ALERTAS POR LOTE (cruce etapa fenológica + pronóstico) ----------------
function renderAlertasLotes(data) {
  const cont = document.getElementById('lotesAlertas');
  const vacio = document.getElementById('vacioLotes');

  const activos = lotesCache.filter(l => l.estado === 'activo');
  if (activos.length === 0) {
    cont.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  // Lluvia acumulada en los próximos 5 días
  const lluviaProximos5 = data.daily.precipitation_sum.slice(0, 5).reduce((a, b) => a + b, 0);
  const diasConLluviaFuerte = data.daily.precipitation_sum.slice(0, 5).filter(mm => mm > 10).length;

  cont.innerHTML = activos.map(lote => {
    const dias = diasEntre(lote.fecha_siembra);
    const etapa = etapaActual(dias, lote.ciclo_dias);
    const diasRestantes = lote.ciclo_dias - dias;

    let riesgo = false;
    let mensaje = 'Condiciones normales para esta etapa.';

    if (etapa.nombre === 'Floración' && lluviaProximos5 > 25) {
      riesgo = true;
      mensaje = `⚠ Floración con lluvia acumulada de ${lluviaProximos5.toFixed(0)} mm en 5 días: riesgo de mala polinización.`;
    } else if (diasRestantes <= 10 && diasRestantes > 0 && diasConLluviaFuerte > 0) {
      riesgo = true;
      mensaje = `⚠ Se acerca la cosecha (${diasRestantes}d) y hay ${diasConLluviaFuerte} día(s) de lluvia fuerte pronosticada: riesgo de atraso o pérdida de calidad.`;
    } else if (diasRestantes <= 0) {
      mensaje = 'Lote listo para cosechar: revisa la ventana de días secos para programar la recolección.';
    }

    return `
    <div class="alerta-lote ${riesgo ? 'riesgo' : ''}">
      <div class="alerta-lote-info">
        <div class="alerta-lote-nombre">${lote.nombre}</div>
        <div class="alerta-lote-etapa">${etapa.nombre} · ${diasRestantes > 0 ? diasRestantes + ' días para cosecha' : 'lista para cosechar'}</div>
      </div>
      <div class="alerta-lote-mensaje">${mensaje}</div>
      ${riesgo ? `<button class="btn-wsp btn-wsp-sm" onclick="avisarWhatsApp('${lote.nombre}', '${mensaje.replace(/'/g, "\\'")}')">📲 Avisar</button>` : ''}
    </div>`;
  }).join('');
}

// ---------------- CARGA PRINCIPAL ----------------
async function cargarClima() {
  try {
    const { lat, lon } = await obtenerCoords();
    document.getElementById('ubicacionTexto').textContent = `Pronóstico para ${lat.toFixed(3)}, ${lon.toFixed(3)}`;

    const data = await obtenerPronostico(lat, lon);
    pronosticoCache = data;

    renderPronostico(data);
    renderRecomendacionesGenerales(data);
    renderAlertasLotes(data);
  } catch (err) {
    document.getElementById('pronosticoGrid').innerHTML =
      `<div class="vacio">No pudimos cargar el clima: ${err.message}</div>`;
  }
}

function cargarLotes() {
  lotesRef.onSnapshot(snapshot => {
    lotesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (pronosticoCache) renderAlertasLotes(pronosticoCache);
  });
}

// ---------------- CAMBIAR UBICACIÓN ----------------
function toggleFormUbicacion() {
  document.getElementById('formUbicacion').classList.toggle('abierto');
}

document.getElementById('guardarUbicacion').addEventListener('click', async () => {
  const lat = parseFloat(document.getElementById('inputLat').value);
  const lon = parseFloat(document.getElementById('inputLon').value);
  if (isNaN(lat) || isNaN(lon)) { alert('Ingresa coordenadas válidas.'); return; }

  await tenantRef.update({ lat, lon });
  document.getElementById('formUbicacion').classList.remove('abierto');
  cargarClima();
});

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
    tenantRef.get().then(doc => {
      document.getElementById('nombreFinca').textContent = doc.exists ? (doc.data().nombre || TENANT_SLUG) : TENANT_SLUG;
    });
    cargarLotes();
    cargarClima();
  } else {
    console.warn('Usuario no autenticado. Conecta tu flujo de login aquí.');
  }
});
