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
 * Document shape (unchanged, written by DevPanel's Config tab):
 *   config/app : { systemMessage: string, maintenance: boolean }
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

const EMPTY = { systemMessage: '', maintenance: false, loaded: false };

/**
 * Live app configuration.
 * @returns {{ systemMessage: string, maintenance: boolean, loaded: boolean }}
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
          loaded: true,
        });
      },
      () => setConfig({ ...EMPTY, loaded: true }), // read failed → let everyone in
    );
    return unsub;
  }, []);

  return config;
}
