// Variables en inglés (nombres de archivo/variables en inglés)
document.getElementById('year').textContent = new Date().getFullYear();

const cta = document.getElementById('cta');
cta.addEventListener('click', () => {
  alert('¡Has hecho clic! (ejemplo)');
});

// Formulario: simulación de envío (solo demo)
const form = document.getElementById('contactForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);
  console.log('Contacto demo:', Object.fromEntries(data.entries()));
  alert('Gracias — (esto es solo un demo, no se envía en realidad)');
});
