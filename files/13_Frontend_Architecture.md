# 13 — Frontend Architecture (incl. State Management)

## 1. Framework & Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui components (see `04_Tech_Stack.md`).

```
apps/web/
├── app/
│   ├── (auth)/login/, register/
│   ├── (dashboard)/
│   │   ├── coach/sessions/, coach/clips/, coach/students/
│   │   └── student/sessions/, student/clips/
│   ├── session/[id]/                 # Live session room
│   │   ├── page.tsx
│   │   ├── components/
│   │   │   ├── VideoGrid.tsx
│   │   │   ├── SkeletonOverlay.tsx
│   │   │   ├── ReplayPanel.tsx
│   │   │   ├── AnnotationCanvas.tsx
│   │   │   └── ReplayTargetPicker.tsx
│   │   └── hooks/
│   │       ├── useLiveKitRoom.ts
│   │       ├── usePoseOverlay.ts
│   │       ├── useReplaySocket.ts
│   │       └── useAnnotationSocket.ts
│   └── admin/
├── components/ui/                    # shadcn primitives
├── lib/
│   ├── api-client.ts                 # typed REST client (uses shared DTOs)
│   ├── socket-client.ts
│   └── livekit-client.ts
├── stores/                           # Zustand stores
│   ├── session-store.ts
│   ├── replay-store.ts
│   └── annotation-store.ts
└── middleware.ts                     # route auth guard
```

## 2. State Management Strategy

| State category | Tool | Examples |
|---|---|---|
| Server state (fetched data) | **TanStack Query** | Session list, clip history, user profile |
| Ephemeral/local UI state | **Zustand** | Current replay mode, selected annotation tool, which student is targeted |
| Real-time/socket-driven state | **Zustand**, updated from socket event handlers | Live pose keypoints, incoming annotation strokes, presence |
| Media/WebRTC state | LiveKit React SDK's own hooks (`useRoom`, `useTracks`) | Track subscriptions, connection quality |

**Why not Redux:** No cross-cutting need for time-travel debugging or middleware complexity at this scale; Zustand's minimal API plus TanStack Query's caching covers all state categories with far less boilerplate — faster for both human and AI-agent-driven development.

## 3. Key Component Responsibilities

| Component | Responsibility |
|---|---|
| `VideoGrid` | Renders LiveKit tracks in gallery/coach-focus/spotlight layout (`07_LiveKit_Video_Architecture.md` §5) |
| `SkeletonOverlay` | Subscribes to `pose:update` socket events, draws keypoints/connections on a canvas layer positioned over the corresponding video tile |
| `ReplayPanel` | Renders the fetched HLS manifest (via `hls.js` or native support), handles scrub/play/pause/slow-motion (FR-5.4) |
| `AnnotationCanvas` | Captures coach drawing input, converts to normalized coordinates (`10_Annotation_System.md` §2), emits/receives socket events |
| `ReplayTargetPicker` | Coach UI for selecting which student(s) receive the current replay (FR-5.2) |

## 4. Real-Time Data Binding Pattern

Socket event handlers write into Zustand stores; components subscribe via selectors — never call `setState` directly from inside a socket callback tied to a specific component's lifecycle (avoids memory leaks/stale closures on unmount, a common pitfall in real-time React apps).

```
socket.on('pose:update', (msg) => usePoseStore.getState().setKeypoints(msg));
// Components subscribe:
const keypoints = usePoseStore((s) => s.keypointsByParticipant[participantId]);
```

## 5. Routing & Access Control

- `middleware.ts` checks for a valid session (via a lightweight cookie-based check) before allowing access to `(dashboard)` and `session/[id]` routes; full authorization (role/resource-level) is still enforced server-side per request (frontend guards are UX convenience, never the security boundary — see `06_Authentication_Authorization_RBAC.md`).
- Role-based route groups: coach and student see different dashboard shells but share the same `session/[id]` room experience with conditionally rendered controls (e.g., `ReplayTargetPicker` only renders for `role === 'coach'`).

## 6. Performance Considerations

- Video tiles and canvas overlays use `React.memo`/careful re-render boundaries — pose updates at 8-10Hz must not re-render the entire session page, only the specific overlay component.
- `AnnotationCanvas` draws to a `<canvas>` (imperative, outside React's render cycle) for stroke rendering, only using React for tool-selection UI — critical for 60fps-feeling freehand drawing.
- Code-split the `session/[id]` route bundle (LiveKit + hls.js are heavy) away from the marketing/dashboard bundle.

## 7. Security Considerations

- Access token kept in memory only (Zustand, not persisted) — see `06_Authentication_Authorization_RBAC.md` §2.
- No sensitive data (join tokens, signed URLs) logged to the browser console in production builds.
- Content Security Policy configured to restrict script/media sources (see `16_Security_Guidelines.md`).

## 8. Common Pitfalls

- ❌ Relying on frontend route guards as the actual security boundary.
- ❌ Using React state (re-renders) for high-frequency pose/drawing data instead of canvas/refs.
- ❌ Storing tokens in localStorage "just for convenience."

## 9. Acceptance Criteria

- [ ] Coach and student see role-appropriate controls in the session room, enforced by both conditional rendering and (redundantly, correctly) server-side rejection if bypassed.
- [ ] Skeleton overlay updates smoothly without visibly degrading video/annotation UI frame rate.
- [ ] Annotation drawing feels responsive (local optimistic render before server round-trip confirmation).
- [ ] Session route bundle is code-split and lazy-loaded independent of the marketing site.
