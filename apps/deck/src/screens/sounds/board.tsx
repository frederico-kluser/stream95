import type { SfxButton, SfxSound } from '@stream95/shared';
import { AudioLines, LayoutGrid, Plus, WifiOff } from 'lucide-react';
import { memo } from 'react';
import { CopyButton } from '@/components/copy-button';
import { EmptyState } from '@/components/section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { Connection } from '@/lib/store';
import { CreateMissingButtons } from './create-missing';
import { SoundTile } from './sound-tile';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

const PACK_COMMAND = 'npm run sfx:pack';

/** The soundboard: one big tile per button, in the saved order. */
export const Board = memo(function Board({
  buttons,
  soundsById,
  offline,
  latency,
}: {
  buttons: readonly SfxButton[];
  soundsById: ReadonlyMap<string, SfxSound>;
  offline: boolean;
  latency: Readonly<Record<string, number>>;
}) {
  return (
    <ul aria-label="Mesa de som" className={GRID}>
      {buttons.map((button) => (
        <li key={button.id} className="min-w-0">
          <SoundTile
            button={button}
            sound={button.soundId ? soundsById.get(button.soundId) : undefined}
            offline={offline}
            latencyMs={button.soundId ? latency[button.soundId] : undefined}
          />
        </li>
      ))}
    </ul>
  );
});

const SKELETON = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Placeholder tiles until the PC sends the library (no "empty" message flashing on load). */
export function BoardSkeleton() {
  return (
    <div aria-busy="true" className={GRID}>
      <span className="sr-only">Carregando a mesa de som…</span>
      {SKELETON.map((key) => (
        <div
          key={key}
          aria-hidden
          className="min-h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none sm:min-h-28"
        />
      ))}
    </div>
  );
}

/** How to get sounds into the library, including the starter pack command. */
function StarterPack() {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p>Para baixar um pacote de memes em português e inglês, rode no terminal do PC:</p>
      <div className="flex w-full max-w-xs items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-3 text-left font-mono text-xs text-foreground">
          {PACK_COMMAND}
        </code>
        <CopyButton
          value={PACK_COMMAND}
          label="Copiar o comando"
          copiedLabel="Comando copiado"
          copiedText="Copiado"
          className="h-12! px-4!"
        >
          Copiar
        </CopyButton>
      </div>
    </div>
  );
}

/** Empty board: no sounds yet (how to add them) or sounds without buttons (how to map them). */
export function BoardEmpty({
  sounds,
  buttons,
  offline,
  onNew,
}: {
  sounds: readonly SfxSound[];
  buttons: readonly SfxButton[];
  offline: boolean;
  onNew: () => void;
}) {
  if (sounds.length === 0) {
    return (
      <EmptyState icon={<AudioLines className="size-8" aria-hidden />} title="Nenhum som ainda">
        <div className="flex flex-col items-center gap-4">
          <p>
            Coloque arquivos de áudio na pasta da biblioteca, no PC, ou envie daqui em Biblioteca no PC. Cada som vira
            um botão.
          </p>
          <StarterPack />
        </div>
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={<LayoutGrid className="size-8" aria-hidden />} title="Nenhum botão ainda">
      <div className="flex flex-col items-stretch gap-3">
        <p>Crie um botão para cada som pronto de uma vez, ou monte um por um.</p>
        <CreateMissingButtons sounds={sounds} buttons={buttons} offline={offline} />
        <Button type="button" variant="outline" className="h-12 rounded-xl" disabled={offline} onClick={onNew}>
          <Plus aria-hidden />
          Novo botão
        </Button>
      </div>
    </EmptyState>
  );
}

/** Why everything is disabled while the deck has no live connection to the PC. */
export function ConnectionNotice({ connection }: { connection: Connection }) {
  return (
    <Alert>
      <WifiOff aria-hidden />
      <AlertTitle>{connection === 'connecting' ? 'Conectando ao PC…' : 'Sem conexão com o PC'}</AlertTitle>
      <AlertDescription>Os botões voltam a funcionar quando o painel reconectar ao stream95.</AlertDescription>
    </Alert>
  );
}
