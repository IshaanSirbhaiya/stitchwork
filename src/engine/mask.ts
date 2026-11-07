// Masking runs before indexing and before anything enters the Crypt.
// Card numbers: 13 to 19 digits, optionally separated by single spaces or hyphens, Luhn-valid.
// Singapore NRIC / FIN: one of S T F G M, seven digits, one letter.

const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
const NRIC = /\b[STFGM]\d{7}[A-Z]\b/gi;

export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function maskSensitive(text: string): string {
  const cardsMasked = text.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/[ -]/g, "");
    return luhnValid(digits) ? `[card ending ${digits.slice(-4)}]` : match;
  });
  return cardsMasked.replace(NRIC, "[ID masked]");
}
