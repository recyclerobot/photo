import { useEditor } from '../editor/store';
import { importImageFiles } from '../editor/export';

export function LeftToolbar() {
  const addText = useEditor((s) => s.addTextLayer);
  const onImport = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.onchange = () => inp.files && importImageFiles(inp.files);
    inp.click();
  };
  return (
    <div className="pointer-events-auto absolute left-2 top-12 z-10 flex flex-col gap-1 rounded-lg border border-black/40 bg-panel/90 p-1 text-xs backdrop-blur">
      <ToolBtn label="Add text layer (T)" onClick={() => addText()}>
        T
      </ToolBtn>
      <ToolBtn label="Import image (I)" onClick={onImport}>
        +
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="grid h-9 w-9 place-items-center rounded text-base font-semibold text-zinc-200 hover:bg-panel-3"
    >
      {children}
    </button>
  );
}
