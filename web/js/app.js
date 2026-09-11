// IJRO Main App Controller & Router
document.addEventListener('DOMContentLoaded', () => {
  window.initFirebase();

  // Check saved session
  const savedUserId = localStorage.getItem('ijro_user_id');
  if (savedUserId) {
    window.onStoreChange('users', (users) => {
      if (!window.store.currentUser) {
        const found = users.find(u => u.id === savedUserId);
        if (found) {
          window.store.currentUser = found;
          routeUserToScreen(found);
        }
      }
    });
  }
});

function handleLogin(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  if (!username || !pass) {
    alert("Iltimos, login va parolni kiriting!");
    return;
  }

  const user = window.store.users.find(u => 
    u.username && u.username.toLowerCase() === username.toLowerCase() && u.password === pass
  );

  if (!user) {
    alert("Login yoki parol noto'g'ri! Iltimos, qayta tekshirib ko'ring.");
    return;
  }

  window.store.currentUser = user;
  localStorage.setItem('ijro_user_id', user.id);
  routeUserToScreen(user);
}

function handleLogout() {
  if (confirm("Haqiqatan ham tizimdan chiqmoqchimisiz?")) {
    window.store.currentUser = null;
    localStorage.removeItem('ijro_user_id');
    showScreen('login-screen');
    showToast("Tizimdan chiqildi");
  }
}

function routeUserToScreen(user) {
  if (user.role === 'MAYOR') {
    showScreen('mayor-screen');
    initMayorView();
  } else if (user.role === 'WORKER') {
    showScreen('worker-screen');
    initWorkerView();
  } else if (user.role === 'BIG_ADMIN' || user.role === 'ADMIN') {
    showScreen('admin-screen');
    initAdminView();
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
