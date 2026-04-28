import { BadRequestException } from '@nestjs/common';
import { ParseHealthFacilityIdPipe } from './parse-health-facility-id.pipe';

describe('ParseHealthFacilityIdPipe', () => {
  const pipe = new ParseHealthFacilityIdPipe();

  it('accepts fac-001', () => {
    expect(pipe.transform('fac-001', { type: 'param' } as never)).toBe(
      'fac-001',
    );
  });

  it('trims whitespace', () => {
    expect(pipe.transform('  fac-001  ', { type: 'param' } as never)).toBe(
      'fac-001',
    );
  });

  it('rejects empty', () => {
    expect(() => pipe.transform('', { type: 'param' } as never)).toThrow(
      BadRequestException,
    );
  });

  it('rejects wrong pattern', () => {
    expect(() =>
      pipe.transform('uuid-here', { type: 'param' } as never),
    ).toThrow(BadRequestException);
  });

  it('rejects too long', () => {
    const id = 'fac-' + 'a'.repeat(62);
    expect(id.length).toBeGreaterThan(64);
    expect(() => pipe.transform(id, { type: 'param' } as never)).toThrow(
      BadRequestException,
    );
  });
});
