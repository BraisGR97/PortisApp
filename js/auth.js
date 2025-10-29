// LOGIN
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm['email'].value;
    const password = loginForm['password'].value;

    auth.signInWithEmailAndPassword(email, password)
      .then(() => {
        window.location.href = 'menu.html';
      })
      .catch(err => alert('Error: ' + err.message));
  });
}

// REGISTRO
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = registerForm['email'].value;
    const password = registerForm['password'].value;

    auth.createUserWithEmailAndPassword(email, password)
      .then(() => {
        alert('Cuenta creada correctamente');
        window.location.href = 'index.html';
      })
      .catch(err => alert('Error: ' + err.message));
  });
}
