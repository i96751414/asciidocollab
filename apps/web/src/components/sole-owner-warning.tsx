"use client";

interface SoleOwnerWarningProperties {
  visible: boolean;
}

/**
 *
 */
export function SoleOwnerWarning({ visible }: SoleOwnerWarningProperties) {
  if (!visible) return null;

  return (
    <div className="p-4 rounded-md border border-destructive bg-destructive/10 text-destructive text-sm">
      <strong>You are the sole owner of this project.</strong> You cannot remove yourself until
      you assign the <strong>Owner</strong> role to at least one other member.
    </div>
  );
}
