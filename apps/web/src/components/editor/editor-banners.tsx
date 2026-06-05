'use client';

interface EditorBannersProperties {
  externalChange: boolean;
  draftContent: string | null;
  onDismissExternalChange: () => void;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
}

/** Notification strips rendered above the editor canvas. */
export function EditorBanners({
  externalChange,
  draftContent,
  onDismissExternalChange,
  onRestoreDraft,
  onDiscardDraft,
}: EditorBannersProperties) {
  return (
    <>
      {externalChange && (
        <div role="status" className="px-3 py-1 text-xs bg-yellow-50 border-b border-yellow-200 text-yellow-800 flex items-center gap-2">
          <span>This file was updated externally.</span>
          <button type="button" className="underline" onClick={onDismissExternalChange}>Dismiss</button>
        </div>
      )}
      {draftContent !== null && (
        <div role="status" className="px-3 py-1 text-xs bg-blue-50 border-b border-blue-200 text-blue-800 flex items-center gap-2">
          <span>An unsaved draft was recovered.</span>
          <button type="button" className="underline" onClick={onRestoreDraft}>Restore</button>
          <button type="button" className="underline" onClick={onDiscardDraft}>Discard</button>
        </div>
      )}
    </>
  );
}
