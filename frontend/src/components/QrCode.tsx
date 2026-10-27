import React from "react";
import { QRCodeSVG } from "qrcode.react";

interface QrCodeProps {
  /** URL encoded in the QR code */
  value: string;
  /** Rendered size in pixels */
  size?: number;
  /** Accessible label describing what scanning does */
  label: string;
}

/**
 * QR code rendered client-side as SVG. Always drawn dark-on-white with a
 * quiet zone so phone cameras can read it in dark mode and on projectors.
 */
export const QrCode: React.FC<QrCodeProps> = ({ value, size = 256, label }) => (
  <div className="inline-block rounded-2xl bg-white p-4 shadow-lg">
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      bgColor="#ffffff"
      fgColor="#111827"
      role="img"
      aria-label={label}
      data-testid="qr-code"
      data-value={value}
    />
  </div>
);
