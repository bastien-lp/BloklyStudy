/**
 * App-wide configuration (`config/app`) — the announcement banner and the
 * maintenance switch, both driven from the developer panel.
 * --------------------------------------------------------------------------
 * Until now the panel wrote this document and nothing ever read it, so both
 * controls were inert. This hook is the missing reader.
 *
 * FAIL OPEN, ALWAYS. Maintenance mode can lock real students out of their
 * revision, so every uncertain state — still loading, document missing, read
 * denied, offline — resolves to "not in maintenance". The only way to block
 * the app is an explicit `maintenance: true` that we actually received.
 *
 * Document shape (written by DevPanel's Config tab):
 *   config/app : { systemMessage: string, maintenance: boolean, features: {} }
 *
 * `features` closes parts of the app without deleting anything (lib/features).
 * Like maintenance, it fails OPEN: only an explicit `false` hides something.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { readFeatures, isEnabled } from './features';

const EMPTY = { systemMessage: '', maintenance: false, features: {}, loaded: false };

/**
 * Live app configuration.
 * @returns {{ systemMessage: string, maintenance: boolean, features: object, loaded: boolean }}
 */
export function useAppConfig() {
  const [config, setConfig] = useState(EMPTY);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'config', 'app'),
      snap => {
        const d = snap.exists() ? snap.data() : {};
        setConfig({
          systemMessage: typeof d.systemMessage === 'string' ? d.systemMessage : '',
          // Strictly true, never just truthy: a stray string must not lock the app.
          maintenance: d.maintenance === true,
          features: readFeatures(d),
          loaded: true,
        });
      },
      () => setConfig({ ...EMPTY, loaded: true }), // read failed → let everyone in
    );
    return unsub;
  }, []);

  return config;
}

/**
 * Whether one feature is open right now (lib/features.js).
 *
 * Fails OPEN like the rest of this file: while the config is loading, or if
 * it cannot be read at all, everything is available. A tool must never
 * disappear because the network hiccuped.
 */
export function useFeature(id) {
  const { features } = useAppConfig();
  return isEnabled(features, id);
}
