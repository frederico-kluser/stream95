import type { SfxButton } from '@stream95/shared';
import { useCallback, useMemo, useState } from 'react';
import { useDeck } from '@/lib/store';
import { Board, BoardEmpty, BoardSkeleton, ConnectionNotice } from './sounds/board';
import { ButtonEditor, type EditorTarget } from './sounds/button-editor';
import { EditPanel } from './sounds/edit-list';
import { LibrarySection, SoundListSection } from './sounds/library';
import { PlayFeedbackProvider } from './sounds/play-feedback';
import { Toolbar } from './sounds/toolbar';
import { useButtonOrder } from './sounds/use-button-order';

type EditorState = { open: boolean; target: EditorTarget; session: number };

/**
 * Soundboard. Every play happens on the PC (the OBS audio source), never on this device: a tap
 * sends the request and the tile shows when the PC confirmed it, with the tap-to-sound latency.
 */
export function SoundsScreen() {
  const { connection, settings, sfx, sfxLatency } = useDeck();
  const offline = connection !== 'online';
  // Nothing received from the PC yet: show placeholders instead of an empty board.
  const loading = offline && sfx.dir === '';
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ open: false, target: { mode: 'new' }, session: 0 });
  const { ordered, move } = useButtonOrder(sfx.buttons);
  const soundsById = useMemo(() => new Map(sfx.sounds.map((s) => [s.id, s])), [sfx.sounds]);

  const openEditor = useCallback(
    (target: EditorTarget) => setEditor((prev) => ({ open: true, target, session: prev.session + 1 })),
    [],
  );
  const onNew = useCallback(() => openEditor({ mode: 'new' }), [openEditor]);
  const onEdit = useCallback((button: SfxButton) => openEditor({ mode: 'edit', button }), [openEditor]);
  const setEditorOpen = useCallback((open: boolean) => setEditor((prev) => ({ ...prev, open })), []);
  const toggleEditing = useCallback(() => setEditing((on) => !on), []);

  return (
    <PlayFeedbackProvider>
      {/* Inline-size containment: long names must not widen the tab panel past the phone screen. */}
      <div className="flex flex-col gap-4 [contain:inline-size]">
        {offline && <ConnectionNotice connection={connection} />}
        <Toolbar
          offline={offline}
          volume={settings.sfx.volume}
          overlap={settings.sfx.overlap}
          editing={editing}
          onToggleEdit={toggleEditing}
        />
        {loading ? (
          <BoardSkeleton />
        ) : editing ? (
          <EditPanel
            buttons={ordered}
            sounds={sfx.sounds}
            soundsById={soundsById}
            offline={offline}
            onNew={onNew}
            onEdit={onEdit}
            onMove={move}
          />
        ) : ordered.length > 0 ? (
          <Board buttons={ordered} soundsById={soundsById} offline={offline} latency={sfxLatency} />
        ) : (
          <BoardEmpty sounds={sfx.sounds} buttons={sfx.buttons} offline={offline} onNew={onNew} />
        )}
        <LibrarySection dir={sfx.dir} sounds={sfx.sounds} offline={offline} normalize={settings.sfx.normalize} />
        <SoundListSection sounds={sfx.sounds} buttons={sfx.buttons} offline={offline} />
        <ButtonEditor
          open={editor.open}
          onOpenChange={setEditorOpen}
          target={editor.target}
          session={editor.session}
          sounds={sfx.sounds}
          offline={offline}
        />
      </div>
    </PlayFeedbackProvider>
  );
}
