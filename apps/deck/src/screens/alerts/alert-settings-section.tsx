import { Settings2 } from 'lucide-react';
import { Section } from '@/components/section';
import { useDeck } from '@/lib/store';
import { SettingSlider, SettingSwitch } from '@/screens/assistant/kit/settings';

/** How every alert behaves, real or simulated. */
export function AlertSettingsSection() {
  const { settings, status } = useDeck();
  const a = settings.alerts;
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Settings2 className="size-4 text-brand" aria-hidden />
          Ajustes dos alertas
        </span>
      }
      description="Valem para os alertas reais e para os simulados."
    >
      <div className="flex flex-col divide-y divide-border">
        <SettingSwitch label="Tocar som nos alertas" checked={a.sound} toPatch={(sound) => ({ alerts: { sound } })} />
        <SettingSwitch
          label="Ler o alerta em voz alta"
          hint={
            status?.openrouter === 'unconfigured'
              ? 'Usa a voz do assistente. Precisa da OPENROUTER_API_KEY no PC.'
              : 'Usa a voz do assistente.'
          }
          checked={a.speak}
          toPatch={(speak) => ({ alerts: { speak } })}
        />
        <SettingSlider
          label="Tempo na tela"
          value={a.durationMs / 1000}
          min={2}
          max={30}
          step={1}
          format={{ style: 'unit', unit: 'second', unitDisplay: 'long' }}
          display={(s) => `${s} s`}
          toPatch={(s) => ({ alerts: { durationMs: Math.round(s * 1000) } })}
        />
      </div>
    </Section>
  );
}
