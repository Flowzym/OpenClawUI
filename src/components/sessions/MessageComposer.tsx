import { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';

export function MessageComposer() {
  const [value, setValue] = useState('');
  const { selectedSessionId, sendMessage, error, isUsingFallback } = useSessionStore();

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
          <div className="space-y-1">
            <p className="text-xs text-app-muted">
              {selectedSessionId ? `Sending through the configured gateway for session ${selectedSessionId}.` : 'Select a session to send through the gateway.'}
            </p>
            {isUsingFallback ? <p className="text-xs text-app-warn">Gateway fallback is active; messages may remain local until the protocol is verified.</p> : null}
            {error ? <p className="text-xs text-app-danger">{error}</p> : null}
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!selectedSessionId || !value.trim()}
            onClick={() => {
              if (!value.trim()) return;
              void sendMessage(value.trim());
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
