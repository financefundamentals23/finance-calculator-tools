const firebaseConfig = {
  apiKey: "AIzaSyAfZz3aL7RV-LvFg-u4dL2Lo5CBu2zvtdQ",
  authDomain: "finance-fundamentals-a1724.firebaseapp.com",
  projectId: "finance-fundamentals-a1724",
  storageBucket: "finance-fundamentals-a1724.firebasestorage.app",
  messagingSenderId: "915652773310",
  appId: "1:915652773310:web:0cae43c6e0d03fe67065ef",
  measurementId: "G-31JDZRNZZJ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore ? firebase.firestore() : null;

function signInWithGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).then(function(){
    redirectAfterAuth();
  }).catch(function(err){
    console.error('Google sign-in failed:', err);
  });
}

function signOutUser(){
  showConfirm({
    title: 'Sign out?',
    message: "You'll need to sign in again to use the calculator.",
    confirmText: 'Sign out',
    cancelText: 'Cancel',
    danger: true
  }).then(function(ok){
    if(ok) auth.signOut();
  });
}

function redirectAfterAuth(){
  window.location.href = 'calculators.html';
}

// ---------- Email/password sign-in + sign-up (login.html) ----------
let authMode = 'signin';

function toggleAuthMode(){
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  updateAuthFormUI();
}

function updateAuthFormUI(){
  const title = document.getElementById('authFormTitle');
  if(!title) return; // not on the login page

  const submitBtn = document.getElementById('authSubmitBtn');
  const toggleText = document.getElementById('authToggleText');
  const toggleLink = document.getElementById('authToggleLink');
  const confirmField = document.getElementById('field-confirmPassword');
  const forgotLine = document.getElementById('authForgotLine');

  if(authMode === 'signup'){
    title.textContent = 'Create Account';
    submitBtn.textContent = 'Create Account';
    toggleText.textContent = 'Already have an account?';
    toggleLink.textContent = 'Sign in';
    if(confirmField) confirmField.style.display = 'flex';
    if(forgotLine) forgotLine.style.display = 'none';
  } else {
    title.textContent = 'Sign In';
    submitBtn.textContent = 'Sign In';
    toggleText.textContent = "Don't have an account?";
    toggleLink.textContent = 'Sign up';
    if(confirmField) confirmField.style.display = 'none';
    if(forgotLine) forgotLine.style.display = 'block';
  }
  clearAuthFormErrors();
}

function clearAuthFormErrors(){
  ['email', 'password', 'confirmPassword'].forEach(function(id){
    const field = document.getElementById('field-' + id);
    if(field) field.classList.remove('error');
  });
  const formError = document.getElementById('authFormError');
  if(formError) formError.textContent = '';
  const formNotice = document.getElementById('authFormNotice');
  if(formNotice) formNotice.textContent = '';
}

function handleForgotPassword(){
  clearAuthFormErrors();
  const email = document.getElementById('email').value.trim();
  const formError = document.getElementById('authFormError');
  const formNotice = document.getElementById('authFormNotice');

  if(!email){
    document.getElementById('field-email').classList.add('error');
    document.getElementById('emailError').textContent = 'Enter your email above first';
    return;
  }

  auth.sendPasswordResetEmail(email).then(function(){
    if(formNotice) formNotice.textContent = 'Password reset email sent — check your inbox.';
  }).catch(function(err){
    if(formError) formError.textContent = friendlyAuthError(err);
  });
}

function friendlyAuthError(err){
  const messages = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists with that email.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/missing-password': 'Enter a password.',
    'auth/too-many-requests': 'Too many attempts — try again later.'
  };
  return messages[err.code] || err.message;
}

function handleEmailAuthSubmit(){
  clearAuthFormErrors();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if(!email){
    document.getElementById('field-email').classList.add('error');
    document.getElementById('emailError').textContent = 'Email is required';
    return;
  }
  if(!password){
    document.getElementById('field-password').classList.add('error');
    document.getElementById('passwordError').textContent = 'Password is required';
    return;
  }
  if(authMode === 'signup'){
    const confirmPassword = document.getElementById('confirmPassword').value;
    if(confirmPassword !== password){
      document.getElementById('field-confirmPassword').classList.add('error');
      return;
    }
  }

  const action = authMode === 'signup'
    ? auth.createUserWithEmailAndPassword(email, password)
    : auth.signInWithEmailAndPassword(email, password);

  action.then(function(){
    redirectAfterAuth();
  }).catch(function(err){
    const formError = document.getElementById('authFormError');
    if(formError) formError.textContent = friendlyAuthError(err);
  });
}

// Reusable across pages: each page just needs the same #authSignedOut /
// #authSignedIn markup, and optionally #authGate + #gatedContent to gate
// content behind sign-in.
function applyAuthUI(user){
  const signedOut = document.getElementById('authSignedOut');
  const signedIn = document.getElementById('authSignedIn');
  const themeToggle = document.getElementById('themeToggle');
  const gate = document.getElementById('authGate');
  const gatedContent = document.getElementById('gatedContent');

  if(user){
    // Already signed in — the login page has nothing left to do here.
    if(document.getElementById('authFormTitle')){
      redirectAfterAuth();
      return;
    }
    if(signedOut) signedOut.style.display = 'none';
    // The standalone toggle only exists for signed-out visitors — once
    // signed in, theme lives in the profile dropdown instead.
    if(themeToggle) themeToggle.style.display = 'none';
    if(signedIn){
      signedIn.style.display = 'flex';
      const nameEl = document.getElementById('authUserName');
      const avatarEl = document.getElementById('authUserAvatar');
      const avatarFallbackEl = document.getElementById('authUserAvatarFallback');
      const displayName = user.displayName || user.email || 'Signed in';
      if(nameEl) nameEl.textContent = displayName;
      if(user.photoURL){
        if(avatarEl){ avatarEl.src = user.photoURL; avatarEl.style.display = ''; }
        if(avatarFallbackEl) avatarFallbackEl.classList.remove('show');
      } else {
        if(avatarEl){ avatarEl.removeAttribute('src'); avatarEl.style.display = 'none'; }
        if(avatarFallbackEl){
          avatarFallbackEl.textContent = displayName.charAt(0).toUpperCase();
          avatarFallbackEl.classList.add('show');
        }
      }
    }
    if(gate) gate.style.display = 'none';
    if(gatedContent) gatedContent.style.display = 'block';

    try{
      localStorage.setItem('ffCachedUser', JSON.stringify({
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL
      }));
    }catch(e){}

    if(typeof loadCalculatorHistory === 'function') loadCalculatorHistory();
  } else {
    if(signedOut) signedOut.style.display = 'flex';
    if(signedIn) signedIn.style.display = 'none';
    if(themeToggle) themeToggle.style.display = '';
    if(gate) gate.style.display = '';
    if(gatedContent) gatedContent.style.display = 'none';

    try{ localStorage.removeItem('ffCachedUser'); }catch(e){}

    if(typeof loadCalculatorHistory === 'function') loadCalculatorHistory();
  }

  document.documentElement.classList.remove('auth-pending');
}

auth.onAuthStateChanged(applyAuthUI);
