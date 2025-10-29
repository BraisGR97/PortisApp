// menu.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Verifica si hay usuario autenticado
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Si no hay usuario, vuelve al login
    window.location.href = "index.html";
  }
});

// Botones del menú
document.getElementById("repairs-btn").addEventListener("click", () => {
  window.location.href = "repairs.html";
});

document.getElementById("records-btn").addEventListener("click", () => {
  window.location.href = "records.html";
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
});
