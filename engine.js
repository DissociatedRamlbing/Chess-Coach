/* Small chess engine for the coach and the computer opponent.
   Runs as a Web Worker (preferred) or on the main thread (fallback).
   Needs the Chess class from chess.bundle.js. */
(function (root) {
  'use strict';
  if (typeof importScripts === 'function' && !root.ChessLib) {
    try { importScripts('chess.bundle.js'); } catch (e) { /* reported on first request */ }
  }
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // Piece-square tables, white's view, rank 8 first.
  var PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
        0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    kEnd: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
        -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
  };
  var MATE = 100000, INF = 1000000;
  var FILES = 'abcdefgh';
  function sqName(i) { return FILES[i & 15] + (8 - (i >> 4)); }
  function uci(m) { return sqName(m.from) + sqName(m.to) + (m.promotion || ''); }

  var ch, nodes, deadline, timedOut;

  function evaluate() {
    var b = ch._board, score = 0, i, p, idx, big = 0;
    for (i = 0; i < 120; i++) {
      if (i & 0x88) { i += 7; continue; }
      p = b[i];
      if (p && p.type !== 'p' && p.type !== 'k') big += VAL[p.type];
    }
    var endgame = big <= 2600;
    for (i = 0; i < 120; i++) {
      if (i & 0x88) { i += 7; continue; }
      p = b[i];
      if (!p) continue;
      idx = (i >> 4) * 8 + (i & 15);
      var t = (p.type === 'k' && endgame) ? PST.kEnd : PST[p.type];
      if (p.color === 'w') score += VAL[p.type] + t[idx];
      else score -= VAL[p.type] + t[(7 - (i >> 4)) * 8 + (i & 15)];
    }
    return ch._turn === 'w' ? score : -score;
  }

  function orderScore(m) {
    var s = 0;
    if (m.captured) s += 10 * VAL[m.captured] - VAL[m.piece] + 10000;
    if (m.promotion) s += VAL[m.promotion] + 9000;
    return s;
  }
  function sortMoves(ms) {
    for (var i = 0; i < ms.length; i++) ms[i]._o = orderScore(ms[i]);
    ms.sort(function (a, b) { return b._o - a._o; });
    return ms;
  }

  function tick() {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) { timedOut = true; throw 'timeout'; }
  }

  function quiesce(alpha, beta, qd) {
    tick();
    var stand = evaluate();
    if (qd <= 0) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    var ms = ch._moves({ legal: false }), caps = [], i, us = ch._turn;
    for (i = 0; i < ms.length; i++) if (ms[i].captured || ms[i].promotion) caps.push(ms[i]);
    sortMoves(caps);
    for (i = 0; i < caps.length; i++) {
      ch._makeMove(caps[i]);
      var s;
      try {
        if (ch._isKingAttacked(us)) continue;
        s = -quiesce(-beta, -alpha, qd - 1);
      } finally { ch._undoMove(); }
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply) {
    tick();
    if (depth <= 0) {
      // Checkmate and stalemate still need a real answer at the horizon.
      if (ch._isKingAttacked(ch._turn) && ch._moves({ legal: true }).length === 0) return -(MATE - ply);
      return quiesce(alpha, beta, 6);
    }
    var ms = sortMoves(ch._moves({ legal: false })), us = ch._turn, legal = 0;
    for (var i = 0; i < ms.length; i++) {
      ch._makeMove(ms[i]);
      var s;
      try {
        if (ch._isKingAttacked(us)) continue;
        legal++;
        s = -negamax(depth - 1, -beta, -alpha, ply + 1);
      } finally { ch._undoMove(); }
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    if (legal === 0) return ch._isKingAttacked(us) ? -(MATE - ply) : 0;
    return alpha;
  }

  // Exact score for one root move, plus the opponent's best reply to it.
  function scoreRoot(m, depth) {
    ch._makeMove(m);
    try {
      var replies = ch._moves({ legal: true });
      if (replies.length === 0) {
        return { score: ch._isKingAttacked(ch._turn) ? MATE - 1 : 0, reply: null };
      }
      sortMoves(replies);
      var best = -INF, bestReply = null;
      for (var i = 0; i < replies.length; i++) {
        ch._makeMove(replies[i]);
        var s;
        try { s = -negamax(depth - 2, -INF, -best, 2); } finally { ch._undoMove(); }
        if (s > best) { best = s; bestReply = replies[i]; }
      }
      return { score: -best, reply: bestReply ? uci(bestReply) : null };
    } finally { ch._undoMove(); }
  }

  /* analyze(fen, {maxDepth, timeMs}) -> {depth, moves:[{uci, score, reply}]}
     Scores are centipawns for the side to move; every legal move is scored. */
  function analyze(fen, opts) {
    var Chess = (root.ChessLib && root.ChessLib.Chess) || root.Chess;
    if (!Chess) throw new Error('Chess rules library did not load');
    opts = opts || {};
    var maxDepth = Math.max(2, opts.maxDepth || 4);
    ch = new Chess(fen);
    nodes = 0; timedOut = false;
    var rootMoves = sortMoves(ch._moves({ legal: true }));
    var result = { depth: 0, moves: [] };
    if (rootMoves.length === 0) return result;
    var order = rootMoves.slice();
    var start = Date.now();
    for (var d = 2; d <= maxDepth; d++) {
      // Depth 2 always completes; deeper passes stop at the time limit.
      deadline = d === 2 ? Infinity : start + (opts.timeMs || 800);
      var out = [];
      try {
        for (var i = 0; i < order.length; i++) {
          var r = scoreRoot(order[i], d);
          out.push({ uci: uci(order[i]), score: r.score, reply: r.reply, _m: order[i] });
        }
      } catch (e) {
        if (e !== 'timeout') throw e;
        break;
      }
      out.sort(function (a, b) { return b.score - a.score; });
      order = out.map(function (o) { return o._m; });
      result = { depth: d, moves: out.map(function (o) { return { uci: o.uci, score: o.score, reply: o.reply }; }) };
      if (Date.now() - start > (opts.timeMs || 800) * 0.5) break;
    }
    return result;
  }

  root.ChessEngine = { analyze: analyze };

  if (typeof importScripts === 'function') {
    root.onmessage = function (ev) {
      var q = ev.data;
      try { root.postMessage({ id: q.id, result: analyze(q.fen, q) }); }
      catch (e) { root.postMessage({ id: q.id, error: String(e && e.message || e) }); }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
