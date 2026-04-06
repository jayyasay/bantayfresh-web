import brandLogo from "../assets/bantay-logo.webp";

type BrandMarkProps = {
  fillParent?: boolean;
  showFrame?: boolean;
  size?: number;
};

export default function BrandMark({
  size = 108,
  showFrame = true,
  fillParent = false,
}: BrandMarkProps) {
  const logoShadow = "0 12px 28px rgba(8, 24, 16, 0.24)";

  if (!showFrame) {
    return (
      <div
        aria-label="BantayFresh brand mark"
        style={{
          borderRadius: fillParent ? "inherit" : Math.round(size * 0.28),
          boxShadow: logoShadow,
          height: fillParent ? "100%" : size,
          overflow: "hidden",
          width: fillParent ? "100%" : size,
        }}
      >
        <img
          alt="BantayFresh logo"
          src={brandLogo}
          style={{
            borderRadius: fillParent ? "inherit" : Math.round(size * 0.28),
            boxShadow: logoShadow,
            height: "100%",
            objectFit: "contain",
            width: "100%",
          }}
        />
      </div>
    );
  }

  const scale = size / 108;
  const frameRadius = 30 * scale;
  const innerInset = 12 * scale;
  const innerRadius = 24 * scale;
  const iconInset = 18 * scale;

  return (
    <div
      aria-label="BantayFresh brand mark"
      style={{
        alignItems: "center",
        backgroundColor: "#1ebc69",
        borderRadius: frameRadius,
        boxShadow: logoShadow,
        display: "flex",
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: size,
      }}
    >
      <div
        style={{
          border: "1px solid rgba(234,251,241,0.22)",
          borderRadius: innerRadius,
          inset: innerInset,
          position: "absolute",
        }}
      />
      <div
        style={{
          alignItems: "center",
          display: "flex",
          inset: iconInset,
          justifyContent: "center",
          position: "absolute",
        }}
      >
        <img
          alt="BantayFresh logo"
          src={brandLogo}
          style={{
            borderRadius: innerRadius,
            boxShadow: logoShadow,
            height: "100%",
            objectFit: "contain",
            width: "100%",
          }}
        />
      </div>
    </div>
  );
}
