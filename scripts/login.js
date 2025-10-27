// login.js
// Se espera una estructura JSON en /data/credentials.json con:
// { "users": { "brais": "pass123", "admin": "1234" } }

const form = document.getElementById('loginForm');
const msg = document.getElementById('loginMessage');

async function loadCredentials(){
  try {
    const res = await fetch('data/credentials.json', {cache: "no-store"});
    if (!res.ok) throw new Error('No credentials file');
    const json = await res.json();
    return json.users || {};
  } catch (e) {
    console.error('Error loading credentials:', e);
    return {}; // vacío = nadie puede entrar hasta que añadas credenciales
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';

  const user = document.getElementById('username').value.trim().toLowerCase();
  const pass = document.getElementById('password').value;

  if (!user || !pass) {
    msg.textContent = 'Rellena usuario y contraseña';
    return;
  }

  const credentials = await loadCredentials();

  if (credentials[user] && credentials[user] === pass) {
    // login correcto
    localStorage.setItem('currentUser', user);
    // opcional: intentar cargar data/user.json y guardarla en localStorage
    try {
      const r = await fetch(`data/${user}.json`, {cache: "no-store"});
      if (r.ok) {
        const userdata = await r.json();
        localStorage.setItem('userData', JSON.stringify(userdata));
      } else {
        localStorage.removeItem('userData');
      }
    } catch (e) {
      localStorage.removeItem('userData');
    }
    window.location.href = 'main.html';
  } else {
    msg.textContent = 'Usuario o contraseña incorrectos';
  }
});
