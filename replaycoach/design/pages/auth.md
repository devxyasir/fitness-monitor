# Auth (`apps/web/app/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`)

## Purpose

Sign in / sign up with minimum friction. Neutral surface — brand accent
only, no domain accent (session/analytics don't apply here).

## Layout — shell (`(auth)/layout.tsx`)

Unchanged split-screen structure (left brand rail, right card) — it was
already correct, only retint + retype:

```tsx
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink relative overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        <div className="hidden lg:flex flex-col justify-center p-16 relative overflow-hidden">
          <SkeletonMotif
            aria-hidden
            className="absolute -right-10 -bottom-5 w-[360px] h-[420px] opacity-[0.10]"
            jointColor="brand"
          />
          <div className="flex items-center gap-2.5 mb-7">
            <Logomark className="w-5 h-5 text-brand" />
            <span className="text-display-s text-ink">ReplayCoach</span>
          </div>
          <h1 className="font-display text-display-l text-ink max-w-[24rem] text-balance">
            The film room for movement.
          </h1>
        </div>
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-[25rem] bg-panel border border-hairline rounded-lg shadow-lg p-9 animate-rise">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Two changes from current: (1) the decorative watermark is the real shared
`SkeletonMotif` component keyed `jointColor="brand"` instead of an
inline one-off SVG duplicated in this file — single source of truth now
lives with the session-room spec; (2) dropped the gradient-border wrapper
div (`background: linear-gradient(135deg, rgba(...))` outline hack) — that
was a glow effect belonging to the old system; a plain `border
border-hairline` + `shadow-lg` reads as premium without it.

## Login (`login/page.tsx`)

Structurally unchanged (email, password with show/hide toggle, submit,
sign-up link) — this page was already close to correct in the earlier pass;
retint + add the disabled Google button exactly as already implemented
today (that addition is fine, keep it, just retint):

```tsx
<div className="flex items-center gap-2.5 mb-5">
  <Logomark className="w-5 h-5 text-brand" />
  <div>
    <h2 className="font-display text-display-s text-ink">Welcome back</h2>
    <p className="text-ink-muted text-sm mt-0.5">Sign in to your film room.</p>
  </div>
</div>

{error && <ErrorBlock message={error} />}

<form onSubmit={handleSubmit} className="flex flex-col gap-4">
  <Input id="auth-email" type="email" label="Email" autoComplete="email" required
    value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@club.com" />
  <div>
    <label htmlFor="auth-password" className="block text-label text-ink-muted mb-1.5">Password</label>
    <div className="relative">
      <input
        id="auth-password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 pr-12 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:border-brand focus-visible:shadow-focus"
        placeholder="••••••••••••"
      />
      <button type="button" onClick={() => setShowPassword((v) => !v)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted text-xs px-2 py-1.5">
        {showPassword ? 'Hide' : 'Show'}
      </button>
    </div>
  </div>
  <Button type="submit" disabled={!canSubmit} loading={loading} className="mt-2 w-full">
    {loading ? 'Signing in…' : 'Log in'}
  </Button>
</form>

<Divider /> {/* "or" divider, extract the existing inline markup into a 4-line shared component */}

<Button variant="ghost" disabled className="w-full">
  <span aria-hidden>G</span> Continue with Google
  <span className="font-mono text-[0.6875rem] text-ink-faint bg-hairline px-2 py-0.5 rounded-full ml-auto">coming soon</span>
</Button>

<div className="text-center mt-6 text-sm text-ink-muted">
  New here? <Link href={registerHref} className="text-brand font-semibold hover:brightness-110">Sign up</Link>
</div>
```

Uses `ErrorBlock` from `DESIGN_SYSTEM.md` §9 in place of the current inline
error `<div>` — same visual result (red alert box), now a shared component
instead of copy-pasted markup across login/register.

## Register (`register/page.tsx`)

Same shell + form pattern as login, plus the display-name field, role
select, and the live password-strength checklist already built today (keep
that logic exactly as-is — it correctly mirrors the API's
`PASSWORD_REGEX`, this was a real bug fix, not a styling choice). Retint the
checklist's success state from `text-live`/`bg-live` to `text-success`/`bg-success`:

```tsx
<li className={`text-[11px] flex items-center gap-1.5 transition-colors ${met ? 'text-success' : 'text-ink-faint'}`}>
  <span className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 ${met ? 'bg-success/20' : 'bg-panel-2 border border-hairline'}`}>
    {met && <CheckIcon className="w-2 h-2" />}
  </span>
  {rule.label}
</li>
```

Role select (`coach`/`student`) — visually unremarkable `<select>` today;
keep as a plain native select (no custom dropdown needed, this is a
2-option choice, a native control is the right amount of engineering here).

## States

- **Loading (submit in flight):** `Button`'s built-in `loading` prop
  (spinner + disabled) — already correct, no change.
- **Error (bad credentials / validation / network):** `ErrorBlock` (§9),
  `role="alert"`, appears above the form. Already present today as a plain
  div; swap to the shared component.
- **Empty:** N/A (a form has no empty-data state).
- **Success:** immediate redirect (coach → `/coach`, student →
  `/student/sessions`, or `redirectTo` param) — no separate success screen,
  unchanged behavior.

## Responsive

Left brand rail already `hidden lg:flex` — card becomes the full viewport
on mobile with `p-6` outer padding, unchanged. No further breakpoints
needed; the form itself never exceeds `max-w-[25rem]` at any size.

## Backend/data

None. Known gap (not in scope for this redesign per `IMPLEMENTATION_NOTES.md`
guardrails): `forgotPassword`/`resetPassword` are server-side no-op stubs
(`apps/api/src/auth/auth.service.ts`) — no "Forgot password?" link exists in
the UI and none should be added until a real email provider is wired up
server-side. Do not add a forgot-password UI flow as part of this redesign.
