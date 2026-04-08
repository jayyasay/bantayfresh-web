import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { IoClose, IoScanOutline } from "react-icons/io5";

type BarcodeScannerModalProps = {
  onClose: () => void;
  onDetected: (barcode: string) => void;
  visible: boolean;
};

type CanvasVariant = {
  crop: { height: number; width: number; x: number; y: number };
  filter?: string;
  mirror?: boolean;
};

const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODABAR,
  BarcodeFormat.ITF,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.QR_CODE,
] as const;

const SCAN_VARIANTS: CanvasVariant[] = [
  {
    crop: { x: 0, y: 0, width: 1, height: 1 },
  },
  {
    crop: { x: 0.08, y: 0.18, width: 0.84, height: 0.56 },
  },
  {
    crop: { x: 0.14, y: 0.28, width: 0.72, height: 0.38 },
    filter: "grayscale(1) contrast(1.65) brightness(1.08)",
  },
  {
    crop: { x: 0.08, y: 0.18, width: 0.84, height: 0.56 },
    mirror: true,
  },
  {
    crop: { x: 0.14, y: 0.28, width: 0.72, height: 0.38 },
    filter: "grayscale(1) contrast(1.65) brightness(1.08)",
    mirror: true,
  },
];

function createReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [...SUPPORTED_FORMATS]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  return new BrowserMultiFormatReader(hints);
}

function getCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Allow camera access to scan barcodes automatically with your device.";
    }

    if (error.name === "NotFoundError") {
      return "We couldn't find an available camera on this device.";
    }

    if (error.name === "OverconstrainedError") {
      return "The preferred camera settings were unavailable, so scanning couldn't start.";
    }
  }

  return error instanceof Error
    ? error.message
    : "We couldn't start the camera right now. You can enter the barcode below instead.";
}

function normalizeDetectedBarcodeValue(value: string) {
  const compactValue = value.replace(/\s+/g, "").trim();
  if (!compactValue) {
    return null;
  }

  const digitOnlyValue = compactValue.replace(/\D/g, "");
  if (digitOnlyValue.length >= 8 && digitOnlyValue.length <= 14) {
    return digitOnlyValue;
  }

  if (/^[A-Za-z0-9-]{8,32}$/.test(compactValue)) {
    return compactValue;
  }

  return null;
}

function drawVariantFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  variant: CanvasVariant,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const cropX = Math.max(0, Math.floor(sourceWidth * variant.crop.x));
  const cropY = Math.max(0, Math.floor(sourceHeight * variant.crop.y));
  const cropWidth = Math.max(1, Math.floor(sourceWidth * variant.crop.width));
  const cropHeight = Math.max(1, Math.floor(sourceHeight * variant.crop.height));
  const scale = Math.min(1, 1280 / cropWidth);
  const targetWidth = Math.max(1, Math.floor(cropWidth * scale));
  const targetHeight = Math.max(1, Math.floor(cropHeight * scale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.filter = variant.filter ?? "none";

  if (variant.mirror) {
    context.translate(targetWidth, 0);
    context.scale(-1, 1);
  }

  context.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  context.restore();
}

export default function BarcodeScannerModal({
  onClose,
  onDetected,
  visible,
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLockRef = useRef(false);
  const sessionRef = useRef(0);
  const [manualCode, setManualCode] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [supportsLiveScan, setSupportsLiveScan] = useState(true);

  useEffect(() => {
    if (!visible) {
      setManualCode("");
      setIsPreparing(false);
      setCameraError(null);
      setSupportsLiveScan(true);
      stopScanner();
      return undefined;
    }

    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;
    scanLockRef.current = false;
    setIsPreparing(true);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setSupportsLiveScan(false);
      setIsPreparing(false);
      setCameraError(
        "This browser doesn't support live camera capture. Enter the barcode manually below.",
      );
      return undefined;
    }

    let cancelled = false;

    async function startCamera(constraints: MediaStreamConstraints) {
      return navigator.mediaDevices.getUserMedia(constraints);
    }

    async function startScanner() {
      readerRef.current = createReader();

      try {
        let stream: MediaStream | null = null;

        try {
          stream = await startCamera({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          });
        } catch {
          try {
            const devices = await BrowserMultiFormatReader.listVideoInputDevices();
            const preferredDevice =
              devices.find((device) => /front|facetime|user|built-?in/i.test(device.label)) ??
              devices[0];

            if (preferredDevice) {
              stream = await startCamera({
                audio: false,
                video: {
                  deviceId: { exact: preferredDevice.deviceId },
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                },
              });
            }
          } catch {
            stream = null;
          }
        }

        if (!stream) {
          stream = await startCamera({
            audio: false,
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        }

        if (cancelled || sessionRef.current !== sessionId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          await new Promise<void>((resolve) => {
            const videoElement = videoRef.current;
            if (!videoElement) {
              resolve();
              return;
            }

            if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
              resolve();
              return;
            }

            const handleLoadedMetadata = () => {
              videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
              resolve();
            };

            videoElement.addEventListener("loadedmetadata", handleLoadedMetadata, {
              once: true,
            });
          });

          await videoRef.current.play();
        }

        if (cancelled || sessionRef.current !== sessionId) {
          return;
        }

        setSupportsLiveScan(true);
        setIsPreparing(false);
        scheduleScan(sessionId);
      } catch (error) {
        if (cancelled || sessionRef.current !== sessionId) {
          return;
        }

        setSupportsLiveScan(false);
        setIsPreparing(false);
        setCameraError(getCameraErrorMessage(error));
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [visible]);

  function stopScanner() {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    readerRef.current = null;
  }

  function handleResolvedBarcode(value: string) {
    const normalizedBarcode = normalizeDetectedBarcodeValue(value);
    if (!normalizedBarcode || scanLockRef.current) {
      return;
    }

    scanLockRef.current = true;
    stopScanner();
    onDetected(normalizedBarcode);
  }

  function scheduleScan(sessionId: number) {
    scanTimerRef.current = window.setTimeout(() => {
      void scanFrame(sessionId);
    }, 180);
  }

  async function scanFrame(sessionId: number) {
    if (!visible || scanLockRef.current || sessionRef.current !== sessionId) {
      return;
    }

    const reader = readerRef.current;
    const video = videoRef.current;

    if (
      !reader ||
      !video ||
      video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      scheduleScan(sessionId);
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    for (const variant of SCAN_VARIANTS) {
      if (scanLockRef.current || sessionRef.current !== sessionId) {
        return;
      }

      try {
        drawVariantFrame(video, canvasRef.current, variant);
        const result = reader.decodeFromCanvas(canvasRef.current);
        const resolvedBarcode = result.getText()?.trim();

        if (resolvedBarcode) {
          handleResolvedBarcode(resolvedBarcode);
          return;
        }
      } catch {
        // Most attempts miss until the barcode fills enough of the frame.
      }
    }

    if (sessionRef.current === sessionId && !scanLockRef.current) {
      scheduleScan(sessionId);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="scanner-modal" role="dialog" aria-modal="true">
      <button
        aria-label="Close barcode scanner"
        className="scanner-modal__backdrop"
        type="button"
        onClick={onClose}
      />

      <div className="scanner-modal__card">
        <div className="scanner-modal__header">
          <div className="scanner-modal__copy">
            <h3 className="scanner-modal__title">Scan Barcode</h3>
            <p className="scanner-modal__body">
              Hold the barcode inside the frame and keep it steady for a moment while we detect it.
            </p>
          </div>

          <button
            aria-label="Close barcode scanner"
            className="scanner-modal__close"
            type="button"
            onClick={onClose}
          >
            <IoClose />
          </button>
        </div>

        <div className="scanner-modal__camera-shell">
          {supportsLiveScan ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                className="scanner-modal__video"
                muted
                playsInline
              />

              <div className="scanner-modal__frame-wrap" aria-hidden="true">
                <div className="scanner-modal__frame" />
              </div>

              {isPreparing ? (
                <div className="scanner-modal__state">
                  <span className="scanner-modal__state-icon">
                    <IoScanOutline />
                  </span>
                  <p className="scanner-modal__state-title">Preparing camera...</p>
                  <p className="scanner-modal__state-body">
                    Starting the webcam and scanner for retail barcodes.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="scanner-modal__notice">
              <p className="scanner-modal__notice-title">Use barcode entry</p>
              <p className="scanner-modal__notice-body">
                {cameraError ??
                  "Live camera scanning isn't available here yet. Enter the barcode manually to continue."}
              </p>
            </div>
          )}
        </div>

        <div className="scanner-modal__footer">
          <p className="scanner-modal__footer-copy">
            MacBook webcams scan best when the barcode fills most of the frame, stays level, and
            the numbers underneath are visible without blur.
          </p>

          {cameraError && supportsLiveScan ? (
            <div className="scanner-modal__notice scanner-modal__notice--inline">
              <p className="scanner-modal__notice-title">Camera unavailable</p>
              <p className="scanner-modal__notice-body">{cameraError}</p>
            </div>
          ) : null}

          <div className="scanner-modal__manual">
            <label className="field-group">
              <span className="form-label">Enter Barcode</span>
              <div className="input-shell">
                <input
                  className="field-input field-input--dark"
                  inputMode="numeric"
                  placeholder="Type or paste the barcode"
                  type="text"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                />
              </div>
            </label>

            <div className="scanner-modal__actions">
              <button
                className="secondary-button secondary-button--wide"
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="submit-button scanner-modal__submit"
                disabled={!manualCode.trim()}
                type="button"
                onClick={() => handleResolvedBarcode(manualCode)}
              >
                Use Barcode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
