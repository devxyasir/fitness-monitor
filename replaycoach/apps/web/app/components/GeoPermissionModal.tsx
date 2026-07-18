'use client';

import { MapPin } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

/** Shown BEFORE the browser's native geolocation prompt — explains why
 * location is being requested, per the spec's exact copy. Never skipped:
 * a bare browser permission popup with no context reads as suspicious. */
export function GeoPermissionExplainer({ onAllow, onCancel }: { onAllow: () => void; onCancel: () => void }) {
  return (
    <Modal title="Confirm your location" onClose={onCancel} maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-analytics/10 border border-analytics/30 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-analytics" />
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">
          We use your location to verify whether this service is available in your region. Your location is never
          shared with third parties.
        </p>
        <div className="flex gap-2.5 w-full mt-1">
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="button" variant="analytics" onClick={onAllow} className="flex-1">
            Allow location
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Shown after the browser prompt is denied (or unsupported) — offers a
 * retry, matching the spec's exact copy. */
export function GeoPermissionDeniedModal({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <Modal title="Location permission required" onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-danger" />
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">
          Location permission is required to access this service. Please enable location permission in your browser
          settings.
        </p>
        <Button type="button" variant="analytics" onClick={onRetry} className="w-full">
          Try again
        </Button>
      </div>
    </Modal>
  );
}
