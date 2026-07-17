/**
 * Pure barcode-format detection and checksum validation — no I/O, no
 * camera/decoding concerns (those live in components/food-products/
 * BarcodeScanner.tsx). Used both to validate a live decode result and to
 * validate manual barcode entry, so the two paths can never disagree about
 * what counts as a well-formed barcode.
 */

import type { BarcodeType } from '@mef/shared-types-contracts';

function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

/** Standard mod-10 (Luhn-style, GS1) checksum shared by UPC-A and EAN-13/EAN-8 — odd/even positional weighting counted from the RIGHT, excluding the check digit itself. */
function gs1CheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  const weights = [3, 1]; // rightmost digit gets weight 3, alternating
  for (let i = 0; i < digitsWithoutCheck.length; i++) {
    const digit = Number(digitsWithoutCheck[digitsWithoutCheck.length - 1 - i]);
    sum += digit * weights[i % 2]!;
  }
  return (10 - (sum % 10)) % 10;
}

function isValidGs1(code: string): boolean {
  if (!isDigits(code)) return false;
  const body = code.slice(0, -1);
  const checkDigit = Number(code[code.length - 1]);
  return gs1CheckDigit(body) === checkDigit;
}

/** UPC-E is a compressed 8-digit (6 significant + number system + check) representation of a UPC-A code. This expands it to the equivalent 12-digit UPC-A per the standard expansion table, then reuses the same GS1 checksum. */
export function expandUpcE(upcE: string): string | null {
  if (!/^\d{8}$/.test(upcE)) return null;
  const numberSystem = upcE[0]!;
  if (numberSystem !== '0' && numberSystem !== '1') return null;

  const digits = upcE.slice(1, 7);
  const checkDigit = upcE[7]!;
  const lastDigit = digits[5]!;

  let manufacturer: string;
  let product: string;

  if (['0', '1', '2'].includes(lastDigit)) {
    manufacturer = digits.slice(0, 2) + lastDigit + '00';
    product = '00' + digits.slice(2, 5);
  } else if (lastDigit === '3') {
    manufacturer = digits.slice(0, 3) + '00';
    product = '000' + digits.slice(3, 5);
  } else if (lastDigit === '4') {
    manufacturer = digits.slice(0, 4) + '0';
    product = '0000' + digits.slice(4, 5);
  } else {
    manufacturer = digits.slice(0, 5);
    product = '0000' + lastDigit;
  }

  return `${numberSystem}${manufacturer}${product}${checkDigit}`;
}

export type BarcodeValidationResult = {
  valid: boolean;
  type: BarcodeType;
  /** The barcode used for product lookup — UPC-E is expanded to its UPC-A equivalent since Open Food Facts indexes by the expanded form. Otherwise identical to the input. */
  normalized: string;
};

/**
 * Detects the barcode type from length and validates its checksum. Accepts
 * only the four packaged-food formats this feature supports (product
 * requirement §1) — anything else (e.g. a QR code payload) is reported
 * invalid rather than guessed at.
 */
export function validateBarcode(rawCode: string): BarcodeValidationResult {
  const code = rawCode.trim();

  if (!isDigits(code)) {
    return { valid: false, type: 'unknown', normalized: code };
  }

  if (code.length === 8) {
    // Ambiguous by length alone: could be EAN-8 or UPC-E. UPC-E only ever
    // starts with 0 or 1 (the number system digit); EAN-8 has no such
    // restriction. Try UPC-E first since it's the format needing expansion.
    if (code[0] === '0' || code[0] === '1') {
      const expanded = expandUpcE(code);
      if (expanded && isValidGs1(expanded)) {
        return { valid: true, type: 'upc_e', normalized: expanded };
      }
    }
    return { valid: isValidGs1(code), type: 'ean_8', normalized: code };
  }

  if (code.length === 12) {
    return { valid: isValidGs1(code), type: 'upc_a', normalized: code };
  }

  if (code.length === 13) {
    return { valid: isValidGs1(code), type: 'ean_13', normalized: code };
  }

  return { valid: false, type: 'unknown', normalized: code };
}
