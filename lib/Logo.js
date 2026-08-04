// Λεκτικό σήμα Turno — το «o» είναι συμπαγής δείκτης βάρδιας.
// tone: "dark" (για ανοιχτό φόντο) | "light" (για σκούρο φόντο)
export default function Logo({ size = 34, tone = "dark" }) {
  const ink = tone === "light" ? "#FFFFFF" : "#10394A";
  const hole = tone === "light" ? "#10394A" : "#FFFFFF";
  return (
    <svg
      width={size * 2.9}
      height={size}
      viewBox="0 0 98 34"
      role="img"
      aria-label="Turno"
      style={{ display: "block" }}
    >
      <text
        x="0"
        y="26"
        fontSize="30"
        fontWeight="700"
        fill={ink}
        fontFamily="Commissioner, system-ui, sans-serif"
        letterSpacing="-0.5"
      >
        Turn
      </text>
      <circle cx="76" cy="17.5" r="8.6" fill={ink} />
      <path
        d="M 76 9.6 A 7.9 7.9 0 0 1 82.6 21.6"
        fill="none"
        stroke="#F2A916"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="76" cy="17.5" r="2.6" fill={hole} />
    </svg>
  );
}
