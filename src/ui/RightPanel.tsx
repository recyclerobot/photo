import { useEffect } from 'react';
import { useEditor, flatObjects } from '../editor/store';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { EffectsPanel } from './EffectsPanel';
import { CanvasPanel } from './CanvasPanel';
import { FloatingWindow } from './FloatingWindow';
import { useUI } from './uiStore';

export function RightPanel() {
  const selectedId = useEditor((s) => s.selectedObjectId);
  const selectedObject = useEditor((s) => {
    if (!s.selectedObjectId) return undefined;
    for (const { object } of flatObjects(s.doc)) {
      if (object.id === s.selectedObjectId) return object;
    }
    return undefined;
  });
  const panels = useUI((s) => s.panels);
  const setPanel = useUI((s) => s.setPanel);

  // Auto-open the properties panel when the user selects an image object so
  // the natural-size and filename info are immediately visible.
  useEffect(() => {
    if (selectedObject?.type === 'image' && !panels.properties) {
      setPanel('properties', true);
    }
    // Only react to the selected id changing, not panel toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedObject?.type]);

  const propsTitle = selectedObject
    ? `Properties — ${selectedObject.type[0].toUpperCase()}${selectedObject.type.slice(1)}`
    : 'Properties';

  return (
    <>
      {panels.canvas && (
        <FloatingWindow windowKey="canvas" title="Canvas" onClose={() => setPanel('canvas', false)}>
          <CanvasPanel />
        </FloatingWindow>
      )}
      {panels.layers && (
        <FloatingWindow
          windowKey="layers"
          title="Layers"
          noScroll
          onClose={() => setPanel('layers', false)}
        >
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
