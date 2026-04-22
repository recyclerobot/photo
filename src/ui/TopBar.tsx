import { useEditor } from '../editor/store';
import { importImageFiles } from '../editor/export';

interface Props {
  onNew: () => void;
  onExport: () => void;
}

export function TopBar({ onNew, onExport }: Props) {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const zoom = useEditor((s) => s.view.zoom);
  const setView = useEditor((s) => s.setView);
  const doc = useEditor((s) => s.doc);

  const onImportClick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.onchange = () => inp.files && importImageFiles(inp.files);
    inp.click();
  };

  return (
    <div className="pointer-events-auto absolute left-0 right-0 top-0 flex items-center gap-1 border-b border-black/40 bg-panel/90 px-2 py-1.5 text-xs backdrop-blur">
      <Btn onClick={onNew}>New canvas</Btn>
      <Btn onClick={onImportClick}>Import image</Btn>
      <Btn onClick={onExport}>Export PNG</Btn>
      <Sep />
      <Btn onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
        ↶ Undo
      </Btn>
      <Btn onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">
        ↷ Redo
      </Btn>
      <Sep />
      <span className="px-2 text-zinc-400">
        {doc.widthPx} × {doc.heightPx} px
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Btn onClick={() => setView({ zoom: Math.max(0.1, zoom / 1.2) })}>−</Btn>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Btn onClick={() => setView({ zoom: Math.min(8, zoom * 1.2) })}>+</Btn>
        <Btn onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}>Fit</Btn>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded px-2 py-1 text-zinc-200 hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-zinc-500"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-zinc-700" />;
}
