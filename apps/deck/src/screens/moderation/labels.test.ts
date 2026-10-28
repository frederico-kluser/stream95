import { describe, expect, it } from 'vitest';
import { verdictParts } from './labels';

describe('verdictParts', () => {
  it('never says the same thing twice', () => {
    expect(verdictParts({ by: 'trusted', category: 'ok', reason: 'confiável' })).toEqual(['confiável']);
    expect(
      verdictParts({ by: 'rules', category: 'links', reason: 'link fora da lista: free-followers-agora.xyz' }),
    ).toEqual(['regras', 'link fora da lista: free-followers-agora.xyz']);
    expect(verdictParts({ by: 'jev', category: 'harassment', reason: 'Jev: barrar 80% · assédio' })).toEqual([
      'Jev',
      'barrar 80% · assédio',
    ]);
    expect(verdictParts({ by: 'rules', category: 'ok', reason: 'regras ok' })).toEqual(['regras', 'ok']);
    expect(verdictParts({ by: 'rules', category: 'scam', reason: 'golpe/spam com link' })).toEqual([
      'regras',
      'golpe/spam com link',
    ]);
    expect(verdictParts({ by: 'rules', category: 'blocklist', reason: 'termo proibido: xyz' })).toEqual([
      'regras',
      'termo proibido: xyz',
    ]);
    // Jev's own label for the category ("sexual") covers the deck's ("conteúdo sexual")
    expect(verdictParts({ by: 'jev', category: 'sexual', reason: 'Jev: barrar 91% · sexual' })).toEqual([
      'Jev',
      'barrar 91% · sexual',
    ]);
    // the reason already says who decided ("sem IA"); "outro" says nothing
    expect(verdictParts({ by: 'fallback', category: 'other', reason: 'termo sensível sem IA: xyz' })).toEqual([
      'termo sensível sem IA: xyz',
    ]);
    expect(verdictParts({ by: 'trusted', category: 'ok', reason: 'VIP/inscrito confiável' })).toEqual([
      'VIP/inscrito confiável',
    ]);
    expect(
      verdictParts({ by: 'llm', category: 'harassment', reason: 'Jev: revisar 60% · assédio → IA: ofensa direta' }),
    ).toEqual(['Jev: revisar 60% · assédio → IA: ofensa direta']);
    // the same word in another number: "dados pessoais" is in "dado pessoal", "link" in "links"
    expect(
      verdictParts({ by: 'rules', category: 'personal_data', reason: 'possível dado pessoal (e-mail/telefone/CPF)' }),
    ).toEqual(['regras', 'possível dado pessoal (e-mail/telefone/CPF)']);
    expect(verdictParts({ by: 'jev', category: 'links', reason: 'Jevson mandou links' })).toEqual([
      'Jev',
      'Jevson mandou links',
    ]);
  });

  it('keeps who, category and reason when they differ', () => {
    expect(verdictParts({ by: 'rules', category: 'ok', reason: 'modo manual' })).toEqual(['regras', 'modo manual']);
    expect(verdictParts({ by: 'rules', category: 'caps', reason: 'muito CAPS LOCK' })).toEqual([
      'regras',
      'caixa alta',
      'muito CAPS LOCK',
    ]);
    expect(
      verdictParts({
        by: 'human',
        category: 'harassment',
        reason: 'aprovada manualmente (Jev: revisar 60% · assédio)',
      }),
    ).toEqual(['streamer', 'aprovada manualmente (Jev: revisar 60% · assédio)']);
    expect(verdictParts({ by: 'llm', category: 'ok', reason: '' })).toEqual(['IA']);
  });

  it('matches whole words only', () => {
    // "linkedin" is not the word "link", and "Jevson" is not "Jev"
    expect(verdictParts({ by: 'jev', category: 'links', reason: 'Jevson mandou um linkedin' })).toEqual([
      'Jev',
      'link',
      'Jevson mandou um linkedin',
    ]);
  });

  it('never takes the verb "ia" in an AI reason for the IA that decided', () => {
    expect(verdictParts({ by: 'llm', category: 'violence', reason: 'disse que ia bater em alguém' })).toEqual([
      'IA',
      'violência',
      'disse que ia bater em alguém',
    ]);
    expect(verdictParts({ by: 'llm', category: 'hate', reason: 'Ia ofender um grupo' })).toEqual([
      'IA',
      'ódio',
      'Ia ofender um grupo',
    ]);
  });
});
