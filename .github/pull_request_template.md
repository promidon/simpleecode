## What changed, and why

<!-- One or two sentences. The why matters more than the what. -->

## How you tested it by hand

<!-- Not just "tests pass" — what did you actually do in the Extension Development Host? -->

## Checks

- [ ] `npm run compile`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] Added a test, if this touched pure logic

## The two ground rules

- [ ] **Deterministic first** — any new fact comes from the code (language
      server, AST, module graph), not from the model.
- [ ] **Privacy** — if this adds anything to a prompt or a network request, it
      passes through the privacy guard and shows up in the pre-send review.
      Describe it below if so.

<!-- Screenshots help a lot for anything touching the dashboard. -->

<!-- New to open source? Say so — that's welcome here, and I'll help. -->
