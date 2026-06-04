'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useKeyBindingSettings } from '@/hooks/use-key-binding-settings';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

function canonicalCombo(event: React.KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) return '';
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  if (event.metaKey) parts.push('Meta');
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return parts.join('+');
}

/** Displays the user's key binding settings and allows remapping or resetting each shortcut. */
export function KeyboardShortcutsCard() {
  const { groups, updateBinding, resetBinding } = useKeyBindingSettings();
  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleBindingClick = (action: string) => {
    setCapturingAction(action);
    setErrors((previous) => ({ ...previous, [action]: '' }));
  };

  const handleCapture = async (event: React.KeyboardEvent, action: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      setCapturingAction(null);
      return;
    }

    if (MODIFIER_KEYS.has(event.key)) return;

    const combo = canonicalCombo(event);
    if (!combo) return;

    try {
      await updateBinding(action, combo);
      setCapturingAction(null);
    } catch (error) {
      setErrors((previous) => ({ ...previous, [action]: error instanceof Error ? error.message : 'Error' }));
      setCapturingAction(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keyboard Shortcuts</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.map((group) => (
          <div key={group.namespace} className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.label}</h3>
            <div className="space-y-2">
              {group.bindings.map((binding) => {
                const isCapturing = capturingAction === binding.action;
                return (
                  <div key={binding.action} className="flex items-center gap-3">
                    <span className="flex-1 text-sm">{binding.label}</span>
                    {isCapturing ? (
                      <input
                        autoFocus
                        readOnly
                        placeholder="Press a key…"
                        className="w-32 rounded border px-2 py-1 text-sm text-center border-primary outline-none"
                        onKeyDown={(event) => handleCapture(event, binding.action)}
                        onBlur={() => setCapturingAction(null)}
                      />
                    ) : (
                      <button
                        className="w-32 rounded border px-2 py-1 text-sm text-center hover:bg-accent"
                        onClick={() => handleBindingClick(binding.action)}
                      >
                        {binding.keyCombo}
                      </button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="reset"
                      disabled={binding.isDefault}
                      onClick={() => resetBinding(binding.action)}
                    >
                      Reset
                    </Button>
                    {errors[binding.action] && (
                      <span className="text-xs text-destructive">{errors[binding.action]}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
