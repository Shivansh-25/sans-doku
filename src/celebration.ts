let timeout: ReturnType<typeof setTimeout> | undefined;
let overlay: HTMLDivElement | undefined;

export function clearCelebration() {
  clearTimeout(timeout);
  overlay?.remove();
  overlay = undefined;
}

export function celebrate() {
  clearCelebration();
  overlay = document.createElement("div");
  overlay.className = "celebration";
  const hearts = document.createElement("div");
  hearts.className = "heart-confetti";
  hearts.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 32; i++) {
    const heart = document.createElement("span");
    heart.textContent = i % 3 === 0 ? "♡" : "♥";
    heart.style.setProperty("--left", `${Math.random() * 100}%`);
    heart.style.setProperty("--delay", `${Math.random() * 0.7}s`);
    heart.style.setProperty("--duration", `${2.5 + Math.random()}s`);
    heart.style.setProperty("--drift", `${Math.random() * 100 - 50}px`);
    heart.style.setProperty("--size", `${16 + Math.random() * 18}px`);
    hearts.append(heart);
  }
  const card = document.createElement("div");
  card.className = "celebration-card";
  card.innerHTML = `<div role="status" aria-live="polite"><span class="celebration-heart" aria-hidden="true">♡</span><h2>Love you my cutu ♡</h2><p>You solved it! So proud of you.</p></div><button type="button" aria-label="Dismiss celebration">A little win ♡</button>`;
  card.querySelector("button")!.onclick = clearCelebration;
  overlay.append(hearts, card);
  document.body.append(overlay);
  timeout = setTimeout(clearCelebration, 6500);
}
