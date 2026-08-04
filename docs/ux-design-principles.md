# UX design principles

The principles behind how SimpleeCode feels to use - the interactions, not the
code. `engineering-principles.md` is the why behind the code; `README.md` is the
operational/product guide; this is the why behind the experience. It pairs with
the locked VS Code extension design in `docs/design/`: calm, low-chrome,
Atkinson Hyperlegible, a panel/sidebar webview, and a deterministic-first trust
model.

This doc is two things at once: the standing principles we design against, and
the rubric we audit the built UI against. Each principle names its source,
defines what it means in SimpleeCode's context, and lists the questions we ask when
reviewing a screen or flow.

SimpleeCode is a VS Code extension. Its primary UI is one webview rendered two
ways: an editor-tab panel and an Activity-Bar sidebar. We read the classic
web-era heuristics through that grain: tabs and command palette entries, not
site pages; a self-contained webview that still respects VS Code expectations;
keyboard and screen-reader parity in HTML/CSS/JS; WCAG 2.2 AA as the floor.

The product's spine shapes every principle below: facts come from the open
workspace, language tools, parser, and local index; the LLM writes the prose;
the user can inspect what was sent and verify claims back against code.

---

## Running an audit

When auditing a screen or flow against these principles, produce one entry per
principle:

- **Principle + source** - which principle, and the heuristic lineage behind it.
- **Definition** - one sentence, grounded in SimpleeCode.
- **Status** - `PASS` | `WARN` | `FAIL`.
- **Evidence** - the specific tab, rail, modal, control, command, or
  interaction. No vague claims; name the thing.
- **User impact** - who is affected, how, and how badly:
  `CATASTROPHIC` (blocks a core flow or sends code the user did not agree to
  send), `MAJOR` (defeats the flow's purpose, or excludes a whole group of
  people), `MINOR` (friction, recoverable), `COSMETIC` (polish).
- **Recommendation** - a specific, implementable fix, sized `S`, `M`, `L`, or
  `XL`.

Ground the interaction-cost and IA audits in SimpleeCode's three critical flows:

1. **Explain** - the developer selects code or a file; SimpleeCode returns a
   grounded explanation at the chosen depth, with facts, citations, and context
   gaps visible.
2. **Tour** - SimpleeCode walks the workspace in a deterministic order so the
   developer can understand the codebase without already knowing where to look.
3. **Check** - the developer pastes or reviews an explanation; SimpleeCode checks
   file, symbol, line, fact, and documentation claims against what it actually
   knows.

More clicks are only acceptable when each click is an easy, obvious choice -
complexity of steps beats complexity of decisions. (Krug's Second Law.)

---

## Every click is a cost

**Source:** Interaction cost theory (NNGroup), Krug's Second Law of Usability.

**Definition:** Every tab switch, button press, command, modal, and scroll in
SimpleeCode is money spent; if the thing the developer just asked for can be shown
in place, it is - never behind another view.

Treat every click and step as money spent. If information or an action can be
shown in place, show it in place. Do not hide what the developer just asked for
behind a button that opens another view to reveal it. A click you remove is a
click that never has to be paid for again.

- **Do not make them open a thing to see a thing.** The answer, verified facts,
  context gaps, and citations belong beside or directly under the explanation,
  not on a separate "sources" screen.
- **Selection should reveal, not tease.** Selecting code and running Explain
  should immediately expose the captured file, lines, parent symbol, prompt
  scope, and available facts.
- **Respect the surface's grain.** The panel can use two columns; the sidebar is
  narrow and stacks content. Same principle, different shape: the facts remain
  in the flow instead of disappearing behind a detour.
- **Progressive disclosure is for complexity, not for the obvious.** Tuck away
  raw packet internals, full prompt text, advanced settings, and debug data.
  Never tuck away the answer, safety state, or why a claim can be trusted.

**Audit questions**

- What is the minimum step count to complete Explain, Tour, and Check?
- Are confirmations, modals, or redirects present for the system's convenience
  rather than the developer's safety?
- Are there dead-end states where the developer must back out rather than
  advance?
- Does the panel use its width, and does the sidebar degrade without hiding the
  answer or facts?

## Calm over dense

**Source:** Progressive Disclosure and Aesthetic-and-Minimalist Design,
Heuristic #8 (NNGroup), Data Density Management (Fresh Consulting).

**Definition:** Calm means structured, not sparse - SimpleeCode surfaces the
answer and its grounding in a clear hierarchy, so the next right thing is never
buried, but the depth is still there when the developer digs.

Rich data, calm surface. Depth comes from light, spacing, type, and motion -
never from more chrome or a wall of boxes. Put dynamism in transitions and
streaming status, not in more content on screen. Calm is not emptiness: every
visible element competes for attention, so non-essential information dims the
essential. Explain should prioritize the answer; Tour can carry more structure;
Check can be denser because the developer came to inspect claims.

**Audit questions**

- Is there a clear visual hierarchy pulling the eye to the answer first, facts
  second, and raw machinery only on demand?
- Are advanced or secondary details revealed on demand, such as full prompt,
  packet JSON, retrieval internals, index counts, and transport details?
- Is density matched to the surface - calm for Explain, guided for Tour, richer
  for Check - or is it one flat density everywhere?
- Are there spots where cognitive load spikes without a matching increase in
  the developer's decision authority?

## Accessibility is part of the experience

**Source:** WCAG 2.2 (W3C), AODA / WCAG 2.0 AA, EAA.

**Definition:** The calm, fast path is worthless if some people cannot take it -
WCAG 2.2 AA is SimpleeCode's floor, met through accessible webview markup,
keyboard behavior, clear language, and readable typography.

The fastest path is worthless if some people cannot take it. Contrast,
screen-reader parity, reduced motion, text scaling, and >=24px hit targets are
UX - not afterthoughts. SimpleeCode is built for people learning or verifying
AI-written code; plain language, short lines, Atkinson Hyperlegible, and
lead-with-the-answer prose are part of accessibility. Evaluate against the four
POUR dimensions:

- **Perceivable:** accessible names on every icon-only control; contrast
  >=4.5:1 (3:1 for large text) in light, dark, and high-contrast modes; meaning
  survives zoom to 200%; never color-only - pair grounded/unverified colors with
  glyphs and text labels.
- **Operable:** full keyboard navigation for tabs, command buttons, links,
  ask/check inputs, menus, and modals; a visible focus indicator; no time-limited
  step in the select -> explain -> verify loop; motion swaps to a gentle
  crossfade under `prefers-reduced-motion`; hit targets >=24px; focus never
  trapped or obscured by a modal or sticky header.
- **Understandable:** plain language, short lines, no walls of text; predictable
  streaming and re-rendering that does not rearrange controls under the user's
  hands; inline input assistance and error correction; do not force re-entry of
  what SimpleeCode already captured.
- **Robust:** correct ARIA roles and names for tablist/tab/tabpanel, dialogs,
  menus, status/live regions, and links; verified with keyboard-only and a
  screen reader across panel and sidebar.

Automated tools catch only part of accessibility issues. Manual testing with
assistive technology is required - test every critical flow with keyboard-only,
screen reader, reduced motion, zoom, and both light/dark or high-contrast modes
at least once per phase.

**Standard:** WCAG 2.2 AA is the floor. The 2.2-only criteria that bite in
SimpleeCode include target size (SC 2.5.8), focus not obscured (SC 2.4.11), no
redundant re-entry (SC 3.3.7), and no cognitive puzzle to authenticate
(SC 3.3.8) if authentication is ever added.

**Audit questions**

- Do Explain, Tour, and Check work end to end with keyboard only and with a
  screen reader?
- Does the layout hold and stay legible at 200% zoom and large editor font
  sizes, in light, dark, and high-contrast themes?
- Is any meaning carried by color alone?
- Are all hit targets >=24px, and is focus ever obscured by sticky chrome,
  menus, or modals?

## Accessible by design

**Source:** Microsoft Inclusive Design, Accessibility as Experience (NNGroup),
WCAG 2.2.

**Definition:** Accessibility lives in SimpleeCode's shared webview shell and
components - contrast, focus, labels, roles, and targets baked into the pattern
- so both panel and sidebar inherit it, instead of re-solving it screen by
screen.

This is an architectural principle, not an implementation checklist. If
accessibility is handled ad hoc in each view, it will drift. Bake it into the
component: a control that ships with its keyboard equivalent, focus state,
accessible name, role, and target size is accessible everywhere it is reused.
Review for it at design time - in the component and mockup - not after the code
lands.

**Audit questions**

- Does the design system document contrast, focus states, labels, roles, and
  target sizes at the component level?
- Do tabs, menus, modals, citation links, segmented controls, and status badges
  ship with keyboard/screen-reader equivalents by default?
- Is there an accessibility review step at design time, before build?
- Are targets, focus management, and error states handled consistently across
  panel and sidebar?

## Visibility of system status

**Source:** Nielsen Heuristic #1 (NNGroup), Tognazzini - Latency Reduction.

**Definition:** SimpleeCode's select -> build packet -> guard -> send -> stream ->
verify loop and background indexing always tell the developer where they are -
idle, capturing, indexing, sending, streaming, verifying, saved, unavailable,
failed - so no one wonders whether the answer is final.

Users must always know what the system is doing. Uncertainty destroys trust,
causes duplicate actions, and raises error rates - especially here, where a
verification pass can flag claims after prose appears. Feedback must be
immediate, unambiguous, and proportionate to the action.

**Audit questions**

- Are there clear states for capturing, indexing, sending, streaming, verifying,
  done, unavailable, and failed - visually distinct, not one generic spinner?
- Does the UI tell "streaming" apart from "verified" apart from "failed"?
- Are background operations such as indexing, ACP availability, update checks,
  and feedback sends surfaced without the developer having to poll or guess?
- Can the developer tell the current state without remembering what they did a
  moment ago?

## User control and freedom

**Source:** Nielsen Heuristic #3, Tognazzini - Autonomy and Explorable
Interfaces.

**Definition:** SimpleeCode's AI answers are inspectable, disposable suggestions -
never silent truth - and the developer can stop a stream, start fresh, switch
tabs, inspect the prompt, or back out without losing work.

Users make mistakes; SimpleeCode must offer clearly marked exits - Stop, New
Conversation, cancel/close, back to prior tab, escape menus and modals - without
a process. An explorable interface lets people try things without fear of an
irreversible outcome. The original code context, exact packet scope, and
verification output make the prose reversible: the developer can check the
source instead of trusting the answer.

**Audit questions**

- Can the developer stop a streaming answer or start a new conversation at any
  time?
- Can they switch tabs without losing ask text, tour position, check input, or
  the last answer?
- Is there any place where SimpleeCode presents LLM prose as fact without a
  one-click path to the real source or a clear "unverified" state?
- Is the "what leaves my machine" gate clearly marked and available before a
  send when review is enabled?

## Consistency and standards

**Source:** Nielsen Heuristic #4, Jakob's Law, Tognazzini - Consistency.

**Definition:** The same word, icon, command, and control mean the same thing
across SimpleeCode's panel, sidebar, tabs, command palette, and settings; the
extension follows VS Code conventions where developers expect them.

Users should not have to wonder whether different words or actions mean the
same thing. This covers internal consistency (Explain, Tour, and Check agree on
citations, badges, file chips, statuses, and depth controls) and external
consistency (VS Code command titles, Activity-Bar behavior, focus rings,
settings names, and theme behavior). Low-chrome is itself a standard: do not
reintroduce a one-off card stack or decorative box language in a single corner.

**Audit questions**

- Are identical interactions, labels, icons, and badges used the same way across
  panel, sidebar, and command palette?
- Does the product follow VS Code conventions where the developer expects them?
- Are there components that look alike but behave differently, or look different
  but behave the same?
- Is the design system enforced in the build, or do one-off components and
  inline colors exist?

## Error prevention and recovery

**Source:** Nielsen Heuristics #5 and #9, Norman - Constraints, Tognazzini -
Defaults.

**Definition:** SimpleeCode designs so high-cost errors cannot happen silently -
especially sending code the developer did not mean to send - and when errors
happen, the message is plain and points to the fix.

The best error handling is designing so the error cannot occur. High-cost
actions are guarded: code packets pass through blocked globs, secret redaction,
size truncation, and review-before-send when enabled. Defaults must be safe and
honest; if the current default scope changes, the UI and docs must change with
it. When retrieval, language-server facts, or verification are thin, say so up
front so the developer does not over-trust the answer. Error messages name what
went wrong, why it matters, and exactly what to do next - in plain language,
blame-free.

**Audit questions**

- Does the review path show the exact content, scope, file, size, and redactions
  before anything leaves the machine when review is enabled?
- Are safe defaults in force for a developer who configures nothing, and are the
  defaults documented truthfully?
- Do error messages say what happened, why it matters, and what to do next?
- Are validation errors for settings, paths, feedback, and pasted answers shown
  inline or in context - not after an obscure failure?

## Recognition over recall

**Source:** Nielsen Heuristic #6, Norman - Discoverability, Tognazzini -
Discoverability.

**Definition:** SimpleeCode surfaces actions and context at the moment they are
needed - file, lines, parent symbol, scope, facts, citations, and next actions -
so the developer recognizes rather than remembers.

Short-term memory is limited. Actions and context must be present at the point
of use, not recalled from a prior screen. The low-chrome surface is the sharpest
tension here: minimal must not become invisible. Icon-only controls need labels
or tooltips and accessible names; core actions must not hide behind
undiscoverable gestures.

**Audit questions**

- Are Explain, Tour, Check, Stop, New, depth, Preview, and Send visible or
  discoverable at the point of use?
- Does the interface surface context - file, line range, parent symbol, scope,
  and available facts - to reduce memory burden?
- Do all interactive controls have labels, tooltips where needed, or accessible
  names?
- Are search, settings, filters, command palette actions, and navigation
  discoverable without tribal knowledge?

## Flexibility and efficiency of use

**Source:** Nielsen Heuristic #7, Tognazzini - Efficiency of the User and
Flexibility.

**Definition:** SimpleeCode's guided surfaces serve the first-time and unsure
developer; command palette entries, keyboard access, depth modes, reuse of the
current packet, and verification tools let power users move fast without
cluttering the calm view.

The interface must serve novice and expert alike. Shortcuts, command palette
entries, segmented depth modes, repeatable checks, and one-click source links
accelerate experienced users without adding chrome for first-timers. Optimize
for the developer's time, not the system's.

**Audit questions**

- Are high-frequency actions reachable by keyboard and command palette?
- Can a fluent developer re-run at a different depth, verify a claim, or open a
  cited file without rebuilding context manually?
- Are batch or repeated operations available where users routinely act on many
  items, such as touring files or checking multiple claims?
- Does the interface reward expertise with speed, or impose one flat pace on
  everyone?

## Affordance, signifiers, and mapping

**Source:** Norman - The Design of Everyday Things, NNGroup.

**Definition:** In a low-chrome, calm surface, SimpleeCode must still signal what
is interactive - depth from light and state, not decorative boxes - and put each
control next to the thing it changes.

Every interactive element must communicate its interactivity. This is SimpleeCode's
signature risk: a calm, low-chrome surface can strip the signifiers that tell
the developer what is clickable. Flat does not mean featureless - hover, focus,
press, selected, loading, and disabled states must read clearly. What looks like
a button behaves like one; what is static does not pretend to be interactive.
Controls map to their effects: depth controls affect the answer, Send belongs
to the ask box, Tour navigation belongs near the current tour step, and claim
links belong on the claims they open.

**Audit questions**

- Are there elements that look interactive but are not, or interactive ones that
  do not look it?
- Do controls map logically to their effects by spatial adjacency and label?
- Are clickable and non-clickable text visually distinguishable?
- Do hover, focus, active, selected, loading, and disabled states communicate the
  current affordance clearly?

## Progressive disclosure and information architecture

**Source:** Progressive Disclosure and Data Density Management (NNGroup / Fresh
Consulting), Tognazzini - Visible Navigation, Krug - Billboard Design.

**Definition:** SimpleeCode's IA mirrors the developer's mental model - explain
this code, tour this codebase, check this answer - with daily features shallow
and secondary machinery one level down.

IA decides how fast users find things and grasp the structure. Progressive
disclosure reveals detail at the right level for the current task - it does not
hide, it sequences. Wayfinding must be continuous: the developer always knows
which tab they are on, what file or selection is in focus, whether the answer is
grounded, and how to get back. Secondary detail (raw packet, prompt preview,
retrieval internals, ACP details, update settings) is reachable, not resident.

**Audit questions**

- Are daily-use features reachable in three steps or fewer?
- Does the IA reflect the developer's mental model rather than the team's
  internal implementation structure?
- Is secondary detail accessible without cluttering the primary explain flow?
- Is navigation state - active tab, current selection, title, tour position,
  and status - present and accurate?

## Feedback loops and conceptual model integrity

**Source:** Norman - Feedback and Conceptual Model, NNGroup, Tognazzini - Track
State.

**Definition:** SimpleeCode behaves the way its metaphor promises - it looks up
real code facts, asks AI to write the explanation, and lets the developer check
the result - while preserving the developer's place across re-renders, tab
switches, and webview reloads.

The system must continuously communicate what it is doing and why, so the
developer's mental model stays accurate. Where SimpleeCode's behavior would diverge
from what the developer expects, the design bridges the gap, not the user. State
is tracked, preserved, and restored: active tab, prompt text, selected context,
tour position, last answer, and check input should survive ordinary UI changes
where possible. This is also why cold-start and reload behavior matter: do not
make the developer rebuild context while the extension warms up.

**Audit questions**

- Does behavior match the deterministic-first model the product promises?
- Are prompt text, active tab, tour position, check input, and last answer
  preserved across re-render, tab switch, and webview reload where feasible?
- Are there interactions whose outcome surprises a developer who has not read
  documentation?
- Is system state - saved, unsaved, indexing, streaming, verifying, offline,
  failed - communicated continuously and accurately?
