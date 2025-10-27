// Redirige al menú principal
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'main.html';
});

// Mostrar/ocultar formulario
const addBtn = document.getElementById('addBtn');
const addForm = document.getElementById('addForm');
addBtn.addEventListener('click', () => {
  addForm.style.display = addForm.style.display === 'none' ? 'flex' : 'none';
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
  renderList();
});

function renderList() {
  itemList.innerHTML = '';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item;
    itemList.appendChild(li);
  });
}
