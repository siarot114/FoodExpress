/* FoodExpress: shared front-end logic (login, cart, orders) using Supabase. */
(function () {
  'use strict';

  var cfg = window.FX_CONFIG || {};
  var configured = !!(cfg.url && cfg.anonKey && !/YOUR_/.test(cfg.url + cfg.anonKey));
  var ready = configured && !!window.supabase;
  var sb = ready ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  var CART = 'fx-cart';
  var DETAILS = 'fx-details';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function peso(n) {
    return '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  }
  function read(key, store) {
    try { return JSON.parse((store || localStorage).getItem(key)); } catch (e) { return null; }
  }
  function write(key, value, store) {
    try { (store || localStorage).setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  function getCart() { var c = read(CART); return Array.isArray(c) ? c : []; }
  function setCart(c) { write(CART, c); }
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function cell(text, tag) { return el(tag || 'td', text); }
  function pageName() {
    return (location.pathname.split('/').pop() || 'index.html') + location.search;
  }
  function goNext() {
    var next = new URLSearchParams(location.search).get('next');
    location.href = next && /^[a-z0-9-]+\.html(\?[\w=&-]*)?$/i.test(next) ? next : 'index.html';
  }
  function notice(text) {
    var d = el('div', text);
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#fff3cd;color:#856404;padding:10px;text-align:center;font:14px Arial,sans-serif';
    document.body.insertBefore(d, document.body.firstChild);
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  }
  function statusBadge(status) {
    var s = el('span', status === 'cancelled' ? 'Cancelled' : 'Preparing', 'status ' + status);
    return s;
  }
  async function currentUser() {
    if (!sb) return null;
    var r = await sb.auth.getSession();
    return r.data && r.data.session ? r.data.session.user : null;
  }

  /* ---------- navigation bar ---------- */
  function setupNav(user) {
    var nav = $('nav');
    if (!nav) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    var out = links.filter(function (a) { return /logout\.html/.test(a.getAttribute('href')); })[0] || null;
    var count = getCart().reduce(function (n, i) { return n + i.qty; }, 0);
    if (count) {
      var c = el('a', 'Cart (' + count + ')');
      c.href = 'checkout.html';
      nav.insertBefore(c, out);
    }
    if (user) {
      var o = el('a', 'My Orders');
      o.href = 'my-orders.html';
      nav.insertBefore(o, out);
    } else if (out) {
      out.textContent = 'Login';
      out.setAttribute('href', 'login.html');
    }
  }

  /* ---------- "Order Now" buttons add the dish to the cart ---------- */
  function hookCart() {
    document.addEventListener('submit', function (e) {
      var form = e.target.closest ? e.target.closest('.food-card form') : null;
      if (!form) return;
      e.preventDefault();
      var card = form.closest('.food-card');
      var name = $('h3', card).textContent.trim();
      var price = 0;
      Array.prototype.forEach.call(card.querySelectorAll('p'), function (p) {
        var m = p.textContent.trim().match(/^₱\s*([\d,]+(?:\.\d+)?)$/);
        if (m) price = parseFloat(m[1].replace(/,/g, ''));
      });
      var qty = Math.max(1, Math.min(50, parseInt($('input[type=number]', form).value, 10) || 1));
      var cart = getCart();
      var found = cart.filter(function (i) { return i.name === name; })[0];
      if (found) found.qty = Math.min(50, found.qty + qty);
      else cart.push({ name: name, price: price, qty: qty });
      setCart(cart);
      location.href = 'checkout.html';
    });
  }

  /* ---------- page logic ---------- */
  var pages = {};

  pages.login = function (user) {
    if (user) { goNext(); return; }
    var f = $('#form'), msg = $('#msg');
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!sb) { msg.textContent = 'The database is not connected yet.'; return; }
      var btn = $('button', f);
      btn.disabled = true; msg.textContent = 'Logging in…';
      var r = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      btn.disabled = false;
      if (r.error) { msg.textContent = r.error.message; return; }
      goNext();
    });
  };

  pages.signup = function (user) {
    if (user) { location.href = 'index.html'; return; }
    var f = $('#form'), msg = $('#msg');
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.className = 'msg';
      if (!sb) { msg.textContent = 'The database is not connected yet.'; return; }
      if (f.password.value.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
      if (f.password.value !== f.confirm.value) { msg.textContent = 'Passwords do not match.'; return; }
      var btn = $('button', f);
      btn.disabled = true; msg.textContent = 'Creating your account…';
      var r = await sb.auth.signUp({
        email: f.email.value.trim(),
        password: f.password.value,
        options: { data: { full_name: f.fullname.value.trim() } }
      });
      btn.disabled = false;
      if (r.error) { msg.textContent = r.error.message; return; }
      if (r.data && r.data.session) { location.href = 'index.html'; return; }
      msg.className = 'msg ok';
      msg.textContent = 'Account created! Check your email to confirm it, then log in.';
      f.reset();
    });
  };

  pages.logout = async function () {
    if (sb) { try { await sb.auth.signOut(); } catch (e) { /* ignore */ } }
    try { localStorage.removeItem(CART); sessionStorage.removeItem(DETAILS); } catch (e) { /* ignore */ }
  };

  pages.checkout = function (user) {
    var cart = getCart(), f = $('#form');
    if (!cart.length) { f.hidden = true; $('#empty').hidden = false; $('#cart-list').hidden = true; return; }
    $('#cart-list').textContent = 'In your cart: ' + cart.map(function (i) { return i.qty + ' × ' + i.name; }).join(', ');
    var saved = read(DETAILS, sessionStorage) || {};
    f.fullname.value = saved.name || (user.user_metadata && user.user_metadata.full_name) || '';
    f.address.value = saved.address || '';
    f.phone.value = saved.phone || '';
    f.payment.value = saved.payment || '';
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      write(DETAILS, {
        name: f.fullname.value.trim(), address: f.address.value.trim(),
        phone: f.phone.value.trim(), payment: f.payment.value
      }, sessionStorage);
      location.href = 'order-summary.html';
    });
  };

  pages.summary = function () {
    var cart = getCart(), d = read(DETAILS, sessionStorage);
    if (!cart.length) { location.replace('menu.html'); return; }
    if (!d) { location.replace('checkout.html'); return; }
    var body = $('#rows'), msg = $('#msg'), confirmBtn = $('#confirm');

    $('#d-name').textContent = d.name;
    $('#d-address').textContent = d.address;
    $('#d-phone').textContent = d.phone;
    $('#d-payment').textContent = d.payment;

    function draw() {
      cart = getCart();
      if (!cart.length) { location.replace('menu.html'); return; }
      body.textContent = '';
      var total = 0;
      cart.forEach(function (item, idx) {
        var line = item.price * item.qty;
        total += line;
        var tr = el('tr');
        tr.appendChild(cell(item.name));
        tr.appendChild(cell(item.qty));
        tr.appendChild(cell(item.price));
        tr.appendChild(cell(line));
        var td = el('td');
        var rm = el('button', '✕', 'remove');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove ' + item.name);
        rm.addEventListener('click', function () {
          var c = getCart(); c.splice(idx, 1); setCart(c); draw();
        });
        td.appendChild(rm);
        tr.appendChild(td);
        body.appendChild(tr);
      });
      $('#total').textContent = total;
    }
    draw();

    confirmBtn.addEventListener('click', async function () {
      if (!sb) { msg.textContent = 'The database is not connected yet.'; return; }
      confirmBtn.disabled = true; msg.textContent = 'Placing your order…';
      var r = await sb.rpc('place_order', {
        p_name: d.name, p_address: d.address, p_phone: d.phone, p_payment: d.payment,
        p_items: getCart().map(function (i) { return { name: i.name, price: i.price, quantity: i.qty }; })
      });
      if (r.error) { msg.textContent = 'Could not place the order: ' + r.error.message; confirmBtn.disabled = false; return; }
      try { localStorage.removeItem(CART); sessionStorage.removeItem(DETAILS); } catch (e) { /* ignore */ }
      location.href = 'order-confirm.html?id=' + encodeURIComponent(r.data);
    });
  };

  pages.confirm = async function () {
    var id = new URLSearchParams(location.search).get('id'), msg = $('#msg');
    if (!id || !UUID.test(id)) { msg.textContent = 'Order not found.'; return; }
    var r = await sb.from('orders').select('*, order_items(*)').eq('id', id).single();
    if (r.error || !r.data) { msg.textContent = 'Order not found.'; return; }
    var o = r.data;
    $('#info').hidden = false;
    $('#o-status').textContent = '';
    $('#o-status').appendChild(statusBadge(o.status));
    $('#o-name').textContent = o.customer_name;
    $('#o-address').textContent = o.address;
    $('#o-payment').textContent = o.payment_method;
    $('#o-date').textContent = fmtDate(o.created_at);
    $('#o-eta').hidden = o.status === 'cancelled';
    var rows = $('#rows'); rows.textContent = '';
    o.order_items.forEach(function (i) {
      var tr = el('tr');
      tr.appendChild(cell(i.item_name)); tr.appendChild(cell(i.quantity));
      tr.appendChild(cell(Number(i.price))); tr.appendChild(cell(Number(i.price) * i.quantity));
      rows.appendChild(tr);
    });
    $('#o-total').textContent = Number(o.total);
    $('#receipt').hidden = false;
    msg.textContent = '';
    var cancel = $('#cancel');
    if (o.status === 'preparing') { cancel.href = 'cancel.html?id=' + encodeURIComponent(o.id); cancel.hidden = false; }
  };

  pages.orders = async function () {
    var list = $('#list'), msg = $('#msg');
    var r = await sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
    if (r.error) { msg.textContent = 'Could not load your orders: ' + r.error.message; return; }
    if (!r.data.length) { msg.textContent = 'You have no orders yet.'; $('#none').hidden = false; return; }
    msg.textContent = '';
    r.data.forEach(function (o) {
      var card = el('div', null, 'order');
      var head = el('div', null, 'order-head');
      head.appendChild(el('strong', fmtDate(o.created_at)));
      head.appendChild(statusBadge(o.status));
      card.appendChild(head);
      card.appendChild(el('p', o.order_items.map(function (i) { return i.quantity + ' × ' + i.item_name; }).join(', '), 'items'));
      var foot = el('div', null, 'order-foot');
      foot.appendChild(el('span', 'Total: ' + peso(o.total)));
      var a = el('a', 'View', 'small-link');
      a.href = 'order-confirm.html?id=' + encodeURIComponent(o.id);
      foot.appendChild(a);
      card.appendChild(foot);
      list.appendChild(card);
    });
  };

  pages.cancel = function () {
    var id = new URLSearchParams(location.search).get('id'), f = $('#form'), msg = $('#msg');
    if (!id || !UUID.test(id)) { f.hidden = true; msg.textContent = 'Order not found.'; return; }
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = $('button', f);
      btn.disabled = true; msg.textContent = 'Cancelling…';
      var reason = f.reason.value + (f.comments.value.trim() ? ': ' + f.comments.value.trim().slice(0, 300) : '');
      var r = await sb.from('orders').update({ status: 'cancelled', cancel_reason: reason }).eq('id', id).select();
      if (r.error || !r.data || !r.data.length) {
        msg.textContent = 'This order could not be cancelled. It may already be cancelled.';
        btn.disabled = false; return;
      }
      location.href = 'cancel-confirmed.html';
    });
  };

  /* ---------- start ---------- */
  async function init() {
    var user = await currentUser();
    if (!configured) notice('Database not connected yet. Add your Supabase URL and key in supabase-config.js.');
    else if (!window.supabase) notice('Could not load the database library. Check your internet connection.');
    setupNav(user);
    if (document.body.hasAttribute('data-requires-login') && !user) {
      location.replace('login.html?next=' + encodeURIComponent(pageName()));
      return;
    }
    hookCart();
    var run = pages[document.body.getAttribute('data-page')];
    if (run) run(user);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
