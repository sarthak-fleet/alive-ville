import { useState } from 'react';

import { useWorldStore } from '../store/world.ts';

export function ImportScreen({ onClose }: { onClose: () => void }) {
  const importWorldFromJson = useWorldStore((state) => state.importWorldFromJson);
  const importing = useWorldStore((state) => state.importing);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await importWorldFromJson(draft);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then(setDraft);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">Import a world</div>
        <p className="modal-hint">
          Paste a world-ingest source JSON (title, synopsis, locations, characters…) — the 3D city,
          characters, and quests are generated from it.
        </p>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder='{"title": "...", "locations": [...], "characters": [...]}'
          rows={12}
        />
        <div className="modal-actions">
          <label className="modal-file">
            Load file
            <input
              type="file"
              accept=".json"
              onChange={(event) => loadFile(event.target.files?.[0])}
              hidden
            />
          </label>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={importing || !draft.trim()}
            onClick={() => void submit()}
          >
            {importing ? 'Importing…' : 'Import world'}
          </button>
        </div>
        {error ? <div className="modal-error">{error}</div> : null}
      </div>
    </div>
  );
}
