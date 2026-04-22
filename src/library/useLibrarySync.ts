import { useEffect } from 'react';
import { useEditor } from '../editor/store';
import { useLibrary } from './libraryStore';

/**
 * Continuously persists the current canvas to the library.
 *
 * On mount: if there is a currentId pointing at an existing entry, load that
 * entry's doc into the editor. Otherwise create a new entry from whatever doc
 * is in the editor.
 *
 * After mount: debounced subscribe to editor doc changes and save into the
 * current entry (creates one if it has been cleared).
 */
export function useLibrarySync() {
  useEffect(() => {
    const lib = useLibrary.getState();
    if (lib.currentId && lib.entries[lib.currentId]) {
      // Load the previously-active design.
      useEditor.getState().setDoc(lib.entries[lib.currentId].doc, { record: false });
    } else {
      // Bootstrap a fresh entry around whatever the editor currently shows.
      useLibrary.getState().createNew(useEditor.getState().doc);
    }

    let timer: number | null = null;
    const unsub = useEditor.subscribe(
      (s) => s.doc,
      (doc) => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          useLibrary.getState().saveCurrent(doc);
          timer = null;
        }, 400);
      },
    );

    return () => {
      unsub();
      if (timer !== null) {
        window.clearTimeout(timer);
        // Flush a final save on unmount.
        useLibrary.getState().saveCurrent(useEditor.getState().doc);
      }
    };
  }, []);
}
