// ==UserScript==
// @name         ÖBA Otomatik İlerle
// @namespace    mehmetkaradeniz
// @version      1.4
// @description  Video bitince listedeki sıradaki bölümü açar, soru gelince sesli uyarır.
// @author       Mehmet Karadeniz, 2026-2027
// @match        *://*.oba.gov.tr/*
// @match        *://oba.gov.tr/*
// @homepageURL  https://karadenizmehmet-debug.github.io/Oba-oto/
// @updateURL    https://karadenizmehmet-debug.github.io/Oba-oto/oba-oto.user.js
// @downloadURL  https://karadenizmehmet-debug.github.io/Oba-oto/oba-oto.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ANAHTAR = 'obaOtoIlerleAcik';
  const DUGME_METNI = /^\s*(sonraki|ileri|devam|devam et|next)\b/i;
  // Bölüm bağlantıları süre içerir: "Bölüm 1 (12dk 28sn)"
  const BOLUM_METNI = /\(\s*\d+\s*dk/i;
  const BEKLEME_MS = 2500;

  let acik = localStorage.getItem(ANAHTAR) !== '0';
  let durumYazisi = '';
  let rozetGuncelle = () => {};

  const durum = (yazi) => {
    durumYazisi = yazi;
    console.log('[ÖBA Oto]', yazi);
    rozetGuncelle();
  };

  // Sadece üst pencerede aç/kapa rozeti göster
  if (window.top === window.self) {
    const rozet = document.createElement('div');
    rozetGuncelle = () => {
      rozet.textContent = (acik ? '▶ Oto-ilerle: AÇIK' : '⏸ Oto-ilerle: KAPALI') +
        (durumYazisi ? '\n' + durumYazisi : '');
      rozet.style.background = acik ? '#1b7f3b' : '#777';
    };
    Object.assign(rozet.style, {
      position: 'fixed', bottom: '12px', right: '12px', zIndex: 2147483647,
      color: '#fff', padding: '6px 10px', borderRadius: '8px', whiteSpace: 'pre-line',
      font: '13px sans-serif', cursor: 'pointer', boxShadow: '0 2px 6px #0005', maxWidth: '70vw'
    });
    rozet.onclick = () => {
      acik = !acik;
      localStorage.setItem(ANAHTAR, acik ? '1' : '0');
      rozetGuncelle();
    };
    rozetGuncelle();
    document.body.appendChild(rozet);
  }

  const gorunur = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  // Kilitli / soluk bölüm mü? (Bölüm 2 gibi henüz açılmamış olanlar)
  const kilitli = (el) => {
    for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      const s = getComputedStyle(e);
      if (parseFloat(s.opacity) < 0.8 || s.pointerEvents === 'none') return true;
      if (/disabled|locked|pasif|kilit/i.test(e.className || '')) return true;
      if (e.getAttribute && e.getAttribute('aria-disabled') === 'true') return true;
    }
    return false;
  };

  // Bölümün satırında yeşil tik var mı?
  const tamamlandi = (el) => {
    const satir = el.closest('li, tr, .row, [class*="item"], [class*="lesson"], [class*="ders"]') || el.parentElement;
    if (!satir) return false;
    if (/success|complete|tamam|done|check/i.test(satir.innerHTML.slice(0, 2000))) {
      // Turuncu halka (devam ediyor) ile yeşil tik ayrımı: renge bak
      for (const ikon of satir.querySelectorAll('svg, i, img, span')) {
        if (ikon === el || el.contains(ikon)) continue;
        const s = getComputedStyle(ikon);
        const renk = (s.color + ' ' + s.backgroundColor + ' ' + s.fill).match(/\d+/g);
        if (!renk) continue;
        for (let i = 0; i + 2 < renk.length; i += 3) {
          const [r, g, b] = renk.slice(i, i + 3).map(Number);
          if (g > 120 && g > r + 40 && g > b + 20) return true; // yeşil
        }
      }
    }
    return false;
  };

  const bolumler = () =>
    [...document.querySelectorAll('a, [role="button"], button, li > span, li > div')]
      .filter((el) => BOLUM_METNI.test(el.textContent || '') && (el.textContent || '').length < 120)
      // iç içe eşleşmelerde en içtekini tut
      .filter((el, _, hepsi) => !hepsi.some((d) => d !== el && el.contains(d)));

  const suankiBolum = (liste) => {
    const adres = location.href.split('#')[0];
    return liste.findIndex((el) => {
      const href = el.href || (el.closest('a') && el.closest('a').href);
      if (href && href.split('#')[0] === adres) return true;
      const sinif = (el.className || '') + ' ' + ((el.closest('li') || {}).className || '');
      return /active|aktif|selected|current/i.test(sinif);
    });
  };

  // Kapalı bölüm başlıklarını (+) aç ki içteki bölümler görünsün
  const basliklariAc = () => {
    document.querySelectorAll('[aria-expanded="false"], .collapsed').forEach((b) => {
      if (gorunur(b)) b.click();
    });
  };

  const sonrakiBolum = () => {
    let liste = bolumler();
    const i = suankiBolum(liste);
    if (i >= 0 && liste[i + 1] && !kilitli(liste[i + 1])) return liste[i + 1];
    // Yedek: tamamlanmamış ve kilitsiz ilk bölüm
    let aday = liste.find((el) => gorunur(el) && !kilitli(el) && !tamamlandi(el));
    if (aday) return aday;
    basliklariAc();
    liste = bolumler();
    return liste.find((el) => gorunur(el) && !kilitli(el) && !tamamlandi(el)) || null;
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
    durum('Soru var, cevap bekleniyor');
    bip();
    uyariDongusu = setInterval(() => {
      if (!soruVar()) {
        clearInterval(uyariDongusu);
        uyariDongusu = null;
        document.title = eskiBaslik;
        durum('');
        return;
      }
      bip();
    }, 5000);
  };

  let ilerliyor = false;
  const ilerle = () => {
    if (!acik || ilerliyor) return;
    ilerliyor = true;
    setTimeout(() => {
      ilerliyor = false;
      if (soruVar()) { uyar(); return; }
      const hedef = sonrakiDugmesi() || sonrakiBolum();
      if (!hedef) { durum('Sıradaki bölüm bulunamadı'); return; }
      const ad = (hedef.textContent || hedef.value || '').trim().slice(0, 40);
      durum('Açılıyor: ' + ad);
      hedef.scrollIntoView({ block: 'center' });
      (hedef.closest('a') || hedef).click();
      setTimeout(videolariBagla, 1500);
    }, BEKLEME_MS);
  };

  const videolariBagla = () => {
    document.querySelectorAll('video').forEach((v) => {
      if (v.dataset.obaOto) return;
      v.dataset.obaOto = '1';
      v.addEventListener('ended', ilerle);
      if (acik && v.paused && !v.ended && v.currentTime === 0) {
        v.play().then(() => durum(''), () => durum('Oynat\'a bir kez dokun'));
      }
    });
  };

  // Yedek: "ended" olayı kaçarsa bitmiş videoyu yoklamayla yakala
  let bitikSure = 0;
  setInterval(() => {
    videolariBagla();
    if (!acik) return;
    if (soruVar()) { uyar(); return; }
    const v = document.querySelector('video');
    const bitti = v && (v.ended || (v.duration > 0 && v.duration - v.currentTime < 0.5 && v.paused));
    bitikSure = bitti ? bitikSure + 1 : 0;
    if (bitikSure === 3) ilerle(); // ~6 sn bitmiş durumda kaldıysa
  }, 2000);
  videolariBagla();
})();
