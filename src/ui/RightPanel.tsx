import { useEditor } from '../editor/store';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { EffectsPanel } from './EffectsPanel';

export function RightPanel() {
  const selectedId = useEditor((s) => s.selectedLayerId);
  return (
    <div className="pointer-events-auto absolute bottom-2 right-2 top-12 flex w-72 flex-col gap-2 overflow-hidden rounded-lg border border-black/40 bg-panel/90 text-xs backdrop-blur">
      <div className="flex flex-1 flex-col overflow-hidden">
        <Section title="Layers" defaultOpen>
          <LayersPanel />
        </Section>
        {selectedId && (
          <>
            <Section title="Properties" defaultOpen>
              <PropertiesPanel />
            </Section>
            <Section title="Effects" defaultOpen>
              <EffectsPanel />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  defaultOpen: _defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col border-b border-black/30 last:border-b-0">
      <div className="border-b border-black/30 bg-panel-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
    </div>
  );
}
