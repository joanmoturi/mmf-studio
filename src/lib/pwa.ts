export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface OfflineStatus {
  ready: boolean;
  version: string;
}

export function requestOfflineStatus(
  worker: ServiceWorker,
  prepare = false,
): Promise<OfflineStatus> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(
      () => {
        channel.port1.close();
        reject(new Error("Offline setup did not respond. Connect and try again."));
      },
      prepare ? 120000 : 10000,
    );
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timer);
      channel.port1.close();
      const message = event.data;
      if (
        typeof message === "object" &&
        message !== null &&
        "ready" in message &&
        typeof message.ready === "boolean" &&
        "version" in message &&
        typeof message.version === "string"
      ) {
        resolve({ ready: message.ready, version: message.version });
      } else reject(new Error("The offline status response was invalid."));
    };
    try {
      worker.postMessage({ type: prepare ? "PREPARE_OFFLINE" : "OFFLINE_STATUS" }, [channel.port2]);
    } catch (error) {
      window.clearTimeout(timer);
      channel.port1.close();
      reject(error);
    }
  });
}

export function installedDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}
