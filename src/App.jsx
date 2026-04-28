import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Volume2, Sparkles, Settings, Loader2, Save, Square, Globe, Home, Heart, Star, Share2, X, Trash2 } from 'lucide-react';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AdMob, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Share } from '@capacitor/share';
import { App as CapApp } from '@capacitor/app';
import './App.css';

const LANG_VOICES = { es: 'es-ES', en: 'en-US', pt: 'pt-BR' };

const UI_STRINGS = {
  es: {
    title: "Palabra Eterna", subtitle: "Versículo diario", home: "Inicio",
    favorites: "Favoritos", language: "Idioma", settings: "Ajustes",
    listen: "Escuchar", stop: "Detener", loading: "Cargando...",
    save: "Guardar", cancel: "Cancelar",
    share: "Compartir", notifications: "Notificaciones diarias",
    no_favorites: "No tienes favoritos aún.", frequency: "Versículos por día",
    v_1: "1 Versículo al día", v_3: "3 Versículos al día",
    retry: "Reintentar", error_load: "No se pudo cargar el versículo.",
    back_today: "Volver al día de hoy", privacy: "Política de Privacidad",
    morning: "Mañana", afternoon: "Tarde", evening: "Noche"
  },
  en: {
    title: "Living Word", subtitle: "Daily verse", home: "Home",
    favorites: "Favorites", language: "Language", settings: "Settings",
    listen: "Listen", stop: "Stop", loading: "Loading...",
    save: "Save", cancel: "Cancel",
    share: "Share", notifications: "Daily notifications",
    no_favorites: "No favorites yet.", frequency: "Verses per day",
    v_1: "1 Verse daily", v_3: "3 Verses daily",
    retry: "Retry", error_load: "Could not load today's verse.",
    back_today: "Back to today", privacy: "Privacy Policy",
    morning: "Morning", afternoon: "Afternoon", evening: "Evening"
  },
  pt: {
    title: "Palavra Viva", subtitle: "Versículo diário", home: "Início",
    favorites: "Favoritos", language: "Idioma", settings: "Ajustes",
    listen: "Ouvir", stop: "Parar", loading: "Carregando...",
    save: "Salvar", cancel: "Cancelar",
    share: "Compartilhar", notifications: "Notificações diárias",
    no_favorites: "Ainda não tem favoritos.", frequency: "Versículos por dia",
    v_1: "1 Versículo por dia", v_3: "3 Versículos por dia",
    retry: "Tentar novamente", error_load: "Não foi possível carregar o versículo.",
    back_today: "Voltar para hoje", privacy: "Política de Privacidade",
    morning: "Manhã", afternoon: "Tarde", evening: "Noite"
  }
};

// --- Helpers para caché local ---
function getCacheKey(date, slot, lang) {
  return `VERSE_CACHE_${date}_${slot}_${lang}`;
}

function getCachedVerse(date, slot, lang) {
  try {
    const raw = localStorage.getItem(getCacheKey(date, slot, lang));
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignorar */ }
  return null;
}

function setCachedVerse(date, slot, lang, data) {
  try {
    localStorage.setItem(getCacheKey(date, slot, lang), JSON.stringify(data));
  } catch (e) { /* ignorar */ }
}

// Limpiar cachés de días anteriores para no llenar localStorage
function cleanOldCache() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const keysToKeep = new Set();
    ['morning', 'afternoon', 'evening'].forEach(slot => {
      ['es', 'en', 'pt'].forEach(lang => {
        keysToKeep.add(getCacheKey(today, slot, lang));
        keysToKeep.add(getCacheKey(yesterday, slot, lang));
      });
    });
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('VERSE_CACHE_') && !keysToKeep.has(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) { /* ignorar */ }
}

function App() {
  // --- Helpers locales ---
  const calcSuffix = () => {
    const h = new Date().getHours();
    return h < 13 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  };

  const getInitialVerse = () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const initialLang = localStorage.getItem('APP_LANG') || 'es';
      const initialSlot = calcSuffix();
      const cached = getCachedVerse(today, initialSlot, initialLang);
      if (cached) return { verse: { reference: cached.reference, text: cached.text }, explanation: cached.explanation };
    } catch (e) {}
    return { verse: null, explanation: '' };
  };

  const initialData = getInitialVerse();

  const [lang, setLang] = useState(localStorage.getItem('APP_LANG') || 'es');
  const T = UI_STRINGS[lang];

  // --- Estado principal ---
  const [verse, setVerse] = useState(initialData.verse);
  const [explanation, setExplanation] = useState(initialData.explanation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeSlotSuffix, setTimeSlotSuffix] = useState(calcSuffix());
  const [refreshKey, setRefreshKey] = useState(0);

  // --- UI ---
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // --- Configuración ---
  const [favorites, setFavorites] = useState(JSON.parse(localStorage.getItem('FAVORITES') || '[]'));
  // NOTIFS_ON tiene 3 valores posibles:
  //   null  → nunca se preguntó (primera apertura)
  //   'true'  → usuario aceptó
  //   'false' → usuario rechazó
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem('NOTIFS_ON') === 'true'
  );
  const [verseFrequency, setVerseFrequency] = useState(parseInt(localStorage.getItem('VERSE_FREQ') || '1'));

  // --- Inicialización ---
  useEffect(() => {
    // AdMob
    const initAds = async () => {
      try {
        await AdMob.initialize();
        await AdMob.showBanner({
          adId: 'ca-app-pub-8283112589264457/8738212244',
          adSize: BannerAdSize.BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: false
        });
      } catch (e) { /* AdMob not available */ }
    };
    initAds();

    // Limpiar cachés viejos
    cleanOldCache();

    // Helper para calcular franja
    const calcSuffix = () => {
      const h = new Date().getHours();
      return h < 13 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    };

    // Setear franja inicial
    setTimeSlotSuffix(calcSuffix());

    // Cuando el usuario vuelve a la app, re-chequear la franja
    const listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        const h = new Date().getHours();
        const newSuffix = h < 13 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
        setTimeSlotSuffix(prev => {
          if (prev !== newSuffix) setRefreshKey(k => k + 1);
          return newSuffix;
        });
      }
    });

    // Auto-refresh: chequear cada 60 segundos si cambió la franja
    const interval = setInterval(() => {
      const h = new Date().getHours();
      const newSuffix = h < 13 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
      setTimeSlotSuffix(prev => {
        if (prev !== newSuffix) setRefreshKey(k => k + 1);
        return newSuffix;
      });
    }, 60000);

    // --- Primera apertura: pedir permiso de notificaciones ---
    // Solo si NOTIFS_ON no existe aún (el usuario nunca eligió)
    const askNotifPermissionIfFirstLaunch = async () => {
      if (localStorage.getItem('NOTIFS_ON') !== null) return; // ya decidió antes

      try {
        // Pedir el permiso del sistema operativo (muestra el diálogo nativo de Android)
        const perm = await LocalNotifications.requestPermissions();
        const granted = perm.display === 'granted';

        // Guardar la decisión del usuario en localStorage
        localStorage.setItem('NOTIFS_ON', String(granted));
        // Actualizar el estado de la app para que el switch en Ajustes refleje la decisión
        setNotificationsEnabled(granted);

        console.log(`[Primera apertura] Notificaciones: ${granted ? 'ACTIVADAS' : 'DESACTIVADAS'}`);
      } catch (e) {
        // Si falla (ej. en web/emulador sin plugin), asumir que no hay notificaciones
        localStorage.setItem('NOTIFS_ON', 'false');
        console.warn('[Primera apertura] No se pudo pedir permiso de notificaciones:', e);
      }
    };
    askNotifPermissionIfFirstLaunch();

    return () => { listener.remove(); clearInterval(interval); };
  }, []);

  // --- Notificaciones locales ---
  // Ref para evitar ejecuciones paralelas del useEffect
  const isSchedulingRef = useRef(false);

  useEffect(() => {
    const scheduleNotifs = async () => {
      // Guardia: si ya hay un proceso de scheduling en curso, no lanzar otro
      if (isSchedulingRef.current) return;
      isSchedulingRef.current = true;

      try {
        if (!notificationsEnabled) {
          await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] });
          return;
        }

        // Pedir permiso de notificación general
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== 'granted') return;

        // En Android 12+ verificar permiso de alarmas exactas
        try {
          const exactPerm = await LocalNotifications.checkPermissions();
          if (exactPerm.exactAlarms !== undefined && exactPerm.exactAlarms !== 'granted') {
            await LocalNotifications.requestExactAlarmPermission?.();
          }
        } catch (e) { /* El dispositivo puede no soportar esta API */ }

        // Títulos según idioma
        const notifTexts = {
          es: {
            morning:   { title: 'Palabra Eterna ✝️', body: 'Tu versículo de la mañana te espera 🌅' },
            afternoon: { title: 'Palabra Eterna ✝️', body: 'Nuevo versículo de la tarde ☀️' },
            evening:   { title: 'Palabra Eterna ✝️', body: 'Tu versículo de la noche está listo 🌙' }
          },
          en: {
            morning:   { title: 'Living Word ✝️', body: 'Your morning verse is ready 🌅' },
            afternoon: { title: 'Living Word ✝️', body: 'Your afternoon verse is ready ☀️' },
            evening:   { title: 'Living Word ✝️', body: 'Your evening verse is ready 🌙' }
          },
          pt: {
            morning:   { title: 'Palavra Viva ✝️', body: 'Seu versículo da manhã está pronto 🌅' },
            afternoon: { title: 'Palavra Viva ✝️', body: 'Seu versículo da tarde está pronto ☀️' },
            evening:   { title: 'Palavra Viva ✝️', body: 'Seu versículo da noite está pronto 🌙' }
          }
        };

        const texts = notifTexts[lang] || notifTexts.es;

        // Cancelar las anteriores antes de reprogramar
        await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] });

        const notifs = [
          {
            id: 1,
            title: texts.morning.title,
            body: texts.morning.body,
            schedule: { on: { hour: 8, minute: 0 }, every: 'day', allowWhileIdle: true },
          },
          {
            id: 2,
            title: texts.afternoon.title,
            body: texts.afternoon.body,
            schedule: { on: { hour: 13, minute: 0 }, every: 'day', allowWhileIdle: true },
          },
          {
            id: 3,
            title: texts.evening.title,
            body: texts.evening.body,
            schedule: { on: { hour: 18, minute: 0 }, every: 'day', allowWhileIdle: true },
          }
        ];

        // Si la frecuencia es 1, solo programar la de mañana
        const notifsToSchedule = verseFrequency === 1
          ? notifs.slice(0, 1)
          : notifs;

        await LocalNotifications.schedule({ notifications: notifsToSchedule });
        console.log(`[Notifs] Programadas ${notifsToSchedule.length} notificación(es) — lang: ${lang}, freq: ${verseFrequency}`);
      } catch (e) {
        console.warn('[Notifs] Error programando notificaciones:', e);
      } finally {
        isSchedulingRef.current = false;
      }
    };
    scheduleNotifs();
  }, [notificationsEnabled, verseFrequency, lang]);

  // --- Calcular franja horaria ---
  const getTimeSlotSuffix = () => {
    const hour = new Date().getHours();
    if (hour < 13) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  };

  const getTimeSlotLabel = () => {
    const suffix = timeSlotSuffix || getTimeSlotSuffix();
    return T[suffix] || suffix;
  };

  // --- Fetch del versículo DIRECTAMENTE en el idioma del usuario ---
  const fetchVerse = useCallback(async () => {
    if (isViewingHistory) return;
    setError('');
    const h = new Date().getHours();
    const suffix = h < 13 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    setTimeSlotSuffix(suffix);

    const today = new Date().toISOString().split('T')[0];

    // 1. Intentar mostrar desde caché local INMEDIATAMENTE
    const cached = getCachedVerse(today, suffix, lang);
    if (cached) {
      setVerse({ reference: cached.reference, text: cached.text });
      setExplanation(cached.explanation);
      // Actualizamos setLoading(false) por si estaba cargando
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      // 2. Pedir al backend los versículos de TODO el día en una sola petición
      let dayData;
      let currentData;
      try {
        const response = await axios.get(
          `https://palabra-viva-api.onrender.com/api/daily-verses-day?lang=${lang}`
        );
        dayData = response.data; // { morning: {...}, afternoon: {...}, evening: {...} }
        currentData = dayData[suffix];

        // Guardar todos los slots del día recibidos
        Object.keys(dayData).forEach(s => {
          setCachedVerse(today, s, lang, dayData[s]);
        });
      } catch (err) {
        // Fallback a la antigua ruta si el nuevo endpoint no ha sido desplegado en Render aún (404)
        console.warn("Fallback a ruta singular, daily-verses-day falló:", err.message);
        const fallbackResponse = await axios.get(
          `https://palabra-viva-api.onrender.com/api/daily-verse?lang=${lang}&slot=${suffix}`
        );
        currentData = fallbackResponse.data;
        setCachedVerse(today, suffix, lang, currentData);
      }

      // 3. Actualizar UI con el slot actual
      if (currentData) {
        setVerse({ reference: currentData.reference, text: currentData.text });
        setExplanation(currentData.explanation);
      }

    } catch (err) {
      // Si tenemos caché, no mostrar error (ya se está mostrando el versículo cacheado)
      if (!cached) {
        setError(T.error_load);
      }
    } finally {
      setLoading(false);
    }
  }, [lang, isViewingHistory, refreshKey]); // lang incluido para re-fetch si cambia idioma

  // Fetch inicial
  useEffect(() => {
    fetchVerse();
  }, [fetchVerse]);

  // --- Handlers ---
  const handleSpeak = async () => {
    if (isSpeaking) {
      await TextToSpeech.stop();
      setIsSpeaking(false);
      return;
    }
    if (!verse) return;
    setIsSpeaking(true);
    try {
      await TextToSpeech.speak({
        text: `${verse.reference}. ${verse.text}. ${explanation}`,
        lang: LANG_VOICES[lang],
        rate: 0.9, pitch: 1.0,
      });
    } catch (e) { /* fallback silencioso */ }
    setIsSpeaking(false);
  };

  const handleShare = async () => {
    if (!verse) return;
    await Share.share({
      title: T.title,
      text: `"${verse.text}" — ${verse.reference}\n\n${explanation}\n\n— ${T.title}\n\nDescarga la app: https://play.google.com/store/apps/details?id=com.palabraviva.diariocristiano`,
    });
  };

  const toggleFavorite = () => {
    if (!verse) return;
    const isFav = favorites.some(f => f.reference === verse.reference);
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter(f => f.reference !== verse.reference);
    } else {
      newFavs = [...favorites, { ...verse, explanation, lang, date: new Date().toISOString() }];
    }
    setFavorites(newFavs);
    localStorage.setItem('FAVORITES', JSON.stringify(newFavs));
  };

  const removeFavorite = (ref, e) => {
    e.stopPropagation();
    const newFavs = favorites.filter(f => f.reference !== ref);
    setFavorites(newFavs);
    localStorage.setItem('FAVORITES', JSON.stringify(newFavs));
  };

  const saveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('NOTIFS_ON', notificationsEnabled);
    localStorage.setItem('VERSE_FREQ', verseFrequency);
    setShowSettings(false);
  };

  const changeLang = (l) => {
    setLang(l);
    localStorage.setItem('APP_LANG', l);
    setShowLangModal(false);
    // fetchVerse se dispara automáticamente porque lang está en sus dependencias
  };

  const selectFavorite = (fav) => {
    setVerse({ reference: fav.reference, text: fav.text });
    setExplanation(fav.explanation);
    setIsViewingHistory(true);
    setShowFavorites(false);
  };

  // --- RENDER ---
  return (
    <div className="app-container">
      <header className="header">
        <div style={{ marginBottom: '0.1rem', color: 'var(--color-primary)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            <path d="M12 8v6" strokeWidth="2" />
            <path d="M9 11h6" strokeWidth="2" />
          </svg>
        </div>
        <h1 className="title">{T.title}</h1>
        <p className="subtitle">{T.subtitle} • {getTimeSlotLabel()}</p>
      </header>

      <main className="container">
        {loading ? (
          <div className="loading"><Loader2 className="spin" size={48} /></div>
        ) : error ? (
          <div className="card text-center" style={{ color: '#e74c3c' }}>
            <p className="mb-4">{error}</p>
            <button className="btn btn-primary" onClick={fetchVerse}><Sparkles size={20} /> {T.retry}</button>
          </div>
        ) : verse ? (
          <>
            <div className="card">
              <div className="verse-text">"{verse.text}"</div>
              <div className="verse-reference">{verse.reference}</div>
              <div className="actions">
                <button className={`btn ${isSpeaking ? 'btn-stop' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={handleSpeak}>
                  {isSpeaking ? <><Square size={20} fill="currentColor" /> {T.stop}</> : <><Volume2 size={20} /> {T.listen}</>}
                </button>
                <button className="btn btn-secondary" onClick={toggleFavorite}>
                  <Star size={20} fill={favorites.some(f => f.reference === verse.reference) ? "currentColor" : "none"} />
                </button>
                <button className="btn btn-secondary" onClick={handleShare}>
                  <Share2 size={20} />
                </button>
              </div>
            </div>
            {explanation && (
              <div className="explanation-card">
                <div className="explanation-content">{explanation}</div>
              </div>
            )}
            {isViewingHistory && (
              <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => { setIsViewingHistory(false); fetchVerse(); }}>
                {T.back_today}
              </button>
            )}
          </>
        ) : null}
      </main>

      {/* Modal: Ajustes */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ margin: 0 }}>{T.settings}</h2>
              <button className="settings-btn" onClick={() => setShowSettings(false)}><X size={24} /></button>
            </div>
            <form onSubmit={saveSettings}>
              <div className="input-group" style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} style={{ width: '20px', height: '20px' }} />
                  <span>{T.notifications}</span>
                </label>
              </div>

              <div className="input-group" style={{ marginTop: '1rem' }}>
                <label>{T.frequency}</label>
                <select value={verseFrequency} onChange={(e) => setVerseFrequency(parseInt(e.target.value))} className="select-input">
                  <option value="1">{T.v_1}</option>
                  <option value="3">{T.v_3}</option>
                </select>
              </div>

              <div className="flex flex-col gap-4 justify-center mt-6">
                <button type="submit" className="btn btn-primary w-full"><Save size={18} /> {T.save}</button>
                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <a href="https://sites.google.com/view/palabra-eterna-privacidad/p%C3%A1gina-principal" target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#666', textDecoration: 'underline' }}>
                    {T.privacy}
                  </a>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Favoritos */}
      {showFavorites && (
        <div className="modal-overlay">
          <div className="modal favorites-modal">
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ margin: 0 }}>{T.favorites}</h2>
              <button className="settings-btn" onClick={() => setShowFavorites(false)}><X size={24} /></button>
            </div>
            <div className="favorites-list">
              {favorites.length === 0 ? (
                <p className="text-center" style={{ opacity: 0.6, padding: '2rem 0' }}>{T.no_favorites}</p>
              ) : (
                favorites.map((fav, index) => (
                  <div key={index} className="fav-item" onClick={() => selectFavorite(fav)} style={{ cursor: 'pointer' }}>
                    <div className="fav-header">
                      <strong>{fav.reference}</strong>
                      <button className="text-red" onClick={(e) => removeFavorite(fav.reference, e)}><Trash2 size={18} /></button>
                    </div>
                    <p>"{fav.text}"</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Idioma */}
      {showLangModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '300px' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ margin: 0 }}>{T.language}</h2>
              <button className="settings-btn" onClick={() => setShowLangModal(false)}><X size={24} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <button className={`btn ${lang === 'es' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => changeLang('es')}>Español</button>
              <button className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => changeLang('en')}>English</button>
              <button className={`btn ${lang === 'pt' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => changeLang('pt')}>Português</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => { setShowSettings(false); setShowFavorites(false); setShowLangModal(false); if (isViewingHistory) { setIsViewingHistory(false); fetchVerse(); } }}>
          <Home size={24} /><span>{T.home}</span>
        </button>
        <button className={`bottom-nav-item ${showFavorites ? 'active' : ''}`} onClick={() => { setShowFavorites(true); setShowSettings(false); setShowLangModal(false); }}>
          <Heart size={24} fill={favorites.length > 0 ? "currentColor" : "none"} /><span>{T.favorites}</span>
        </button>
        <button className={`bottom-nav-item ${showLangModal ? 'active' : ''}`} onClick={() => { setShowLangModal(true); setShowFavorites(false); setShowSettings(false); }}>
          <Globe size={24} /><span>{T.language}</span>
        </button>
        <button className={`bottom-nav-item ${showSettings ? 'active' : ''}`} onClick={() => { setShowSettings(true); setShowFavorites(false); setShowLangModal(false); }}>
          <Settings size={24} /><span>{T.settings}</span>
        </button>
      </nav>
      <div className="ad-bar" />
    </div>
  );
}

export default App;
