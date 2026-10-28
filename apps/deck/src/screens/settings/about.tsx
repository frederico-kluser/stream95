import { DEFAULT_PORT } from '@stream95/shared';
import { BookOpen, CodeXml, MessageCircle } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Section } from '@/components/section';
import { isLocalHost } from '@/lib/auth';
import { COPY_SECONDARY, ExternalButton } from './shared';

const REPO = 'https://github.com/frederico-kluser/stream95';

/**
 * The server's address on the PC. The server also serves this panel, so the page's port is its
 * port (PORT in .env). Under Vite dev, or behind an HTTPS proxy, the port is not the server's:
 * fall back to the default one.
 */
export function pcOrigin(page: Pick<Location, 'protocol' | 'port'> = location, dev = import.meta.env.DEV): string {
  if (dev || page.protocol !== 'http:') return `http://localhost:${DEFAULT_PORT}`;
  return page.port ? `http://localhost:${page.port}` : 'http://localhost';
}

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-sm break-all text-muted-foreground">{url}</p>
      </div>
      <CopyButton
        value={url}
        label={`Copiar endereço: ${label}`}
        copiedLabel="Endereço copiado"
        copiedText="Copiado"
        className={`${COPY_SECONDARY} self-start sm:self-auto`}
      >
        Copiar
      </CopyButton>
    </li>
  );
}

/** Project links and the local addresses of the scenes and of this panel. */
export function AboutSection() {
  const pc = pcOrigin();
  const here = `${location.origin}${location.pathname}`;
  return (
    <Section title="Sobre" description="O stream95 é open source, com licença MIT. O servidor roda no seu PC.">
      <ul className="grid gap-3 sm:grid-cols-3">
        <li>
          <ExternalButton href={REPO} className="w-full justify-start">
            <CodeXml className="size-4" aria-hidden />
            Código no GitHub
          </ExternalButton>
        </li>
        <li>
          <ExternalButton href={`${REPO}/tree/main/docs`} className="w-full justify-start">
            <BookOpen className="size-4" aria-hidden />
            Documentação
          </ExternalButton>
        </li>
        <li>
          <ExternalButton href={`${REPO}/issues`} className="w-full justify-start">
            <MessageCircle className="size-4" aria-hidden />
            Relatar um problema
          </ExternalButton>
        </li>
      </ul>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Endereços no PC</h3>
        <ul className="flex flex-col gap-3">
          <UrlRow label="Cenas para o OBS" url={`${pc}/`} />
          <UrlRow label="Este painel" url={`${pc}/dock/`} />
          {!isLocalHost() && <UrlRow label="Este painel neste aparelho" url={here} />}
        </ul>
      </div>
    </Section>
  );
}
