'use client';

import { useRef, useState } from 'react';
import type { UserDto } from '@replaycoach/types';
import { userClient } from '../../lib/user-client';
import { toast } from '../../stores/toast-store';
import { Avatar } from './Avatar';
import { AVATAR_ICONS } from './avatarIcons';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

/** Curated, neutral/friendly/professional emoji set — no funny, angry, or
 * inappropriate options. A handful of dance-relevant ones (💃🕺🩰) included
 * since that's this product's actual audience. */
const AVATAR_EMOJIS = [
  '😊', '🙂', '😄', '🤗', '👍', '🌟', '✨', '💪',
  '🎯', '🎨', '🎭', '🩰', '🕺', '💃', '🎵', '🎶',
  '🏆', '🌸', '🌺', '🍃', '☀️', '🌙', '⭐', '🌈',
];

type Mode = 'icon' | 'emoji' | 'url' | 'upload';

function modeOf(avatarUrl: string | null | undefined): Mode {
  if (avatarUrl?.startsWith('icon:')) return 'icon';
  if (avatarUrl?.startsWith('emoji:')) return 'emoji';
  if (avatarUrl) return 'url';
  return 'icon';
}

export function AvatarPicker({ user, onUpdated }: { user: UserDto; onUpdated: (user: UserDto) => void }) {
  const [mode, setMode] = useState<Mode>(modeOf(user.avatarUrl));
  const [urlValue, setUrlValue] = useState(modeOf(user.avatarUrl) === 'url' ? user.avatarUrl ?? '' : '');
  const [savingIcon, setSavingIcon] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyAvatarUrl = async (avatarUrl: string, label: string) => {
    try {
      const updated = await userClient.updateProfile({ avatarUrl });
      onUpdated(updated);
      toast.success(`Avatar updated${label ? ` — ${label}` : ''}.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not update avatar.');
    }
  };

  const handlePickIcon = async (key: string) => {
    setSavingIcon(key);
    await applyAvatarUrl(`icon:${key}`, '');
    setSavingIcon(null);
  };

  const handlePickEmoji = async (emoji: string) => {
    setSavingIcon(emoji);
    await applyAvatarUrl(`emoji:${emoji}`, '');
    setSavingIcon(null);
  };

  const handleSaveUrl = async () => {
    if (!urlValue.trim()) return;
    setSavingUrl(true);
    await applyAvatarUrl(urlValue.trim(), '');
    setSavingUrl(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await userClient.uploadAvatar(file);
      onUpdated(updated);
      toast.success('Avatar uploaded and optimized.');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not upload this image.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const modes: { key: Mode; label: string }[] = [
    { key: 'icon', label: 'Icon' },
    { key: 'emoji', label: 'Emoji' },
    { key: 'url', label: 'Image URL' },
    { key: 'upload', label: 'Upload' },
  ];

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <Avatar user={user} size={56} />
        <div className="text-sm text-ink-muted">This is how you'll appear across the app.</div>
      </div>

      <div role="radiogroup" aria-label="Avatar type" className="flex flex-wrap gap-2 mb-4">
        {modes.map((m) => (
          <label
            key={m.key}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm border cursor-pointer transition-colors ${
              mode === m.key ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name="avatar-mode"
              value={m.key}
              checked={mode === m.key}
              onChange={() => setMode(m.key)}
              className="sr-only"
            />
            {m.label}
          </label>
        ))}
      </div>

      {mode === 'icon' && (
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-2">
          {Object.entries(AVATAR_ICONS).map(([key, Icon]) => {
            const isCurrent = user.avatarUrl === `icon:${key}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePickIcon(key)}
                disabled={savingIcon !== null}
                aria-label={key.replace('-', ' ')}
                aria-pressed={isCurrent}
                className={`aspect-square rounded-md border flex items-center justify-center transition-colors ${
                  isCurrent ? 'bg-analytics/15 border-analytics text-analytics' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink hover:border-ink-faint'
                } ${savingIcon === key ? 'opacity-50' : ''}`}
              >
                <Icon className="w-[45%] h-[45%]" />
              </button>
            );
          })}
        </div>
      )}

      {mode === 'emoji' && (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
          {AVATAR_EMOJIS.map((emoji) => {
            const isCurrent = user.avatarUrl === `emoji:${emoji}`;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => handlePickEmoji(emoji)}
                disabled={savingIcon !== null}
                aria-label={`emoji ${emoji}`}
                aria-pressed={isCurrent}
                className={`aspect-square rounded-md border flex items-center justify-center text-xl transition-colors ${
                  isCurrent ? 'bg-analytics/15 border-analytics' : 'bg-panel-2 border-hairline hover:border-ink-faint'
                } ${savingIcon === emoji ? 'opacity-50' : ''}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}

      {mode === 'url' && (
        <div className="flex flex-col gap-3">
          <Input
            id="avatar-url"
            type="url"
            label="Image URL"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://example.com/photo.jpg"
          />
          <Button type="button" onClick={handleSaveUrl} disabled={!urlValue.trim() || savingUrl} loading={savingUrl} className="self-start">
            {savingUrl ? 'Saving…' : 'Use this image'}
          </Button>
        </div>
      )}

      {mode === 'upload' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-faint">JPG, PNG, or WEBP, up to 8MB. Automatically resized and compressed.</p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} className="text-sm text-ink-muted" />
          {uploading && <p className="text-xs text-ink-faint">Uploading and optimizing…</p>}
        </div>
      )}
    </div>
  );
}
