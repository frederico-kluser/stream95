import type { SfxSound } from '@stream95/shared';
import { Check, CircleAlert, Upload } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { useNotify } from '@/components/notify';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  checkUploads,
  cleanCategory,
  fileSize,
  MAX_UPLOAD_FILES,
  NEW_CATEGORY,
  plural,
  type Rejected,
  ROOT_CATEGORY,
  UPLOAD_ACCEPT,
} from './lib';
import { FILL_PILL, Spinner } from './parts';
import { type ActionState, useAction } from './use-action';

type Picked = { files: { file: File; key: string }[]; rejected: (Rejected & { key: string })[] };

const EMPTY: Picked = { files: [], rejected: [] };

let pickSeq = 0;

function pickFiles(list: FileList | null): Picked {
  const { accepted, rejected } = checkUploads(Array.from(list ?? []));
  pickSeq += 1;
  return {
    files: accepted.map((file, i) => ({ file, key: `${pickSeq}:${i}:${file.name}` })),
    rejected: rejected.map((r, i) => ({ ...r, key: `${pickSeq}:${i}:${r.name}` })),
  };
}

const SEND: Record<ActionState, string> = { idle: 'Enviar', busy: 'Enviando…', done: 'Enviado', error: 'Falhou' };

function sendIcon(state: ActionState) {
  if (state === 'busy') return <Spinner className="size-4" />;
  if (state === 'done') return <Check className="size-4" />;
  if (state === 'error') return <CircleAlert className="size-4" />;
  return <Upload className="size-4" />;
}

/** Sends audio files to the library folder on the PC (optionally into a subfolder). */
export function UploadSounds({ categories, offline }: { categories: readonly string[]; offline: boolean }) {
  const notify = useNotify();
  const action = useAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderLabelId = useId();
  const newFolderId = useId();
  const [picked, setPicked] = useState<Picked>(EMPTY);
  const [category, setCategory] = useState<string>(ROOT_CATEGORY);
  const [newName, setNewName] = useState('');
  const [dragging, setDragging] = useState(false);

  const items = [
    { value: ROOT_CATEGORY, label: 'Pasta principal' },
    ...categories.map((c) => ({ value: c, label: c })),
    { value: NEW_CATEGORY, label: 'Nova pasta…' },
  ];
  // A new folder goes with the name the PC will give it; an existing one with its real name on disk.
  const folder = category === NEW_CATEGORY ? cleanCategory(newName) : category === ROOT_CATEGORY ? '' : category;
  const typed = newName.normalize('NFC').trim();
  const count = picked.files.length;
  const reason = offline
    ? 'Sem conexão com o PC.'
    : count === 0
      ? 'Escolha um ou mais arquivos de áudio.'
      : category === NEW_CATEGORY && !folder
        ? 'Dê um nome para a nova pasta.'
        : null;

  const reset = () => {
    setPicked(EMPTY);
    if (inputRef.current) inputRef.current.value = '';
  };

  const send = async () => {
    if (reason) return;
    const form = new FormData();
    // The folder goes first: the server reads the parts in order.
    if (folder) form.append('category', folder);
    for (const { file } of picked.files) form.append('file', file, file.name);
    const result = await action.run(() => api<{ sounds: SfxSound[] }>('POST', '/api/sfx/upload', form), {
      settleMs: 2200,
    });
    if (!result.ok) return;
    const n = result.value.sounds?.length ?? count;
    notify({
      tone: 'success',
      title: plural(n, 'som enviado', 'sons enviados'),
      description: 'O PC converte para WAV 48 kHz agora. Os botões ficam prontos em instantes.',
    });
    reset();
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) setPicked(pickFiles(e.dataTransfer.files));
  };

  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border px-4 py-5 text-center hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/60',
          dragging && 'border-primary bg-accent',
        )}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Escolher arquivos de áudio</span>
        <span className="text-xs text-muted-foreground">
          MP3, WAV, OGG, M4A, FLAC e outros. Até 50 MB cada, {MAX_UPLOAD_FILES} por vez.
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          disabled={offline}
          onChange={(e) => setPicked(pickFiles(e.target.files))}
          className="sr-only"
        />
      </label>

      {(count > 0 || picked.rejected.length > 0) && (
        <div className="flex flex-col gap-2 text-sm">
          {count > 0 && (
            <ul aria-label="Arquivos escolhidos" className="flex flex-col gap-1">
              {picked.files.map(({ file, key }) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fileSize(file.size)}</span>
                </li>
              ))}
            </ul>
          )}
          {picked.rejected.length > 0 && (
            <ul aria-label="Arquivos que não vão" className="flex flex-col gap-1 text-destructive">
              {picked.rejected.map(({ name, why, key }) => (
                <li key={key} className="flex items-start gap-1.5">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">
                    {name}: {why}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label id={folderLabelId}>Pasta de destino</Label>
        <Select items={items} value={category} onValueChange={(value) => value && setCategory(value)}>
          <SelectTrigger aria-labelledby={folderLabelId} disabled={offline} className="h-12! w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value} className="min-h-12">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {category === NEW_CATEGORY && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={newFolderId}>Nome da nova pasta</Label>
            <Input
              id={newFolderId}
              value={newName}
              maxLength={40}
              autoComplete="off"
              placeholder="ex.: memes-pt"
              onChange={(e) => setNewName(e.target.value)}
              className="h-12"
            />
            {typed && folder !== typed && (
              <p className="text-xs text-muted-foreground">
                {folder ? `A pasta vai se chamar “${folder}”.` : 'Use letras e números no nome da pasta.'}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <MultiStateButton
          state={action.state}
          icon={sendIcon(action.state)}
          onClick={() => void send()}
          disabled={reason !== null}
          widthMorph={false}
          feedback={action.state === 'error' ? 'shake' : action.state === 'done' ? 'pop' : 'none'}
          announce={
            action.state === 'done' ? 'Arquivos enviados' : action.state === 'error' ? 'Envio falhou' : undefined
          }
          className={cn(FILL_PILL, 'rounded-xl!')}
          pillClassName="min-h-12 rounded-xl px-4 text-sm font-semibold"
          surfaceClassName={cn('bg-primary text-primary-foreground hover:bg-primary/85', reason && 'opacity-50')}
        >
          {action.state === 'idle' && count > 0 ? `Enviar ${plural(count, 'arquivo', 'arquivos')}` : SEND[action.state]}
        </MultiStateButton>
        <p className="text-xs text-muted-foreground">{reason ?? 'Os arquivos vão para a pasta do PC.'}</p>
      </div>
    </div>
  );
}
