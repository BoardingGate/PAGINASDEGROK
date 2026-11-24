/* Carrusel de mejores tuits recientes · constructor de vídeo
   ?modo=grabar  -> sin cursor, sin escalado, reloj controlado por window.setTime(t)
   ?t=12.5       -> congela la animación en ese instante (útil para depurar) */
(() => {
  const P = new URLSearchParams(location.search);
  const GRABAR = P.get('modo') === 'grabar';
  const CFG = { fadeIn: 0.6, fadeOut: 0.6, pausaIni: 1.0, pausaFin: 1.5, vel: 48, // px/s
                baseLectura: 2.5, porPalabra: 0.25, minLectura: 5, cola: 0.4,
                avatarFps: 24, avatarFrames: 96 };
  const $ = (s) => document.querySelector(s);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const recortar = (s, n = 240) => { s = s.replace(/\n{2,}/g, '\n').trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(' '), c.lastIndexOf('\n'), 1)).replace(/[\s,.;:]+$/, '') + '…'; };
  const enlazar = (s) => esc(s).replace(/(^|[\s(])([@$#][\p{L}\p{N}_]+)/gu, '$1<span class="az">$2</span>');
  const fmtN = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + ' K' : String(n);
  const fmtFecha = (iso) => {
    const d = new Date(iso);
    const h = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(/\./g, '');
    return `${h} · ${f}`;
  };
  const ICO = {
    resp: '<svg viewBox="0 0 24 24"><path d="M3 11.5a8.5 8.5 0 0 1 8.5-8.5h1A8.5 8.5 0 0 1 21 11.5 8.5 8.5 0 0 1 12.5 20H8l-4 3v-4.6A8.4 8.4 0 0 1 3 11.5z"/></svg>',
    rp: '<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    mg: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.800-8 11-8 11z"/></svg>',
    vi: '<svg viewBox="0 0 24 24"><path d="M5 21V10M12 21V3M19 21v-7"/></svg>'
  };

  const imgs = [];
  const cargarImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(i); i.src = src; imgs.push(i); });

  let items = [], total = 0, avatarImgs = [];

  function construir(data) {
    const pista = $('#pista'), puntos = $('#puntos');
    data.tuits.forEach((t, i) => {
      const el = document.createElement('article'); el.className = 'item';
      const c = t.cita;
      el.innerHTML = `<div class="inner">
        <div class="texto">${enlazar(t.texto)}</div>
        ${t.imagen ? `<img class="foto-propia" src="${t.imagen}" alt="">` : ''}
        ${c ? `<div class="cita"><div class="cc"><div class="cab"><img src="${c.avatar}" alt=""><div><div class="cn">${esc(c.autor)}</div><div class="cu">@${esc(c.usuario)}</div></div></div><div class="ct">${enlazar(recortar(c.texto))}</div></div>${c.imagen ? `<img class="foto" src="${c.imagen}" alt="">` : ''}</div>` : ''}
        <div class="fecha">${fmtFecha(t.fecha)} · <b>${fmtN(t.metricas.vistas)}</b> vistas</div>
        <div class="metricas">
          <span>${ICO.resp}<b>${fmtN(t.metricas.respuestas)}</b></span>
          <span>${ICO.rp}<b>${fmtN(t.metricas.reposts)}</b></span>
          <span>${ICO.mg}<b>${fmtN(t.metricas.me_gusta)}</b></span>
          <span>${ICO.vi}<b>${fmtN(t.metricas.vistas)}</b></span>
        </div></div>`;
      if (!t.cita && !t.imagen && t.texto.length <= 220) el.classList.add('grande');
      el.dataset.url = t.url; el._t = t;
      pista.appendChild(el);
      const d = document.createElement('i'); puntos.appendChild(d);
    });
  }

  function planificar(vistaH) {
    let t0 = 0;
    items = [...document.querySelectorAll('.item')].map((el) => {
      const H = el.querySelector('.inner').offsetHeight;
      const palabras = (el._t.texto + ' ' + (el._t.cita ? el._t.cita.texto : '')).split(/\s+/).filter(Boolean).length;
      const cabe = H <= vistaH;
      const recorrido = cabe ? 0 : H - vistaH;
      const lectura = Math.max(CFG.minLectura, CFG.baseLectura + CFG.porPalabra * palabras);
      const hold = cabe ? lectura : CFG.pausaIni + recorrido / CFG.vel + CFG.pausaFin;
      const it = { el, H, cabe, recorrido, hold, palabras, ini: t0, finIn: t0 + CFG.fadeIn,
                   iniOut: t0 + CFG.fadeIn + hold, fin: t0 + CFG.fadeIn + hold + CFG.fadeOut };
      t0 = it.fin; return it;
    });
    total = t0 + CFG.cola;
  }

  function setTime(t) {
    t = Math.max(0, Math.min(t, total));
    let act = -1;
    items.forEach((it, i) => {
      let op = 0, y = 0;
      if (t >= it.ini && t < it.fin) {
        act = i;
        if (t < it.finIn) op = (t - it.ini) / CFG.fadeIn;
        else if (t < it.iniOut) op = 1; else op = 1 - (t - it.iniOut) / CFG.fadeOut;
        if (!it.cabe) {
          const s = t - it.finIn - CFG.pausaIni;
          y = Math.max(0, Math.min(it.recorrido, s * CFG.vel));
        }
      }
      it.el.style.opacity = Math.max(0, Math.min(1, op)).toFixed(4);
      it.el.style.transform = `translate3d(0,${(-y).toFixed(2)}px,0)`;
      it.el.style.visibility = op > 0 ? 'visible' : 'hidden';
    });
    [...$('#puntos').children].forEach((d, i) => d.classList.toggle('on', i === act));
    window.__actual = act;
    // gorila: boca que se abre y se cierra (2 fotogramas) con ritmo de habla
    const g = gorila(t);
    $('#g-abierta').style.visibility = g.abierta ? 'visible' : 'hidden';
    $('#g-cerrada').style.visibility = g.abierta ? 'hidden' : 'visible';
  }

  // ciclo de 4 s: frases cortas (abre/cierra) y una pausa con la boca cerrada
  const BOCA = [[0.00,0.22],[0.40,0.62],[0.80,1.00],[1.20,1.50],[2.30,2.52],[2.70,2.95],[3.10,3.30]];
  function gorila(t) {
    const c = t % 4;
    const abierta = BOCA.some(([a, b]) => c >= a && c < b);
    return { abierta }; // sin balanceo: la mano queda fija sobre el borde
  }

  function escalar() {
    if (GRABAR) return;
    const k = Math.min(innerWidth / 1080, innerHeight / 1350);
    $('#escala').style.transform = `scale(${k})`;
    $('#escala').style.left = ((innerWidth - 1080 * k) / 2) + 'px';
  }

  async function init() {
    if (GRABAR) document.body.classList.add('grabar');
    const data = await (await fetch(P.get('datos') || 'tuits.json', { cache: 'no-store' })).json();
    construir(data);
    const cargas = [];
    data.tuits.forEach((t) => { if (t.imagen) cargas.push(cargarImg(t.imagen)); if (t.cita) { cargas.push(cargarImg(t.cita.avatar)); if (t.cita.imagen) cargas.push(cargarImg(t.cita.imagen)); } });
    const av = [cargarImg('assets/gorila-arriba-cerrada.png'), cargarImg('assets/gorila-arriba-abierta.png')];
    await Promise.all([...cargas, ...av, document.fonts.ready]);
    await Promise.all(imgs.map((i) => i.decode ? i.decode().catch(() => {}) : 0));
    planificar($('#vista').clientHeight);
    window.__plan = items.map((i) => ({ id: i.el._t.id, vistas: i.el._t.metricas.vistas, alto: i.H, cabe: i.cabe, recorrido: i.recorrido, hold: +i.hold.toFixed(2), ini: +i.ini.toFixed(2), fin: +i.fin.toFixed(2), palabras: i.palabras }));
    window.__duration = total;
    window.setTime = setTime;
    escalar(); addEventListener('resize', escalar);
    if (P.has('t')) { setTime(parseFloat(P.get('t'))); }
    else if (!GRABAR) {
      const t0 = performance.now();
      const tick = (n) => { setTime(((n - t0) / 1000) % total); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      document.body.style.cursor = 'pointer';
      document.body.addEventListener('click', () => { const a = items[window.__actual]; window.open(a ? a.el.dataset.url : 'https://x.com/boardinggate', '_blank'); });
    } else setTime(0);
    window.__ready = true;
  }
  init();
})();
