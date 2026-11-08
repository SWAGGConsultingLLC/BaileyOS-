/* Living Archive self-attestation. Not an age or identity check.
   Storage on this origin only. It cannot see swaggconsulting.com. */
(function (root) {
  var STORE = 'bailey_agegate';
  var ISSUER = 'bailey-archive';
  var REMEMBER_MS = 28 * 864e5;
  var RETAIN_MS = 90 * 864e5;
  var EVENTS = { shown: 1, yes: 1, no: 1, recheck: 1 };

  function rememberedYes(raw, now) {
    if (!raw || raw.state !== 'yes') return false;
    if (typeof raw.expires !== 'number' || !isFinite(raw.expires)) return false;
    return now < raw.expires;
  }

  function readRaw(storage) {
    try { return JSON.parse(storage.getItem(STORE)); }
    catch (e) { return null; }
  }

  function record(state, now) {
    return { state: state, ts: now, expires: now + REMEMBER_MS };
  }

  function writeRecord(storage, value) {
    try { storage.setItem(STORE, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function payload(eventName, path, now, token) {
    if (!EVENTS[eventName]) throw new Error('unsupported event');
    if (!/^[0-9a-f]{32}$/.test(token)) throw new Error('token must be 16 bytes hex');
    return {
      event: eventName,
      verified: eventName === 'yes',
      token_hash: token,
      issuer_id: ISSUER,
      content_category: 'general',
      source_id: String(path || '/').slice(0, 128),
      retain_until: new Date(now + RETAIN_MS).toISOString()
    };
  }

  function newToken(cryptoObj) {
    var bytes = new Uint8Array(16);
    (cryptoObj || root.crypto).getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    return hex;
  }

  function logStatus(el, ok, status) {
    if (!el) return;
    el.textContent = ok
      ? 'Log accepted by the database.'
      : 'Log not stored' + (status ? ' (HTTP ' + status + ')' : '') + '. Issuer bailey-archive is not accepted until the pending policy is applied. Nothing was recorded.';
  }

  function postLog(url, key, body) {
    return fetch(url.replace(/\/$/, '') + '/rest/v1/age_assertions', {
      method: 'POST',
      keepalive: true,
      headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    }).then(function (res) { return { ok: res.ok, status: res.status }; }, function () { return { ok: false, status: 0 }; });
  }

  function boot(opts) {
    var gate = document.getElementById('archive-age-gate');
    if (!gate || gate.getAttribute('data-booted') === '1') return;
    gate.setAttribute('data-booted', '1');
    var yesBtn = document.getElementById('archive-age-yes');
    var noBtn = document.getElementById('archive-age-no');
    var status = document.getElementById('age-log-status');
    function storage() {
      try { return localStorage; }
      catch (e) { return null; }
    }
    var now = Date.now();
    var box = storage();
    var stored = box ? readRaw(box) : null;

    function hold(on) {
      document.documentElement.classList.toggle('age-open', !on);
      document.documentElement.classList.toggle('age-hold', on);
      var kids = document.body ? document.body.children : [];
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] === gate) continue;
        if (on) kids[i].setAttribute('inert', '');
        else kids[i].removeAttribute('inert');
      }
      if (on && yesBtn) yesBtn.focus();
    }

    function send(eventName) {
      if (!opts || !opts.url || !opts.key) {
        logStatus(status, false, 0);
        return Promise.resolve({ ok: false, status: 0 });
      }
      var body;
      try { body = payload(eventName, location.pathname, Date.now(), newToken(root.crypto)); }
      catch (e) { logStatus(status, false, 0); return Promise.resolve({ ok: false, status: 0 }); }
      return postLog(opts.url, opts.key, body).then(function (res) {
        logStatus(status, res.ok, res.status);
        return res;
      });
    }

    gate.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var nodes = [yesBtn, noBtn];
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    yesBtn.addEventListener('click', function () {
      var current = storage();
      if (current) writeRecord(current, record('yes', Date.now()));
      send('yes');
      hold(false);
    });
    noBtn.addEventListener('click', function () {
      var current = storage();
      if (current) writeRecord(current, record('no', Date.now()));
      send('no');
      setTimeout(function () { location.assign('https://www.google.com/'); }, 150);
    });

    if (rememberedYes(stored, now)) {
      hold(false);
      return;
    }
    if (stored && stored.state === 'yes') send('recheck');
    hold(true);
    send('shown');
  }

  root.ArchiveGate = {
    STORE: STORE,
    ISSUER: ISSUER,
    rememberedYes: rememberedYes,
    readRaw: readRaw,
    record: record,
    writeRecord: writeRecord,
    payload: payload,
    newToken: newToken,
    logStatus: logStatus,
    postLog: postLog,
    boot: boot
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
