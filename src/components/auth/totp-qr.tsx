import { encode } from "uqr";

/**
 * QR of an otpauth:// URI as one SVG path. Always dark modules on a light
 * ground — some authenticator scanners don't read inverted codes — so it
 * takes the two footer tokens, which keep that order in both themes.
 */
export function TotpQr({
  uri,
  className,
}: {
  uri: string;
  className?: string;
}) {
  // A quiet zone of 4 modules, as the QR standard asks.
  const { data, size } = encode(uri, { ecc: "M", border: 4 });
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR-код для приложения-аутентификатора"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} className="fill-footer-foreground" />
      <path d={path} className="fill-footer" />
    </svg>
  );
}

/** The base32 key from an otpauth:// URI, in groups of four for typing. */
export function manualKey(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return secret.match(/.{1,4}/g)?.join(" ") ?? "";
}
