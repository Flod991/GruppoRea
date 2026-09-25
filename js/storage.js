/**
 * Salvataggio dei dati: nel browser (locale) oppure su Supabase (condiviso tra le sedi).
 *
 * Nel database ogni punto vendita è un documento separato ("sede:<id>") e le
 * impostazioni comuni stanno in "impostazioni": si inviano solo i documenti
 * cambiati, così due sedi che lavorano insieme non si sovrascrivono.
 */
(function (root) {
  'use strict';

  const LOCAL_KEY = 'gruppoRea.turni.v1';
  const TABLE = 'turni_dati';
  const SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4';

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocal(state) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Divide lo stato in documenti: uno per sede più le impostazioni comuni. */
  function split(state, storeIds) {
    const docs = { impostazioni: { settings: state.settings, sampleData: !!state.sampleData } };
    for (const id of storeIds) {
      docs['sede:' + id] = {
        employees: state.employees.filter((e) => e.store === id),
        requirements: state.requirements[id] || null,
        schedules: state.schedules[id] || {},
      };
    }
    return docs;
  }

  /** Applica un documento allo stato (in place). */
  function applyDoc(state, id, data) {
    if (!data) return;
    if (id === 'impostazioni') {
      if (data.settings) state.settings = data.settings;
      state.sampleData = !!data.sampleData;
      return;
    }
    if (!id.startsWith('sede:')) return;
    const store = id.slice(5);
    state.employees = state.employees.filter((e) => e.store !== store).concat(data.employees || []);
    if (data.requirements) state.requirements[store] = data.requirements;
    state.schedules[store] = data.schedules || {};
  }

  function localStorageBackend() {
    return {
      mode: 'local',
      async load() { return readLocal(); },
      save(state) { return writeLocal(state); },
      flush() {},
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Impossibile caricare la libreria del database'));
      document.head.appendChild(s);
    });
  }

  function cloudBackend(cfg, storeIds, hooks) {
    let client = null;
    let user = null;
    let pending = null;
    let timer = null;
    let sending = false;
    let latest = null; // ultimo stato ricevuto, per ritentare dopo un errore
    const lastSent = {};

    const setStatus = (s) => hooks.onStatus && hooks.onStatus(s);

    async function flush() {
      clearTimeout(timer);
      timer = null;
      if (!pending || sending) return;
      const docs = split(pending, storeIds);
      pending = null;
      const rows = [];
      for (const id of Object.keys(docs)) {
        const json = JSON.stringify(docs[id]);
        if (lastSent[id] !== json) rows.push({ id, data: docs[id], json });
      }
      if (!rows.length) { setStatus('saved'); return; }
      sending = true;
      setStatus('saving');
      const now = new Date().toISOString();
      const { error } = await client.from(TABLE).upsert(rows.map((r) => ({ id: r.id, data: r.data, updated_at: now })));
      sending = false;
      if (error) {
        setStatus('error');
        // Riprova più tardi con lo stato più recente disponibile.
        pending = pending || latest;
        timer = setTimeout(flush, 5000);
        return;
      }
      for (const r of rows) lastSent[r.id] = r.json;
      setStatus(pending ? 'saving' : 'saved');
      if (pending) flush();
    }

    return {
      mode: 'cloud',
      get user() { return user; },
      async init() {
        if (!root.supabase) await loadScript(SUPABASE_SRC);
        client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const { data } = await client.auth.getSession();
        user = data && data.session ? data.session.user : null;
        return user;
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        user = data.user;
        return user;
      },
      async signOut() {
        await flush();
        await client.auth.signOut();
        user = null;
      },
      /** Restituisce lo stato salvato, oppure null se il database è ancora vuoto. */
      async load() {
        const { data, error } = await client.from(TABLE).select('id,data');
        if (error) throw error;
        if (!data || !data.length) return null;
        const state = { employees: [], requirements: {}, schedules: {} };
        for (const row of data) {
          lastSent[row.id] = JSON.stringify(row.data);
          applyDoc(state, row.id, row.data);
        }
        return state;
      },
      save(state) {
        pending = state;
        latest = state;
        setStatus('saving');
        clearTimeout(timer);
        timer = setTimeout(flush, 600);
        return true;
      },
      flush,
      /** Notifica le modifiche fatte da altri utenti. */
      subscribe(onChange) {
        client
          .channel('turni-dati')
          .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
            const row = payload.new;
            if (!row || !row.id) return;
            const json = JSON.stringify(row.data);
            if (lastSent[row.id] === json) return; // modifica nostra
            lastSent[row.id] = json;
            onChange(row.id, row.data);
          })
          .subscribe();
      },
    };
  }

  function create(storeIds, hooks) {
    const cfg = root.TURNI_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) return cloudBackend(cfg, storeIds, hooks || {});
    return localStorageBackend();
  }

  root.TurniStorage = { create, readLocal, writeLocal, applyDoc, split };
})(typeof self !== 'undefined' ? self : this);
