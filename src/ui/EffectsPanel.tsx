import { useState } from 'react';
import { useEditor } from '../editor/store';
import { ALL_EFFECT_KINDS, EFFECT_LABELS } from '../editor/effects';
import type { Effect, EffectKind } from '../editor/types';

export function EffectsPanel() {
  const layer = useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedLayerId));
  const addEffect = useEditor((s) => s.addEffect);
  const updateEffect = useEditor((s) => s.updateEffect);
  const removeEffect = useEditor((s) => s.removeEffect);
  const [adding, setAdding] = useState<EffectKind>('brightnessContrast');
  if (!layer) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value as EffectKind)}
          className="flex-1 rounded bg-panel-2 px-1 py-1 text-zinc-200 outline-none"
        >
          {ALL_EFFECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {EFFECT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          onClick={() => addEffect(layer.id, adding)}
          className="rounded bg-accent px-2 py-1 text-white hover:opacity-90"
        >
          Add
        </button>
      </div>

      {layer.effects.length === 0 && (
        <div className="px-1 py-2 text-zinc-500">No effects on this layer.</div>
      )}

      {layer.effects.map((e) => (
        <EffectCard
          key={e.id}
          effect={e}
          onChange={(patch) => updateEffect(layer.id, e.id, patch)}
          onRemove={() => removeEffect(layer.id, e.id)}
        />
      ))}
    </div>
  );
}

function EffectCard({
  effect,
  onChange,
  onRemove,
}: {
  effect: Effect;
  onChange: (patch: Partial<Effect>) => void;
  onRemove: () => void;
}) {
  const setParam = <K extends string>(key: K, value: any) =>
    onChange({ params: { [key]: value } as any } as Partial<Effect>);

  return (
    <div className="rounded border border-black/30 bg-panel-2/60 p-2">
      <div className="mb-1 flex items-center gap-1">
        <input
          type="checkbox"
          checked={effect.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <span className="flex-1 text-zinc-200">{EFFECT_LABELS[effect.kind]}</span>
        <button onClick={onRemove} className="px-1 text-red-400 hover:bg-panel-3" title="Remove">
          ✕
        </button>
      </div>
      {effect.kind === 'brightnessContrast' && (
        <>
          <Slider
            label="Brightness"
            value={effect.params.brightness}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setParam('brightness', v)}
          />
          <Slider
            label="Contrast"
            value={effect.params.contrast}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setParam('contrast', v)}
          />
        </>
      )}
      {effect.kind === 'hsl' && (
        <>
          <Slider
            label="Hue"
            value={effect.params.hue}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setParam('hue', v)}
          />
          <Slider
            label="Saturation"
            value={effect.params.saturation}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setParam('saturation', v)}
          />
          <Slider
            label="Lightness"
            value={effect.params.lightness}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => setParam('lightness', v)}
          />
        </>
      )}
      {effect.kind === 'blur' && (
        <>
          <Slider
            label="Strength"
            value={effect.params.strength}
            min={0}
            max={50}
            step={0.5}
            onChange={(v) => setParam('strength', v)}
          />
          <Slider
            label="Quality"
            value={effect.params.quality}
            min={1}
            max={8}
            step={1}
            onChange={(v) => setParam('quality', v)}
          />
        </>
      )}
      {effect.kind === 'dropShadow' && (
        <>
          <Slider
            label="Distance"
            value={effect.params.distance}
            min={0}
            max={100}
            step={1}
            onChange={(v) => setParam('distance', v)}
          />
          <Slider
            label="Angle°"
            value={(effect.params.angle * 180) / Math.PI}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => setParam('angle', (v * Math.PI) / 180)}
          />
          <Slider
            label="Blur"
            value={effect.params.blur}
            min={0}
            max={40}
            step={0.5}
            onChange={(v) => setParam('blur', v)}
          />
          <Slider
            label="Alpha"
            value={effect.params.alpha}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setParam('alpha', v)}
          />
          <ColorRow
            label="Color"
            value={effect.params.color}
            onChange={(v) => setParam('color', v)}
          />
        </>
      )}
      {effect.kind === 'invert' && (
        <Slider
          label="Amount"
          value={effect.params.amount}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParam('amount', v)}
        />
      )}
      {effect.kind === 'grayscale' && (
        <Slider
          label="Amount"
          value={effect.params.amount}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParam('amount', v)}
        />
      )}
      {effect.kind === 'sepia' && (
        <Slider
          label="Amount"
          value={effect.params.amount}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParam('amount', v)}
        />
      )}
      {effect.kind === 'sharpen' && (
        <Slider
          label="Amount"
          value={effect.params.amount}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => setParam('amount', v)}
        />
      )}
      {effect.kind === 'noise' && (
        <Slider
          label="Amount"
          value={effect.params.amount}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParam('amount', v)}
        />
      )}
      {effect.kind === 'pixelate' && (
        <Slider
          label="Size"
          value={effect.params.size}
          min={1}
          max={64}
          step={1}
          onChange={(v) => setParam('size', v)}
        />
      )}
      {effect.kind === 'tint' && (
        <>
          <ColorRow
            label="Color"
            value={effect.params.color}
            onChange={(v) => setParam('color', v)}
          />
          <Slider
            label="Amount"
            value={effect.params.amount}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setParam('amount', v)}
          />
        </>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="grid grid-cols-[80px_1fr_46px] items-center gap-2 py-0.5">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="text-right text-[11px] tabular-nums text-zinc-300">
        {Math.round(value * 100) / 100}
      </span>
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid grid-cols-[80px_1fr] items-center gap-2 py-0.5">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-12 cursor-pointer rounded border border-black/30 bg-transparent"
      />
    </label>
  );
}
