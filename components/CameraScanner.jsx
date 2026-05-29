"use client";

import { useEffect, useRef, useState } from "react";

export default function CameraScanner({ onResult }) {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    if ("BarcodeDetector" in window) setSupported(true);
  }, []);

  async function startScan() {
    setError("");
    try {
      if (!("BarcodeDetector" in window)) {
        setError("Camera scanning not supported in this browser");
        return;
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      trackRef.current = stream.getTracks()[0];
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      async function tick() {
        if (!videoRef.current || !scanning) return;
        const { videoWidth, videoHeight } = videoRef.current;
        if (videoWidth === 0 || videoHeight === 0) {
          requestAnimationFrame(tick);
          return;
        }
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
        const bitmap = await createImageBitmap(canvas);
        try {
          const barcodes = await detector.detect(bitmap);
          if (barcodes.length > 0) {
            const text = barcodes[0].rawValue;
            if (text) {
              onResult?.(text);
              stopScan();
              return;
            }
          }
        } catch (err) {
          console.warn("QR detect failed", err);
        }
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      stopScan();
    }
  }

  function stopScan() {
    setScanning(false);
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }

  if (!supported) {
    return <div className="text-xs text-[#8B949E]">Camera scanning unavailable on this device.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={scanning ? stopScan : startScan}
          className="rounded-lg bg-[#F7931A] px-3 py-2 text-sm font-bold text-white hover:bg-[#E8850F]"
        >
          {scanning ? "Stop Scan" : "Scan QR"}
        </button>
      </div>
      {error && <div className="text-xs text-[#F85149]">{error}</div>}
      {scanning && (
        <video
          ref={videoRef}
          className="w-full rounded-xl border border-[#30363D] bg-[#0D1117]"
          playsInline
          muted
        />
      )}
    </div>
  );
}
