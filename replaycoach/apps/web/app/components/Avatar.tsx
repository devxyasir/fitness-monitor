import type { UserDto } from '@replaycoach/types';
import { AVATAR_ICONS } from './avatarIcons';

/**
 * Renders a user's avatar wherever it appears in the app — the single
 * source of truth for `UserDto.avatarUrl`'s encoding (see AvatarPicker):
 *   - `icon:<name>`  → a curated lucide icon, name keys into AVATAR_ICONS
 *   - `emoji:<char>` → a single emoji character
 *   - anything else non-empty → treated as an image URL (direct link or an
 *     uploaded/compressed file's path) and rendered as an <img>
 *   - null/empty → initials fallback (unchanged from before this system
 *     existed, so accounts that never set an avatar look the same as always)
 */
export function Avatar({ user, size = 32 }: { user: UserDto | null | undefined; size?: number }) {
  const avatarUrl = user?.avatarUrl;
  const initial = user?.displayName?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? 'U';
  const dimension = { width: size, height: size };

  if (avatarUrl?.startsWith('icon:')) {
    const Icon = AVATAR_ICONS[avatarUrl.slice(5)];
    if (Icon) {
      return (
        <div
          style={dimension}
          className="rounded-full bg-analytics/15 text-analytics flex items-center justify-center flex-shrink-0"
        >
          <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
        </div>
      );
    }
  }

  if (avatarUrl?.startsWith('emoji:')) {
    return (
      <div
        style={{ ...dimension, fontSize: size * 0.55 }}
        className="rounded-full bg-panel-2 border border-hairline flex items-center justify-center flex-shrink-0 leading-none"
      >
        {avatarUrl.slice(6)}
      </div>
    );
  }

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={user?.displayName ?? 'User'}
        style={dimension}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }

  return (
    <div
      style={{ ...dimension, fontSize: size * 0.4 }}
      className="rounded-full bg-analytics flex items-center justify-center font-bold text-white dark:text-canvas flex-shrink-0"
    >
      {initial}
    </div>
  );
}
