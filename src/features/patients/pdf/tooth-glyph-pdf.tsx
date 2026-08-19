import { G, Path, Svg } from "@react-pdf/renderer";
import type { ToothKind } from "@/features/dashboard/odontogram-teeth";

// Same four crown+root paths as ToothGlyph (odontogram-teeth.tsx) — react-pdf
// renders through its own layout/paint engine, not the DOM, so that SVG
// component can't be reused directly here; this re-expresses the exact same
// path data via react-pdf's own Svg/Path/G so the printed chart matches the
// on-screen one instead of inventing a second tooth illustration. The
// clinical logic driving WHICH glyph and orientation a position gets
// (getToothKind, arch layout) is imported and reused as-is from that same
// module — only this drawing primitive differs.
export function ToothGlyphPdf({
  kind,
  color,
  flipped,
  opacity,
  width = 14,
  height = 19,
}: {
  kind: ToothKind;
  color: string;
  flipped: boolean;
  opacity?: number;
  width?: number;
  height?: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 32">
      <G transform={flipped ? "matrix(1,0,0,-1,0,32)" : undefined} opacity={opacity}>
        {kind === "incisivo" && (
          <>
            <Path
              d="M8 2h8a3 3 0 0 1 3 3v8a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V5a3 3 0 0 1 3-3Z"
              fill={color}
            />
            <Path d="M9.4 17h5.2l-1 12h-3.2z" fill={color} opacity={0.5} />
          </>
        )}
        {kind === "canino" && (
          <>
            <Path
              d="M12 2c2.7 0 4.5 1.7 5.5 4.1 1 2.2.3 4.6-1.3 6.3L13 15.6a1.3 1.3 0 0 1-2 0L7.8 12.4c-1.6-1.7-2.3-4.1-1.3-6.3C7.5 3.7 9.3 2 12 2Z"
              fill={color}
            />
            <Path d="M10.4 16h3.2l-.8 13h-1.6z" fill={color} opacity={0.5} />
          </>
        )}
        {kind === "premolar" && (
          <>
            <Path
              d="M6 4.5A3.5 3.5 0 0 1 9.5 1h5A3.5 3.5 0 0 1 18 4.5V11a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 6 11Z"
              fill={color}
            />
            <Path
              d="M12 3.5v11"
              stroke={color}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.45}
              fill="none"
            />
            <Path d="M9 17h6l-.9 12h-4.2z" fill={color} opacity={0.5} />
          </>
        )}
        {kind === "molar" && (
          <>
            <Path
              d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5a6.5 6.5 0 0 1-6.5 6.5h-3A6.5 6.5 0 0 1 4 11.5Z"
              fill={color}
            />
            <Path
              d="M12 2.5v12.5M5.2 8.7h13.6"
              stroke={color}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.4}
              fill="none"
            />
            <Path d="M7 18h10l-1 11.5H8z" fill={color} opacity={0.5} />
          </>
        )}
      </G>
    </Svg>
  );
}
