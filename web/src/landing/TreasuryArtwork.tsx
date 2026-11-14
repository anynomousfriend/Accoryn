export function TreasuryArtwork() {
  return (
    <div className="treasury-artwork" aria-hidden="true">
      <div className="art-orbit orbit-one">
        <svg viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="184" />
          <circle cx="200" cy="200" r="138" />
          <circle cx="200" cy="200" r="92" />
          <circle cx="200" cy="200" r="46" />
          <path d="M16 200h368M200 16v368M70 70l260 260M70 330 330 70" />
        </svg>
      </div>
      <div className="art-seal seal-one">
        <svg viewBox="0 0 300 400">
          <path d="M150 10C80 10 30 57 30 135v130c0 78 50 125 120 125s120-47 120-125V135C270 57 220 10 150 10Z" />
          <path d="M150 50c-48 0-80 30-80 85v130c0 55 32 85 80 85s80-30 80-85V135c0-55-32-85-80-85Z" />
          <circle cx="150" cy="200" r="36" />
          <path d="M150 164v72M114 200h72" />
        </svg>
      </div>
      <div className="art-seal seal-two">
        <svg viewBox="0 0 320 320">
          <rect x="35" y="35" width="250" height="250" rx="90" />
          <rect x="75" y="75" width="170" height="170" rx="60" />
          <rect x="115" y="115" width="90" height="90" rx="30" />
        </svg>
      </div>
      <div className="art-orbit orbit-two">
        <svg viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="185" />
          <circle cx="200" cy="200" r="145" />
          <circle cx="200" cy="200" r="105" />
          <circle cx="200" cy="200" r="65" />
          <circle cx="200" cy="200" r="25" />
        </svg>
      </div>
      <div className="art-spark">✳</div>
    </div>
  );
}
