import fc from "fast-check";
import { luhnValid, maskSensitive } from "../../src/engine/mask";

describe("maskSensitive (source-stitching requirement 5)", () => {
  test("5.1 masks a Luhn-valid card number with spaces", () => {
    expect(maskSensitive("card 4111 1111 1111 1111 on file")).toBe("card [card ending 1111] on file");
  });

  test("5.1 masks a Luhn-valid card number with hyphens", () => {
    expect(maskSensitive("pay 5555-5555-5555-4444 now")).toBe("pay [card ending 4444] now");
  });

  test("5.2 masks NRIC and FIN patterns", () => {
    expect(maskSensitive("Director ID S1234567D and FIN G7654321K")).toBe("Director ID [ID masked] and FIN [ID masked]");
  });

  test("5.3 leaves a Luhn-invalid digit run unchanged", () => {
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(maskSensitive("ref 4111111111111112")).toBe("ref 4111111111111112");
  });

  test("dates, amounts and phone numbers are untouched", () => {
    const text = "On 2026-10-12 we paid SGD 20,000. Call +65 6123 4567.";
    expect(maskSensitive(text)).toBe(text);
  });

  test("property: no generated Luhn-valid card survives masking", () => {
    const digit = fc.integer({ min: 0, max: 9 });
    const cardArb = fc.array(digit, { minLength: 12, maxLength: 18 }).map((ds) => {
      // Append the Luhn check digit.
      const body = ds.join("");
      for (let c = 0; c <= 9; c++) if (luhnValid(body + c)) return body + c;
      return body + "0";
    });
    const word = fc.stringMatching(/^[a-z]{1,8}$/);
    fc.assert(
      fc.property(cardArb, word, word, fc.constantFrom(" ", "-", ""), (card, before, after, sep) => {
        const grouped = card.replace(/(\d{4})(?=\d)/g, `$1${sep}`);
        const out = maskSensitive(`${before} ${grouped} ${after}`);
        return !out.includes(grouped) && out.includes(`[card ending ${card.slice(-4)}]`);
      }),
      { numRuns: 300 },
    );
  });
});
