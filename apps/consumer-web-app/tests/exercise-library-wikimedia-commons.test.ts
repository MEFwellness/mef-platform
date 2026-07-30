import { describe, it, expect, vi, afterEach } from 'vitest';
import { findCommonsImage } from '../lib/exercise-library/wikimediaCommons';

function mockFetchSequence(responses: unknown[]) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const body = responses[call];
      call += 1;
      return { ok: true, json: async () => body } as Response;
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findCommonsImage', () => {
  it('accepts a candidate whose title contains every significant token and has a commercial-use license', async () => {
    mockFetchSequence([
      { query: { search: [{ title: 'File:Barbell Squat demonstration.jpg' }] } },
      {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/barbell-squat.jpg',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Barbell_Squat_demonstration.jpg',
                  mime: 'image/jpeg',
                  extmetadata: {
                    LicenseShortName: { value: 'CC BY-SA 4.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                    Artist: { value: 'Some Photographer' },
                  },
                },
              ],
            },
          },
        },
      },
    ]);

    const result = await findCommonsImage('Barbell Squat');
    expect(result).not.toBeNull();
    expect(result?.imageUrl).toBe('https://upload.wikimedia.org/barbell-squat.jpg');
  });

  it('rejects a candidate missing a required token — "Barbell Squat" cannot match a "Barbell Row" photo', async () => {
    mockFetchSequence([{ query: { search: [{ title: 'File:Barbell Row form.jpg' }] } }]);
    const result = await findCommonsImage('Barbell Squat');
    expect(result).toBeNull();
  });

  it('rejects a non-commercial-use license even if the title matches perfectly', async () => {
    mockFetchSequence([
      { query: { search: [{ title: 'File:Barbell Squat demonstration.jpg' }] } },
      {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/barbell-squat.jpg',
                  mime: 'image/jpeg',
                  extmetadata: { LicenseShortName: { value: 'CC BY-NC 4.0' } },
                },
              ],
            },
          },
        },
      },
    ]);
    const result = await findCommonsImage('Barbell Squat');
    expect(result).toBeNull();
  });

  it('rejects an anatomical diagram even though its title token-matches — real bug found against production data ("Adductor" matched a Gray\'s Anatomy plate)', async () => {
    mockFetchSequence([{ query: { search: [{ title: 'File:Gray415 - Adductor pollicis - red.png' }] } }]);
    const result = await findCommonsImage('Adductor');
    expect(result).toBeNull();
  });

  it('rejects an SVG (vector diagrams are never a photo of someone performing the exercise)', async () => {
    mockFetchSequence([{ query: { search: [{ title: 'File:Barbell Squat diagram.svg' }] } }]);
    const result = await findCommonsImage('Barbell Squat');
    expect(result).toBeNull();
  });

  it('rejects a long, unrelated title even though every required token happens to appear in it — real bug found against production data ("Side Bridge" matched an actual bridge-structure photo)', async () => {
    mockFetchSequence([
      {
        query: {
          search: [
            {
              title:
                'File:Southern side of Woljeonggyo Bridge illuminated at sunset in Gyeongju South Korea.jpg',
            },
          ],
        },
      },
    ]);
    const result = await findCommonsImage('Side Bridge');
    expect(result).toBeNull();
  });

  it('still accepts a genuine match where the exercise name is a real fraction of a slightly longer title', async () => {
    mockFetchSequence([
      { query: { search: [{ title: 'File:Paul Anderson silver dollar squat.jpg' }] } },
      {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/anderson-squat.jpg',
                  mime: 'image/jpeg',
                  extmetadata: { LicenseShortName: { value: 'CC0' } },
                },
              ],
            },
          },
        },
      },
    ]);
    const result = await findCommonsImage('Anderson Squat');
    expect(result).not.toBeNull();
  });

  it('rejects a non-JPEG image even when the title token-matches cleanly — real bug found against production data ("Adductor" matched "Adductor minimus.gif", an anatomical diagram not caught by the title-pattern exclusion)', async () => {
    mockFetchSequence([
      { query: { search: [{ title: 'File:Adductor minimus.gif' }] } },
      {
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/adductor-minimus.gif',
                  mime: 'image/gif',
                  extmetadata: { LicenseShortName: { value: 'CC BY-SA 2.1 jp' } },
                },
              ],
            },
          },
        },
      },
    ]);
    const result = await findCommonsImage('Adductor');
    expect(result).toBeNull();
  });

  it('returns null when the search finds nothing at all', async () => {
    mockFetchSequence([{ query: { search: [] } }]);
    const result = await findCommonsImage('Some Very Obscure Exercise Name');
    expect(result).toBeNull();
  });

  it('retries on 429 instead of failing immediately — real production data hit this on nearly every request (1928/1934) before backoff was added', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return { ok: false, status: 429, headers: new Headers() } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ query: { search: [] } }),
        } as Response;
      })
    );

    const result = await findCommonsImage('Barbell Squat');
    expect(result).toBeNull(); // empty search result, but the point is it didn't throw on the 429
    expect(call).toBeGreaterThanOrEqual(2);
  });
});
