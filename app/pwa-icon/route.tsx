import { ImageResponse } from "next/og";

export function GET(request: Request) {
  const size = Math.min(1024, Math.max(48, Number(new URL(request.url).searchParams.get("size")) || 512));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f10",
        }}
      >
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 100 100" fill="none">
          <path
            d="M70 24C56 12 28 16 30 34C32 52 70 46 70 66C70 84 40 88 26 74"
            stroke="#d9b8ae"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}