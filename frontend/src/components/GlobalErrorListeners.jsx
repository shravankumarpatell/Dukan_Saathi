"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/services/apiError";

/**
 * Last line of defence for errors that escape components:
 *  - unhandled promise rejections (an awaited API call nobody caught)
 *  - uncaught runtime errors from event handlers / timers
 *  - browser offline / online transitions
 *
 * Shows one toast (deduped for 4s) so the user is never left staring at a
 * screen where "nothing happened". Errors are still logged to the console.
 */
export default function GlobalErrorListeners() {
  const lastRef = useRef({ msg: "", at: 0 });

  useEffect(() => {
    const show = (msg) => {
      const now = Date.now();
      if (lastRef.current.msg === msg && now - lastRef.current.at < 4000) return;
      lastRef.current = { msg, at: now };
      toast.error(msg);
    };

    const onRejection = (e) => {
      const reason = e?.reason;
      // Cancelled requests are not errors the user needs to hear about.
      if (reason?.name === "AbortError" || reason?.type === "Aborted") return;
      // eslint-disable-next-line no-console
      console.error("[unhandledrejection]", reason);
      show(errorMessage(reason));
      e.preventDefault?.();
    };

    const onError = (e) => {
      // Ignore cross-origin script noise ("Script error.") and resource load errors.
      if (!e?.error && (!e?.message || e.message === "Script error.")) return;
      // eslint-disable-next-line no-console
      console.error("[window.error]", e.error || e.message);
      show("Kuch gadbad ho gayi. Agar dikkat rahe to page reload karein.");
    };

    const onOffline = () => show("Internet chala gaya. Connection wapas aane par kaam khud chalega.");
    const onOnline = () => toast.success("Internet wapas aa gaya.");

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
