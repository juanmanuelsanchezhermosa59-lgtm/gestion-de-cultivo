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

// Si ya hay sesión activa Y ya sabemos su finca, lo mandamos directo (evita
// mostrarle el formulario de login si ya estaba logueado).
auth.onAuthStateChanged(async (user) => {
  const slugGuardado = localStorage.getItem('tenant_slug');
  if (user && slugGuardado) {
    window.location.href = 'lotes.html';
  }
});

document.getElementById('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('btnLogin');
  const errorBox = document.getElementById('mensajeError');
  errorBox.className = 'mensaje-error';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // Buscar a qué finca pertenece este usuario
    const indexDoc = await db.collection('usuarios_index').doc(uid).get();

    if (!indexDoc.exists) {
      throw new Error('No encontramos una finca asociada a esta cuenta. Contacta al administrador.');
    }

    const slug = indexDoc.data().slug;
    localStorage.setItem('tenant_slug', slug);

    btn.textContent = '¡Listo! Redirigiendo...';
    window.location.href = 'lotes.html';

  } catch (err) {
    let mensaje = 'Correo o contraseña incorrectos.';
    if (err.message && err.message.includes('finca asociada')) mensaje = err.message;

    errorBox.textContent = mensaje;
    errorBox.className = 'mensaje-error mostrar';
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

// ---------------- RECUPERAR CONTRASEÑA ----------------
document.getElementById('linkOlvide').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const errorBox = document.getElementById('mensajeError');
  const exitoBox = document.getElementById('mensajeExito');
  errorBox.className = 'mensaje-error';
  exitoBox.className = 'mensaje-exito';

  if (!email) {
    errorBox.textContent = 'Escribe tu correo arriba primero para poder enviarte el enlace.';
    errorBox.className = 'mensaje-error mostrar';
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    exitoBox.textContent = `Te enviamos un enlace de recuperación a ${email}.`;
    exitoBox.className = 'mensaje-exito mostrar';
  } catch (err) {
    errorBox.textContent = 'No pudimos enviar el correo. Verifica que esté bien escrito.';
    errorBox.className = 'mensaje-error mostrar';
  }
});