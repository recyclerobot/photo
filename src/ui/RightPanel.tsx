import { useEditor } from '../editor/store';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { EffectsPanel } from './EffectsPanel';
import { CanvasPanel } from './CanvasPanel';
import { FloatingWindow } from './FloatingWindow';
import { useUI } from './uiStore';

export function RightPanel() {
  const selectedId = useEditor((s) => s.selectedLayerId);
  const selectedLayer = useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedLayerId));
  const panels = useUI((s) => s.panels);
  const setPanel = useUI((s) => s.setPanel);

  const propsTitle = selectedLayer
    ? `Properties — ${selectedLayer.type[0].toUpperCase()}${selectedLayer.type.slice(1)}`
    : 'Properties';

  return (
    <>
      {panels.canvas && (
        <FloatingWindow windowKey="canvas" title="Canvas" onClose={() => setPanel('canvas', false)}>
          <CanvasPanel />
        </FloatingWindow>
      )}
      {panels.layers && (
        <FloatingWindow windowKey="layers" title="Layers" onClose={() => setPanel('layers', false)}>
          <LayersPanel />
        </FloatingWindow>
      )}
      {panels.properties && selectedId && (
        <FloatingWindow
          windowKey="properties"
          title={propsTitle}
          onClose={() => setPanel('properties', false)}
        >
          <PropertiesPanel />
        </FloatingWindow>
      )}
      {panels.effects && selectedId && (
        <FloatingWindow
          windowKey="effects"
          title="Effects"
          onClose={() => setPanel('effects', false)}
        >
          <EffectsPanel />
        </FloatingWindow>
      )}
    </>
  );
}
