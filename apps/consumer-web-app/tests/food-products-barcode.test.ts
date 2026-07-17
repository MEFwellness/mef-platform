import { describe, it, expect } from 'vitest';
import { validateBarcode, expandUpcE } from '../lib/food-products/barcode';

describe('validateBarcode', () => {
  it('accepts a valid UPC-A code', () => {
    const result = validateBarcode('012345678905');
    expect(result).toEqual({ valid: true, type: 'upc_a', normalized: '012345678905' });
  });

  it('rejects a UPC-A code with a bad check digit', () => {
    const result = validateBarcode('012345678900');
    expect(result.valid).toBe(false);
    expect(result.type).toBe('upc_a');
  });

  it('accepts a valid EAN-13 code', () => {
    const result = validateBarcode('4006381333931');
    expect(result).toEqual({ valid: true, type: 'ean_13', normalized: '4006381333931' });
  });

  it('rejects an EAN-13 code with a bad check digit', () => {
    const result = validateBarcode('4006381333930');
    expect(result.valid).toBe(false);
    expect(result.type).toBe('ean_13');
  });

  it('accepts a valid EAN-8 code', () => {
    const result = validateBarcode('73513537');
    expect(result).toEqual({ valid: true, type: 'ean_8', normalized: '73513537' });
  });

  it('accepts a valid UPC-E code and expands it to its UPC-A equivalent', () => {
    const result = validateBarcode('01234531');
    expect(result.valid).toBe(true);
    expect(result.type).toBe('upc_e');
    expect(result.normalized).toBe('012300000451');
  });

  it('rejects a non-numeric string', () => {
    const result = validateBarcode('not-a-barcode');
    expect(result).toEqual({ valid: false, type: 'unknown', normalized: 'not-a-barcode' });
  });

  it('rejects a string of the wrong length', () => {
    const result = validateBarcode('123456');
    expect(result.valid).toBe(false);
    expect(result.type).toBe('unknown');
  });

  it('trims whitespace before validating', () => {
    const result = validateBarcode('  012345678905  ');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('012345678905');
  });

  it('rejects an empty string', () => {
    const result = validateBarcode('');
    expect(result.valid).toBe(false);
  });
});

describe('expandUpcE', () => {
  it('returns null for a code that is not 8 digits', () => {
    expect(expandUpcE('1234567')).toBeNull();
  });

  it('returns null when the number system digit is not 0 or 1', () => {
    expect(expandUpcE('51234531')).toBeNull();
  });

  it('expands a UPC-E code ending in 3 using the manufacturer/product split rule', () => {
    expect(expandUpcE('01234531')).toBe('012300000451');
  });
});
