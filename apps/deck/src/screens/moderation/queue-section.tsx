import type { ModeratedMessage } from '@stream95/shared';
import { Ban, Check, Inbox, LoaderCircle, Timer, UserCheck, X } from 'lucide-react';
import { AnimatePresence, motion, PresenceContext } from 'motion/react';
import {
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { Sheet, SheetBackdrop, SheetClose, SheetHandle, SheetPanel } from '@/components/motion-ui/sheet';
import { SwipeAction, SwipeActions, SwipeActionsList } from '@/components/motion-ui/swipe-actions';
import { type Notice, useNotify } from '@/components/notify';
import { EmptyState, Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ago, pct } from '@/lib/format';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useCoarsePointer, useItemMotion, useNow } from './hooks';
import { inMinutes, type ModerationMode, RISKY_BLOCK } from './labels';
import { AuthorBadges, JevBars, OfflineReason, SignalTags, VerdictSummary } from './message-bits';
import { approveMessage, banAuthor, errorNotice, scheduleReject, useHiddenQueueItems, useStoredFlag } from './stores';

type ItemAction = 'approve' | 'trust' | 'ban';

const QUEUE_HELP: Record<ModerationMode, string> = {
  auto: 'Mensagens que as regras ou a IA seguraram para você decidir.',
  manual: 'Modo manual: toda mensagem nova espera aqui.',
  off: 'Só regras: mensagens com termos sensíveis esperam aqui.',
};

const EMPTY_HELP: Record<ModerationMode, string> = {
  auto: 'Quando a moderação segurar uma mensagem, ela aparece aqui para você aprovar ou rejeitar.',
  manual: 'No modo manual, toda mensagem nova aparece aqui antes de ir para a live.',
  off: 'As regras locais seguram aqui o que parecer arriscado.',
};

// Phones: the two main choices are big (72 px); from `sm` up every action is 48 px.
const ACTION = 'w-full whitespace-normal sm:w-auto sm:px-4';
const MAIN_HEIGHT = 'h-18 text-base leading-tight sm:h-12 sm:text-sm';
const SIDE_HEIGHT = 'h-auto min-h-12 py-2 leading-tight sm:h-12 sm:py-0';

/** Two-line label for hold buttons: the action and how to confirm it. */
function HoldLabel({ action, hint }: { action: string; hint: string }) {
  return (
    <span className="flex flex-col items-start leading-tight">
      <span>{action}</span>
      <span className="text-[11px] font-normal opacity-80">{hint}</span>
    </span>
  );
}

function Spinner() {
  return <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />;
}

type CardProps = {
  m: ModeratedMessage;
  now: number;
  expireMin: number;
  attentionAt: number;
  online: boolean;
  onReject: (m: ModeratedMessage) => void;
};

type CardActions = {
  /** The decision being sent, until the server's queue update removes the card. */
  pending: ItemAction | null;
  /** Bumped after a failure: fresh hold buttons (a confirmed one stays locked). */
  attempt: number;
  run: (action: ItemAction) => void;
};

/**
 * Approve, trust and ban for one held message. The state lives in the row, not in the card, so a
 * swipe row that is remounted (see useSwipeGuard) still shows a decision that is being sent.
 */
function useCardActions(m: ModeratedMessage, online: boolean): CardActions {
  const notify = useNotify();
  const [pending, setPending] = useState<ItemAction | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);

  const run = useCallback(
    (action: ItemAction) => {
      if (lock.current || !online) return;
      lock.current = true;
      setPending(action);
      const request = action === 'ban' ? banAuthor(m, notify) : approveMessage(m, action === 'trust', notify);
      // on success it stays pending: the next queue update from the server removes this card
      request.catch((err: unknown) => {
        notify(errorNotice(err));
        lock.current = false;
        setPending(null);
        setAttempt((n) => n + 1);
      });
    },
    [m, online, notify],
  );

  return useMemo(() => ({ pending, attempt, run }), [pending, attempt, run]);
}

/** One held message: who, what, why it waits, Jev's chances and the four decisions. */
const QueueCard = memo(function QueueCard({
  m,
  now,
  expireMin,
  attentionAt,
  online,
  onReject,
  actions,
}: CardProps & { actions: CardActions }) {
  const { pending, attempt, run } = actions;
  const uid = useId();
  const block = m.verdict.probabilities?.block ?? 0;
  const risky = block >= RISKY_BLOCK;
  const left = m.decidedAt + expireMin * 60_000 - now;
  const locked = !online || pending !== null;

  const approveControl = (kind: 'approve' | 'trust') => {
    const main = kind === 'approve';
    const label = main ? 'Aprovar' : 'Aprovar e confiar';
    const icon = main ? <Check className="size-4" aria-hidden /> : <UserCheck className="size-4" aria-hidden />;
    if (pending === kind) {
      return (
        <Button
          disabled
          variant={main ? 'default' : 'outline'}
          className={cn(ACTION, main ? MAIN_HEIGHT : SIDE_HEIGHT)}
        >
          <Spinner />
          Aprovando…
        </Button>
      );
    }
    if (risky && !locked) {
      return (
        <HoldToConfirmButton
          key={`${kind}-${attempt}`}
          holdSeconds={1}
          onConfirm={() => run(kind)}
          aria-describedby={`${uid}-risk`}
          className={cn(
            'w-full! rounded-lg! sm:w-auto! sm:px-4',
            main
              ? 'h-18! bg-primary! text-base! text-primary-foreground! sm:h-12! sm:text-sm!'
              : 'h-auto! min-h-12 border border-border bg-transparent! py-2 text-foreground! sm:h-12! sm:py-0',
          )}
        >
          {icon}
          <HoldLabel action={label} hint="segure 1 s" />
        </HoldToConfirmButton>
      );
    }
    return (
      <Button
        variant={main ? 'default' : 'outline'}
        disabled={locked}
        onClick={() => run(kind)}
        className={cn(ACTION, main ? MAIN_HEIGHT : SIDE_HEIGHT)}
      >
        {icon}
        {label}
      </Button>
    );
  };

  const banControl = () => {
    if (pending === 'ban') {
      return (
        <Button disabled variant="secondary" className={cn(ACTION, SIDE_HEIGHT, 'sm:ml-auto')}>
          <Spinner />
          Banindo…
        </Button>
      );
    }
    if (locked) {
      return (
        <Button disabled variant="secondary" className={cn(ACTION, SIDE_HEIGHT, 'sm:ml-auto')}>
          <Ban aria-hidden />
          Banir na sessão
        </Button>
      );
    }
    return (
      <HoldToConfirmButton
        key={`ban-${attempt}`}
        holdSeconds={1.5}
        onConfirm={() => run('ban')}
        aria-describedby={`${uid}-ban`}
        className="w-full! rounded-lg! sm:ml-auto sm:h-12! sm:w-auto! sm:px-4"
      >
        <Ban className="size-4 text-destructive" aria-hidden />
        <HoldLabel action="Banir na sessão" hint="segure 1,5 s" />
      </HoldToConfirmButton>
    );
  };

  return (
    <article aria-labelledby={`${uid}-who`} className="flex flex-col gap-3 px-0.5 py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span id={`${uid}-who`} className="font-semibold wrap-anywhere">
          {m.displayName}
        </span>
        <AuthorBadges m={m} />
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {ago(m.timestamp, now)}
        </span>
      </div>
      <p className="text-base leading-relaxed wrap-anywhere">{m.text}</p>
      <VerdictSummary verdict={m.verdict} lead="Quem segurou:" />
      {m.verdict.probabilities && <JevBars p={m.verdict.probabilities} />}
      <div className="flex flex-wrap items-center gap-2">
        <SignalTags signals={m.verdict.signals} at={attentionAt} />
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            left < 2 * 60_000 ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          <Timer className="size-3.5" aria-hidden />
          Expira {inMinutes(left)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {approveControl('approve')}
        <Button variant="secondary" disabled={locked} onClick={() => onReject(m)} className={cn(ACTION, MAIN_HEIGHT)}>
          <X aria-hidden />
          Rejeitar
        </Button>
        {approveControl('trust')}
        {banControl()}
      </div>
      <span id={`${uid}-risk`} className="sr-only">
        O Jev deu {pct(block)} de chance de barrar. Segure por 1 segundo para aprovar.
      </span>
      <span id={`${uid}-ban`} className="sr-only">
        Segure por 1,5 segundo. Rejeita a mensagem e esconde as próximas de {m.displayName} até o stream95 reiniciar.
      </span>
    </article>
  );
});

function QueueListItem(props: CardProps) {
  const motionProps = useItemMotion();
  const actions = useCardActions(props.m, props.online);
  return (
    <motion.li layout="position" {...motionProps}>
      <QueueCard {...props} actions={actions} />
    </motion.li>
  );
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-12 items-center justify-center [&_svg]:size-5">{children}</span>;
}

/**
 * The vendor SwipeActions follows a swipe with document listeners until the next pointerup and
 * never hears pointercancel. After a scroll that starts on a row (the browser takes the pan and
 * cancels the pointer), the row would keep following every later touch, and one far enough to the
 * left would commit Rejeitar. This watches the gesture from outside the vendor code: a cancelled
 * swipe remounts the row (its listeners go away and it snaps back), and a full swipe only commits
 * on the pointerup of the pointer that started it on this row.
 */
function useSwipeGuard(contentRef: RefObject<HTMLElement | null>) {
  const [generation, setGeneration] = useState(0);
  /** The pointer that started a swipe on this row, until its pointerup or pointercancel. */
  const swipePointer = useRef<number | null>(null);
  /** While a pointerup is dispatched: whether it ends this row's own swipe. */
  const pointerUp = useRef<'own' | 'foreign' | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      pointerUp.current = null;
      const row = contentRef.current?.closest('li');
      const target = e.target instanceof Element ? e.target : null;
      // the vendor's rule: a press on a button never starts a swipe
      if (row && target && row.contains(target) && !target.closest('button')) swipePointer.current = e.pointerId;
    };
    const onUp = (e: PointerEvent) => {
      // the vendor ends a swipe on any pointerup; only the pointer that started it may commit it
      pointerUp.current = e.pointerId === swipePointer.current ? 'own' : 'foreign';
      swipePointer.current = null;
    };
    const clearUp = () => {
      pointerUp.current = null;
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== swipePointer.current) return;
      swipePointer.current = null;
      setGeneration((g) => g + 1);
    };
    // Capture on window runs before the vendor's document listeners, the bubble one after them; a
    // click (tap or keyboard on a revealed action) always starts clean.
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointerup', clearUp);
    window.addEventListener('click', clearUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointerup', clearUp);
      window.removeEventListener('click', clearUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
  }, [contentRef]);

  /** Runs a swipe action, unless a stale gesture commits it: then the row only snaps back. */
  const guard = useCallback((action: () => void) => {
    if (pointerUp.current === 'foreign') {
      setGeneration((g) => g + 1);
      return;
    }
    action();
  }, []);

  return { generation, guard };
}

/**
 * Touch row: the card slides left to reveal Rejeitar (a full swipe commits it, with undo) and
 * Banir (opens a hold-to-confirm sheet). Approving is never a swipe. The row height follows the
 * card, since SwipeActions needs a fixed height.
 */
function SwipeQueueRow({
  m,
  now,
  expireMin,
  attentionAt,
  online,
  onReject,
  index,
  isLast,
  onBan,
}: CardProps & { index: number; isLast: boolean; onBan: (m: ModeratedMessage) => void }) {
  const actions = useCardActions(m, online);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(320);
  const { generation, guard } = useSwipeGuard(contentRef);
  const presence = useContext(PresenceContext);
  // a remounted row shows up where it was, without the entrance animation
  const inPlace = useMemo(() => (presence ? { ...presence, initial: false as const } : null), [presence]);

  // A callback ref, so a remounted row measures its new card node too.
  const measure = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (!node) return;
    setHeight(node.offsetHeight);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => setHeight(node.offsetHeight));
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      if (contentRef.current === node) contentRef.current = null;
    };
  }, []);

  const reject = useCallback(() => guard(() => onReject(m)), [guard, onReject, m]);
  const ban = useCallback(() => onBan(m), [onBan, m]);

  return (
    <PresenceContext.Provider value={generation > 0 ? inPlace : presence}>
      <SwipeActions
        key={generation}
        id={m.id}
        rowHeight={height}
        index={index}
        isLast={isLast}
        right={
          <>
            <SwipeAction
              side="right"
              icon={
                <ActionIcon>
                  <Ban aria-hidden />
                </ActionIcon>
              }
              label="Banir"
              ariaLabel={`Banir ${m.displayName} nesta sessão`}
              fillClassName="bg-destructive text-background"
              onActivate={ban}
            />
            <SwipeAction
              side="right"
              primary
              icon={
                <ActionIcon>
                  <X aria-hidden />
                </ActionIcon>
              }
              label="Rejeitar"
              ariaLabel={`Rejeitar a mensagem de ${m.displayName}`}
              fillClassName="bg-foreground text-background"
              onActivate={reject}
            />
          </>
        }
      >
        <div ref={measure} className="w-full self-start">
          <QueueCard
            m={m}
            now={now}
            expireMin={expireMin}
            attentionAt={attentionAt}
            online={online}
            onReject={onReject}
            actions={actions}
          />
        </div>
      </SwipeActions>
    </PresenceContext.Provider>
  );
}

/** Ban confirmation opened from a swipe (a tap alone never bans). */
function BanSheet({ target, onClose }: { target: ModeratedMessage | null; onClose: () => void }) {
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Notice | null>(null);
  const titleId = useId();
  const last = useRef<ModeratedMessage | null>(null);
  if (target) last.current = target;
  const m = target ?? last.current; // keeps the text during the closing animation
  const targetId = target?.id ?? null;
  /** Message the sheet is open for right now (null once closed or unmounted). */
  const openFor = useRef<string | null>(null);

  // a new message, or a closed sheet, starts without the last failure
  useEffect(() => {
    openFor.current = targetId;
    setError(null);
    return () => {
      openFor.current = null;
    };
  }, [targetId]);

  const confirm = async () => {
    if (!target || pending) return;
    setPending(true);
    setError(null);
    try {
      await banAuthor(target, notify);
      onClose();
    } catch (err) {
      // inline while the sheet is open (a toast would sit behind its scrim); a toast once it closed
      if (openFor.current === target.id) setError(errorNotice(err));
      else notify(errorNotice(err));
      setAttempt((n) => n + 1);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetBackdrop label="Fechar" />
      <SheetPanel labelledBy={titleId}>
        <SheetHandle />
        {m && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold text-balance">
                Banir {m.displayName} nesta sessão?
              </h2>
              <SheetClose label="Cancelar" className="size-12!" />
            </div>
            <p className="text-sm text-muted-foreground">
              A mensagem é rejeitada e as próximas dessa pessoa ficam fora da live até o stream95 reiniciar.
            </p>
            <blockquote className="rounded-lg bg-muted px-3 py-2 text-sm wrap-anywhere">{m.text}</blockquote>
            {error && (
              <div role="alert" className="text-sm">
                <p className="font-medium text-destructive">{error.title}</p>
                {error.description && <p className="text-muted-foreground">{error.description}</p>}
              </div>
            )}
            {pending ? (
              <Button disabled variant="secondary" className="h-14 w-full">
                <Spinner />
                Banindo…
              </Button>
            ) : (
              <HoldToConfirmButton
                key={attempt}
                holdSeconds={1.5}
                onConfirm={() => void confirm()}
                className="h-14! w-full! rounded-lg!"
              >
                <Ban className="size-4 text-destructive" aria-hidden />
                <HoldLabel action="Banir na sessão" hint="segure 1,5 s" />
              </HoldToConfirmButton>
            )}
          </div>
        )}
      </SheetPanel>
    </Sheet>
  );
}

const SWIPE_TIP_KEY = 'stream95.moderation.swipeTipSeen';

/** Held messages waiting for the streamer, oldest first (they expire first). */
export function QueueSection() {
  const { queue, settings, connection } = useDeck();
  const hidden = useHiddenQueueItems();
  const coarse = useCoarsePointer();
  const notify = useNotify();
  const now = useNow();
  const [banTarget, setBanTarget] = useState<ModeratedMessage | null>(null);
  const [tipSeen, setTipSeen] = useStoredFlag(SWIPE_TIP_KEY, false);
  const items = useMemo(() => queue.filter((m) => !hidden.has(m.id)), [queue, hidden]);
  const online = connection === 'online';
  const mod = settings.moderation;
  const swipe = coarse && online;

  const reject = useCallback(
    (m: ModeratedMessage) => {
      if (online) scheduleReject(m, notify);
    },
    [online, notify],
  );

  // the message left the queue meanwhile (expired or decided on another device): nothing to ban
  const banGone = banTarget !== null && !queue.some((q) => q.id === banTarget.id);
  useEffect(() => {
    if (banGone) setBanTarget(null);
  }, [banGone]);

  const cardProps = { now, expireMin: mod.queueExpireMin, attentionAt: mod.attentionAt, online, onReject: reject };

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          Fila de aprovação
          {items.length > 0 && (
            <Badge className="border-transparent bg-warning/15 text-warning tabular-nums">{items.length}</Badge>
          )}
        </span>
      }
      description={`${QUEUE_HELP[mod.mode]} Sem decisão em ${mod.queueExpireMin} min, a mensagem expira.`}
    >
      <OfflineReason connection={connection} />
      {items.length === 0 ? (
        <EmptyState icon={<Inbox className="size-6" aria-hidden />} title="Nenhuma mensagem esperando">
          {EMPTY_HELP[mod.mode]} Para ver como funciona, use Testar moderação, no fim da tela.
        </EmptyState>
      ) : swipe ? (
        <>
          {!tipSeen && (
            <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-1 text-sm text-muted-foreground">
              <p className="flex-1">Dica: deslize a mensagem para a esquerda para rejeitar ou banir.</p>
              <Button variant="ghost" className="h-12 shrink-0" onClick={() => setTipSeen(true)}>
                Entendi
              </Button>
            </div>
          )}
          <SwipeActionsList>
            {items.map((m, i) => (
              <SwipeQueueRow
                key={m.id}
                m={m}
                index={Math.min(i, 4)}
                isLast={i === items.length - 1}
                onBan={setBanTarget}
                {...cardProps}
              />
            ))}
          </SwipeActionsList>
        </>
      ) : (
        <ul className="relative divide-y divide-border">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((m) => (
              <QueueListItem key={m.id} m={m} {...cardProps} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <BanSheet target={banTarget} onClose={() => setBanTarget(null)} />
    </Section>
  );
}
