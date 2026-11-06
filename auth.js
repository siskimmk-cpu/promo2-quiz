/* 2급 합격 · 로그인·승인·학습기록 동기화 (송무온과 같은 Supabase 서버, 명단은 quiz_members 따로)
   흐름: 로그인 화면 → quiz_me()로 상태 확인 → 승인됐으면 서버 기록을 내려받아 합친 뒤 app.js 실행
   관리자(송무온 관리자)는 설정 → 「사용자 관리」에서 승인·해제·임시 비밀번호·학습 현황 확인 */
(function () {
  'use strict';
  var CFG = { url: 'https://bvmlzmiaapwoaenrdmcs.supabase.co', key: 'sb_publishable_kok1GuiFLpTe9fSEV9KlkQ_L8gbSh5v' };
  var SITE = 'https://siskimmk-cpu.github.io/promo2-quiz/';
  var KEY = 'promo2-quiz-v3', OWNER = 'promo2-owner', AUTHC = 'promo2-auth', CHG = 'promo2-chg', LASTEMAIL = 'promo2-email';
  var st = { sb: null, user: null, me: null, timer: 0, syncing: false, lastSync: 0, err: '' };
  var rd = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  var wr = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } };
  var rm = function (k) { try { localStorage.removeItem(k); } catch (e) { } };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ── 화면 ── */
  var gate = null;
  function screen(inner) {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    if (!gate) { gate = document.createElement('div'); gate.id = 'p2gate'; document.body.appendChild(gate); }
    gate.innerHTML = '<div class="p2g-in"><div class="p2g-brand"><img src="icon-192.png" alt=""><div><b>2급 합격</b><span>2급 승진자격시험 예상 기출문제</span></div></div>' + inner + '<p class="p2g-foot">관리자가 승인한 계정만 쓸 수 있어요 · 문의 김민기</p></div>';
    return gate;
  }
  function closeGate() { if (gate) { gate.classList.add('out'); var g = gate; gate = null; setTimeout(function () { g.remove(); }, 260); } }
  function msg(w, t, ok) { var m = $('#p2M', w); if (m) { m.textContent = t || ''; m.className = 'p2g-msg' + (ok ? ' ok' : ''); } }

  function showLogin(note, tab) {
    tab = tab || 'in';
    var tabs = '<div class="p2g-tabs"><button type="button" data-t="in" class="' + (tab === 'in' ? 'on' : '') + '">로그인</button><button type="button" data-t="up" class="' + (tab === 'up' ? 'on' : '') + '">계정 만들기</button></div>';
    var body = tab === 'in'
      ? '<form id="p2F"><label>이메일<input id="p2E" type="email" autocomplete="username" inputmode="email" required value="' + esc(rd(LASTEMAIL, '')) + '"></label>' +
        '<label>비밀번호<input id="p2P" type="password" autocomplete="current-password" required></label>' +
        '<button class="p2g-btn pri" type="submit">로그인</button></form>' +
        '<p class="p2g-small">처음이면 <b>계정 만들기</b> → 관리자 승인 후 바로 쓸 수 있어요. 비밀번호를 잊었으면 관리자에게 임시 비밀번호를 요청하세요. 송무온 계정이 있으면 그 계정으로 로그인해도 돼요.</p>'
      : '<form id="p2U"><label>이름<input id="p2N" autocomplete="name" required maxlength="20" placeholder="예: 홍길동"></label>' +
        '<label>이메일<input id="p2E" type="email" autocomplete="username" inputmode="email" required></label>' +
        '<label>비밀번호 <small>10자 이상</small><input id="p2P" type="password" autocomplete="new-password" minlength="10" required></label>' +
        '<label>비밀번호 확인<input id="p2P2" type="password" autocomplete="new-password" minlength="10" required></label>' +
        '<button class="p2g-btn pri" type="submit">계정 만들기 (승인 요청)</button></form>' +
        '<p class="p2g-small">만들면 <b>승인 대기</b>가 돼요. 관리자가 승인하면 바로 쓸 수 있어요.</p>';
    var intro = '<section class="p2g-intro"><h2>2급 승진자격시험 대비 예상 기출문제</h2><p class="p2g-lead">2026. 12. 18.(금) 시험 공고 과목(자배법·손해사정이론·보험계약법·공제약관·상식)에 맞춘 객관식 문제은행이에요.</p>' +
      '<ul class="p2g-feat"><li><b>📅</b><span><b>매일 오전 9시 새 문제</b>시험 과목 안에서만 꾸준히 추가돼요</span></li><li><b>🔥</b><span><b>기출 빈출 쟁점</b>손해사정사 기출 10년 분석으로 자주 나온 쟁점부터</span></li><li><b>⏱️</b><span><b>실전 모의고사</b>50문항·90분, 과목별 점수와 합격 예측</span></li><li><b>📝</b><span><b>오답노트·보기별 해설</b>틀린 문제는 1·3·7일 뒤 다시 나와요</span></li><li><b>🔄</b><span><b>PC·휴대폰 기록 연동</b>같은 계정이면 어디서든 이어서</span></li></ul>' +
      '<div class="p2g-steps"><b>처음 오셨나요?</b><ol><li><b>계정 만들기</b> — 이름·이메일·비밀번호(10자 이상)</li><li><b>승인 기다리기</b> — 관리자(김민기)가 확인 후 승인</li><li><b>다시 확인</b> 누르면 바로 시작</li></ol><p>송무온 계정이 있으면 그 계정으로 로그인하면 돼요. 휴대폰은 공유 → 「홈 화면에 추가」로 앱처럼 쓸 수 있어요.</p></div></section>';
    var w = screen('<div class="p2g-grid">' + intro + '<div class="p2g-form"><h1>' + (tab === 'in' ? '로그인' : '계정 만들기') + '</h1>' + tabs + body + '<div class="p2g-msg" id="p2M"></div></div></div>');
    if (note) msg(w, note, /만들었|보냈|바꿨/.test(note));
    w.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { showLogin('', b.dataset.t); }; });
    if (tab === 'in') $('#p2F', w).onsubmit = async function (e) {
      e.preventDefault(); msg(w, '확인 중…');
      var email = $('#p2E', w).value.trim().toLowerCase(), pw = $('#p2P', w).value;
      var r = await st.sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) { msg(w, /Invalid login/i.test(r.error.message) ? '이메일 또는 비밀번호가 맞지 않아요.' : /not confirmed/i.test(r.error.message) ? '메일함에서 인증 링크를 먼저 눌러 주세요.' : '로그인하지 못했어요: ' + r.error.message); return; }
      wr(LASTEMAIL, email); afterLogin(r.data.session);
    };
    else $('#p2U', w).onsubmit = async function (e) {
      e.preventDefault();
      var name = $('#p2N', w).value.trim(), email = $('#p2E', w).value.trim().toLowerCase(), p1 = $('#p2P', w).value, p2 = $('#p2P2', w).value;
      if (p1.length < 10) { msg(w, '비밀번호는 10자 이상으로 해 주세요.'); return; }
      if (p1 !== p2) { msg(w, '비밀번호 두 칸이 서로 달라요.'); return; }
      msg(w, '만드는 중…');
      var r = await st.sb.auth.signUp({ email: email, password: p1, options: { data: { name: name, app: 'promo2' }, emailRedirectTo: SITE } });
      if (r.error) { msg(w, /already|registered/i.test(r.error.message) ? '이미 가입된 이메일이에요. 로그인해 보세요.' : '만들지 못했어요: ' + r.error.message); return; }
      var u = r.data && r.data.user;
      if (u && Array.isArray(u.identities) && !u.identities.length) { msg(w, '이미 가입된 이메일이에요. 로그인해 보세요.'); return; }
      wr(LASTEMAIL, email);
      if (r.data.session) { afterLogin(r.data.session); return; }
      showLogin('계정을 만들었어요. 메일함의 인증 링크를 누른 뒤 여기서 로그인하세요. 그다음 관리자 승인을 기다리면 돼요.', 'in');
    };
  }

  function showPending(status) {
    var nm = st.user && st.user.user_metadata && st.user.user_metadata.name;
    var rev = status === 'revoked';
    var w = screen('<div class="p2g-wait"><span>' + (rev ? '🔒' : '⏳') + '</span></div><h1>' + (rev ? '사용이 해제된 계정이에요' : '승인을 기다리고 있어요') + '</h1><p class="p2g-p">' + esc(nm ? nm + ' · ' : '') + esc(st.user ? st.user.email : '') + '</p>' +
      '<p class="p2g-p">' + (rev ? '다시 쓰려면 관리자(김민기)에게 문의하세요.' : '관리자(김민기)가 승인하면 바로 쓸 수 있어요. 승인 연락을 받으면 <b>다시 확인</b>을 누르세요.') + '</p>' +
      '<button class="p2g-btn pri" id="p2R">다시 확인</button><button class="p2g-btn" id="p2O">다른 계정으로 로그인</button><div class="p2g-msg" id="p2M"></div>');
    $('#p2R', w).onclick = async function () { msg(w, '확인 중…'); var g = await st.sb.auth.getSession(); if (g.data && g.data.session) afterLogin(g.data.session); else showLogin(); };
    $('#p2O', w).onclick = async function () { await st.sb.auth.signOut(); st.user = null; showLogin(); };
  }

  /* ── 로그인 후: 상태 확인 → 기록 합치기 → 앱 실행 ── */
  async function afterLogin(session) {
    st.user = session.user;
    screen('<div class="p2g-load"><i></i></div><h1>불러오는 중</h1><p class="p2g-p">내 학습 기록을 확인하고 있어요.</p>');
    var me;
    try { var r = await st.sb.rpc('quiz_me'); if (r.error) throw r.error; me = Array.isArray(r.data) ? r.data[0] : r.data; }
    catch (e) {
      var c = cachedAuth();
      if (c && c.uid === st.user.id && c.status === 'approved' && !navigator.onLine) { st.me = c; return enter(); }
      showLogin('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요. (' + (e.message || e) + ')'); return;
    }
    if (!me || me.status !== 'approved') { rm(AUTHC); showPending(me && me.status); return; }
    st.me = { uid: st.user.id, email: st.user.email, status: 'approved', is_admin: !!me.is_admin, name: me.name || (st.user.user_metadata || {}).name || '' };
    wr(AUTHC, JSON.stringify(st.me));
    await pull();
    enter();
  }
  function cachedAuth() { try { return JSON.parse(rd(AUTHC, 'null')); } catch (e) { return null; } }

  var entered = false;
  function enter() {
    if (entered) { closeGate(); return; } entered = true;
    if (/access_token|type=signup|type=recovery/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    closeGate(); window.P2A.me = st.me;
    var s = document.createElement('script'); s.src = 'app.js?v=' + (window.BUILD || ''); document.body.appendChild(s);
    hookSave();
  }

  /* ── 기록 동기화 ── */
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function merge(a, b, aNewer) { // a=서버, b=이 기기
    if (!a) return b; if (!b) return a;
    var N = aNewer ? a : b, O = aNewer ? b : a, out = Object.assign({}, O, N);
    var ans = Object.assign({}, a.ans || {}); Object.keys(b.ans || {}).forEach(function (id) { var x = ans[id], y = b.ans[id]; if (!x || (y.t || 0) > (x.t || 0)) ans[id] = y; }); out.ans = ans;
    var srs = {}; Object.keys(ans).forEach(function (id) { var from = (b.ans || {})[id] === ans[id] ? b : a; if (from.srs && from.srs[id]) srs[id] = from.srs[id]; else if ((a.srs || {})[id]) srs[id] = a.srs[id]; else if ((b.srs || {})[id]) srs[id] = b.srs[id]; }); out.srs = srs;
    out.star = Array.from(new Set([].concat(a.star || [], b.star || [])));
    var log = Object.assign({}, a.log || {}); Object.keys(b.log || {}).forEach(function (d) { var x = log[d] || { n: 0, o: 0 }, y = b.log[d]; log[d] = { n: Math.max(x.n || 0, y.n || 0), o: Math.max(x.o || 0, y.o || 0) }; }); out.log = log;
    var best = Object.assign({}, a.best || {}); Object.keys(b.best || {}).forEach(function (k) { best[k] = Math.max(best[k] == null ? -1 : best[k], b.best[k]); }); out.best = best;
    var seen = {}, hist = []; [].concat(a.hist || [], b.hist || []).forEach(function (h) { var k = h.d + '|' + h.name + '|' + h.sc; if (!seen[k]) { seen[k] = 1; hist.push(h); } }); hist.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; }); out.hist = hist.slice(-50);
    ['badges', 'badgeSeen', 'daily'].forEach(function (k) { if (a[k] || b[k]) out[k] = Object.assign({}, O[k] || {}, N[k] || {}); });
    return out;
  }
  function stats(d) {
    var ids = Object.keys(d.ans || {}), ok = ids.filter(function (i) { return d.ans[i].ok; }).length;
    var days = Object.keys(d.log || {}).sort(), last7 = days.filter(function (x) { return x >= new Date(Date.now() - 6 * 864e5 + 9 * 36e5).toISOString().slice(0, 10); });
    var h = d.hist || [], lastMock = h.length ? h[h.length - 1] : null, bestMock = h.reduce(function (m, x) { return Math.max(m, x.sc || 0); }, 0);
    return { done: ids.length, ok: ok, pct: ids.length ? Math.round(ok / ids.length * 100) : 0, days7: last7.length, today: ((d.log || {})[new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10)] || { n: 0 }).n, mocks: h.length, lastMock: lastMock ? { sc: lastMock.sc, d: lastMock.d, name: lastMock.name } : null, bestMock: bestMock || null, wrong: ids.length - ok, stars: (d.star || []).length };
  }
  async function pull() {
    var owner = rd(OWNER, '');
    if (owner && owner !== st.user.id) { rm(KEY); rm(CHG); } // 이 기기에 다른 사람 기록이 있으면 지움(그 사람 기록은 서버에 있음)
    wr(OWNER, st.user.id);
    try {
      var r = await st.sb.from('quiz_progress').select('data,updated_at').eq('owner', st.user.id).maybeSingle();
      if (r.error) throw r.error;
      var local = parse(rd(KEY, 'null')), server = r.data ? r.data.data : null;
      var sAt = r.data ? Date.parse(r.data.updated_at) : 0, lAt = +rd(CHG, '0');
      if (entered) return; // 이미 앱이 열렸으면 덮어쓰지 않음(다음 실행 때 반영)
      if (server && Object.keys(server).length) {
        var m = merge(server, local, sAt >= lAt);
        realSet.call(localStorage, KEY, JSON.stringify(m));
        if (local && JSON.stringify(m) !== JSON.stringify(server)) queue(800);
      } else if (local) queue(800);
      st.lastSync = Date.now();
    } catch (e) { st.err = e.message || String(e); }
  }
  async function push() {
    if (st.syncing || !st.user) return; st.syncing = true;
    try {
      var d = parse(rd(KEY, 'null')); if (!d) return;
      var r = await st.sb.from('quiz_progress').upsert({ owner: st.user.id, data: d, stats: stats(d), updated_at: new Date().toISOString() }, { onConflict: 'owner' });
      if (r.error) throw r.error; st.err = ''; st.lastSync = Date.now();
    } catch (e) { st.err = e.message || String(e); queue(30000); }
    finally { st.syncing = false; }
  }
  function queue(ms) { clearTimeout(st.timer); st.timer = setTimeout(push, ms == null ? 4000 : ms); }
  var realSet = Storage.prototype.setItem;
  function hookSave() {
    Storage.prototype.setItem = function (k, v) { realSet.call(this, k, v); if (this === localStorage && k === KEY) { realSet.call(this, CHG, String(Date.now())); queue(); } };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && st.timer) { clearTimeout(st.timer); push(); } });
    window.addEventListener('online', function () { queue(500); });
  }

  /* ── 설정 화면에 붙는 계정 영역 ── */
  function settingsHTML() {
    var me = st.me || {};
    var t = st.lastSync ? new Date(st.lastSync).toTimeString().slice(0, 5) : '';
    return '<div class="label">내 계정</div><div class="list">' +
      '<div class="row"><span class="tx"><span class="nm">' + esc(me.name || '이름 없음') + (me.is_admin ? ' <em class="p2-adm">관리자</em>' : '') + '</span><span class="meta">' + esc(me.email || '') + ' · ' + (st.err ? '동기화 오류 — 인터넷 연결을 확인하세요' : t ? '학습 기록 서버 저장 ' + t : '학습 기록이 서버에 저장돼요') + '</span></span></div>' +
      (me.is_admin ? '<button class="row" id="p2Adm"><span class="tx"><span class="nm">사용자 관리</span><span class="meta">가입 승인 · 해제 · 임시 비밀번호 · 학습 현황</span></span><span class="p2-pend" id="p2Pend"></span></button>' : '') +
      '<button class="row" id="p2Pw"><span class="tx"><span class="nm">비밀번호 바꾸기</span></span></button>' +
      '<button class="row" id="p2Out"><span class="tx"><span class="nm">로그아웃</span><span class="meta">공용 PC면 꼭 로그아웃하세요 · 이 기기의 기록은 지워지고 서버에 남아요</span></span></button></div>';
  }
  function bindSettings(root) {
    var a = $('#p2Adm', root); if (a) { a.onclick = adminPanel; pendingCount().then(function (n) { var p = $('#p2Pend', root); if (p && n) p.textContent = '대기 ' + n; }); }
    var pw = $('#p2Pw', root); if (pw) pw.onclick = changePw;
    var o = $('#p2Out', root); if (o) o.onclick = logout;
  }
  async function logout() {
    var o = $('#p2Out'); if (o && o.dataset.arm !== '1') { o.dataset.arm = '1'; $('.nm', o).textContent = '한 번 더 누르면 로그아웃'; return; }
    clearTimeout(st.timer); await push();
    await st.sb.auth.signOut(); rm(KEY); rm(CHG); rm(OWNER); rm(AUTHC); location.reload();
  }

  /* ── 시트(관리자·비밀번호) ── */
  function sheet(html, wide) {
    var o = document.createElement('div'); o.className = 'p2s-ov'; o.innerHTML = '<div class="p2s' + (wide ? ' wide' : '') + '" role="dialog"><button class="p2s-x" aria-label="닫기">✕</button>' + html + '</div>';
    document.body.appendChild(o); requestAnimationFrame(function () { o.classList.add('in'); });
    var close = function () { o.classList.remove('in'); setTimeout(function () { o.remove(); }, 220); };
    o.onclick = function (e) { if (e.target === o) close(); }; $('.p2s-x', o).onclick = close;
    o.close = close; return o;
  }
  function changePw() {
    var o = sheet('<h2>비밀번호 바꾸기</h2><form id="p2CF"><label>새 비밀번호 <small>10자 이상</small><input id="p2C1" type="password" autocomplete="new-password" minlength="10" required></label><label>한 번 더<input id="p2C2" type="password" autocomplete="new-password" minlength="10" required></label><button class="p2g-btn pri" type="submit">바꾸기</button></form><div class="p2g-msg" id="p2M"></div>');
    $('#p2CF', o).onsubmit = async function (e) {
      e.preventDefault(); var a = $('#p2C1', o).value, b = $('#p2C2', o).value;
      if (a.length < 10) return msg(o, '10자 이상으로 해 주세요.'); if (a !== b) return msg(o, '두 칸이 서로 달라요.');
      var r = await st.sb.auth.updateUser({ password: a }); msg(o, r.error ? '바꾸지 못했어요: ' + r.error.message : '비밀번호를 바꿨어요.', !r.error);
    };
  }
  async function pendingCount() { try { var r = await st.sb.rpc('quiz_admin_users'); if (r.error) return 0; return (r.data || []).filter(function (x) { return x.status === 'pending'; }).length; } catch (e) { return 0; } }
  var ago = function (t) { if (!t) return '없음'; var m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전'; };
  async function adminPanel() {
    var o = sheet('<h2>사용자 관리</h2><div id="p2AL" class="p2a-load">불러오는 중…</div><div class="p2g-msg" id="p2M"></div>', true);
    var L = $('#p2AL', o);
    async function load() {
      var r = await st.sb.rpc('quiz_admin_users');
      if (r.error) { L.textContent = '불러오지 못했어요: ' + r.error.message; return; }
      var rows = r.data || [], me = (st.user.email || '').toLowerCase();
      var P = rows.filter(function (x) { return x.status === 'pending'; }), A = rows.filter(function (x) { return x.status === 'approved'; }), R = rows.filter(function (x) { return x.status === 'revoked'; });
      var tot = A.reduce(function (s, x) { return s + ((x.stats || {}).done || 0); }, 0);
      var card = function (x) {
        var s = x.stats || {}, self = x.email === me;
        var act = x.status === 'pending' ? '<button class="p2a-b ok" data-ap="' + esc(x.email) + '">승인</button><button class="p2a-b" data-rj="' + esc(x.email) + '">거절</button>'
          : x.status === 'revoked' ? '<button class="p2a-b ok" data-ap="' + esc(x.email) + '">다시 승인</button>'
          : self ? '<span class="p2a-tag">나</span>' : '<button class="p2a-b" data-tp="' + esc(x.email) + '">임시 비밀번호</button><button class="p2a-b warn" data-rv="' + esc(x.email) + '">해제</button>';
        var stat = x.status === 'approved' ? '<div class="p2a-st"><span><b>' + (s.done || 0) + '</b>푼 문제</span><span><b>' + (s.pct || 0) + '%</b>정답률</span><span><b>' + (s.days7 || 0) + '일</b>최근 7일</span><span><b>' + (s.lastMock ? s.lastMock.sc + '점' : '–') + '</b>최근 모의고사</span></div>' : '';
        return '<div class="p2a-r"><div class="p2a-h"><div><b>' + esc(x.name || '(이름 없음)') + '</b><small>' + esc(x.email) + '</small></div><div class="p2a-act">' + act + '</div></div>' + stat +
          '<div class="p2a-m">' + (x.status === 'pending' ? '가입 ' + ago(x.created_at) : '마지막 학습 ' + ago(x.synced_at) + ' · 접속 ' + ago(x.last_seen || x.last_sign_in)) + '</div></div>';
      };
      L.className = '';
      L.innerHTML = '<div class="p2a-sum"><span><b>' + A.length + '</b>사용 중</span><span><b>' + P.length + '</b>승인 대기</span><span><b>' + tot.toLocaleString() + '</b>전체 풀이</span></div>' +
        (P.length ? '<h3>승인 대기 ' + P.length + '</h3>' + P.map(card).join('') : '') +
        '<h3>사용 중 ' + A.length + '</h3>' + (A.length ? A.map(card).join('') : '<p class="p2a-e">아직 없어요.</p>') +
        (R.length ? '<h3>해제됨 ' + R.length + '</h3>' + R.map(card).join('') : '');
      L.querySelectorAll('button').forEach(function (b) { b.onclick = function () { act(b); }; });
    }
    async function act(b) {
      var r, M = function (t, ok) { msg(o, t, ok); };
      if (b.dataset.ap) { r = await st.sb.rpc('quiz_admin_set', { p_email: b.dataset.ap, p_status: 'approved' }); M(r.error ? '승인 실패: ' + r.error.message : b.dataset.ap + ' 승인했어요.', !r.error); }
      else if (b.dataset.rv || b.dataset.rj) {
        if (b.dataset.arm !== '1') { b.dataset.arm = '1'; b.textContent = '한 번 더'; return; }
        r = b.dataset.rv ? await st.sb.rpc('quiz_admin_set', { p_email: b.dataset.rv, p_status: 'revoked' }) : await st.sb.rpc('quiz_admin_reject', { p_email: b.dataset.rj });
        M(r.error ? '실패: ' + r.error.message : (b.dataset.rv ? b.dataset.rv + ' 사용을 해제했어요.' : b.dataset.rj + ' 가입을 거절했어요.'), !r.error);
      } else if (b.dataset.tp) { tempPw(b.dataset.tp); return; }
      load();
    }
    load();
  }
  function tempPw(email) {
    var o = sheet('<h2>임시 비밀번호</h2><p class="p2g-p">' + esc(email) + '</p><form id="p2TF"><label>임시 비밀번호 <small>10자 이상</small><input id="p2T1" type="text" autocomplete="off" minlength="10" required></label><button class="p2g-btn pri" type="submit">정하기</button></form><div class="p2g-msg" id="p2M"></div><p class="p2g-small">본인에게 직접 알려 주고, 로그인 후 설정 → 「비밀번호 바꾸기」를 하게 하세요.</p>');
    $('#p2TF', o).onsubmit = async function (e) { e.preventDefault(); var i = $('#p2T1', o); var r = await st.sb.rpc('admin_set_password', { p_email: email, p_password: i.value }); i.value = ''; msg(o, r.error ? '실패: ' + r.error.message : '정했어요. 본인에게 알려 주세요.', !r.error); };
  }

  function legacy() { entered = true; var s = document.createElement('script'); s.src = 'app.js?v=' + (window.BUILD || ''); document.body.appendChild(s); }
  window.P2A = { settingsHTML: settingsHTML, bindSettings: bindSettings, me: null, sync: function () { return push(); } };

  /* ── 시작 ── */
  async function boot() {
    if (!window.supabase || !window.supabase.createClient) { screen('<h1>불러오지 못했어요</h1><p class="p2g-p">인터넷 연결을 확인하고 새로고침해 주세요.</p>'); return; }
    st.sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { storageKey: 'promo2-sb', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    var c = cachedAuth();
    var got = await st.sb.auth.getSession(), session = got.data && got.data.session;
    if (!session) {
      // 서버 준비 전(진급시험용 SQL 미적용)이면 예전처럼 로그인 없이 열기
      try { var pr = await st.sb.rpc('quiz_me'); var er = pr.error; if (er && (er.code === 'PGRST202' || /Could not find the function/i.test(er.message || ''))) { window.P2A = null; legacy(); return; } } catch (e) { }
      showLogin(); return;
    }
    if (c && c.uid === session.user.id && c.status === 'approved') { // 빠른 시작: 지난번 승인 상태로 바로 열고 뒤에서 확인
      st.user = session.user; st.me = c;
      await Promise.race([pull(), new Promise(function (r) { setTimeout(r, 2500); })]);
      enter();
      st.sb.rpc('quiz_me').then(function (r) {
        var me = r.data && (Array.isArray(r.data) ? r.data[0] : r.data);
        if (!r.error && me && me.status !== 'approved') { rm(AUTHC); location.reload(); return; }
        if (!r.error && me) { st.me.is_admin = !!me.is_admin; st.me.name = me.name || st.me.name; wr(AUTHC, JSON.stringify(st.me)); }
      }).catch(function () { });
      return;
    }
    afterLogin(session);
    st.sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && entered) location.reload(); });
  }
  /* 새 버전 확인: 앱을 백그라운드에서 다시 열 때도 확인해서 최신으로 */
  var lastChk = 0;
  function checkVer() {
    if (!window.BUILD || location.protocol === 'file:' || Date.now() - lastChk < 60000) return; lastChk = Date.now();
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.v || j.v === window.BUILD) return;
      var k = 'promo2-reloaded-' + j.v; try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) { }
      if (st.timer) { clearTimeout(st.timer); push(); }
      setTimeout(function () { location.replace(location.pathname + '?v=' + j.v + location.hash); }, 300);
    }).catch(function () { });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkVer(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js').catch(function () { }); } catch (e) { } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
