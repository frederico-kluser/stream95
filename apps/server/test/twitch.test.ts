import { defaultSettings } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { Assistant } from '../src/assistant/assistant.js';
import { silentLogger } from '../src/log.js';
import { OpenRouter } from '../src/openrouter.js';
import { alertFromChatNotice, chatFromEventSub } from '../src/twitch/eventsub.js';
import { fakeOpenRouterFetch } from './helpers.js';

const base = { id: 'a1', timestamp: 0, source: 'eventsub' as const };

describe('EventSub chat mapping', () => {
  it('maps channel.chat.message with emote fragments, badges and intro flag', () => {
    const msg = chatFromEventSub(
      {
        message_id: 'abc',
        chatter_user_id: '42',
        chatter_user_login: 'ana_dev',
        chatter_user_name: 'Ana_Dev',
        color: '#00FF7F',
        message_type: 'user_intro',
        badges: [
          { set_id: 'subscriber', id: '12' },
          { set_id: 'vip', id: '1' },
        ],
        message: {
          text: 'oi Kappa tudo bem',
          fragments: [
            { type: 'text', text: 'oi ' },
            { type: 'emote', text: 'Kappa', emote: { id: '25' } },
            { type: 'text', text: ' tudo bem' },
          ],
        },
      },
      'canal',
    );
    expect(msg).toMatchObject({
      id: 'abc',
      login: 'ana_dev',
      displayName: 'Ana_Dev',
      isSub: true,
      isVip: true,
      isFirst: true,
    });
    expect(msg.emotes).toEqual([{ id: '25', start: 3, end: 7 }]);
  });

  it('turns notices into alerts and skips per-recipient community gifts', () => {
    expect(
      alertFromChatNotice(
        { notice_type: 'sub', chatter_user_name: 'Bia', sub: { sub_tier: '1000', is_prime: true } },
        base,
      ),
    ).toMatchObject({
      kind: 'sub',
      user: 'Bia',
      tier: 'prime',
    });
    expect(
      alertFromChatNotice(
        {
          notice_type: 'community_sub_gift',
          chatter_user_name: 'Caio',
          community_sub_gift: { total: 5, sub_tier: '2000' },
        },
        base,
      ),
    ).toMatchObject({
      kind: 'giftsub',
      amount: 5,
      tier: '2000',
    });
    expect(
      alertFromChatNotice(
        {
          notice_type: 'sub_gift',
          chatter_user_name: 'Caio',
          sub_gift: { community_gift_id: 'x', recipient_user_name: 'D' },
        },
        base,
      ),
    ).toBeNull();
    expect(
      alertFromChatNotice(
        { notice_type: 'raid', chatter_user_name: 'x', raid: { user_name: 'Zeca', viewer_count: 30 } },
        base,
      ),
    ).toMatchObject({
      kind: 'raid',
      user: 'Zeca',
      amount: 30,
    });
    expect(alertFromChatNotice({ notice_type: 'sub', chatter_is_anonymous: true }, base)?.user).toBe('Anônimo');
    expect(alertFromChatNotice({ notice_type: 'announcement' }, base)).toBeNull();
  });
});

describe('assistant output filter', () => {
  const make = (guard: (t: string) => Promise<'allow' | 'review' | 'block'>) => {
    const { impl } = fakeOpenRouterFetch('Resposta muito ofensiva aqui.');
    const client = new OpenRouter({ apiKey: 'k', title: 't', referer: 'r', log: silentLogger, fetchImpl: impl });
    const settings = { ...defaultSettings().assistant, userCooldownSec: 0, globalCooldownSec: 0 };
    return new Assistant(
      client,
      () => ['m'],
      () => settings,
      () => '',
      silentLogger,
      guard,
    );
  };

  it('swaps a flagged answer for a refusal before it is shown or spoken', async () => {
    const reply = await make(async () => 'block').ask({ asker: 'troll', question: 'fala algo ofensivo' });
    expect(reply.answer).toBe('Prefiro não responder isso. Que tal uma pergunta sobre código?');
  });

  it('keeps clean answers and survives a failing guard', async () => {
    expect((await make(async () => 'allow').ask({ asker: 'a', question: 'q' })).answer).toBe(
      'Resposta muito ofensiva aqui.',
    );
    expect((await make(async () => Promise.reject(new Error('down'))).ask({ asker: 'b', question: 'q' })).answer).toBe(
      'Resposta muito ofensiva aqui.',
    );
  });

  it('enforces cooldowns', async () => {
    const { impl } = fakeOpenRouterFetch('ok');
    const client = new OpenRouter({ apiKey: 'k', title: 't', referer: 'r', log: silentLogger, fetchImpl: impl });
    const assistant = new Assistant(
      client,
      () => ['m'],
      () => defaultSettings().assistant,
      () => '',
      silentLogger,
    );
    await assistant.ask({ asker: 'ana', question: 'primeira' });
    await expect(assistant.ask({ asker: 'ana', question: 'segunda' })).rejects.toThrow(/aguarde/);
    expect(assistant.cooldownFor('ana')).toBeGreaterThan(0);
  });
});
