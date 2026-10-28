import { SFX_COLORS, type SfxButton, type SfxSound } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import {
  applyOrder,
  availability,
  categoriesOf,
  checkUploads,
  cleanCategory,
  colorForCategory,
  countByStatus,
  durationText,
  fileSize,
  groupSounds,
  labelFromName,
  lastGrapheme,
  MAX_UPLOAD_FILES,
  moveId,
  OVERLAP_HINT,
  pickEmoji,
  sameIds,
  sliderValue,
  unmappedReadySounds,
} from './lib';

const sound = (id: string, name: string, category = '', status: SfxSound['status'] = 'ready'): SfxSound => ({
  id,
  name,
  category,
  file: category ? `${category}/${name}.mp3` : `${name}.mp3`,
  status,
  durationMs: 1200,
});

const button = (id: string, soundId: string | null): SfxButton => ({
  id,
  label: id,
  soundId,
  color: 'violet',
  volume: 1,
});

describe('sounds screen helpers', () => {
  it('turns a file name into a short button label', () => {
    expect(labelFromName('bruh-sound_effect')).toBe('Bruh sound effect');
    expect(labelFromName('   ')).toBe('Som');
    expect(labelFromName('a'.repeat(80))).toHaveLength(32);
    // 32 code points, like the server counts: an emoji is never cut in half
    const label = labelFromName(`${'a'.repeat(31)}😂😂`);
    expect(Array.from(label)).toHaveLength(32);
    expect(label.endsWith('😂')).toBe(true);
  });

  it('groups by folder (root first) and searches without case or accents', () => {
    const sounds = [
      sound('1', 'Zé', 'memes-pt'),
      sound('2', 'airhorn'),
      sound('3', 'Ação', 'memes-pt'),
      sound('4', 'bruh', 'memes-en'),
    ];
    const groups = groupSounds(sounds);
    expect(groups.map((g) => g.category)).toEqual(['', 'memes-en', 'memes-pt']);
    expect(groups[0]?.label).toBe('Pasta principal');
    expect(groups[2]?.sounds.map((s) => s.name)).toEqual(['Ação', 'Zé']);
    expect(groupSounds(sounds, 'ACAO').flatMap((g) => g.sounds.map((s) => s.id))).toEqual(['3']);
    expect(groupSounds(sounds, 'memes-en').flatMap((g) => g.sounds.map((s) => s.id))).toEqual(['4']);
    expect(categoriesOf(sounds)).toEqual(['memes-en', 'memes-pt']);
  });

  it('explains why a button cannot play', () => {
    expect(availability(button('b', null), undefined)).toMatchObject({ ok: false, text: 'sem som escolhido' });
    expect(availability(button('b', 'x'), undefined)).toMatchObject({
      ok: false,
      kind: 'missing',
      text: 'sem arquivo',
    });
    expect(availability(button('b', '1'), sound('1', 'a', '', 'converting'))).toMatchObject({
      ok: false,
      text: 'convertendo…',
    });
    expect(availability(button('b', '1'), sound('1', 'a', '', 'error'))).toMatchObject({ ok: false, kind: 'error' });
    expect(availability(button('b', '1'), sound('1', 'a')).ok).toBe(true);
  });

  it('lists ready sounds without a button, in library order', () => {
    const sounds = [sound('1', 'b', 'x'), sound('2', 'a', 'x'), sound('3', 'c', '', 'converting'), sound('4', 'd')];
    expect(unmappedReadySounds(sounds, [button('b1', '2')]).map((s) => s.id)).toEqual(['4', '1']);
    expect(countByStatus(sounds)).toEqual({ ready: 3, converting: 1, error: 0 });
  });

  it('moves ids and overlays a pending order on the server list', () => {
    expect(moveId(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    const server = [button('a', null), button('b', null), button('d', null)];
    // 'c' was deleted meanwhile and 'd' is new: unknown ids drop out, new buttons go last.
    expect(applyOrder(server, ['b', 'c', 'a']).map((b) => b.id)).toEqual(['b', 'a', 'd']);
    expect(applyOrder(server, null).map((b) => b.id)).toEqual(['a', 'b', 'd']);
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('accepts only the formats and sizes the server takes', () => {
    const files = [
      { name: 'ok.MP3', size: 1000 },
      { name: 'notes.txt', size: 10 },
      { name: 'empty.wav', size: 0 },
      { name: 'huge.flac', size: 60 * 1024 * 1024 },
      ...Array.from({ length: MAX_UPLOAD_FILES }, (_, i) => ({ name: `s${i}.ogg`, size: 5 })),
    ];
    const { accepted, rejected } = checkUploads(files);
    expect(accepted).toHaveLength(MAX_UPLOAD_FILES);
    expect(accepted[0]?.name).toBe('ok.MP3');
    expect(rejected.map((r) => r.why)).toEqual([
      'formato não aceito',
      'arquivo vazio',
      'maior que 50 MB',
      'passou de 20 arquivos',
    ]);
  });

  it('names a new folder exactly like the server will', () => {
    expect(cleanCategory('  memes/pt: top?  ')).toBe('memes pt top');
    expect(cleanCategory('..secret..')).toBe('secret');
    expect(cleanCategory('a'.repeat(60))).toHaveLength(40);
    expect(cleanCategory('///')).toBe('');
    // the server keeps only letters, digits, space and _ ( ) -
    expect(cleanCategory('Memes & Zoeira')).toBe('Memes Zoeira');
    expect(cleanCategory('sons.br')).toBe('sons br');
    expect(cleanCategory('Efeitos [PT]')).toBe('Efeitos PT');
    expect(cleanCategory('zoeira 😂')).toBe('zoeira');
    expect(cleanCategory('memes...')).toBe('memes');
    expect(cleanCategory('Ação (BR)_v2-final')).toBe('Ação (BR)_v2-final');
    expect(cleanCategory('Ação')).toBe('Ação'); // decomposed accents become one letter (NFC)
    expect(cleanCategory('con')).toBe('_con'); // reserved on Windows
    expect(cleanCategory('😂😂')).toBe('');
    // 40 code points, never half a character
    expect(Array.from(cleanCategory(`${'a'.repeat(39)}𝓐𝓐`))).toHaveLength(40);
  });

  it('keeps the last emoji typed, even multi code point ones', () => {
    expect(lastGrapheme('😂🔥')).toBe('🔥');
    expect(lastGrapheme('👍🏽')).toBe('👍🏽');
    expect(lastGrapheme('🏳️‍🌈')).toBe('🏳️‍🌈');
    expect(lastGrapheme('  ')).toBe('');
  });

  it('drops an emoji longer than the 8 code points the server keeps', () => {
    expect(pickEmoji('😂🔥')).toBe('🔥');
    expect(pickEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦'); // 7 code points
    expect(pickEmoji('😂👩🏻‍❤️‍💋‍👨🏼')).toBeNull(); // 10 code points
    expect(pickEmoji('')).toBe('');
  });

  it('says what "one at a time" does', () => {
    expect(OVERLAP_HINT.single).toBe('Um som novo interrompe os outros.');
  });

  it('formats durations, sizes and slider values', () => {
    expect(durationText(2400)).toBe('2,4 s');
    expect(durationText(125_000)).toBe('2:05');
    expect(durationText(undefined)).toBe('');
    expect(fileSize(20_000)).toBe('20 KB');
    expect(fileSize(3.2 * 1024 * 1024)).toBe('3,2 MB');
    expect(sliderValue(0.4)).toBe(0.4);
    expect(sliderValue([0.7])).toBe(0.7);
  });

  it('gives the same folder the same non-gray color', () => {
    expect(colorForCategory('memes-pt')).toBe(colorForCategory('memes-pt'));
    for (const name of ['', 'memes-pt', 'memes-en', 'x']) {
      const color = colorForCategory(name);
      expect(SFX_COLORS).toContain(color);
      expect(color).not.toBe('slate');
    }
  });
});
