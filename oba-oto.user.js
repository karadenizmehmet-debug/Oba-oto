// ==UserScript==
// @name         ÖBA Otomatik İlerle
// @namespace    mehmetkaradeniz
// @version      1.17
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

  // Çerçeve (iframe) içinde: yalnızca SCORM/Storyline içeriğinde çalış, gerisini üst sayfa yapar
  if (window.top !== window.self) {
    if (/\/scorm-packages\//.test(location.pathname)) scormModu();
    return;
  }

  const ANAHTAR = 'obaOtoIlerleAcik';
  const DUGME_METNI = /^\s*(sonraki|ileri|devam|devam et|next)\b/i;
  // Bölüm bağlantıları süre içerir: "Bölüm 1 (12dk 28sn)"
  const BOLUM_METNI = /\(\s*\d+\s*dk/i;
  const BEKLEME_MS = 2500;

  let acik = localStorage.getItem(ANAHTAR) !== '0';
  let durumYazisi = '';
  let rozetGuncelle = () => {};

  // SCORM çerçevesinden gelen mesajlar
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.obaOto) return;
    const m = e.data;
    if (m.tip === 'durum') durum(m.yazi);
    if (m.tip === 'uyari') { durum(m.yazi); bip(); }
    if (m.tip === 'bitti') { durum('İçerik bitti, sonraki bölüme geçiliyor'); ilerle(); }
  });

  const durum = (yazi) => {
    durumYazisi = yazi;
    console.log('[ÖBA Oto]', yazi);
    rozetGuncelle();
  };

  // Sadece üst pencerede aç/kapa rozeti göster
  if (window.top === window.self) {
    const kutu = document.createElement('div');
    kutu.id = 'oba-oto-rozet';
    Object.assign(kutu.style, {
      position: 'fixed', bottom: '12px', right: '12px', zIndex: 2147483647,
      display: 'flex', gap: '6px', alignItems: 'flex-end'
    });
    const tani = document.createElement('div');
    tani.textContent = '?';
    Object.assign(tani.style, {
      background: '#334', color: '#fff', borderRadius: '8px', padding: '6px 10px',
      font: 'bold 13px sans-serif', cursor: 'pointer', boxShadow: '0 2px 6px #0005'
    });
    tani.title = 'Tanı bilgisini kopyala';
    tani.onclick = async () => {
      const metin = taniMetni();
      try { await navigator.clipboard.writeText(metin); durum('Tanı kopyalandı, Claude\'a yapıştır'); }
      catch (e) { prompt('Kopyala:', metin); }
    };
    const rozet = document.createElement('div');
    rozetGuncelle = () => {
      rozet.textContent = (acik ? '▶ Oto-ilerle: AÇIK' : '⏸ Oto-ilerle: KAPALI') +
        (durumYazisi ? '\n' + durumYazisi : '');
      rozet.style.background = acik ? '#1b7f3b' : '#777';
    };
    Object.assign(rozet.style, {
      color: '#fff', padding: '6px 10px', borderRadius: '8px', whiteSpace: 'pre-line',
      font: '13px sans-serif', cursor: 'pointer', boxShadow: '0 2px 6px #0005', maxWidth: '70vw'
    });
    rozet.onclick = () => {
      acik = !acik;
      localStorage.setItem(ANAHTAR, acik ? '1' : '0');
      rozetGuncelle();
    };
    rozetGuncelle();
    kutu.append(tani, rozet);
    document.body.appendChild(kutu);
  }

  const gorunur = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  // Bölüm adları süre içerir: "Giriş (1dk 26sn)". Metin düğümünden bul, etiket türüne bakma.
  const bolumler = () => {
    const sonuc = [];
    const gezgin = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = gezgin.nextNode())) {
      if (!BOLUM_METNI.test(n.nodeValue)) continue;
      const el = n.parentElement;
      if (!el || el.closest('#oba-oto-rozet') || sonuc.includes(el)) continue;
      if (gorunur(el)) sonuc.push(el);
    }
    return sonuc;
  };

  // Bölümün satırı: içinde yalnızca bu bölüm olan en büyük üst öğe
  const satirBul = (el, liste) => {
    let satir = el;
    while (satir.parentElement && satir.parentElement !== document.body &&
           liste.filter((x) => satir.parentElement.contains(x)).length === 1) {
      satir = satir.parentElement;
    }
    return satir;
  };

  // Kilitli / soluk mu? (henüz açılmamış bölümler soluk görünür)
  const kilitli = (el, satir) => {
    for (let e = el; e && e !== satir.parentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (parseFloat(s.opacity) < 0.8 || s.pointerEvents === 'none') return true;
      if (/disabled|locked|pasif|kilit|passive/i.test(e.getAttribute('class') || '')) return true;
      if (e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled')) return true;
    }
    const renk = getComputedStyle(el).color.match(/[\d.]+/g);
    if (renk && renk.length >= 4 && parseFloat(renk[3]) < 0.7) return true;
    return false;
  };

  // Satırdaki simgede tik (check) varsa bölüm izlenmiş
  const tamamlandi = (satir) => {
    for (const e of satir.querySelectorAll('*')) {
      const sinif = (e.getAttribute('class') || '') + ' ' + (e.getAttribute('data-icon') || '') +
        ' ' + (e.getAttribute('src') || '') + ' ' + (e.getAttribute('alt') || '');
      if (/check|tick|complete|tamam|done|izlendi/i.test(sinif)) return true;
    }
    return /[✓✔]|check_circle/.test(satir.textContent);
  };

  const bolumDurumlari = () => {
    const liste = bolumler();
    return liste.map((el) => {
      const satir = satirBul(el, liste);
      return { el, satir, bitti: tamamlandi(satir), kilit: kilitli(el, satir) };
    });
  };

  // --- ÖBA oynatma sayfasına özel (a.course-player-object-item listesi) ---
  // Simge metni: check_circle = bitti, timelapse = yarım, radio_button_unchecked = başlanmadı
  // isDisabled sınıfı = kilitli
  const obaListesi = () => [...document.querySelectorAll('a.course-player-object-item')];
  const obaKilitli = (a) => a.classList.contains('isDisabled');
  const obaSimge = (a) => {
    const birim = a.closest('.meta-info-unit');
    return birim ? birim.querySelector('.icon') : null;
  };
  // Şu anki bölüm: adres eşleşmesi, yoksa simgesi yeşil (text-success) olan
  const obaSuanki = (liste) => {
    const i = liste.findIndex((a) => a.pathname === location.pathname);
    if (i >= 0) return i;
    return liste.findIndex((a) => { const ic = obaSimge(a); return ic && ic.classList.contains('text-success'); });
  };
  const obaBitti = (a) => { const ic = obaSimge(a); return !!ic && /check_circle/.test(ic.textContent); };

  const BEKLEYEN = 'obaOtoBekleyen';
  let denemeSayisi = 0;

  const obaSonraki = () => {
    const liste = obaListesi();
    if (!liste.length) return undefined; // ÖBA listesi yok, genel yönteme geç
    const i = obaSuanki(liste);
    // Şu anki bulunamazsa: bitmemiş ve kilitsiz ilk bölüm (bitmişlere geri dönme)
    const sonraki = i >= 0 ? liste[i + 1] : liste.find((a) => !obaKilitli(a) && !obaBitti(a));
    if (!sonraki) { durum('Son bölüm, eğitim bitti'); return null; }
    if (obaKilitli(sonraki)) {
      // ÖBA kilidi birkaç saniye geç açabilir: bekle, olmazsa sayfayı yenile
      denemeSayisi++;
      if (denemeSayisi <= 8) {
        durum(`Sonraki kilitli, bekleniyor (${denemeSayisi}/8)`);
        setTimeout(ilerle, 3000);
      } else if (sessionStorage.getItem(BEKLEYEN + 'Yenilendi') !== location.pathname) {
        // Yalnızca bir kez yenile; yenileme döngüsüne girme
        durum('Kilit açılmadı, sayfa yenileniyor');
        sessionStorage.setItem(BEKLEYEN, location.pathname);
        sessionStorage.setItem(BEKLEYEN + 'Yenilendi', location.pathname);
        location.reload();
      } else {
        durum('Sonraki bölüm kilitli: bu bölümü bitir');
        denemeSayisi = 0;
      }
      return null;
    }
    denemeSayisi = 0;
    sessionStorage.removeItem(BEKLEYEN + 'Yenilendi');
    return sonraki;
  };

  // İzlenmemiş ve kilitsiz ilk bölüm (ÖBA listesi bulunamazsa genel yöntem)
  const sonrakiBolum = () => {
    const oba = obaSonraki();
    if (oba !== undefined) return oba;
    const d = bolumDurumlari();
    const hedef = d.find((b) => !b.bitti && !b.kilit);
    if (!hedef) {
      durum(`Bulunamadı (bölüm ${d.length}, biten ${d.filter((b) => b.bitti).length}, kilitli ${d.filter((b) => b.kilit).length})`);
      return null;
    }
    return hedef.el;
  };

  // Tanı bilgisi: ilk izlenmemiş satırın HTML'i (bana göndermek için)
  const taniMetni = () => {
    const d = bolumDurumlari();
    const satirlar = d.slice(0, 6).map((b, i) =>
      `#${i} bitti=${b.bitti} kilit=${b.kilit} | ${b.satir.outerHTML.replace(/\s+/g, ' ').slice(0, 700)}`);
    // Etkileşimli içerikler (Storyline vb.) iframe içinde açılır: kaynaklarını ve düğmelerini listele
    const cerceveler = [...document.querySelectorAll('iframe')].map((f, i) => {
      let ic = 'erişilemiyor (başka alan adı)';
      try {
        const doc = f.contentDocument;
        if (doc) {
          const dugmeler = [...doc.querySelectorAll('button, [role="button"], a, [tabindex]')]
            .filter((e) => e.getBoundingClientRect().width > 0)
            .slice(0, 25)
            .map((e) => `${e.tagName.toLowerCase()}#${e.id || '-'}.${String(e.className || '').slice(0, 40)} "${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 40)}"`);
          ic = `video=${doc.querySelectorAll('video').length} audio=${doc.querySelectorAll('audio').length}\n   ` + dugmeler.join('\n   ');
        }
      } catch (e) {}
      return `iframe#${i} ${f.src}\n   ${ic}`;
    });
    const ol = obaListesi();
    const obaBilgi = `oba-liste=${ol.length} şu-an=${obaSuanki(ol)} ` +
      ol.slice(0, 12).map((a) => `[${a.pathname.split('/').pop()}${obaKilitli(a) ? ' kilitli' : ''}]`).join(' ');
    return `ÖBA Oto tanı ${location.pathname}\nbölüm=${d.length}\n${obaBilgi}\n` + satirlar.join('\n\n') +
      `\n\nIFRAME (${cerceveler.length})\n` + cerceveler.join('\n');
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
      if (!hedef) return;
      const ad = (hedef.textContent || hedef.value || '').trim().slice(0, 40);
      durum('Açılıyor: ' + ad);
      hedef.scrollIntoView({ block: 'center' });
      const tik = hedef.closest('a, button, [role="button"], [onclick]') || hedef;
      tik.click();
      // Tıklama sayfayı değiştirmezse bağlantıya doğrudan git
      if (tik.href) setTimeout(() => { if (location.href !== tik.href) location.href = tik.href; }, 3000);
      setTimeout(videolariBagla, 1500);
    }, BEKLEME_MS);
  };

  // Video başta duruyorsa başlatmayı dene. Tarayıcı sesli otomatik oynatmayı
  // engelleyebilir; o zaman ekrana ilk dokunuşta ya da sayfaya dönüşte tekrar dener.
  const oynatmayiDene = () => {
    if (!acik) return;
    document.querySelectorAll('video').forEach((v) => {
      if (!v.paused || v.ended || v.currentTime > 1) return; // kullanıcı ortada durdurduysa dokunma
      try {
        const oynat = v.play();
        if (oynat && oynat.then) oynat.then(() => durum(''), () => durum('Oynat\'a bir kez dokun'));
      } catch (e) {}
    });
  };
  ['touchend', 'click'].forEach((t) => document.addEventListener(t, () => setTimeout(oynatmayiDene, 300), true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(oynatmayiDene, 500);
  });

  const videolariBagla = () => {
    document.querySelectorAll('video').forEach((v) => {
      if (v.dataset.obaOto) return;
      v.dataset.obaOto = '1';
      v.addEventListener('ended', ilerle);
    });
    oynatmayiDene();
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

  // --- Ekranı açık tut + karartma (yalnızca üst pencerede) ---
  if (window.top === window.self) {
    const KARARTMA_SN = 30; // dokunulmazsa bu kadar saniye sonra karart
    let kilit = null;

    const ekraniAcikTut = async () => {
      if (!acik || kilit || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
      try {
        kilit = await navigator.wakeLock.request('screen');
        kilit.addEventListener('release', () => { kilit = null; });
      } catch (e) {}
    };
    document.addEventListener('visibilitychange', ekraniAcikTut);
    ['click', 'touchstart'].forEach((t) => document.addEventListener(t, ekraniAcikTut, { capture: true, passive: true }));
    setInterval(ekraniAcikTut, 10000);

    const perde = document.createElement('div');
    Object.assign(perde.style, {
      position: 'fixed', inset: '0', background: '#000', zIndex: 2147483647,
      display: 'none', color: '#1a1a1a', font: '13px sans-serif',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center'
    });
    perde.textContent = 'ÖBA Oto çalışıyor · açmak için dokun';
    document.body.appendChild(perde);

    let sonDokunma = Date.now();
    const tamEkran = () => {
      const k = document.documentElement;
      if (document.fullscreenElement || !k.requestFullscreen) return;
      k.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    };
    const rozetKutusu = () => document.getElementById('oba-oto-rozet');
    const kartart = () => {
      perde.style.display = 'flex';
      const k = rozetKutusu(); if (k) k.style.display = 'none'; // rozet de ışık yakmasın
    };
    const perdeKaldir = (e) => {
      sonDokunma = Date.now();
      if (perde.style.display !== 'none') {
        perde.style.display = 'none';
        const k = rozetKutusu(); if (k) k.style.display = 'flex';
        // Tam ekrana geç: sonraki karartma durum çubuğu ve adres çubuğu dahil tüm ekranı kaplar
        tamEkran();
        if (e && e.target === perde) { e.preventDefault(); e.stopPropagation(); }
      }
    };
    perde.addEventListener('touchstart', perdeKaldir, { passive: false });
    perde.addEventListener('click', perdeKaldir);
    ['touchstart', 'click', 'keydown', 'scroll', 'pointermove'].forEach((t) =>
      document.addEventListener(t, () => { sonDokunma = Date.now(); }, { capture: true, passive: true }));

    setInterval(() => {
      const soru = uyariDongusu !== null;
      if (soru) { if (perde.style.display !== 'none') perdeKaldir(); return; } // soru varsa ekran görünsün
      // Yalnızca sayfada video oynarken karart. Etkileşimli içeriklerde (iframe) dokunuşlar
      // buraya ulaşmaz; orada karartma kullanıcıyı kör eder.
      const oynayan = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended);
      const iframeIcinde = document.activeElement && document.activeElement.tagName === 'IFRAME';
      if (!oynayan || iframeIcinde) { sonDokunma = Date.now(); return; }
      if (acik && perde.style.display === 'none' && Date.now() - sonDokunma > KARARTMA_SN * 1000) kartart();
    }, 1000);
  }
  // Kilit beklenirken yenilendiyse kaldığı yerden devam et
  if (sessionStorage.getItem(BEKLEYEN) === location.pathname) {
    sessionStorage.removeItem(BEKLEYEN);
    setTimeout(ilerle, 3000);
  }
  videolariBagla();

  // --- SCORM / Articulate Storyline içeriği (iframe içinde çalışır) ---
  // Slayt zaman çizelgesi bitince oynatıcının SONRAKİ düğmesine basar. Slaytta tek bir
  // "Başla/Devam" düğmesi varsa ona basar. Birden çok etkileşim ya da soru varsa
  // dokunmaz, üst sayfaya uyarı gönderir: o adımları kullanıcı yapar.
  function scormModu() {
    const ust = (m) => { try { window.top.postMessage(Object.assign({ obaOto: true }, m), location.origin); } catch (e) {} };
    const acikMi = () => localStorage.getItem('obaOtoIlerleAcik') !== '0';
    const gor = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const pasif = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true' ||
      /disabled|cs-disabled/i.test(String(el.className || ''));

    const ilerleme = () => {
      const r = document.querySelector('#seek input');
      if (!r) return null;
      const max = parseFloat(r.max || r.getAttribute('aria-valuemax') || '100');
      const v = parseFloat(r.value || r.getAttribute('aria-valuenow') || '0');
      return max > 0 ? v / max : null;
    };

    const sonrakiDugme = () => [...document.querySelectorAll('button, [role="button"]')].find((b) => {
      const ad = (b.id + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).toLocaleLowerCase('tr');
      return /(^|\s)(next|sonraki|ileri)/.test(ad) && gor(b) && !pasif(b);
    });

    const soruVar = () => [...document.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], input[type="text"], textarea, [role="radio"], [role="checkbox"]')]
      .some((e) => gor(e) && !e.closest('#playback-controls, #outline-panel, #seek'));

    // Adı boş düğmeler ve video nesnelerinin oynat düğmeleri (…-button, yanında .mp4) etkileşim sayılmaz
    const slaytDugmeleri = () => [...document.querySelectorAll('.slide-container button, .slide-container [role="button"], button.acc-button')]
      .filter((b) => {
        if (!gor(b) || pasif(b)) return false;
        const ad = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || b.textContent || '')).trim();
        if (!ad) return false;
        const es = b.id && b.id.endsWith('-button') && document.getElementById(b.id.slice(0, -7));
        if (es && /\.(mp4|webm|mov)\b/i.test(es.textContent || '')) return false;
        return true;
      });

    let imza = '';
    let bitikSayac = 0;
    let uyariZamani = 0;
    let sonVideoZamani = -1;
    let sonOzet = '';
    let oynadi = false; // bu slaytın oynadığı görüldü mü (sayfa açılışında yanlış 'bitti' olmasın)

    setInterval(() => {
      if (!acikMi()) return;
      const kap = document.querySelector('.slide-container') || document.body;
      const yeniImza = (kap.innerText || kap.textContent || '').slice(0, 120);
      if (yeniImza !== imza) { imza = yeniImza; bitikSayac = 0; uyariZamani = 0; oynadi = false; }

      // Zaman çizelgesi bitti mi? İlerleme çubuğuna ve slayttaki videolara bak.
      const p = ilerleme();
      const oynamis = [...document.querySelectorAll('video')].filter((v) => v.currentTime > 0 && v.duration > 0);
      const videolarBitti = oynamis.length > 0 &&
        oynamis.every((v) => v.ended || v.currentTime >= v.duration - 0.5);
      const videoZamani = oynamis.reduce((a, v) => a + v.currentTime, 0);
      const durgun = oynamis.length > 0 && oynamis.every((v) => v.paused) && videoZamani === sonVideoZamani;
      sonVideoZamani = videoZamani;
      if ((p !== null && p > 0.02 && p < 0.95) || oynamis.some((v) => !v.paused)) oynadi = true;
      const bitti = (p !== null && p >= 0.97) || videolarBitti || (p === null && durgun);

      // Durumu rozete yaz (değiştiğinde)
      const yuzde = p !== null ? Math.round(p * 100) : null;
      const ozet = `Slayt %${yuzde === null ? '?' : yuzde}` + (videolarBitti ? ' · video bitti' : '');
      if (ozet !== sonOzet) { sonOzet = ozet; ust({ tip: 'durum', yazi: ozet }); }
      bitikSayac = bitti ? bitikSayac + 1 : 0;
      if (bitikSayac < 2) return; // ~4 sn bitmiş kalsın

      const uyar = (yazi) => {
        if (Date.now() - uyariZamani < 15000) return;
        uyariZamani = Date.now();
        ust({ tip: 'uyari', yazi });
      };

      if (soruVar()) { uyar('Soru var, cevap bekleniyor'); return; }

      const ileri = sonrakiDugme();
      if (ileri) { ust({ tip: 'durum', yazi: 'Sonraki slayt' }); ileri.click(); bitikSayac = 0; return; }

      const dugmeler = slaytDugmeleri();
      const ad = (b) => ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).toLocaleLowerCase('tr');
      if (dugmeler.length === 1 && /ba[sş]la|devam|ileri|sonraki|next|start|t[ıi]kla/i.test(ad(dugmeler[0]))) {
        ust({ tip: 'durum', yazi: 'Başla düğmesine basıldı' });
        dugmeler[0].click();
        bitikSayac = 0;
        return;
      }
      if (dugmeler.length > 0) { uyar('Etkileşim bekleniyor: ekrandaki adımı yap'); return; }

      // Ne sonraki ne düğme var: içerik sonu
      // İçerik sonu: yalnızca bu slayt gerçekten oynadıysa (açılışta takılı kalan eski durumla geçme)
      if (bitikSayac === 2 && oynadi) ust({ tip: 'bitti' });
    }, 2000);
  }
})();
