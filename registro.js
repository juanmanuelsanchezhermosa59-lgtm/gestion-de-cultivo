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

function generarSlug(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function slugDisponible(slug) {
  const doc = await db.collection('tenants').doc(slug).get();
  return !doc.exists;
}

document.getElementById('nombreFinca').addEventListener('input', async (e) => {
  const slugBase = generarSlug(e.target.value);
  const hint = document.getElementById('slugHint');
  if (!slugBase) { hint.textContent = ''; return; }

  hint.textContent = `Verificando disponibilidad de "${slugBase}"...`;
  hint.className = 'campo-hint';

  const disponible = await slugDisponible(slugBase);
  if (disponible) {
    hint.textContent = `✓ URL disponible: ${slugBase}`;
    hint.className = 'campo-hint slug-ok';
  } else {
    hint.textContent = `✗ Ya existe una finca con ese nombre, usa uno distinto`;
    hint.className = 'campo-hint slug-error';
  }
});

document.getElementById('formRegistro').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('btnRegistrar');
  const errorBox = document.getElementById('mensajeError');
  errorBox.className = 'mensaje-error';

  const nombreFinca = document.getElementById('nombreFinca').value.trim();
  const propietario = document.getElementById('propietario').value.trim();
  const ubicacion = document.getElementById('ubicacion').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const slug = generarSlug(nombreFinca);

  btn.disabled = true;
  btn.textContent = 'Creando finca...';

  try {
    // 1. Verificar disponibilidad del slug una última vez
    const disponible = await slugDisponible(slug);
    if (!disponible) {
      throw new Error('Ya existe una finca registrada con ese nombre. Elige otro.');
    }

    // 2. Crear cuenta de autenticación
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // 3. Crear el documento del tenant en modo "bootstrap"
    await db.collection('tenants').doc(slug).set({
      nombre: nombreFinca,
      propietario: propietario,
      ubicacion: ubicacion,
      plan: 'trial',
      fecha_registro: firebase.firestore.FieldValue.serverTimestamp(),
      bootstrap: true
    });

    // 4. Crear el usuario admin dentro del tenant
    await db.collection('tenants').doc(slug).collection('usuarios').doc(uid).set({
      rol: 'admin',
      email: email,
      nombre: propietario,
      creado: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 4b. Guardar el índice uid -> slug para que el login pueda encontrar esta finca
    await db.collection('usuarios_index').doc(uid).set({ slug: slug });

    // 5. Cerrar la ventana de bootstrap
    await db.collection('tenants').doc(slug).update({ bootstrap: false });

    // 6. Guardar el slug localmente para que los módulos lo usen
    localStorage.setItem('tenant_slug', slug);

    btn.textContent = '¡Listo! Redirigiendo...';
    window.location.href = 'lotes.html';

  } catch (err) {
    let mensaje = err.message;
    if (err.code === 'auth/email-already-in-use') mensaje = 'Ese correo ya está registrado.';
    if (err.code === 'auth/weak-password') mensaje = 'La contraseña debe tener al menos 6 caracteres.';

    errorBox.textContent = mensaje;
    errorBox.className = 'mensaje-error mostrar';
    btn.disabled = false;
    btn.textContent = 'Registrar mi finca';
  }
});