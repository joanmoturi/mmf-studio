"use client";

import { useEffect, useRef, useState } from "react";
import { installedDisplay, requestOfflineStatus, type InstallPromptEvent } from "@/lib/pwa";
import { errorText } from "./shared";

interface PhoneState {
  online: boolean;
  phase: "development" | "unsupported" | "preparing" | "ready" | "failed";
  installed: boolean;
  updateAvailable: boolean;
  error: string;
}

export function PwaPanel() {
  const [state, setState] = useState<PhoneState>(() => ({
    online: navigator.onLine,
    phase:
      process.env.NODE_ENV !== "production"
        ? "development"
        : !window.isSecureContext || !("serviceWorker" in navigator)
          ? "unsupported"
          : "preparing",
    installed: installedDisplay(),
    updateAvailable: false,
    error: "",
  }));
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [setupAttempt, setSetupAttempt] = useState(0);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const set = (values: Partial<PhoneState>) => {
      if (!disposed) setState((old) => ({ ...old, ...values }));
    };
    const online = () => set({ online: navigator.onLine });
    const installed = () => {
      set({ installed: true });
      setPrompt(null);
    };
    const beforeInstall = (event: Event) => {
      if (!("prompt" in event) || !("userChoice" in event)) return;
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    const display = window.matchMedia("(display-mode: standalone)");
    const displayChanged = () => set({ installed: installedDisplay() });
    display.addEventListener("change", displayChanged);
    const supported =
      process.env.NODE_ENV === "production" &&
      window.isSecureContext &&
      "serviceWorker" in navigator;

    const status = async (worker: ServiceWorker | null) => {
      if (!worker) return;
      try {
        const result = await requestOfflineStatus(worker);
        set({
          phase: result.ready ? "ready" : "failed",
          error: result.ready
            ? ""
            : "The complete app is not cached. Connect and retry offline setup.",
        });
      } catch (error) {
        set({ phase: "failed", error: errorText(error) });
      }
    };
    const observe = (current: ServiceWorkerRegistration) => {
      registration.current = current;
      set({ updateAvailable: !!current.waiting });
      const watch = () => {
        const worker = current.installing;
        if (!worker) return;
        const changed = () => {
          if (worker.state === "installed" && current.active) set({ updateAvailable: true });
          if (worker.state === "activated") void status(current.active);
          if (worker.state === "redundant" && !current.active)
            set({
              phase: "failed",
              error: "Offline download could not finish. Stay connected and retry.",
            });
        };
        worker.addEventListener("statechange", changed);
        cleanups.push(() => worker.removeEventListener("statechange", changed));
      };
      current.addEventListener("updatefound", watch);
      cleanups.push(() => current.removeEventListener("updatefound", watch));
      watch();
      void status(current.active);
    };
    const controllerChanged = () => {
      if (updateRequested.current) {
        window.location.reload();
        return;
      }
      void status(navigator.serviceWorker.controller);
    };
    const visible = () => {
      if (document.visibilityState === "visible") {
        void status(registration.current?.active ?? null);
        if (navigator.onLine) void registration.current?.update().catch(() => {});
      }
    };
    if (supported) {
      navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
      document.addEventListener("visibilitychange", visible);
      void (async () => {
        try {
          const existing = await navigator.serviceWorker.getRegistration("/");
          if (disposed) return;
          if (existing?.active && new URL(existing.active.scriptURL).pathname === "/sw.js")
            observe(existing);
          const current = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          });
          if (disposed) return;
          if (registration.current !== current) observe(current);
          else void status(current.active);
        } catch (error) {
          if (!registration.current?.active) set({ phase: "failed", error: errorText(error) });
        }
      })();
    }
    return () => {
      disposed = true;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      display.removeEventListener("change", displayChanged);
      cleanups.forEach((cleanup) => cleanup());
      if (supported) {
        navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
        document.removeEventListener("visibilitychange", visible);
      }
    };
  }, [setupAttempt]);

  const retry = async () => {
    setBusy(true);
    setState((old) => ({ ...old, phase: "preparing", error: "" }));
    try {
      const worker = registration.current?.active;
      if (!worker) {
        setSetupAttempt((value) => value + 1);
        return;
      }
      const result = await requestOfflineStatus(worker, true);
      setState((old) => ({
        ...old,
        phase: result.ready ? "ready" : "failed",
        error: result.ready
          ? ""
          : "Offline setup is incomplete. Check the connection and available device storage.",
      }));
    } catch (error) {
      setState((old) => ({ ...old, phase: "failed", error: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="phone-panel" aria-label="Phone installation and offline status">
      <div className="phone-status-row">
        <span
          className={`phone-status ${state.online ? "" : "phone-disconnected"}`}
          aria-live="polite"
        >
          <i />
          {state.online ? "Online" : "Offline"} ·{" "}
          {state.phase === "ready"
            ? "Ready for offline use"
            : state.phase === "development"
              ? "Offline setup requires a production build"
              : state.phase === "unsupported"
                ? "HTTPS and a supported browser required"
                : state.phase === "preparing"
                  ? "Preparing offline app..."
                  : "Offline setup incomplete"}
        </span>
        <div className="actions">
          {state.installed && <span className="tag">Installed on this device</span>}
          {!state.installed && prompt && (
            <button
              disabled={state.phase !== "ready" || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await prompt.prompt();
                  await prompt.userChoice;
                  setPrompt(null);
                } catch (error) {
                  setState((old) => ({ ...old, error: errorText(error) }));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Install MMF Studio
            </button>
          )}
          {state.phase === "failed" && (
            <button disabled={busy || !state.online} onClick={retry}>
              Retry offline setup
            </button>
          )}
          {state.updateAvailable && (
            <button
              onClick={() => {
                if (
                  !window.confirm(
                    "Save any open form and export a backup before updating. Apply the new app version and reload this tab? Saved plans will be retained.",
                  )
                )
                  return;
                const waiting = registration.current?.waiting;
                if (!waiting) {
                  setState((old) => ({ ...old, updateAvailable: false }));
                  return;
                }
                updateRequested.current = true;
                waiting.postMessage({ type: "ACTIVATE_UPDATE" });
              }}
            >
              Apply app update
            </button>
          )}
        </div>
      </div>
      <details>
        <summary>Use on your phone / installation help</summary>
        <div className="phone-help">
          <p>
            <strong>First visit:</strong> open the app&apos;s HTTPS website on your phone and wait
            for <strong>Ready for offline use</strong>. A GitHub repository or a downloaded ZIP is
            not the installation link. This local app has not been deployed automatically.
          </p>
          <div className="two-column">
            <p>
              <strong>Android:</strong> in Chrome, use Install MMF Studio when offered, or the
              browser menu → Install and create shortcut / Install app.
            </p>
            <p>
              <strong>iPhone/iPad:</strong> in Safari, open Share → Add to Home Screen, enable Open
              as Web App when shown, then Add.
            </p>
          </div>
          <p>
            <strong>After setup:</strong> launch from the home-screen icon. Projections, editing,
            scenarios, and file import/export work offline without your computer. The first complete
            download must finish first. Internet is needed again for app updates.
          </p>
          <p>
            <strong>Move your plan:</strong> export a JSON backup on your computer and import that
            file on your phone under Data &amp; recovery. Data is separate per device, browser, and
            website address; it is not synchronized automatically. An installed web app may have
            separate storage from its browser tab.
          </p>
          <p>
            <strong>Keep backups:</strong> clearing browser/site data or uninstalling can remove
            saved plans and offline files. Device storage policies can also evict them. Installation
            is not a backup.
          </p>
          {typeof navigator.storage?.persist === "function" && (
            <button
              onClick={async () => {
                try {
                  const granted = await navigator.storage.persist();
                  setStorageMessage(
                    granted
                      ? "Persistent storage granted for this origin. Continue exporting backups; clearing site data still removes it."
                      : "Persistent storage was not granted. The app still works, but keep regular JSON backups.",
                  );
                } catch {
                  setStorageMessage(
                    "Persistent storage could not be requested. Keep regular JSON backups.",
                  );
                }
              }}
            >
              Request persistent device storage
            </button>
          )}
          {storageMessage && <p role="status">{storageMessage}</p>}
          {state.phase === "development" && (
            <p>
              For local offline testing, run npm run build followed by npm start. A phone cannot
              install from your computer&apos;s ordinary HTTP LAN address; initial phone setup needs
              trusted HTTPS.
            </p>
          )}
        </div>
      </details>
      {state.error && <p className="warning">{state.error}</p>}
    </section>
  );
}
