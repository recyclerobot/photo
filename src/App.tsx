import { useEffect, useState } from 'react';
import { PixiStage } from './editor/pixi/PixiStage';
import { TopBar } from './ui/TopBar';
import { LeftToolbar } from './ui/LeftToolbar';
import { RightPanel } from './ui/RightPanel';
import { Rulers } from './ui/Rulers';
import { NewCanvasDialog } from './ui/NewCanvasDialog';
import { ExportDialog } from './ui/ExportDialog';
import { LibraryDialog } from './ui/LibraryDialog';
import { useKeyboard } from './ui/useKeyboard';
import { useDropzone } from './ui/useDropzone';
import { useUI } from './ui/uiStore';
import { useLibrarySync } from './library/useLibrarySync';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Notices } from './ui/NoticesView';

export default function App() {
  const [showNew, setShowNew] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const showLeftToolbar = useUI((s) => s.panels.leftToolbar);

  useKeyboard();
  useDropzone();
  useLibrarySync();

  useEffect(() => {
    const onContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', onContext);
    return () => document.removeEventListener('contextmenu', onContext);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1a1b1e] text-zinc-200">
      <ErrorBoundary label="Canvas">
        <PixiStage />
      </ErrorBoundary>

      <ErrorBoundary label="Editor UI">
        <div data-ui-overlay className="pointer-events-none absolute inset-0">
          <TopBar
            onNew={() => setShowNew(true)}
            onExport={() => setShowExport(true)}
            onOpenLibrary={() => setShowLibrary(true)}
          />
          {showLeftToolbar && <LeftToolbar />}
          <RightPanel />
          <Rulers />
        </div>

        {showNew && <NewCanvasDialog onClose={() => setShowNew(false)} />}
        {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
        {showLibrary && <LibraryDialog onClose={() => setShowLibrary(false)} />}
      </ErrorBoundary>

      <Notices />
    </div>
  );
}
