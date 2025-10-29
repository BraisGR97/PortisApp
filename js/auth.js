import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ==== LOGIN ==== */
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const message = document.getElementById("loginMessage");

    try {
      const q = query(collection(db, "users"), where("username", "==", username));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        message.textContent = "Usuario no encontrado.";
        message.style.color = "#e53935";
        return;
      }

      let found = false;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.password === password) {
          found = true;
        }
      });

      if (found) {
        message.textContent = "Inicio de sesión correcto ✅";
        message.style.color = "#4CAF50";
        setTimeout(() => {
          window.location.href = "menu.html";
        }, 1200);
      } else {
        message.textContent = "Contraseña incorrecta.";
        message.style.color = "#e53935";
      }
    } catch (error) {
      console.error("Error en login:", error);
      message.textContent = "Error de conexión.";
      message.style.color = "#e53935";
    }
  });
}

/* ==== REGISTRO ==== */
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  const usernameInput = document.getElementById("registerUsername");
  const passInput = document.getElementById("registerPassword");
  const passRepeatInput = document.getElementById("registerPasswordRepeat");
  const message = document.getElementById("registerMessage");
  const backToLoginBtn = document.getElementById("backToLoginBtn");

  function checkPasswords() {
    if (passInput.value.length === 0 && passRepeatInput.value.length === 0) {
      passInput.style.borderColor = "#ccc";
      passRepeatInput.style.borderColor = "#ccc";
      return;
    }

    if (passInput.value === passRepeatInput.value) {
      passInput.style.borderColor = "#4CAF50";
      passRepeatInput.style.borderColor = "#4CAF50";
    } else {
      passInput.style.borderColor = "#e53935";
      passRepeatInput.style.borderColor = "#e53935";
    }
  }

  passInput.addEventListener("input", checkPasswords);
  passRepeatInput.addEventListener("input", checkPasswords);

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passInput.value.trim();
    const repeatPassword = passRepeatInput.value.trim();

    if (password !== repeatPassword) {
      message.textContent = "Las contraseñas no coinciden.";
      message.style.color = "#e53935";
      return;
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      message.textContent = "Ese usuario ya existe.";
      message.style.color = "#e53935";
      return;
    }

    try {
      await addDoc(usersRef, {
        username: username,
        password: password,
      });

      message.textContent = "Cuenta creada con éxito ✅";
      message.style.color = "#4CAF50";

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1500);
    } catch (error) {
      console.error("Error al registrar:", error);
      message.textContent = "Error al crear la cuenta.";
      message.style.color = "#e53935";
    }
  });

  backToLoginBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}
