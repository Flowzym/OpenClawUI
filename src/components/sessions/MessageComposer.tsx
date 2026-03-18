import { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';

export function MessageComposer() {
  const [value, setValue] = useState('');
  const { selectedSessionId, appendDraftReply } = useSessionStore();

  return (
    <div className="panel mt-3">
      <div className="space-y-3">
        <textarea
          className="input min-h-28 resize-none"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Compose operator prompt, instruction, or follow-up..."
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-app-muted">Mock composer only. TODO: send prompts through the real gateway client.</p>
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              if (!value.trim()) return;
              appendDraftReply(selectedSessionId, value.trim());
              setValue('');
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
