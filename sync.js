/* Online play for the standalone site: stores each game in a Supabase table and
   hands the page the same small storage interface it uses inside Claude. */
(function () {
  'use strict';
  window.CHESS_STANDALONE = true;
  var cfg = window.CHESS_CONFIG || {}, client = null;
  var configured = /^https:\/\//.test(cfg.supabaseUrl || '') && !!cfg.supabaseKey && cfg.supabaseKey.indexOf('PASTE_') !== 0;
  if (configured && window.supabase && window.supabase.createClient) {
    try { client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey); } catch (e) { client = null; }
  }
  function fail(error) { return { code: 'unavailable', message: (error && error.message) || 'Could not reach the game storage' }; }
  function snap(code, row) {
    var body = null;
    if (row) { body = {}; Object.keys(row).forEach(function (k) { if (k !== 'code') body[k] = row[k]; }); }
    return { id: code, exists: !!row, data: function () { return body || undefined; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function gameRef(code) {
    function read() {
      return client.from('games').select('*').eq('code', code).maybeSingle().then(function (r) {
        if (r.error) throw fail(r.error);
        return r.data || null;
      });
    }
    return {
      id: code, path: 'games/' + code,
      get: function () { return read().then(function (row) { return snap(code, row); }); },
      set: function (body) {
        var row = { code: code }; Object.keys(body).forEach(function (k) { row[k] = body[k]; });
        return client.from('games').upsert(row).then(function (r) { if (r.error) throw fail(r.error); });
      },
      update: function (patch) {
        return client.from('games').update(patch).eq('code', code).then(function (r) { if (r.error) throw fail(r.error); });
      },
      onSnapshot: function (next, onError) {
        var stopped = false, lastJson = null, channel = null, timer = null;
        function deliver(row) {
          if (stopped) return;
          var j = JSON.stringify(row || null);
          if (j === lastJson) return;
          lastJson = j; next(snap(code, row));
        }
        function poll() { read().then(deliver).catch(function () {}); }
        poll();
        try {
          channel = client.channel('game-' + code)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'code=eq.' + code },
              function (payload) { if (payload && payload.new && payload.new.code) deliver(payload.new); else poll(); })
            .subscribe();
        } catch (e) { channel = null; }
        // Safety net: also check every few seconds, in case live updates are not switched on for the table.
        timer = setInterval(poll, 3000);
        return function () {
          stopped = true; clearInterval(timer);
          if (channel) { try { client.removeChannel(channel); } catch (e) {} }
        };
      }
    };
  }
  var db = client ? {
    doc: function (path) {
      var parts = String(path).split('/');
      if (parts.length !== 2 || parts[0] !== 'games' || !/^[A-Z0-9]{4}$/.test(parts[1])) throw new TypeError('Unsupported path: ' + path);
      return gameRef(parts[1]);
    }
  } : null;
  window.claude = { use: function (name) { return Promise.resolve(name === 'db' ? db : null); } };
})();
