import { useEffect, useState } from 'react';
import { useEditor } from './editor/store';
import { PixiStage } from './editor/pixi/PixiStage';
import { TopBar } from './ui/TopBar';
import { LeftToolbar } from './ui/LeftToolbar';
import { RightPanel } from './ui/RightPanel';
import { NewCanvasDialog } from './ui/NewCanvasDialog';
import { ExportDialog } from './ui/ExportDialog';
import { useKeyboard } from './ui/useKeyboard';
import { useDropzone } from './ui/useDropzone';

export default function App() {
  const layerCount = useEditor((s) => s.doc.layers.length);
  const [showNew, setShowNew] = useState(layerCount === 0);
  const [showExport, setShowExport] = useState(false);

  useKeyboard();
  useDropzone();

  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', onContext);
    return () => document.removeEventListener('contextmenu', onContext);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1a1b1e] text-zinc-200">
      <PixiStage />

      <div data-ui-overlay className="pointer-events-none absolute inset-0">
        <TopBar onNew={() => setShowNew(true)} onExport={() => setShowExport(true)} />
        <LeftToolbar />
        <RightPanel />
      </div>

      {showNew && <NewCanvasDialog onClose={() => setShowNew(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  );
}
