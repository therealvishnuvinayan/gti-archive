# Flux AI Right Panel History And Matches UX Report

## What Changed

- Removed the horizontal recent-chat strip from the main Flux AI chat header.
- Kept the main chat area focused on the Flux AI title, subtitle, conversation, suggestions, and composer.
- Added a persistent right-side sidebar with:
  - `Matches` panel at the top.
  - `Recent Chats` panel below it.
- Kept contextual detail panels for status summaries, blockers, created projects, and draft project previews above the Matches panel only when meaningful contextual data exists.

## Matches Panel

- Added Projects and Archives tabs inside the right panel.
- Project matches render from API returned project data only.
- Archive matches render from API returned archive data only.
- Empty project search state shows:
  - `No projects found.`
  - `Try searching by project name, executor, category, tag, or status.`
- Initial project tab state shows:
  - `No project query yet.`
  - `Ask Flux AI to find projects and real matches will appear here.`
- Archive empty state is archive-specific:
  - `No archive assets found.`
  - `Try searching by file name, artwork ID, brand, archive category, project name, or file type.`

## Recent Chats

- Moved conversation history into the right-side `Recent Chats` panel.
- Preserved existing conversation behavior:
  - Start a new chat.
  - Load an existing chat.
  - Delete a persisted chat.
  - Highlight the current chat.
- The main chat header no longer uses horizontal scrolling for history.

## Layout Behavior

- Desktop uses a two-column Flux AI workspace:
  - Main chat column.
  - Sticky right sidebar for Matches and Recent Chats.
- Smaller screens stack the right-side panels below the chat.
- The chat content gets more vertical room with the old header history removed.
- The right panel uses compact result cards to avoid crowding and horizontal overflow.

## Security And Data Behavior

- No backend permission rules were changed.
- No mock data was reintroduced.
- Archive and project results still come from the existing Flux AI API response.
- Archive preview/download actions continue to use authenticated app routes and the existing preview modal behavior.
- Raw storage keys, buckets, direct download URLs, and hidden archive data remain excluded by the existing server-side rules.

## Files Changed

- `src/components/flux-ai/flux-ai-workspace.tsx`
- `scripts/flux-ai-search-ui-regression-checks.mjs`
- `scripts/flux-ai-archive-search-checks.mjs`
- `docs/FLUX_AI_RIGHT_PANEL_HISTORY_AND_MATCHES_UX_REPORT.md`

## Manual QA Checklist

1. Open `/flux-ai`.
2. Confirm the main chat header only shows `Flux AI` and the subtitle.
3. Confirm no horizontal recent-chat strip appears in the main chat area.
4. Confirm the right sidebar shows `Matches` above `Recent Chats`.
5. Confirm Projects and Archives tabs can be switched.
6. Ask for a project search and confirm project results appear only under the Projects tab.
7. Ask for an archive search and confirm archive results appear under the Archives tab.
8. Confirm empty project searches show `No projects found.`
9. Confirm empty archive searches show `No archive assets found.`
10. Confirm recent chats can be loaded, started, and deleted from the right sidebar.
11. Confirm status summaries, blockers, and draft project previews still appear contextually when returned by Flux AI.
12. Confirm mobile/tablet widths stack panels without horizontal overflow.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `node scripts/flux-ai-search-ui-regression-checks.mjs`
- `node scripts/flux-ai-archive-search-checks.mjs`
- `node scripts/flux-ai-security-regression-checks.mjs`
- `node scripts/flux-ai-real-data-regression-checks.mjs`
- `node scripts/flux-ai-count-regression-checks.mjs`
- `node scripts/flux-ai-conversation-persistence-checks.mjs`
- `node scripts/flux-ai-conversation-delete-checks.mjs`
