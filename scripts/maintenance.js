// Redirige al menú principal
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'main.html';
});

// Modal
const addBtn = document.getElementById('addBtn');
const addModal = document.getElementById('addModal');
const closeModal = document.getElementById('closeModal');

addBtn.addEventListener('click', () => {
  addModal.style.display = 'flex'; // solo aparece al pulsar Añadir
});

closeModal.addEventListener('click', () => {
  addModal.style.display = 'none';
});

// Cerrar modal si se hace click fuera del contenido
window.addEventListener('click', (e) => {
  if (e.target === addModal) addModal.style.display = 'none';
});

// Lista y almacenamiento
const itemList = document.getElementById('itemList');
const confirmAdd = document.getElementById('confirmAdd');
const newItemInput = document.getElementById('newItem');

// Cargar lista desde localStorage
let items = JSON.parse(localStorage.getItem('maintenanceItems')) || [];
renderList();

confirmAdd.addEventListener('click', () => {
  const value = newItemInput.value.trim();
  if (!value) return;

  items.push(value);
  localStorage.setItem('maintenanceItems', JSON.stringify(items));
  newItemInput.value = '';
  addModal.style.display = 'none';
  renderList();
});

function renderList() {
  itemList.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    itemList.appendChild(li);
  });
}
