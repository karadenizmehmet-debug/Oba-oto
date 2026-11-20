// ==UserScript==
// @name         ÖBA Otomatik İlerle
// @namespace    mehmetkaradeniz
// @version      1.3
// @description  Video bitince "Sonraki/İleri/Devam" düğmesine basar, sıradaki videoyu başlatır.
// @author       Mehmet Karadeniz, 2026-2027
// @match        *://*.oba.gov.tr/*
// @match        *://oba.gov.tr/*
// @homepageURL  https://karadenizmehmet-debug.github.io/oba-oto/
// @updateURL    https://karadenizmehmet-debug.github.io/oba-oto/oba-oto.user.js
// @downloadURL  https://karadenizmehmet-debug.github.io/oba-oto/oba-oto.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ANAHTAR = 'obaOtoIlerleAcik';
  const DUGME_METNI = /^\s*(sonraki|ileri|devam|devam et|next|tamam)\b/i;
  const BEKLEME_MS = 2500;

  let acik = localStorage.getItem(ANAHTAR) !== '0';

  // Sadece üst pencerede aç/kapa rozeti göster
  if (window.top === window.self) {
    const rozet = document.createElement('div');
    const guncelle = () => {
      rozet.textContent = acik ? '▶ Oto-ilerle: AÇIK' : '⏸ Oto-ilerle: KAPALI';
      rozet.style.background = acik ? '#1b7f3b' : '#777';
    };
    Object.assign(rozet.style, {
      position: 'fixed', bottom: '12px', right: '12px', zIndex: 2147483647,
      color: '#fff', padding: '6px 10px', borderRadius: '8px',
      font: '13px sans-serif', cursor: 'pointer', boxShadow: '0 2px 6px #0005'
    });
    rozet.onclick = () => {
      acik = !acik;
      localStorage.setItem(ANAHTAR, acik ? '1' : '0');
      guncelle();
    };
    guncelle();
    document.body.appendChild(rozet);
  }

  const gorunur = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  const sonrakiDugmesi = () => {
    const adaylar = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
    for (const el of adaylar) {
      const metin = (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim();
      if (DUGME_METNI.test(metin) && gorunur(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        return el;
      }
    }
    return null;
  };

  // Ekranda soru (seçenek / metin kutusu) varsa tıklama yapma, uyar
  const soruVar = () =>
    [...document.querySelectorAll('input[type="radio"], input[type="checkbox"], textarea, select')]
      .some(gorunur);

  let ses = null;
  let uyariDongusu = null;

  // Kullanıcı sayfaya ilk dokunduğunda sesi hazırla (tarayıcılar ilk etkileşimi ister)
  const sesHazirla = () => {
    try {
      if (!ses) ses = new (window.AudioContext || window.webkitAudioContext)();
      if (ses.state === 'suspended') ses.resume();
    } catch (e) {}
  };
  ['click', 'touchstart', 'keydown'].forEach((t) =>
    document.addEventListener(t, sesHazirla, { capture: true, passive: true })
  );

  const bip = () => {
    sesHazirla();
    if (!ses) return;
    [0, 0.25, 0.5].forEach((gecikme) => {
      const o = ses.createOscillator();
      const g = ses.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.6;
      o.connect(g);
      g.connect(ses.destination);
      o.start(ses.currentTime + gecikme);
      o.stop(ses.currentTime + gecikme + 0.15);
    });
    try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {}
  };

  // Soru ekrandan kalkana kadar her 5 sn'de bir uyar
  const uyar = () => {
    if (uyariDongusu) return;
    const eskiBaslik = document.title.replace(/^❓ SORU VAR - /, '');
    document.title = '❓ SORU VAR - ' + eskiBaslik;
    bip();
    uyariDongusu = setInterval(() => {
      if (!soruVar()) {
        clearInterval(uyariDongusu);
        uyariDongusu = null;
        document.title = eskiBaslik;
        return;
      }
      bip();
    }, 5000);
  };

  const ilerle = () => {
    if (!acik) return;
    setTimeout(() => {
      if (soruVar()) {
        console.log('[ÖBA Oto] Soru var, bekleniyor.');
        uyar();
        return;
      }
      const d = sonrakiDugmesi();
      if (d) {
        console.log('[ÖBA Oto] Tıklanıyor:', d.innerText || d.value);
        d.click();
      } else {
        console.log('[ÖBA Oto] Sonraki düğmesi bulunamadı.');
      }
    }, BEKLEME_MS);
  };

  const videolariBagla = () => {
    document.querySelectorAll('video').forEach((v) => {
      if (v.dataset.obaOto) return;
      v.dataset.obaOto = '1';
      v.addEventListener('ended', ilerle);
      // Yeni açılan video duruyorsa başlatmayı dene
      if (acik && v.paused && !v.ended && v.currentTime === 0) {
        v.play().catch(() => {});
      }
    });
  };

  setInterval(() => {
    videolariBagla();
    // Video ortasında açılan sorular için de uyar
    if (acik && soruVar()) uyar();
  }, 2000);
  videolariBagla();
})();
