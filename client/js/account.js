// Join screen (log in / sign up / guest) and the secrets the browser keeps:
//   session: stays logged in to an account
//   token:   reopens this browser's guest profile
// Neither is a password; the password is only sent once, when logging in.

import { MSG } from '/shared/constants.js';

const SESSION_KEY = 'lastcast.session';
const TOKEN_KEY = 'lastcast.token';
const SIGNUP_FLAG = 'lastcast.openSignup';

function read(store, key) {
  try { return window[store].getItem(key); } catch { return null; }
}
function write(store, key, value) {
  try {
    if (value == null) window[store].removeItem(key);
    else window[store].setItem(key, value);
  } catch { /* storage blocked: works for this visit only */ }
}

export const saved = {
  session: () => read('localStorage', SESSION_KEY),
  setSession: (v) => write('localStorage', SESSION_KEY, v),
  token: () => read('localStorage', TOKEN_KEY),
  setToken: (v) => write('localStorage', TOKEN_KEY, v),
};

/** Reload straight into the sign-up form, keeping this browser's guest progress. */
export function reloadToSignup() {
  write('sessionStorage', SIGNUP_FLAG, '1');
  location.reload();
}

const $ = (id) => document.getElementById(id);

const LABELS = { login: 'Log in', register: 'Create account', guest: 'Play as guest' };

export class JoinForm {
  constructor({ onSubmit }) {
    this.form = $('join-form');
    this.mode = null;
    for (const btn of this.form.querySelectorAll('[data-mode]')) {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    }
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      onSubmit(this.joinMessage());
    });

    const signup = read('sessionStorage', SIGNUP_FLAG);
    write('sessionStorage', SIGNUP_FLAG, null);
    this.setMode(signup ? 'register' : saved.token() ? 'guest' : 'login');
  }

  setMode(mode) {
    this.mode = mode;
    for (const btn of this.form.querySelectorAll('[data-mode]')) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
    const account = mode !== 'guest';
    $('account-fields').hidden = !account;
    $('guest-fields').hidden = account;
    $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('join-submit').textContent = LABELS[mode];

    let hint = '';
    if (mode === 'register') {
      hint = saved.token()
        ? 'Your guest progress on this browser will move to your new account.'
        : '3-16 letters, numbers or _. Password: at least 6 characters.';
    } else if (mode === 'guest') {
      hint = 'Guest progress is saved on this browser only.';
    }
    $('auth-hint').textContent = hint;
    this.showError('');
    (account ? $('username') : $('name')).focus();
  }

  joinMessage() {
    const msg = { t: MSG.JOIN, mode: this.mode };
    if (this.mode === 'guest') {
      msg.name = $('name').value;
      msg.token = saved.token();
    } else {
      msg.username = $('username').value.trim();
      msg.password = $('password').value;
      if (this.mode === 'register') msg.token = saved.token();
    }
    return msg;
  }

  setBusy(busy, text) {
    $('join-submit').disabled = busy;
    if (busy && text) $('join-submit').textContent = text;
    if (!busy) $('join-submit').textContent = LABELS[this.mode];
  }

  showError(message) {
    $('join-error').textContent = message;
  }

  clearPassword() {
    $('password').value = '';
  }
}
