(function(){
  const btn = document.getElementById('home-btn');
  if(!btn) return;

  btn.addEventListener('click', () => {
    window.location.href = '../page-LogIn/index.html';
  });
})();
